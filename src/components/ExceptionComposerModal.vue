<template>
      <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-card" style="max-width: 620px;">
          <div class="modal-header">
            <h3>🛠️ 特例調代（管理員）</h3>
            <button class="btn-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="modal-body p-20" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">
              組合有效但單步規則擋下的特例（含同節互換），由管理員背書建單（最多 {{ maxLegs }} 腿）。
              檢查只顯示警告不阻擋；建單後經費照系統計算，不寄線上通知。
            </div>
            <div v-for="(leg, i) in legs" :key="'exleg-' + i" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <strong>第{{ i + 1 }}腿</strong>
                <select class="form-select" style="width: auto;" v-model="leg.kind">
                  <option value="exchange">調課（兩人互調，含同節）</option>
                  <option value="substitution">代課（B 代一節）</option>
                </select>
                <button v-if="legs.length > 1" type="button" class="btn btn-secondary" style="margin-left: auto; padding: 2px 8px; font-size: 0.75rem;" @click="removeLeg(i)">移除</button>
              </div>
              <div v-if="leg.kind === 'exchange'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label class="form-label">A 端教師
                  <input type="text" class="form-input" placeholder="輸入姓名或 Email 篩選"
                    :value="leg.aText" @input="onTeacherInput(leg, 'a', $event.target.value)"
                    :list="'dl-exc-' + i + '-a'">
                  <datalist :id="'dl-exc-' + i + '-a'">
                    <option v-for="t in teacherOptions" :key="'ex' + i + 'a-' + t.value" :value="t.display"></option>
                  </datalist>
                </label>
                <label class="form-label">A 日期／節次
                  <span style="display: flex; gap: 4px;">
                    <input type="date" class="form-input" v-model="leg.aDate">
                    <select class="form-select" v-model="leg.aPeriod">
                      <option v-for="p in periodOptions" :key="'ex' + i + 'ap-' + p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </span>
                </label>
                <label class="form-label">B 端教師
                  <input type="text" class="form-input" placeholder="輸入姓名或 Email 篩選"
                    :value="leg.bText" @input="onTeacherInput(leg, 'b', $event.target.value)"
                    :list="'dl-exc-' + i + '-b'">
                  <datalist :id="'dl-exc-' + i + '-b'">
                    <option v-for="t in teacherOptions" :key="'ex' + i + 'b-' + t.value" :value="t.display"></option>
                  </datalist>
                </label>
                <label class="form-label">B 日期／節次
                  <span style="display: flex; gap: 4px;">
                    <input type="date" class="form-input" v-model="leg.bDate">
                    <select class="form-select" v-model="leg.bPeriod">
                      <option v-for="p in periodOptions" :key="'ex' + i + 'bp-' + p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </span>
                </label>
              </div>
              <div v-else style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <label class="form-label">請假教師（被代）
                  <input type="text" class="form-input" placeholder="輸入姓名或 Email 篩選"
                    :value="leg.aText" @input="onTeacherInput(leg, 'a', $event.target.value)"
                    :list="'dl-exc-' + i + '-l'">
                  <datalist :id="'dl-exc-' + i + '-l'">
                    <option v-for="t in teacherOptions" :key="'ex' + i + 'l-' + t.value" :value="t.display"></option>
                  </datalist>
                </label>
                <label class="form-label">日期／節次
                  <span style="display: flex; gap: 4px;">
                    <input type="date" class="form-input" v-model="leg.aDate">
                    <select class="form-select" v-model="leg.aPeriod">
                      <option v-for="p in periodOptions" :key="'ex' + i + 'sp-' + p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </span>
                </label>
                <label class="form-label">代課教師
                  <input type="text" class="form-input" placeholder="輸入姓名或 Email 篩選"
                    :value="leg.bText" @input="onTeacherInput(leg, 'b', $event.target.value)"
                    :list="'dl-exc-' + i + '-s'">
                  <datalist :id="'dl-exc-' + i + '-s'">
                    <option v-for="t in teacherOptions" :key="'ex' + i + 's-' + t.value" :value="t.display"></option>
                  </datalist>
                </label>
                <label class="form-label">經費（同一般流程選項）
                  <select class="form-select" v-model="leg.subFee">
                    <option v-for="f in feeOptions" :key="'ex' + i + 'f-' + f" :value="f">{{ f }}</option>
                  </select>
                </label>
              </div>
              <div style="font-size: 0.78rem; margin-top: 6px; color: var(--text-secondary);">{{ legText(i) }}</div>
            </div>
            <button v-if="legs.length < maxLegs" type="button" class="btn btn-secondary" style="align-self: flex-start;" @click="addLeg">＋ 加一腿（調課／代課）</button>
            <label class="form-label">事由（必填，記入備註備查）
              <input type="text" class="form-input" maxlength="200" placeholder="例：A、B 已線下談妥，B 週二有空" v-model="reason">
            </label>
            <div v-if="warnings.length" style="border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; padding: 10px 12px; font-size: 0.8rem; line-height: 1.6;">
              <div style="font-weight: 700; color: #92400e;">⚠️ 已知悉事項（{{ warnings.length }}）：送出即代表管理員背書</div>
              <div v-for="(w, i) in warnings" :key="'exw-' + i">· {{ w }}</div>
            </div>
            <div v-if="formError" style="font-size: 0.8rem; color: var(--color-danger);">{{ formError }}</div>
            <div v-if="results.length" style="font-size: 0.8rem; line-height: 1.6;">
              <div v-for="(r, i) in results" :key="'exr-' + i" :style="{ color: r.ok ? 'var(--color-success)' : 'var(--color-danger)' }">
                第{{ i + 1 }}腿：{{ r.ok ? ('已建單（' + r.serial + '）') : ('失敗：' + r.error) }}
              </div>
            </div>
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

