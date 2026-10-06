<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 560px;">
          <div class="modal-header">
            <h3>🛠️ 特例調代（管理員）</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body p-20" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">
              組合有效但單步規則擋下的特例（如調課＋接代課），由管理員背書建單。
              檢查只顯示警告不阻擋；建單後經費照系統計算，不寄線上通知。
            </div>
            <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;">
              <div style="font-weight: 700; margin-bottom: 8px;">A 端（調出方）</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <label class="form-label">教師
                  <select class="form-select" v-model="form.aEmail">
                    <option value="">請選擇</option>
                    <option v-for="t in teacherOptions" :key="'exa-' + t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                </label>
                <label class="form-label">日期
                  <input type="date" class="form-input" v-model="form.aDate">
                </label>
                <label class="form-label">節次
                  <select class="form-select" v-model="form.aPeriod">
                    <option v-for="p in periodOptions" :key="'exa-p-' + p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </label>
              </div>
              <div style="font-size: 0.8rem; margin-top: 6px; color: var(--text-secondary);">該格課程：{{ aSlotText }}</div>
            </div>
            <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;">
              <div style="font-weight: 700; margin-bottom: 8px;">B 端（調入方）</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                <label class="form-label">教師
                  <select class="form-select" v-model="form.bEmail">
                    <option value="">請選擇</option>
                    <option v-for="t in teacherOptions" :key="'exb-' + t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                </label>
                <label class="form-label">日期
                  <input type="date" class="form-input" v-model="form.bDate">
                </label>
                <label class="form-label">節次
                  <select class="form-select" v-model="form.bPeriod">
                    <option v-for="p in periodOptions" :key="'exb-p-' + p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </label>
              </div>
              <div style="font-size: 0.8rem; margin-top: 6px; color: var(--text-secondary);">該格課程：{{ bSlotText }}</div>
            </div>
            <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; font-weight: 700;">
                <input type="checkbox" v-model="form.needSub"> 加辦代課（B 代其中一節）
              </label>
              <div v-if="form.needSub" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-top: 8px;">
                <label class="form-label">代課人
                  <select class="form-select" v-model="form.subTeacher">
                    <option value="">請選擇</option>
                    <option v-for="t in teacherOptions" :key="'exs-' + t.value" :value="t.value">{{ t.label }}</option>
                  </select>
                </label>
                <label class="form-label">日期
                  <input type="date" class="form-input" v-model="form.subDate">
                </label>
                <label class="form-label">節次
                  <select class="form-select" v-model="form.subPeriod">
                    <option v-for="p in periodOptions" :key="'exs-p-' + p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </label>
                <label class="form-label">經費
                  <select class="form-select" v-model="form.subFee">
                    <option v-for="f in feeOptions" :key="'exf-' + f" :value="f">{{ f }}</option>
                  </select>
                </label>
              </div>
            </div>
            <label class="form-label">事由（必填，記入備註備查）
              <input type="text" class="form-input" maxlength="200" placeholder="例：A、B 已線下談妥，B 週二有空" v-model="form.reason">
            </label>
            <div v-if="warnings.length" style="border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; padding: 10px 12px; font-size: 0.8rem; line-height: 1.6;">
              <div style="font-weight: 700; color: #92400e;">⚠️ 已知悉事項（{{ warnings.length }}）：送出即代表管理員背書</div>
              <div v-for="(w, i) in warnings" :key="'exw-' + i">· {{ w }}</div>
            </div>
            <div v-if="formError" style="font-size: 0.8rem; color: var(--color-danger);">{{ formError }}</div>
          </div>
          <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
            <button type="button" class="btn btn-secondary" :disabled="sending" @click="$emit('close')">取消</button>
            <button type="button" class="btn btn-primary" :disabled="!canSubmit || sending" @click="onSubmit">
              {{ sending ? '送出中…' : '直接核准建單' }}
            </button>
          </div>
        </div>
      </div>
</template>

