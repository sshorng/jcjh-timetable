<template>
  <!-- §UI-0 全螢幕載入遮罩（自 App.vue 抽出；純展示） -->
  <div v-if="loading" class="loading-overlay" role="status" aria-live="polite" aria-atomic="true" :aria-busy="loading ? 'true' : 'false'">
    <div class="spinner"></div>
    <p class="loading-msg">{{ loadingMessage }}</p>
  </div>
</template>

<script setup>
defineProps({
  loading: { type: Boolean, default: false },
  loadingMessage: { type: String, default: '' }
});
</script>
