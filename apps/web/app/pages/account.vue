<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { createAuthClient } from "better-auth/vue";
import { passkeyClient } from "@better-auth/passkey/client";

const config = useRuntimeConfig();
const client = shallowRef<SupabaseClient | null>(null);
const session = ref<Session | null>(null);
const email = ref("");
const password = ref("");
const displayName = ref("");
const mode = ref<"login" | "signup" | "reset" | "recovery">("login");
const message = ref("");
const errorMessage = ref("");
const busy = ref(false);
const ready = ref(false);
let unsubscribe: (() => void) | undefined;
const redirectUrl = () => `${window.location.origin}/account`;

async function loadProfile() {
  if (!client.value || !session.value) return;
  const { data, error } = await client.value
    .from("profiles")
    .select("display_name")
    .eq("id", session.value.user.id)
    .maybeSingle();
  if (error) errorMessage.value = "プロフィールを読み込めませんでした。";
  else displayName.value = data?.display_name ?? "";
}

onMounted(async () => {
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    errorMessage.value =
      "Supabaseが未設定です。READMEの手順でローカル環境を設定してください。";
    ready.value = true;
    return;
  }
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  );
  client.value = supabase;
  const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
    session.value = nextSession;
    if (event === "PASSWORD_RECOVERY") mode.value = "recovery";
    // Avoid calling another Supabase method inside this callback.
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION")
      setTimeout(() => void loadProfile(), 0);
  });
  unsubscribe = () => data.subscription.unsubscribe();
  ready.value = true;
});
onBeforeUnmount(() => unsubscribe?.());

