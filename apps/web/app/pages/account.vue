<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { createAuthClient } from "better-auth/vue";
import { passkeyClient } from "@better-auth/passkey/client";
import { getPendingInvite } from "../utils/pending-invite";
import {
  getProfileIcon,
  profileIcons,
  type ProfileIcon,
} from "../utils/profile-icon";

const config = useRuntimeConfig();
const client = shallowRef<SupabaseClient | null>(null);
const session = ref<Session | null>(null);
const displayName = ref("");
const profileIcon = ref<ProfileIcon>("sun");
const profileIconsAvailable = ref(true);
const message = ref("");
const errorMessage = ref("");
const busy = ref(false);
const ready = ref(false);
const hasPendingInvite = ref(false);
let unsubscribe: (() => void) | undefined;
const redirectUrl = () => `${window.location.origin}/account`;

async function loadProfile() {
  if (!client.value || !session.value) return;
  const result = await client.value
    .from("profiles")
    .select("display_name, icon")
    .eq("id", session.value.user.id)
    .maybeSingle();
  if (result.error && ["42703", "PGRST204"].includes(result.error.code)) {
    // A preview may run before the additive icon migration is applied.
    profileIconsAvailable.value = false;
    const fallback = await client.value
      .from("profiles")
      .select("display_name")
      .eq("id", session.value.user.id)
      .maybeSingle();
    if (fallback.error)
      errorMessage.value = "プロフィールを読み込めませんでした。";
    else displayName.value = fallback.data?.display_name ?? "";
  } else if (result.error)
    errorMessage.value = "プロフィールを読み込めませんでした。";
  else {
    profileIconsAvailable.value = true;
    displayName.value = result.data?.display_name ?? "";
    profileIcon.value = getProfileIcon(result.data?.icon).id;
  }
  if (hasPendingInvite.value && displayName.value) {
    window.location.assign("/friends");
  }
}

onMounted(async () => {
  try {
    hasPendingInvite.value = !!getPendingInvite(window.sessionStorage);
  } catch {
    hasPendingInvite.value = false;
  }
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
    // Avoid calling another Supabase method inside this callback.
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION")
      setTimeout(() => void loadProfile(), 0);
  });
  unsubscribe = () => data.subscription.unsubscribe();
  ready.value = true;
});
onBeforeUnmount(() => unsubscribe?.());

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
    ...(profileIconsAvailable.value ? { icon: profileIcon.value } : {}),
    updated_at: new Date().toISOString(),
  });
  if (error)
    errorMessage.value = "保存できませんでした。もう一度お試しください。";
  else {
    displayName.value = name;
    message.value = "プロフィールを保存しました。";
    if (hasPendingInvite.value) window.location.assign("/friends");
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
async function passkeyLogin() {
  if (!client.value || busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    const { error } = await client.value.auth.signInWithOAuth({
      provider: "custom:near",
      options: { redirectTo: redirectUrl(), scopes: "openid" },
    });
    if (error) throw error;
  } catch {
    errorMessage.value = "パスキー認証を開始できませんでした。";
  } finally {
    busy.value = false;
  }
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
        <h1>Nearへようこそ。</h1>
        <p class="account-intro">友達とつながる準備をしましょう。</p>
        <p v-if="errorMessage" class="account-alert error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="message" class="account-alert" role="status">{{ message }}</p>
        <p v-if="hasPendingInvite" class="account-alert" role="status">
          友達から招待が届いています。ログインと表示名の設定後に確認できます。
        </p>
        <p v-if="!ready">読み込み中…</p>
        <template v-else-if="session">
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
            <fieldset class="icon-picker" :disabled="!profileIconsAvailable">
              <legend>アイコン</legend>
              <div class="icon-options">
                <label
                  v-for="icon in profileIcons"
                  :key="icon.id"
                  class="icon-option"
                  :style="{ '--icon-color': icon.color }"
                  :title="icon.label"
                >
                  <input
                    v-model="profileIcon"
                    type="radio"
                    name="profile-icon"
                    :value="icon.id"
                    :aria-label="icon.label"
                  />
                  <span aria-hidden="true">{{ icon.symbol }}</span>
                </label>
              </div>
            </fieldset>
            <p v-if="!profileIconsAvailable" class="account-intro">
              アイコンの設定は準備中です。
            </p>
            <button class="primary-button" :disabled="busy">
              プロフィールを保存
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
            :disabled="!client || busy"
            @click="passkeyLogin"
          >
            {{ busy ? "認証画面へ移動中…" : "パスキーではじめる" }}
          </button>
        </div>
        <p v-else class="account-intro">パスキーログインは準備中です。</p>
        <a v-if="session" class="back-link" href="/friends">友達を追加する →</a>
        <a class="back-link" href="/">← トップに戻る</a>
      </section>
    </div>
    <AppNav active="account" />
  </main>
</template>