<!-- 特例調代 composer（後台掛載；leg 卡片制 1～5 腿，送單委派 submitAdminException） -->
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
const maxLegs = 5;
const reason = ref('');
const sending = ref(false);
const formError = ref('');
const results = ref([]);
function blankLeg() {
  return {
    kind: 'exchange',
    aEmail: '', aText: '', aDate: '', aPeriod: '',
    bEmail: '', bText: '', bDate: '', bPeriod: '',
    subFee: '自費代課'
  };
}
const legs = ref([blankLeg()]);
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
    var subject = String((t && (t.subject || t['授課科目'] || t['任課科目'])) || '').trim();
    return { value: value, label: label, display: subject ? (label + '（' + subject + '）') : label };
  }).filter(function (t) { return !!t.value; });
});
function resolveTeacherEmail(text) {
  var key = String(text || '').trim().toLowerCase();
  if (!key) return '';
  var list = teacherOptions.value || [];
  var hit = list.find(function (t) {
    return t.value === key || t.label.toLowerCase() === key || t.display.toLowerCase() === key;
  });
  return hit ? hit.value : '';
}
function onTeacherInput(leg, side, text) {
  if (!leg) return;
  leg[side + 'Text'] = text;
  leg[side + 'Email'] = resolveTeacherEmail(text);
}
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
  // 當前該格課程優先（含已生效／待生效異動疊加），才抓得到鏈式第二筆的真實課堂
  var eff = null;
  try {
    if (typeof props.getScheduleForDate === 'function' && email && dateStr && period !== '') {
      eff = props.getScheduleForDate(email, dateStr, period, dayOfWeekOf(dateStr)) || null;
    }
  } catch (eEff) { /* 以基礎課程為準 */ }
  var teacherName = '';
  try {
    teacherName = props.getTeacherNameByEmail(email) || (s && (s.teacherName || s.name)) || '';
  } catch (eName) { /* ignore */ }
  var className = String(((eff && eff.className) || (s && s.className)) || '');
  var subject = String(((eff && eff.subject) || (s && s.subject)) || '');
  return {
    teacherEmail: email,
    teacherName: teacherName,
    className: className,
    subject: subject,
    attr: String((s && (s.attr || s.attribute)) || ''),
    specialTags: String((s && (s.specialTags || s['特殊標記'])) || ''),
    isPullOut: !!(s && (s.isPullOut || s.isSubstitute)),
    pendingText: String((eff && (eff.pendingText || '')) || ''),
    dateStr: dateStr,
    dayOfWeek: dayOfWeekOf(dateStr),
    period: period === '' ? '' : parseInt(period, 10)
  };
}
function slotTextWithPending(slot) {
  var base = slotText(slot);
  if (slot.pendingText) return base + '（' + slot.pendingText + '）';
  return base;
}
function slotText(slot) {
  if (!slot.teacherEmail || !slot.dateStr || slot.period === '') return '—';
  if (!slot.className) return '（該格無基礎課程）';
  return slot.dateStr + ' 第' + slot.period + '節 ' + slot.className + (slot.subject ? ' ' + slot.subject : '');
}
function legText(i) {
  var leg = legs.value[i];
  if (!leg) return '—';
  if (leg.kind === 'exchange') {
    var a = slotView(leg.aEmail, leg.aDate, leg.aPeriod);
    var b = slotView(leg.bEmail, leg.bDate, leg.bPeriod);
    return slotTextWithPending(a) + ' ⇄ ' + slotTextWithPending(b);
  }
  var s = slotView(leg.aEmail, leg.aDate, leg.aPeriod);
  return slotTextWithPending(s) + ' → ' + String(leg.bEmail || '未定') + '（' + leg.subFee + '）';
}
function legModel(i) {
  var leg = legs.value[i];
  if (leg.kind === 'exchange') {
    return {
      kind: 'exchange',
      aSlot: slotView(leg.aEmail, leg.aDate, leg.aPeriod),
      bSlot: slotView(leg.bEmail, leg.bDate, leg.bPeriod)
    };
  }
  var leaveView = slotView(leg.aEmail, leg.aDate, leg.aPeriod);
  return {
    kind: 'substitution',
    leave: {
      teacherEmail: leg.aEmail,
      className: leaveView.className,
      subject: leaveView.subject,
      dateStr: leg.aDate,
      period: leg.aPeriod,
      dayOfWeek: dayOfWeekOf(leg.aDate)
    },
    sub: {
      teacherEmail: leg.bEmail,
      dateStr: leg.aDate,
      period: leg.aPeriod,
      dayOfWeek: dayOfWeekOf(leg.aDate),
      fee: leg.subFee
    }
  };
}
const warnings = computed(function () {
  var models = legs.value.map(function (leg, i) { return legModel(i); });
  return buildExceptionWarnings({ legs: models, checks: { getScheduleForDate: props.getScheduleForDate } });
});
const canSubmit = computed(function () {
  if (!String(reason.value || '').trim()) return false;
  if (!legs.value.length) return false;
  for (var i = 0; i < legs.value.length; i++) {
    var leg = legs.value[i];
    if (leg.kind === 'exchange') {
      if (!leg.aEmail || !leg.aDate || leg.aPeriod === '') return false;
      if (!leg.bEmail || !leg.bDate || leg.bPeriod === '') return false;
      var a = slotView(leg.aEmail, leg.aDate, leg.aPeriod);
      var b = slotView(leg.bEmail, leg.bDate, leg.bPeriod);
      if (!a.className || !b.className) return false;
      if (String(a.teacherEmail).trim().toLowerCase() === String(b.teacherEmail).trim().toLowerCase()) return false;
    } else {
      if (!leg.aEmail || !leg.aDate || leg.aPeriod === '') return false;
      if (!leg.bEmail || !leg.subFee) return false;
      var s = slotView(leg.aEmail, leg.aDate, leg.aPeriod);
      if (!s.className) return false;
      if (String(leg.aEmail).trim().toLowerCase() === String(leg.bEmail).trim().toLowerCase()) return false;
    }
  }
  return true;
});
function addLeg() {
  if (legs.value.length >= maxLegs) return;
  legs.value.push(blankLeg());
}
function removeLeg(i) {
  if (legs.value.length <= 1) return;
  legs.value.splice(i, 1);
}
async function onSubmit() {
  formError.value = '';
  results.value = [];
  if (!canSubmit.value) {
    formError.value = '請填完各腿課堂與事由';
    return;
  }
  sending.value = true;
  try {
    var out = await props.submitAdminException({
      legs: legs.value.map(function (leg, i) { return legModel(i); }),
      reason: String(reason.value || '').trim()
    });
    results.value = out.results || [];
    if (out.ok) {
      emit('close');
    } else {
      formError.value = '部分腿建單失敗，詳見上方結果（成功的單有效，不回滾）';
    }
  } catch (err) {
    formError.value = String((err && err.message) || err || '送出失敗');
  } finally {
    sending.value = false;
  }
}
</script>
