<template>
      <div class="modal-overlay" data-tour="line-message-modal" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:620px;">
          <div class="modal-header">
            <h3>💬 {{ lineMessageTitle }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.85rem;line-height:1.5;color:var(--text-secondary);margin:0 0 10px;">可先修改訊息內容，再複製或開啟 LINE。</p>
            <textarea
              v-model="lineMessageText"
              class="form-input"
              rows="12"
              autofocus
              style="width:100%;font-family:monospace;font-size:0.82rem;background:#fff;border:1px solid #d1fae5;border-radius:6px;padding:8px;resize:vertical;line-height:1.5;"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="copyEditedLineMessage">📋 複製</button>
            <button type="button" class="btn btn-success" style="background:#06c755;border-color:#05b04b;" @click="sendEditedLineMessage">💬 傳送</button>
            <button type="button" class="btn btn-secondary" @click="$emit('close')">關閉</button>
          </div>
        </div>
      </div>
</template>

<!-- LINE 訊息編輯 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  lineMessageTitle: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  copyEditedLineMessage: { type: Function, required: true },
  sendEditedLineMessage: { type: Function, required: true },
});
defineEmits(['close']);
const lineMessageText = defineModel('lineMessageText');
</script>
