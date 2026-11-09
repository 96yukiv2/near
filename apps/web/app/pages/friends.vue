<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { getProfileIcon } from "../utils/profile-icon";
import {
  clearPendingInvite,
  getPendingInvite,
  savePendingInvite,
} from "../utils/pending-invite";

type Person = { id: string; name: string; icon?: string };
type Request = { id: string; user_id: string; name: string };
type Relationships = {
  friends: Person[];
  incoming: Request[];
  outgoing: Request[];
  blocked: Person[];
};
const config = useRuntimeConfig();
const client = ref<SupabaseClient | null>(null);
const session = ref<Session | null>(null);
const data = ref<Relationships>({
  friends: [],
  incoming: [],
  outgoing: [],
  blocked: [],
});
const inviteToken = ref("");
const inviteLink = ref("");
const inviteSaved = ref(false);
let inviteStorage: Storage | undefined;
const message = ref("");
const errorMessage = ref("");
const busy = ref(false);
const ready = ref(false);
let unsubscribe: (() => void) | undefined;

async function refresh() {
  if (!client.value || !session.value) return;
  const { data: result, error } = await client.value.rpc("near_friend_action", {
    action: "list",
  });
  if (error)
    errorMessage.value =
      "友達情報を取得できませんでした。時間をおいてお試しください。";
  else data.value = result as Relationships;
}
onMounted(() => {
  const token = new URLSearchParams(window.location.hash.slice(1)).get(
    "invite",
  );
  try {
    inviteStorage = window.sessionStorage;
  } catch {
    inviteStorage = undefined;
  }
  if (token) {
    inviteToken.value = token;
    inviteSaved.value =
      !!inviteStorage && savePendingInvite(inviteStorage, token);
    if (inviteSaved.value) {
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  } else if (inviteStorage) {
    inviteToken.value = getPendingInvite(inviteStorage);
    inviteSaved.value = !!inviteToken.value;
  }
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    errorMessage.value = "Supabaseが未設定です。";
    ready.value = true;
    return;
  }
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  );
  client.value = supabase;
  const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
    session.value = next;
    if (next) setTimeout(() => void refresh(), 0);
    else {
      inviteLink.value = "";
      data.value = { friends: [], incoming: [], outgoing: [], blocked: [] };
    }
  });
  unsubscribe = () => listener.subscription.unsubscribe();
  ready.value = true;
});
onBeforeUnmount(() => unsubscribe?.());
async function act(action: string, target?: string) {
  if (!client.value || !session.value || busy.value) return;
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  const params: Record<string, string> = { action };
  if (target) params.target = target;
  if (action === "request") params.token = inviteToken.value;
  const { data: result, error } = await client.value.rpc(
    "near_friend_action",
    params,
  );
  if (error) {
    errorMessage.value = error.message.includes("profile required")
      ? "先にアカウント画面で表示名を保存してください。"
      : "操作できませんでした。リンクの期限や友達の状態を確認してください。";
  } else if (action === "create_invite") {
    inviteLink.value = `${window.location.origin}/friends#invite=${result.token}`;
    message.value =
      "招待リンクを作成しました。有効期限は24時間で、1回だけ使用できます。";
  } else {
    if (action === "request") {
      inviteToken.value = "";
      if (inviteStorage) clearPendingInvite(inviteStorage);
      inviteSaved.value = false;
    }
    message.value =
      action === "request"
        ? "友達申請を送りました。相手の承認を待ちましょう。"
        : "変更を保存しました。";
    await refresh();
  }
  busy.value = false;
}
async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    message.value = "招待リンクをコピーしました。";
  } catch {
    message.value = "リンクを選択してコピーしてください。";
  }
}
</script>

