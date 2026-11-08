<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Map as MapLibreMap } from "maplibre-gl";
import { friends, statusLabel } from "../utils/demo";

const mapElement = ref<HTMLElement | null>(null);
const selected = ref(friends[0]!);
const sharing = ref(false);
let map: MapLibreMap | undefined;

function selectFriend(friend: (typeof friends)[number]) {
  selected.value = friend;
  map?.flyTo({ center: friend.coordinates, zoom: 12.7, duration: 900 });
}

onMounted(async () => {
  const maplibre = await import("maplibre-gl");
  if (!mapElement.value) return;
  map = new maplibre.Map({
    container: mapElement.value,
    style: "https://demotiles.maplibre.org/style.json",
    center: [139.7, 35.659],
    zoom: 12.1,
    attributionControl: false,
  });
  map.addControl(
    new maplibre.AttributionControl({ compact: true }),
    "bottom-right",
  );
  map.addControl(
    new maplibre.NavigationControl({ showCompass: false }),
    "bottom-right",
  );
  for (const friend of friends) {
    const el = document.createElement("button");
    el.className = "map-marker";
    el.style.setProperty("--marker-color", friend.color);
    el.textContent = friend.initial;
    el.setAttribute("aria-label", `${friend.name}の位置を見る`);
    el.addEventListener("click", () => selectFriend(friend));
    new maplibre.Marker({ element: el })
      .setLngLat(friend.coordinates)
      .addTo(map);
  }
});
onBeforeUnmount(() => map?.remove());
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar">
      <div class="brand-row">
        <a class="brand" href="#"
          ><span class="brand-icon">✳</span> near<span class="brand-dot"
            >.</span
          ></a
        ><a class="preview-pill" href="/friends">友達 →</a>
      </div>
      <div class="intro">
        <div class="eyebrow">
          <span class="sparkle">✳</span> YOUR LITTLE WORLD
        </div>
        <h1>いつものみんなを、<br /><em>もっと近くに。</em></h1>
        <p>
          離れていても、なんだか近くに感じる。<br />友達とつながる、あなただけの地図。
        </p>
      </div>
      <div class="demo-note">
        <span>✦</span>
        <p>
          <strong>これはデモ画面です</strong
          ><br />表示される友達と位置はすべて架空のものです。
        </p>
      </div>
      <div class="section-heading">
        <div>
          <span class="section-kicker">YOUR PEOPLE</span>
          <h2>
            友達 <span>{{ friends.length }}</span>
          </h2>
        </div>
        <span class="heading-icon">↗</span>
      </div>
      <div class="friend-list">
        <button
          v-for="friend in friends"
          :key="friend.id"
          class="friend-row"
          :class="{ active: selected.id === friend.id }"
          @click="selectFriend(friend)"
        >
          <span class="avatar" :style="{ background: friend.color }"
            >{{ friend.initial }}<i :class="{ stale: friend.stale }"></i
          ></span>
          <span class="friend-info"
            ><strong>{{ friend.name }}</strong
            ><small>{{ friend.place }}</small></span
          >
          <span class="friend-time"
            >{{ friend.updated
            }}<small v-if="friend.stale">更新が古い</small></span
          >
        </button>
      </div>
      <div class="sidebar-bottom">
        <div class="sharing-card">
          <span class="sharing-icon">◎</span>
          <div>
            <strong>位置情報の共有</strong><small>デモ上の表示のみ</small>
          </div>
          <button
            class="toggle"
            :class="{ on: sharing }"
            :aria-pressed="sharing"
            :aria-label="
              sharing
                ? 'デモの共有表示をオフにする'
                : 'デモの共有表示をオンにする'
            "
            @click="sharing = !sharing"
          >
            <span></span>
          </button>
        </div>
        <p class="privacy">
          ♧ &nbsp;位置を見られるのは、承認した友達だけ。<br /><span
            >実際の共有機能は今後実装します。</span
          >
        </p>
      </div>
    </aside>
    <section class="map-area" aria-label="友達のデモ地図">
      <div ref="mapElement" class="map"></div>
      <div class="map-top">
        <div class="map-title">
          <span class="map-title-icon">✳</span>
          <div>
            <strong>みんなのマップ</strong
            ><small>今日も、ゆるくつながろう。</small>
          </div>
        </div>
        <span class="map-demo">● &nbsp; DEMO MAP</span>
      </div>
      <div class="map-caption">
        <span>✦</span> それぞれの場所で、同じ時間を。
      </div>
      <div class="place-card">
        <div class="place-top">
          <span class="avatar large" :style="{ background: selected.color }"
            >{{ selected.initial }}<i :class="{ stale: selected.stale }"></i
          ></span>
          <div>
            <div class="place-name">
              {{ selected.name }}
              <span :class="{ old: selected.stale }">{{
                statusLabel(selected)
              }}</span>
            </div>
            <p>{{ selected.place }}</p>
          </div>
          <span class="place-heart">♡</span>
        </div>
        <div class="place-details">
          <span>◷ &nbsp;{{ selected.updated }}に更新</span
          ><span>◎ &nbsp;精度 {{ selected.accuracy }}</span>
        </div>
      </div>
      <div class="map-footer">MADE FOR YOUR CLOSEST PEOPLE &nbsp; ✳</div>
    </section>
  </main>
</template>
