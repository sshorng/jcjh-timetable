<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width:760px;">
          <div class="modal-header">
             <h3>💰 設定超鐘點／代課（小鐘點）經費來源{{ overtimePlanTeacher ? '：' + overtimePlanTeacher.name : '' }}</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body">
             <p v-if="overtimePlanUsesFixedSlots" style="margin:0 0 12px;color:var(--text-secondary);font-size:0.82rem;line-height:1.6;">
               超鐘點課格直接依教師前面設定的「固定超鐘點節次」，不再判定日期；已儲存的代課（小鐘點）來源也會保留快照，不因日後課表變更而移動，並依日期、節次與班級分配至會計 Excel 的對應工作表。
             </p>
             <p v-else style="margin:0 0 12px;color:var(--text-secondary);font-size:0.82rem;line-height:1.6;">
               尚未設定固定超鐘點，代課（小鐘點）首次設定時取結算最後一天仍有效的課格；儲存後會保留經費來源快照，不因日後課表變更而移動。
             </p>
             <div v-if="!overtimePlanUsesFixedSlots" style="margin:-4px 0 12px;padding:8px 10px;border-radius:6px;background:#eff6ff;color:#1d4ed8;font-size:0.78rem;">
               判斷日期：結算最後一天 {{ overtimePlanPeriodEnd || '未設定' }}
             </div>
            <div v-if="!overtimePlanRows.length" class="empty-state" style="padding:24px 12px;">
               目前固定超鐘點或代課小鐘點快照沒有可設定的課格。
            </div>
            <div v-else style="display:flex;flex-direction:column;gap:8px;">
              <div v-for="row in overtimePlanRows" :key="row.key" style="display:grid;grid-template-columns:70px 78px minmax(90px,1fr) minmax(180px,1fr);align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--surface-muted,#f8fafc);">
                 <span style="font-weight:700;">{{ ['日','一','二','三','四','五','六','日'][row.day] || row.day }}</span>
                <span>{{ row.period === 0 ? '早自習' : (row.period === 45 ? '午休' : '第' + row.period + '節') }}</span>
                   <span>{{ row.className || (row.kind === 'fixed' ? '目前課表無對應班級' : '未指定班級') }}<small v-if="row.subject" style="display:block;color:var(--text-muted);">{{ row.subject }}</small><small v-if="row.activeFrom || row.activeTo" style="display:block;color:var(--text-muted);">有效：{{ row.activeFrom || '學期起' }}～{{ row.activeTo || '學期迄' }}</small><small v-if="row.sourceStatus === 'conflict'" style="display:block;color:#b45309;line-height:1.5;">⚠ 快照班級與目前課表不一致，目前：{{ row.currentClassName || '未指定' }} <button type="button" class="btn btn-sm btn-outline-warning" style="padding:1px 5px;font-size:0.68rem;" @click.stop="row.className = row.currentClassName">採用目前課表班級</button></small><small v-else-if="row.sourceStatus === 'missing' || row.sourceStatus === 'ambiguous' || row.sourceStatus === 'invalid'" style="display:block;color:#b91c1c;">⚠ {{ row.sourceStatus === 'ambiguous' ? '同一節有多個來源' : (row.sourceStatus === 'invalid' ? '來源格式錯誤' : '尚未找到唯一經費來源') }}</small></span>
                 <input type="text" class="form-input" list="overtime-expense-source-options" maxlength="80" placeholder="例如：[公代]公費代課鐘點費；留白＝預設經費" v-model="row.source">
              </div>
            </div>
            <datalist id="overtime-expense-source-options">
               <option v-for="source in getOvertimeExpenseSourceOptions()" :key="'overtime-source-' + source" :value="source"></option>
            </datalist>
            <div style="margin-top:12px;font-size:0.75rem;color:var(--text-muted);">
               可輸入 `[簡稱]全稱`；摘要與工作表頁籤顯示簡稱，Excel 標題使用全稱。留白代表預設經費。已設定 {{ overtimePlanRows.filter(row => row.source).length }}／{{ overtimePlanRows.length }} 個課格。
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" :disabled="loading" @click="saveOvertimePlan">儲存來源設定</button>
            <button class="btn btn-secondary" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
</template>

<!-- 超鐘點計畫 modal（自 App.vue 抽出；表單經 defineModel 雙向綁定，其餘 props 注入） -->
<script setup>
defineProps({
  overtimePlanTeacher: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  overtimePlanPeriodEnd: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  overtimePlanUsesFixedSlots: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  loading: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  getOvertimeExpenseSourceOptions: { type: Function, required: true },
  saveOvertimePlan: { type: Function, required: true },
});
defineEmits(['close']);
const overtimePlanRows = defineModel('overtimePlanRows');
</script>
