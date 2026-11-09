<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  useLocationMap,
  type MapLocation,
} from "../composables/useLocationMap";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { formatLocationTime, isLocationStale } from "../utils/location";

type Location = MapLocation;
type LocationState = { sharing: boolean; locations: Location[] };
const config = useRuntimeConfig();
const client = ref<SupabaseClient | null>(null);
const session = ref<Session | null>(null);
const mapElement = ref<HTMLElement | null>(null);
const sharing = ref(false);
const statusUncertain = ref(true);
const locations = ref<Location[]>([]);
const busy = ref(false);
const ready = ref(false);
const tracking = ref(false);
const message = ref("");
const errorMessage = ref("");
const clock = ref(Date.now());
let unsubscribe: (() => void) | undefined;
const locationMap = useLocationMap();
let poll: ReturnType<typeof setInterval> | undefined;
let tick: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let updateInFlight = false;
let disposed = false;
let refreshSequence = 0;

function stopPolling() {
  generation++;
  if (poll) clearInterval(poll);
  poll = undefined;
  tracking.value = false;
}
function isStale(location: Location) {
  return isLocationStale(location.updated_at, clock.value);
}
function formatDate(value: string) {
  return formatLocationTime(value, clock.value);
}
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    }),
  );
}
async function refresh() {
  if (!client.value || !session.value) return;
  const actorId = session.value.user.id;
  const sequence = ++refreshSequence;
  const { data, error } = await client.value.rpc("near_location_action", {
    action: "list",
  });
  if (
    sequence !== refreshSequence ||
    session.value?.user.id !== actorId ||
    disposed
  )
    return;
  if (error) {
    errorMessage.value = "位置情報を取得できませんでした。";
    return;
  }
  if (!session.value || disposed) return;
  const state = data as LocationState;
  sharing.value = state.sharing;
  statusUncertain.value = false;
  locations.value = state.locations;
  if (!state.sharing && tracking.value) stopPolling();
  await locationMap.render(locations.value, actorId);
}
async function sendPosition(action: "start" | "update", run: number) {
  if (!client.value || !session.value || updateInFlight) return false;
  updateInFlight = true;
  let requestSent = false;
  try {
    const position = await getPosition();
    if (run !== generation || !session.value || disposed) return false;
    requestSent = true;
    const { error } = await client.value.rpc("near_location_action", {
      action,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy,
    });
    if (error) throw error;
    if (run !== generation || !session.value || disposed) return false;
    if (action === "start") sharing.value = true;
    statusUncertain.value = false;
    errorMessage.value = "";
    await refresh();
    return true;
  } catch {
    if (run !== generation || !session.value || disposed) return false;
    if (action === "start" && requestSent) {
      refreshSequence++;
      statusUncertain.value = true;
      errorMessage.value =
        "共有が開始されたか確認できません。通信を確認し、共有状態を確認するか停止してください。";
    } else {
      errorMessage.value =
        "位置を更新できませんでした。ブラウザの位置情報の許可と通信状態を確認してください。";
    }
    return false;
  } finally {
    updateInFlight = false;
  }
}
async function start() {
  if (!client.value || !session.value || busy.value) return;
  if (!navigator.geolocation || !window.isSecureContext) {
    errorMessage.value = "位置情報を使うにはHTTPSまたはlocalhostが必要です。";
    return;
  }
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  stopPolling();
  const run = generation;
  if (await sendPosition("start", run)) {
    tracking.value = true;
    message.value = "位置の共有を開始しました。";
    poll = setInterval(() => void sendPosition("update", run), 60_000);
  }
  busy.value = false;
}
async function stop() {
  if (!client.value || !session.value || busy.value) return;
  busy.value = true;
  stopPolling();
  refreshSequence++;
  message.value = "";
  errorMessage.value = "";
  const { error } = await client.value.rpc("near_location_action", {
    action: "stop",
  });
  if (error)
    errorMessage.value =
      "共有を停止できませんでした。通信を確認して再度停止してください。";
  else {
    sharing.value = false;
    statusUncertain.value = false;
    message.value = "位置の共有を停止し、保存済みの位置を削除しました。";
    await refresh();
  }
  busy.value = false;
}
onMounted(async () => {
  if (!config.public.supabaseUrl || !config.public.supabasePublishableKey) {
    errorMessage.value = "Supabaseが未設定です。";
    ready.value = true;
    return;
  }
  if (!mapElement.value) return;
  try {
    await locationMap.initialize(mapElement.value);
  } catch {
    errorMessage.value =
      "地図を表示できませんでした。共有の停止は引き続き操作できます。";
  }
  if (disposed) return;
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  );
  client.value = supabase;
  const { data } = supabase.auth.onAuthStateChange((_event, next) => {
    if (next && next.user.id !== session.value?.user.id) {
      refreshSequence++;
      stopPolling();
      statusUncertain.value = true;
      locations.value = [];
      locationMap.clear();
    }
    session.value = next;
    if (next) setTimeout(() => void refresh(), 0);
    else {
      refreshSequence++;
      stopPolling();
      sharing.value = false;
      statusUncertain.value = false;
      locations.value = [];
      locationMap.clear();
    }
  });
  unsubscribe = () => data.subscription.unsubscribe();
  tick = setInterval(() => {
    clock.value = Date.now();
    if (session.value) void refresh();
  }, 30_000);
  ready.value = true;
});
onBeforeUnmount(() => {
  disposed = true;
  stopPolling();
  if (tick) clearInterval(tick);
  unsubscribe?.();
  locationMap.destroy();
});
</script>

