<template>
      <div class="modal-overlay" @click.self="dismissBatchPrintPrompt">
        <div class="modal-card" style="max-width: 420px;">
          <div class="modal-header">
            <h3>🖨️ 批次已核准</h3>
            <button class="btn-close" @click="dismissBatchPrintPrompt">&times;</button>
          </div>
          <div class="modal-body">
            <p style="font-size:0.9rem;line-height:1.5;margin:0 0 8px;">
              已成功出單，共 <strong>{{ lastBatchPrintIds.length }}</strong> 筆異動紀錄可列印通知單。
            </p>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin:0;">是否立即列印本批代（調、補）課單？</p>
          </div>
          <div class="modal-footer success-actions">
            <button class="btn btn-primary" @click="printLastBatchNotices">🖨️ 一鍵列印本批</button>
            <button class="btn btn-secondary" @click="dismissBatchPrintPrompt">稍後再印</button>
          </div>
        </div>
      </div>
</template>

<!-- 批次已核准列印提示 modal（自 App.vue 抽出；展示＋操作委派，狀態全由 props 注入） -->
<script setup>
defineProps({
  lastBatchPrintIds: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  dismissBatchPrintPrompt: { type: Function, required: true },
  printLastBatchNotices: { type: Function, required: true },
});
defineEmits(['close']);
</script>
