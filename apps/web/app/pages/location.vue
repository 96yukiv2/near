<script setup lang="ts">
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { onBeforeUnmount, onMounted, ref } from "vue";

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  updated_at: string;
};
type LocationState = { sharing: boolean; locations: Location[] };
const config = useRuntimeConfig();
const client = ref<SupabaseClient | null>(null);
const session = ref<Session | null>(null);
const mapElement = ref<HTMLElement | null>(null);
const sharing = ref(false);
const locations = ref<Location[]>([]);
const busy = ref(false);
const ready = ref(false);
const tracking = ref(false);
const message = ref("");
const errorMessage = ref("");
const clock = ref(Date.now());
let unsubscribe: (() => void) | undefined;
let map: MapLibreMap | undefined;
let markers: MapLibreMarker[] = [];
let poll: ReturnType<typeof setInterval> | undefined;
let tick: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let updateInFlight = false;
let centered = false;
let disposed = false;
let refreshSequence = 0;

function stopPolling() {
  generation++;
  if (poll) clearInterval(poll);
  poll = undefined;
  tracking.value = false;
}
function isStale(location: Location) {
  return clock.value - new Date(location.updated_at).getTime() > 15 * 60_000;
}
function formatDate(value: string) {
  return new Date(value).toLocaleString("ja-JP");
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
async function renderMarkers() {
  if (!map) return;
  const maplibre = await import("maplibre-gl");
  if (!map || disposed) return;
  for (const marker of markers) marker.remove();
  markers = locations.value.map((location) => {
    const el = document.createElement("button");
    el.className = "map-marker";
    el.style.setProperty(
      "--marker-color",
      location.id === session.value?.user.id ? "#82b993" : "#ffad91",
    );
    el.textContent = location.name.slice(0, 1);
    el.setAttribute("aria-label", `${location.name}の位置`);
    el.addEventListener("click", () =>
      map?.flyTo({ center: [location.longitude, location.latitude], zoom: 12 }),
    );
    return new maplibre.Marker({ element: el })
      .setLngLat([location.longitude, location.latitude])
      .addTo(map!);
  });
  if (!centered && locations.value.length) {
    centered = true;
    const bounds = new maplibre.LngLatBounds();
    for (const item of locations.value)
      bounds.extend([item.longitude, item.latitude]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 0 });
  }
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
  locations.value = state.locations;
  if (!state.sharing && tracking.value) stopPolling();
  await renderMarkers();
}
async function sendPosition(action: "start" | "update", run: number) {
  if (!client.value || !session.value || updateInFlight) return false;
  updateInFlight = true;
  try {
    const position = await getPosition();
    if (run !== generation || !session.value || disposed) return false;
    const { error } = await client.value.rpc("near_location_action", {
      action,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy,
    });
    if (error) throw error;
    if (run !== generation || !session.value || disposed) return false;
    errorMessage.value = "";
    await refresh();
    return true;
  } catch {
    errorMessage.value =
      "位置を更新できませんでした。ブラウザの位置情報の許可と通信状態を確認してください。";
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
  const maplibre = await import("maplibre-gl");
  if (disposed || !mapElement.value) return;
  map = new maplibre.Map({
    container: mapElement.value,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
          maxzoom: 19,
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
    center: [139.7, 35.66],
    zoom: 4,
    attributionControl: false,
  });
  map.addControl(
    new maplibre.AttributionControl({ compact: false }),
    "bottom-right",
  );
  map.addControl(
    new maplibre.NavigationControl({ showCompass: false }),
    "bottom-right",
  );
  const supabase = createClient(
    config.public.supabaseUrl,
    config.public.supabasePublishableKey,
  );
  client.value = supabase;
  const { data } = supabase.auth.onAuthStateChange((_event, next) => {
    session.value = next;
    if (next) setTimeout(() => void refresh(), 0);
    else {
      refreshSequence++;
      stopPolling();
      sharing.value = false;
      locations.value = [];
      centered = false;
      for (const marker of markers) marker.remove();
      markers = [];
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
  map?.remove();
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
      <nav><a href="/friends">友達</a><a href="/account">アカウント</a></nav>
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
            <strong>位置共有：{{ sharing ? "オン" : "オフ" }}</strong>
            <p>
              共有は初期状態でオフです。停止すると保存された位置も削除されます。
            </p>
            <button
              v-if="!sharing"
              class="primary-button"
              :disabled="busy"
              @click="start"
            >
              位置共有を始める</button
            ><template v-else
              ><button
                v-if="!tracking"
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
  </main>
</template>
