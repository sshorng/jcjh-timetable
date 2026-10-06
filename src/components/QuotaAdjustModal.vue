<template>
      <div class="modal-overlay" @click.self="closeManualQuotaAdjust">
        <div class="modal-card" style="max-width:440px;">
          <div class="modal-header">
            <div>
              <h3>± 手動調整折抵額度</h3>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:3px;">
                {{ quotaAdjustForm.name }}　目前餘額 {{ quotaAdjustForm.balance }} 節
              </div>
            </div>
            <button type="button" class="btn-close" :disabled="quotaAdjustSaving" @click="closeManualQuotaAdjust" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">調整方式</label>
                <select class="form-select" v-model="quotaAdjustForm.direction">
                  <option value="add">增加額度</option>
                  <option value="subtract">扣除額度</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">節數</label>
                <input type="number" class="form-input" min="1" step="1" v-model.number="quotaAdjustForm.amount">
              </div>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">備註（選填）</label>
              <input type="text" class="form-input" maxlength="200" placeholder="例：補登活動額度、人工更正" v-model="quotaAdjustForm.note">
            </div>
            <div style="padding:9px 11px;border:1px solid #ddd6fe;background:#f5f3ff;border-radius:8px;font-size:0.84rem;">
              調整後餘額：<strong>{{ quotaAdjustPreview }}</strong> 節
            </div>
            <p style="margin:0;color:var(--text-muted);font-size:0.74rem;line-height:1.5;">調整會同步更新教師名單，並在額度帳本留下管理員、異動節數與備註。</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" :disabled="quotaAdjustSaving" @click="saveManualQuotaAdjust">{{ quotaAdjustSaving ? '儲存中…' : '確認調整' }}</button>
            <button type="button" class="btn btn-secondary" :disabled="quotaAdjustSaving" @click="closeManualQuotaAdjust">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 手動調整額度 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  quotaAdjustPreview: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  quotaAdjustSaving: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  closeManualQuotaAdjust: { type: Function, required: true },
  saveManualQuotaAdjust: { type: Function, required: true },
});
defineEmits(['close']);
const quotaAdjustForm = defineModel('quotaAdjustForm');
</script>
