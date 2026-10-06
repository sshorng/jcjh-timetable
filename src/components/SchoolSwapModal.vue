<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:620px;">
          <div class="modal-header">
            <h3>{{ schoolSwapModalMode === 'add' ? '新增全校對調' : '編輯全校對調' }}</h3>
            <button type="button" class="btn-close" @click="$emit('close')" aria-label="關閉">&times;</button>
          </div>
          <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
            <div class="form-group m-0">
              <label class="form-label">對調名稱 *</label>
              <input type="text" class="form-input" v-model="schoolSwapForm.name" maxlength="80">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px;padding:12px;">
                <strong style="display:block;margin-bottom:8px;color:#1d4ed8;">端點 A</strong>
                <div class="form-group m-0">
                  <label class="form-label">日期</label>
                  <input type="date" class="form-input" v-model="schoolSwapForm.dateA">
                </div>
                <div class="text-xs-muted-78" style="margin:5px 0 9px;">{{ schoolSwapWeekdayText(schoolSwapForm.dateA) }}</div>
                <div class="form-group m-0">
                  <label class="form-label">節次</label>
                  <select class="form-select" v-model.number="schoolSwapForm.periodA">
                    <option v-for="p in timetablePeriods" :key="'swap-a-'+p" :value="p">{{ formatPeriodText(p) }}</option>
                  </select>
                </div>
              </div>
              <div style="border:1px solid #c4b5fd;background:#f5f3ff;border-radius:10px;padding:12px;">
                <strong style="display:block;margin-bottom:8px;color:#6d28d9;">端點 B</strong>
                <div class="form-group m-0">
                  <label class="form-label">日期</label>
                  <input type="date" class="form-input" v-model="schoolSwapForm.dateB">
                </div>
                <div class="text-xs-muted-78" style="margin:5px 0 9px;">{{ schoolSwapWeekdayText(schoolSwapForm.dateB) }}</div>
                <div class="form-group m-0">
                  <label class="form-label">節次</label>
                  <select class="form-select" v-model.number="schoolSwapForm.periodB">
                    <option v-for="p in timetablePeriods" :key="'swap-b-'+p" :value="p">{{ formatPeriodText(p) }}</option>
                  </select>
                </div>
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:0.86rem;">
              <input type="checkbox" class="chk-md" v-model="schoolSwapForm.enabled">
              啟用這筆對調
            </label>
            <div class="form-group m-0">
              <label class="form-label">備註</label>
              <input type="text" class="form-input" v-model="schoolSwapForm.note" maxlength="300">
            </div>
            <p style="margin:0;font-size:0.76rem;color:var(--text-muted);line-height:1.5;">系統會再次檢查學期範圍、週一至週五、日期與星期一致，以及啟用時段是否重疊。</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" :disabled="schoolSwapSaving" @click="saveSchoolSwap">{{ schoolSwapSaving ? '儲存中…' : '儲存' }}</button>
            <button type="button" class="btn btn-secondary" :disabled="schoolSwapSaving" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 校對調 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  schoolSwapModalMode: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  schoolSwapSaving: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  schoolSwapWeekdayText: { type: Function, required: true },
  formatPeriodText: { type: Function, required: true },
  timetablePeriods: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  saveSchoolSwap: { type: Function, required: true },
});
defineEmits(['close']);
const schoolSwapForm = defineModel('schoolSwapForm');
</script>
