<script setup lang="ts">
defineProps<{ active: "map" | "friends" | "account" }>();
</script>

<template>
  <nav class="app-nav" aria-label="メインナビゲーション">
    <a
      href="/location"
      :class="{ selected: active === 'map' }"
      :aria-current="active === 'map' ? 'page' : undefined"
      ><span aria-hidden="true">⌖</span><small>マップ</small></a
    >
    <a
      href="/friends"
      :class="{ selected: active === 'friends' }"
      :aria-current="active === 'friends' ? 'page' : undefined"
      ><span aria-hidden="true">♧</span><small>友達</small></a
    >
    <a
      href="/account"
      :class="{ selected: active === 'account' }"
      :aria-current="active === 'account' ? 'page' : undefined"
      ><span aria-hidden="true">◉</span><small>マイページ</small></a
    >
  </nav>
</template>
