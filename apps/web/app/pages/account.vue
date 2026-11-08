<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { onBeforeUnmount, onMounted, ref } from "vue";

const config = useRuntimeConfig();
const client = ref<SupabaseClient | null>(null);
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
    displayName.value = "";
    message.value = "ログアウトしました。";
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
          <p class="account-intro">{{ session.user.email }} でログイン中</p>
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
        </template>
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
            v-if="mode === 'login' && config.public.googleAuthEnabled === true"
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
        <a class="back-link" href="/">← デモ地図に戻る</a>
      </section>
    </div>
  </main>
</template>