<template>
  <main class="account-page">
    <div class="account-wrap friends-wrap">
      <a class="brand" href="/"
        ><span class="brand-icon">✳</span> near<span class="brand-dot"
          >.</span
        ></a
      >
      <section class="account-card">
        <span class="section-kicker">YOUR PEOPLE</span>
        <h1>友達とつながろう。</h1>
        <p class="account-intro">大切な人だけを、あなたの輪の中に。</p>
        <p v-if="errorMessage" class="account-alert error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="message" class="account-alert" role="status">{{ message }}</p>
        <p v-if="!ready">読み込み中…</p>
        <template v-else-if="!session"
          ><p>友達機能を使うには、ログインと表示名の設定が必要です。</p>
          <a
            v-if="inviteToken && !inviteSaved"
            class="back-link"
            href="/account"
            target="_blank"
            rel="noopener"
            >別のタブでログイン →</a
          >
          <a v-else class="back-link" href="/account">ログイン →</a>
          <p v-if="inviteToken" class="account-intro">
            {{
              inviteSaved
                ? "ログインと表示名の設定後、友達画面に戻って申請してください。"
                : "このページを開いたままログイン後、戻って申請してください。"
            }}
          </p></template
        >
        <template v-else>
          <div v-if="inviteToken" class="friend-section">
            <h2>招待が届いています</h2>
            <p>申請後、招待した相手の承認を待ちます。</p>
            <button
              class="primary-button"
              :disabled="busy"
              @click="act('request')"
            >
              友達申請を送る
            </button>
          </div>
          <div class="friend-section">
            <h2>招待する</h2>
            <p>リンクは信頼できる人にだけ渡してください。</p>
            <button
              class="secondary-button"
              :disabled="busy"
              @click="act('create_invite')"
            >
              招待リンクを作る
            </button>
            <div v-if="inviteLink" class="invite-link">
              <label for="invite-link">招待リンク</label
              ><input
                id="invite-link"
                :value="inviteLink"
                readonly
                @focus="($event.target as HTMLInputElement).select()"
              /><button class="link-button" @click="copyInvite">コピー</button>
            </div>
          </div>
          <div class="friend-section">
            <h2>
              届いた申請 <span>{{ data.incoming.length }}</span>
            </h2>
            <p v-if="!data.incoming.length">届いた申請はありません。</p>
            <div
              v-for="request in data.incoming"
              :key="request.id"
              class="relation-row"
            >
              <strong>{{ request.name }}</strong>
              <div>
                <button :disabled="busy" @click="act('accept', request.id)">
                  承認</button
                ><button :disabled="busy" @click="act('decline', request.id)">
                  断る</button
                ><button
                  :disabled="busy"
                  @click="act('block', request.user_id)"
                >
                  ブロック
                </button>
              </div>
            </div>
          </div>
          <div class="friend-section">
            <h2>
              友達 <span>{{ data.friends.length }}</span>
            </h2>
            <p v-if="!data.friends.length">まだ友達はいません。</p>
            <div
              v-for="friend in data.friends"
              :key="friend.id"
              class="relation-row"
            >
              <div class="friend-identity">
                <span
                  class="friend-avatar"
                  :style="{
                    '--avatar-color': getProfileIcon(friend.icon).color,
                  }"
                  aria-hidden="true"
                  >{{ getProfileIcon(friend.icon).symbol }}</span
                >
                <strong>{{ friend.name }}</strong>
              </div>
              <div>
                <button :disabled="busy" @click="act('remove', friend.id)">
                  削除</button
                ><button :disabled="busy" @click="act('block', friend.id)">
                  ブロック
                </button>
              </div>
            </div>
          </div>
          <div v-if="data.outgoing.length" class="friend-section">
            <h2>承認待ち</h2>
            <p v-for="request in data.outgoing" :key="request.id">
              {{ request.name }}
            </p>
          </div>
          <div v-if="data.blocked.length" class="friend-section">
            <h2>ブロック中</h2>
            <div
              v-for="person in data.blocked"
              :key="person.id"
              class="relation-row"
            >
              <strong>{{ person.name }}</strong
              ><button :disabled="busy" @click="act('unblock', person.id)">
                解除
              </button>
            </div>
            <p>解除しても友達関係は自動で戻りません。</p>
          </div>
        </template>
      </section>
    </div>
    <AppNav active="friends" />
  </main>
</template>
