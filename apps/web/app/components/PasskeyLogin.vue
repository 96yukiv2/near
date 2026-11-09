<script setup lang="ts">
import { createAuthClient } from "better-auth/vue";
import { anonymousClient, emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { ref } from "vue";

const auth = createAuthClient({
  plugins: [anonymousClient(), passkeyClient(), emailOTPClient()],
});
const oauth = createAuthClient({ plugins: [oauthProviderClient()] });
const config = useRuntimeConfig();
const busy = ref(false);
const errorMessage = ref("");
const recoveryEmail = ref("");
const recoveryCode = ref("");
const savedRecoveryCode = ref("");
const recoveryCodeVerified = ref(false);
const recoveryStarted = ref(false);
const recoverySent = ref(false);
const recoveryAuthenticated = ref(false);

async function continueAuthorization() {
  const continued = await oauth.oauth2.continue({ created: true });
  if (continued.error || !continued.data?.url)
    throw new Error("Authorization did not continue");
  window.location.assign(continued.data.url);
}

async function begin(create: boolean) {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    if (create) {
      const current = await auth.getSession();
      if (current.error) throw current.error;
      if (current.data?.session) {
        const passkeys = await auth.passkey.listUserPasskeys();
        if (passkeys.error) throw passkeys.error;
        if (passkeys.data?.length) {
          errorMessage.value =
            "登録済みのパスキーが見つかりました。「パスキーでログイン」をお試しください。";
          return;
        }
      } else {
        const result = await auth.signIn.anonymous();
        if (result.error) throw result.error;
      }
      const result = await auth.passkey.addPasskey();
      if (result.error?.status === 403) {
        errorMessage.value =
          "パスキー登録を続けられませんでした。登録済みの場合は「パスキーでログイン」をお試しください。";
        return;
      }
      if (result.error) throw result.error;
      await auth.signOut();
      const verified = await auth.signIn.passkey();
      if (verified.error) throw verified.error;
    } else {
      const result = await auth.signIn.passkey();
      if (result.error) throw result.error;
    }
    await continueAuthorization();
  } catch {
    errorMessage.value =
      "認証を完了できませんでした。LINEなどのアプリ内ブラウザの場合は、Safariで開いてもう一度お試しください。";
  } finally {
    busy.value = false;
  }
}

async function recover() {
  if (busy.value) return;
  busy.value = true;
  errorMessage.value = "";
  try {
    if (!recoverySent.value) {
      const result = await auth.emailOtp.sendVerificationOtp({
        email: recoveryEmail.value.trim(),
        type: "sign-in",
      });
      if (result.error) throw result.error;
      recoverySent.value = true;
    } else {
      if (!recoveryAuthenticated.value) {
        const result = await auth.signIn.emailOtp({
          email: recoveryEmail.value.trim(),
          otp: recoveryCode.value.trim(),
        });
        if (result.error) throw result.error;
        recoveryCode.value = "";
        recoveryAuthenticated.value = true;
        return;
      }
      if (!recoveryCodeVerified.value) {
        const response = await fetch("/api/recovery/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: savedRecoveryCode.value.trim() }),
        });
        if (!response.ok) throw new Error("Invalid recovery code");
        savedRecoveryCode.value = "";
        recoveryCodeVerified.value = true;
      }
      const passkey = await auth.passkey.addPasskey();
      if (passkey.error) throw passkey.error;
      await auth.signOut();
      const verified = await auth.signIn.passkey();
      if (verified.error) throw verified.error;
      await continueAuthorization();
    }
  } catch {
    errorMessage.value =
      "確認できませんでした。時間をおいてもう一度お試しください。";
  } finally {
    busy.value = false;
  }
}

async function retryDeletion() {
  if (busy.value || !window.confirm("中断したアカウント削除を再試行しますか？"))
    return;
  busy.value = true;
  errorMessage.value = "";
  try {
    const verified = await auth.signIn.passkey();
    if (verified.error) throw verified.error;
    const removed = await fetch("/api/account/delete", { method: "POST" });
    if (!removed.ok) throw new Error("Deletion failed");
    window.location.assign("/account");
  } catch {
    errorMessage.value =
      "削除を再試行できませんでした。アカウントと通信状態を確認してください。";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="account-page">
    <div class="account-wrap">
      <a class="brand" href="/">
        <span class="brand-icon">✳</span> near<span class="brand-dot">.</span>
      </a>
      <section class="account-card">
        <span class="section-kicker">YOUR LITTLE WORLD</span>
        <h1>パスキーでつながろう。</h1>
        <p class="account-intro">
          端末の顔認証や指紋認証などを使います。メールアドレスの入力は不要です。
        </p>
        <p v-if="errorMessage" class="account-alert error" role="alert">
          {{ errorMessage }}
        </p>
        <div class="passkey-actions">
          <button
            class="primary-button"
            type="button"
            :disabled="busy"
            @click="begin(false)"
          >
            パスキーでログイン
          </button>
          <button
            class="secondary-button"
            type="button"
            :disabled="busy"
            @click="begin(true)"
          >
            はじめて利用する
          </button>
        </div>
        <p v-if="busy" role="status">認証処理中です…</p>
        <p class="account-intro">
          パスキーをすべて失うと、復旧方法を設定していない場合はアカウントを復元できません。
        </p>
        <template v-if="String(config.public.nearRecoveryEnabled) === 'true'">
          <button
            v-if="!recoveryStarted"
            class="link-button"
            type="button"
            @click="recoveryStarted = true"
          >
            登録済みのメールで復旧
          </button>
          <form v-else @submit.prevent="recover">
            <label for="recovery-email">事前に登録したメールアドレス</label>
            <input
              id="recovery-email"
              v-model="recoveryEmail"
              type="email"
              autocomplete="email"
              required
              :readonly="recoverySent"
            />
            <template v-if="recoverySent && !recoveryAuthenticated">
              <p>登録済みの場合、確認コードが届きます。</p>
              <label for="recovery-code">確認コード</label>
              <input
                id="recovery-code"
                v-model="recoveryCode"
                inputmode="numeric"
                autocomplete="one-time-code"
                required
              />
            </template>
            <template v-if="recoveryAuthenticated && !recoveryCodeVerified">
              <label for="saved-recovery-code">保存した復旧コード</label>
              <input
                id="saved-recovery-code"
                v-model="savedRecoveryCode"
                autocomplete="off"
                required
              />
            </template>
            <p v-if="recoveryAuthenticated">
              復旧コードを使って新しいパスキーを登録すると、以前のパスキーは使えなくなります。
            </p>
            <button class="secondary-button" type="submit" :disabled="busy">
              {{
                recoveryAuthenticated
                  ? "新しいパスキーを登録"
                  : recoverySent
                    ? "復旧する"
                    : "確認コードを送る"
              }}
            </button>
          </form>
        </template>
        <button
          class="link-button"
          type="button"
          :disabled="busy"
          @click="retryDeletion"
        >
          中断したアカウント削除を再試行
        </button>
      </section>
    </div>
  </main>
</template>