<template>
  <main class="location-page">
    <header class="location-header">
      <a class="brand" href="/"
        ><span class="brand-icon">✳</span> near<span class="brand-dot"
          >.</span
        ></a
      >
      <span
        v-if="session"
        class="header-caption sharing-badge"
        :class="{ active: sharing && !statusUncertain }"
        aria-live="polite"
      >
        {{
          statusUncertain
            ? "共有状態を確認中"
            : sharing
              ? "● 位置を共有中"
              : "○ 共有オフ"
        }}
      </span>
      <span v-else class="header-caption">your people, closer ✳</span>
    </header>
    <section class="location-content">
      <div class="location-panel">
        <span class="section-kicker">YOUR LOCATION</span>
        <h1>みんなの現在地。</h1>
        <p class="account-intro">
          承認した友達とだけ、今いる場所を共有できます。
        </p>
        <p v-if="errorMessage" class="account-alert error" role="alert">
          {{ errorMessage }}
        </p>
        <p v-if="message" class="account-alert" role="status">{{ message }}</p>
        <p v-if="!ready">読み込み中…</p>
        <template v-else-if="!session"
          ><p>位置共有にはログインと表示名の設定が必要です。</p>
          <a class="back-link" href="/account">ログインへ →</a></template
        >
        <template v-else
          ><div class="location-sharing">
            <strong
              >位置共有：{{
                statusUncertain ? "確認できません" : sharing ? "オン" : "オフ"
              }}</strong
            >
            <p>
              共有は初期状態でオフです。停止すると保存された位置も削除されます。
            </p>
            <button
              v-if="!sharing && !statusUncertain"
              class="primary-button"
              :disabled="busy"
              @click="start"
            >
              位置共有を始める</button
            ><template v-else
              ><button
                v-if="sharing && !tracking && !statusUncertain"
                class="secondary-button"
                :disabled="busy"
                @click="start"
              >
                このページで位置更新を再開</button
              ><button
                class="secondary-button stop-button"
                :disabled="busy"
                @click="stop"
              >
                位置共有を停止
              </button></template
            >
            <p>
              位置の送信はこのページを開いている間のみ行います。閉じても共有は停止せず、最後の位置が残ります。停止するにはボタンを押してください。
            </p>
          </div>
          <div class="friend-section">
            <h2>
              表示できる位置 <span>{{ locations.length }}</span>
            </h2>
            <p v-if="!locations.length">共有中の位置はまだありません。</p>
            <div v-for="item in locations" :key="item.id" class="location-row">
              <strong
                >{{ item.name }}
                <small v-if="item.id === session.user.id"
                  >（自分）</small
                ></strong
              ><span :class="{ old: isStale(item) }"
                >{{ isStale(item) ? "更新が古い・" : ""
                }}{{ formatDate(item.updated_at) }} 更新</span
              ><span>精度 約{{ Math.round(item.accuracy_m) }} m</span>
            </div>
          </div>
        </template>
        <p class="account-intro">
          地図の表示にはOpenStreetMapを利用します。地図を表示すると、提供元にIPアドレスと表示範囲が送られます。
        </p>
      </div>
      <div
        ref="mapElement"
        class="location-map"
        aria-label="位置マーカーの表示領域"
      ></div>
    </section>
    <AppNav active="map" />
  </main>
</template>