<!-- 特例調代 composer（後台掛載；表單狀態內聚，送單委派 submitAdminException） -->
<script setup>
import { computed, ref } from 'vue';
import { buildExceptionWarnings } from '../modules/exception-warnings.js';
const props = defineProps({
  teachersList: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  allSchedules: { type: [Array, Number, Boolean, Object, Function, String], default: undefined },
  getScheduleForDate: { type: Function, required: true },
  getTeacherNameByEmail: { type: Function, required: true },
  submitAdminException: { type: Function, required: true }
});
const emit = defineEmits(['close']);
const form = ref({
  aEmail: '', aDate: '', aPeriod: '',
  bEmail: '', bDate: '', bPeriod: '',
  needSub: false, subTeacher: '', subDate: '', subPeriod: '', subFee: '自費代課',
  reason: ''
});
const sending = ref(false);
const formError = ref('');
const periodOptions = [
  { value: 0, label: '早自習' },
  { value: 1, label: '第1節' },
  { value: 2, label: '第2節' },
  { value: 3, label: '第3節' },
  { value: 4, label: '第4節' },
  { value: 5, label: '第5節' },
  { value: 6, label: '第6節' },
  { value: 7, label: '第7節' },
  { value: 45, label: '午休' },
  { value: 8, label: '第8節' }
];
const feeOptions = ['自費代課', '公費代課', '僅課表呈現（不結算）', '扣額度', '活動公費', '第8節代課'];
const teacherOptions = computed(function () {
  return (props.teachersList || []).map(function (t) {
    var value = String((t && (t.email || t.loginEmail || t['教師Email'])) || '').trim().toLowerCase();
    var label = String((t && (t.name || t.teacherName || t['教師姓名'])) || '').trim() || value;
    return { value: value, label: label };
  }).filter(function (t) { return !!t.value; });
});
function dayOfWeekOf(dateStr) {
  var d = new Date(String(dateStr || '').replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return '';
  var dow = d.getDay();
  return dow === 0 ? 7 : dow;
}
function findSlot(email, dateStr, period) {
  var list = props.allSchedules || [];
  var em = String(email || '').trim().toLowerCase();
  var dow = dayOfWeekOf(dateStr);
  var p = parseInt(period, 10);
  if (!em || !dow || Number.isNaN(p)) return null;
  return (list || []).find(function (s) {
    return String((s && (s.teacherEmail || s.email)) || '').trim().toLowerCase() === em
      && parseInt(s.dayOfWeek, 10) === dow
      && parseInt(s.period, 10) === p;
  }) || null;
}
function slotView(email, dateStr, period) {
  var s = findSlot(email, dateStr, period);
  if (!s) return { teacherEmail: email, teacherName: '', className: '', subject: '', dateStr: dateStr, dayOfWeek: dayOfWeekOf(dateStr), period: period };
  var teacherName = '';
  try {
    teacherName = props.getTeacherNameByEmail(email) || s.teacherName || s.name || '';
  } catch (eName) { /* ignore */ }
  return {
    teacherEmail: email,
    teacherName: teacherName,
    className: String(s.className || ''),
    subject: String(s.subject || ''),
    dateStr: dateStr,
    dayOfWeek: dayOfWeekOf(dateStr),
    period: parseInt(period, 10)
  };
}
const aSlot = computed(function () { return slotView(form.value.aEmail, form.value.aDate, form.value.aPeriod); });
const bSlot = computed(function () { return slotView(form.value.bEmail, form.value.bDate, form.value.bPeriod); });
function slotText(slot) {
  if (!slot.teacherEmail || !slot.dateStr || slot.period === '') return '—';
  if (!slot.className) return '（該格無基礎課程）';
  return slot.dateStr + ' 第' + slot.period + '節 ' + slot.className + (slot.subject ? ' ' + slot.subject : '');
}
const aSlotText = computed(function () { return slotText(aSlot.value); });
const bSlotText = computed(function () { return slotText(bSlot.value); });
const warnings = computed(function () {
  return buildExceptionWarnings({
    aSlot: aSlot.value,
    bSlot: bSlot.value,
    sub: {
      enabled: !!form.value.needSub,
      teacherEmail: form.value.subTeacher,
      dateStr: form.value.subDate,
      period: form.value.subPeriod
    },
    checks: { getScheduleForDate: props.getScheduleForDate }
  });
});
const canSubmit = computed(function () {
  if (!form.value.aEmail || !form.value.aDate || form.value.aPeriod === '') return false;
  if (!form.value.bEmail || !form.value.bDate || form.value.bPeriod === '') return false;
  if (!aSlot.value.className || !bSlot.value.className) return false;
  if (!String(form.value.reason || '').trim()) return false;
  if (form.value.needSub) {
    if (!form.value.subTeacher || !form.value.subDate || form.value.subPeriod === '') return false;
    if (!form.value.subFee) return false;
  }
  return true;
});
async function onSubmit() {
  formError.value = '';
  if (!canSubmit.value) {
    formError.value = '請填完雙方課堂與事由';
    return;
  }
  sending.value = true;
  try {
    await props.submitAdminException({
      aSlot: aSlot.value,
      bSlot: bSlot.value,
      needSub: !!form.value.needSub,
      subSlot: {
        teacherEmail: form.value.subTeacher,
        dateStr: form.value.subDate,
        period: form.value.subPeriod,
        fee: form.value.subFee
      },
      reason: String(form.value.reason || '').trim()
    });
    emit('close');
  } catch (err) {
    formError.value = String((err && err.message) || err || '送出失敗');
  } finally {
    sending.value = false;
  }
}
</script>
