<script setup lang="ts">
type IconName = 'local' | 'session' | 'cookies' | 'indexeddb' | 'globe' | 'close';
defineProps<{ name: IconName }>();
const paths: Record<IconName, string[]> = {
  local: ['M5 3h12l4 4v14H3V3h2Z', 'M7 3v6h10V3', 'M7 21v-8h10v8'],
  session: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 7v5l3 2'],
  cookies: ['M21 12.5A8.8 8.8 0 1 1 11.5 3a4 4 0 0 0 4.8 4.8A4 4 0 0 0 21 12.5Z', 'M8 8h.01M7 14h.01M12 16h.01M13 11h.01'],
  indexeddb: ['M20 6c0 2.2-16 2.2-16 0s16-2.2 16 0Z', 'M4 6v12c0 2.7 16 2.7 16 0V6', 'M4 12c0 2.7 16 2.7 16 0'],
  globe: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M3 12h18', 'M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z'],
  close: ['m6 6 12 12M18 6 6 18'],
};
</script>

<template>
  <svg class="ui-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="(path, index) in paths[name]" :key="index" :d="path" />
  </svg>
</template>

<style scoped>
.ui-icon{display:block;flex:none}
</style>
