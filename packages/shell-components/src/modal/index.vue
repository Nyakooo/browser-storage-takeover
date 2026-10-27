<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import LocalData from "./local.vue";
import UiIcon from "../components/UiIcon.vue";
import logo from "../assets/logo.png";

const showModal = ref(false);
const siteHost = location.hostname;
const localData = ref<InstanceType<typeof LocalData>>();
function canClose() { return !showModal.value || (localData.value?.canClose() ?? true); }
function close() { if (canClose()) showModal.value = false; }
function onKeydown(event: KeyboardEvent) { if (event.key === 'Escape') close(); }
defineExpose({ canClose });
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

onMounted(() => { showModal.value = true; });
</script>

<template>
  <div v-if="showModal" class="overlay" @click.self="close">
    <section class="inspector-window" role="dialog" aria-modal="true" aria-label="Storage Inspector">
      <header class="window-header">
        <img class="brand-icon" :src="logo" alt="" width="32" height="32" />
        <div class="brand-copy"><strong>Storage Inspector</strong><span>Browser data, in one place</span></div>
        <div class="header-spacer"></div>
        <span class="active-site"><i></i>Tab: {{ siteHost }}</span>
        <button class="close-button" aria-label="Close Storage Inspector" title="Close" @click="close"><UiIcon name="close" /></button>
      </header>
      <LocalData ref="localData" />
    </section>
  </div>
</template>

<style scoped>
.overlay{position:fixed;z-index:999999;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(17,25,36,.42);backdrop-filter:blur(2px);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.inspector-window{width:min(1120px,96vw);max-height:calc(100vh - 36px);overflow:hidden;border:1px solid #e4e8ee;border-radius:13px;background:#fff;box-shadow:0 24px 72px #0b152637;display:flex;flex-direction:column}.window-header{height:58px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid #eceff3;background:#fff}.brand-icon{width:34px;height:34px;display:block;flex:none;object-fit:contain}.brand-copy{display:flex;flex-direction:column;gap:2px}.brand-copy strong{color:#263346;font-size:12px;font-weight:700}.brand-copy span{color:#99a2ae;font-size:9px}.header-spacer{flex:1}.active-site{display:flex;align-items:center;gap:8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid #edf0f3;border-radius:5px;color:#687588;font-size:10px}.active-site i{width:6px;height:6px;flex:none;border-radius:50%;background:#49a67b}.close-button{display:grid;place-items:center;width:30px;height:30px;margin-left:7px;border:0;border-radius:6px;background:transparent;color:#8f99a6;font-size:23px;line-height:1;cursor:pointer}.close-button:hover{background:#f1f3f6;color:#465366}
@media(max-width:760px){.overlay{padding:8px}.inspector-window{width:100%;max-height:calc(100vh - 16px)}.window-header{height:52px;padding:0 10px}.active-site{max-width:120px}}
</style>
