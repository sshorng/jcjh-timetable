<template>
      <div class="modal-overlay" @click.self="closeEmptySlotModal">
        <div class="modal-card" role="dialog" aria-modal="true" aria-label="空堂排班" style="max-width:440px;">
          <div class="modal-header">
            <h3>📌 空堂排班</h3>
            <button type="button" class="btn-close" @click="closeEmptySlotModal" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
            <p style="margin:0;font-size:0.8rem;color:var(--text-secondary);line-height:1.45;">
              將任務排入老師的<strong>空堂</strong>，經費固定<strong>扣額度</strong>，預設<strong>不寄信</strong>。常用於段考巡堂等。
            </p>
            <div style="background:#f8fafc;border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;font-size:0.85rem;">
              <div><strong>{{ emptySlotForm.teacherName }}</strong>
                <span class="text-xs-muted-78" >（額度 {{ emptySlotForm.quota }}）</span>
              </div>
              <div style="margin-top:4px;color:var(--text-secondary);">
                 {{ formatDateMMDD(emptySlotForm.dateStr) }}({{ getWeekDayText(emptySlotForm.dayOfWeek) }}) {{ formatPeriodText(emptySlotForm.period) }}
              </div>
            </div>
            <div v-if="emptySlotQuotaZero" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;font-size:0.8rem;color:#b91c1c;">
              ⚠️ 折抵額度為 0：仍可送出，但請安排<strong>由他人還一節</strong>。
            </div>
            <div class="form-group m-0" >
              <label class="form-label">任務名稱 *</label>
              <input type="text" class="form-input" v-model="emptySlotForm.taskName" placeholder="例如：段考巡堂、考場巡堂" maxlength="40">
            </div>
            <div class="form-group m-0" >
              <label class="form-label">班級（選填）</label>
              <input type="text" class="form-input" v-model="emptySlotForm.className" placeholder="可不填；要綁班再填，如 701" maxlength="20">
            </div>
            <div class="form-group m-0" >
              <label class="form-label">備註（選填）</label>
              <input type="text" class="form-input" v-model="emptySlotForm.note" placeholder="可空白" maxlength="80">
            </div>
            <p style="margin:0;font-size:0.72rem;color:var(--text-muted);">
              送出＝直接核准寫入課表　·　扣 1 折抵額度　·　不寄系統信
            </p>
          </div>
          <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" @click="closeEmptySlotModal">取消</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="isSubmitting || loading"
              @click="executeEmptySlotAssign"
            >確認排入並扣額度</button>
          </div>
        </div>
      </div>
</template>

<!-- 空堂任務 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  formatDateMMDD: { type: Function, required: true },
  getWeekDayText: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  emptySlotQuotaZero: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  isSubmitting: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  closeEmptySlotModal: { type: Function, required: true },
  executeEmptySlotAssign: { type: Function, required: true },
});
defineEmits(['close']);
const emptySlotForm = defineModel('emptySlotForm');
</script>