async function submit() {
  if (!client.value) return;
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    if (mode.value === "recovery") {
      const { error } = await client.value.auth.updateUser({
        password: password.value,
      });
      if (error) throw error;
      password.value = "";
      mode.value = "login";
      message.value = "パスワードを変更しました。";
    } else if (mode.value === "reset") {
      const { error } = await client.value.auth.resetPasswordForEmail(
        email.value,
        { redirectTo: redirectUrl() },
      );
      if (error) throw error;
      message.value =
        "登録済みの場合、再設定メールが届きます。メールをご確認ください。";
    } else if (mode.value === "signup") {
      const { error } = await client.value.auth.signUp({
        email: email.value,
        password: password.value,
        options: { emailRedirectTo: redirectUrl() },
      });
      if (error) throw error;
      password.value = "";
      message.value =
        "確認メールを送信しました。メール内のリンクを開いてください。";
    } else {
      const { error } = await client.value.auth.signInWithPassword({
        email: email.value,
        password: password.value,
      });
      if (error) throw error;
      password.value = "";
    }
  } catch {
    errorMessage.value =
      "操作できませんでした。入力内容と設定を確認して、もう一度お試しください。";
  } finally {
    busy.value = false;
  }
}
async function saveProfile() {
  if (!client.value || !session.value) return;
  const name = displayName.value.trim();
  if (!name || [...name].length > 40) {
    errorMessage.value = "表示名は1〜40文字で入力してください。";
    return;
  }
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  const { error } = await client.value.from("profiles").upsert({
    id: session.value.user.id,
    display_name: name,
    updated_at: new Date().toISOString(),
  });
  if (error)
    errorMessage.value = "保存できませんでした。もう一度お試しください。";
  else {
    displayName.value = name;
    message.value = "表示名を保存しました。";
  }
  busy.value = false;
}
async function signOut() {
  if (!client.value) return;
  const { error } = await client.value.auth.signOut();
  if (error) errorMessage.value = "ログアウトできませんでした。";
  else {
    if (String(config.public.nearPasskeyEnabled) === "true") {
      const result = await createAuthClient().signOut();
      if (result.error) {
        errorMessage.value = "認証サービスからログアウトできませんでした。";
        return;
      }
    }
    displayName.value = "";
    message.value = "ログアウトしました。";
  }
}
async function deleteAccount() {
  if (!client.value || !session.value || busy.value) return;
  const confirmation = window.prompt(
    "アカウント、友達関係、位置情報を削除します。元には戻せません。続けるには「削除」と入力してください。",
  );
  if (confirmation !== "削除") return;
  busy.value = true;
  errorMessage.value = "";
  message.value = "";
  try {
    if (String(config.public.nearPasskeyEnabled) === "true") {
      const auth = createAuthClient({ plugins: [passkeyClient()] });
      const verified = await auth.signIn.passkey();
      const linked = session.value.user.identities?.some(
        (identity) =>
          identity.provider === "custom:near" &&
          identity.identity_data?.sub === verified.data?.user?.id,
      );
      if (verified.error || !linked) {
        errorMessage.value =
          "ログイン中のアカウントのパスキーを確認してください。";
        return;
      }
      const removed = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.value.access_token}` },
      });
      if (!removed.ok) throw new Error("Deletion failed");
      await client.value.auth.signOut({ scope: "local" });
      session.value = null;
      displayName.value = "";
      message.value = "アカウントを削除しました。";
      return;
    }
    const { error } = await client.value.functions.invoke("delete-account", {
      body: {},
    });
    if (error) {
      if (error.context instanceof Response && error.context.status === 403) {
        errorMessage.value =
          "安全のため、ログアウトして再ログインした後に削除してください。";
      } else {
        errorMessage.value =
          "削除を完了できませんでした。通信を確認し、もう一度お試しください。";
      }
      return;
    }
    await client.value.auth.signOut({ scope: "local" });
    session.value = null;
    displayName.value = "";
    message.value = "アカウントを削除しました。";
  } catch {
    errorMessage.value =
      "削除の結果を確認できません。ログイン状態を確認してください。";
  } finally {
    busy.value = false;
  }
}
async function googleLogin() {
  if (!client.value) return;
  const { error } = await client.value.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl() },
  });
  if (error) errorMessage.value = "Googleログインを開始できませんでした。";
}
async function passkeyLogin() {
  if (!client.value) return;
  const { error } = await client.value.auth.signInWithOAuth({
    provider: "custom:near",
    options: { redirectTo: redirectUrl(), scopes: "openid" },
  });
  if (error) errorMessage.value = "パスキー認証を開始できませんでした。";
}
</script>

<template>
  <main class="account-page">
    <div class="account-wrap">
      <a class="brand" href="/"
        ><span class="brand-icon">✳</span> near<span class="brand-dot"
          >.</span
        ></a
      >
      <section class="account-card">
        <span class="section-kicker">YOUR LITTLE WORLD</span>
        <h1>おかえりなさい。</h1>
        <p class="account-intro">友達とつながる準備をしましょう。</p>
        <p v-if="errorMessage" class="account-alert error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="message" class="account-alert" role="status">{{ message }}</p>
        <p v-if="!ready">読み込み中…</p>
        <template v-else-if="session && mode !== 'recovery'">
          <p class="account-intro">ログイン中</p>
          <form @submit.prevent="saveProfile">
            <label for="display-name">表示名</label>
            <input
              id="display-name"
              v-model="displayName"
              maxlength="40"
              required
              placeholder="なんて呼ばれたい？"
            />
            <button class="primary-button" :disabled="busy">
              表示名を保存
            </button>
          </form>
          <button class="link-button" type="button" @click="signOut">
            ログアウト
          </button>
          <RecoveryEmailSettings
            v-if="
              client &&
              String(config.public.nearPasskeyEnabled) === 'true' &&
              String(config.public.nearRecoveryEnabled) === 'true'
            "
            :supabase="client"
          />
          <div class="account-danger">
            <h2>アカウントの削除</h2>
            <p>
              アカウント、友達関係、保存された位置情報を削除します。削除後は元に戻せません。
            </p>
            <button type="button" :disabled="busy" @click="deleteAccount">
              アカウントを削除
            </button>
          </div>
        </template>
        <div v-else-if="String(config.public.nearPasskeyEnabled) === 'true'">
          <p class="account-intro">パスキーを使ってログインできます。</p>
          <button
            class="primary-button"
            type="button"
            :disabled="!client"
            @click="passkeyLogin"
          >
            パスキーではじめる
          </button>
        </div>
        <form v-else @submit.prevent="submit">
          <template v-if="mode !== 'recovery'">
            <label for="email">メールアドレス</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
            />
          </template>
          <template v-if="mode !== 'reset'">
            <label for="password">{{
              mode === "recovery" ? "新しいパスワード" : "パスワード"
            }}</label>
            <input
              id="password"
              v-model="password"
              type="password"
              :autocomplete="
                mode === 'login' ? 'current-password' : 'new-password'
              "
              minlength="6"
              required
            />
          </template>
          <button class="primary-button" :disabled="busy || !client">
            {{
              mode === "login"
                ? "ログイン"
                : mode === "signup"
                  ? "アカウントを作成"
                  : mode === "reset"
                    ? "再設定メールを送信"
                    : "パスワードを変更"
            }}
          </button>
          <button
            v-if="
              mode === 'login' &&
              String(config.public.googleAuthEnabled) === 'true'
            "
            class="secondary-button"
            type="button"
            @click="googleLogin"
          >
            Googleでログイン
          </button>
          <div v-if="mode !== 'recovery'" class="account-links">
            <button
              type="button"
              @click="
                mode = mode === 'signup' ? 'login' : 'signup';
                message = '';
                errorMessage = '';
              "
            >
              {{ mode === "signup" ? "ログインに戻る" : "アカウントを作成" }}
            </button>
            <button
              v-if="mode !== 'reset'"
              type="button"
              @click="
                mode = 'reset';
                message = '';
                errorMessage = '';
              "
            >
              パスワードを忘れた方
            </button>
            <button
              v-else
              type="button"
              @click="
                mode = 'login';
                message = '';
                errorMessage = '';
              "
            >
              ログインに戻る
            </button>
          </div>
        </form>
        <a v-if="session" class="back-link" href="/friends">友達を追加する →</a>
        <a class="back-link" href="/">← マップに戻る</a>
      </section>
    </div>
    <AppNav active="account" />
  </main>
</template>
