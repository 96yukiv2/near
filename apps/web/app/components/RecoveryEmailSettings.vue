<script setup lang="ts">
import type { SupabaseClient } from "@supabase/supabase-js";
import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";
import { ref } from "vue";

const props = defineProps<{ supabase: SupabaseClient }>();
const auth = createAuthClient({ plugins: [passkeyClient(), emailOTPClient()] });
const email = ref("");
const code = ref("");
const pending = ref(false);
const busy = ref(false);
const message = ref("");
const error = ref("");

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    if (!pending.value) {
      const verified = await auth.signIn.passkey();
      if (verified.error || !verified.data?.user) throw new Error("passkey");
      const supabaseUser = await props.supabase.auth.getUser();
      const linked = supabaseUser.data.user?.identities?.some(
        (identity) =>
          identity.provider === "custom:near" &&
          identity.identity_data?.sub === verified.data.user.id,
      );
      if (supabaseUser.error || !linked) throw new Error("different_account");
      const result = await auth.emailOtp.requestEmailChange({
        newEmail: email.value.trim(),
      });
      if (result.error) throw result.error;
      pending.value = true;
      message.value = "確認コードを送信しました。";
    } else {
      const result = await auth.emailOtp.changeEmail({
        newEmail: email.value.trim(),
        otp: code.value.trim(),
      });
      if (result.error) throw result.error;
      email.value = "";
      code.value = "";
      pending.value = false;
      message.value = "復旧用メールを登録しました。";
    }
  } catch {
    error.value =
      "登録できませんでした。ログイン中のアカウントと入力内容を確認してください。";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="account-danger">
    <h2>復旧用メール</h2>
    <p>
      任意で登録できます。登録したメールアドレスはアカウント復旧のために保存されます。
    </p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form @submit.prevent="submit">
      <label for="backup-email">メールアドレス</label>
      <input
        id="backup-email"
        v-model="email"
        type="email"
        autocomplete="email"
        required
        :readonly="pending"
      />
      <template v-if="pending">
        <label for="backup-code">確認コード</label>
        <input
          id="backup-code"
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          required
        />
      </template>
      <button class="secondary-button" type="submit" :disabled="busy">
        {{ pending ? "確認する" : "パスキーで確認して登録" }}
      </button>
    </form>
  </section>
</template>
