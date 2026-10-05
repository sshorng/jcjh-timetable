import { computed } from 'vue';
/**
 * 自 v1 ui-schoolswap.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import DomainSchedule from '../domain/domain-schedule.js';
import DomainSchoolSwap from '../domain/domain-school-swap.js';
import FieldMap from '../domain/field-map.js';

/**
 * ui-schoolswap.js — 全校對調（ modal／存檔／班級異動）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
import { showToast, showConfirm } from '../ui/toast.js';
const UiSchoolSwap = (() => {
  function create(deps) {
    deps = deps || {};
    var computed = deps.computed;
    var callGasApi = deps.callGasApi;
    var currentWeekDates = deps.currentWeekDates;
    var schoolSwapModalMode = deps.schoolSwapModalMode;
    var schoolSwapForm = deps.schoolSwapForm;
    var showSchoolSwapModal = deps.showSchoolSwapModal;
    var schoolSwaps = deps.schoolSwaps;
    var clearScheduleCache = deps.clearScheduleCache;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var schoolSwapWeekdayNumber = deps.schoolSwapWeekdayNumber;
    var schoolSwapSaving = deps.schoolSwapSaving;
    var isSingleWeek = deps.isSingleWeek;

const openAddSchoolSwapModal = () => {
  const dates = currentWeekDates.value || [];
  schoolSwapModalMode.value = 'add';
  schoolSwapForm.value = {
    id: '',
    name: '',
    dateA: dates[0] || '',
    periodA: 1,
    dateB: dates[1] || '',
    periodB: 1,
    enabled: true,
    note: ''
  };
  showSchoolSwapModal.value = true;
};

const openEditSchoolSwapModal = (row) => {
  const mapped = FieldMap.mapSchoolSwap(row || {});
  schoolSwapModalMode.value = 'edit';
  schoolSwapForm.value = {
    id: mapped.id,
    name: mapped.name,
    dateA: mapped.dateA,
    periodA: mapped.periodA,
    dateB: mapped.dateB,
    periodB: mapped.periodB,
    enabled: mapped.enabled,
    note: mapped.note
  };
  showSchoolSwapModal.value = true;
};

const saveSchoolSwap = async () => {
  const form = schoolSwapForm.value || {};
  if (!String(form.name || '').trim() || !form.dateA || !form.dateB) {
    showToast('請填寫名稱及兩個日期！', 'warning');
    return;
  }
  const dayA = schoolSwapWeekdayNumber(form.dateA);
  const dayB = schoolSwapWeekdayNumber(form.dateB);
  if (dayA < 1 || dayA > 5 || dayB < 1 || dayB > 5) {
    showToast('全校對調日期必須是週一至週五！', 'warning');
    return;
  }
  if (String(form.dateA) + '|' + String(form.periodA) === String(form.dateB) + '|' + String(form.periodB)) {
    showToast('兩個對調端點不可相同！', 'warning');
    return;
  }
  schoolSwapSaving.value = true;
  try {
    const res = await callGasApi('saveSchoolSwap', {
      對調ID: form.id || '',
      事件名稱: String(form.name || '').trim(),
      日期A: form.dateA,
      星期A: dayA,
      節次A: parseInt(form.periodA, 10),
      日期B: form.dateB,
      星期B: dayB,
      節次B: parseInt(form.periodB, 10),
      啟用: !!form.enabled,
      備註: String(form.note || '').trim()
    });
    if (!res || res.success === false) throw new Error(res && res.error ? res.error : '儲存失敗');
    const saved = FieldMap.mapSchoolSwap(res.schoolSwap || form);
    const next = schoolSwaps.value.slice();
    const index = next.findIndex(row => String(FieldMap.mapSchoolSwap(row).id) === String(saved.id));
    if (index >= 0) next[index] = saved;
    else next.unshift(saved);
    schoolSwaps.value = next;
    showSchoolSwapModal.value = false;
    clearScheduleCache();
    showToast(schoolSwapModalMode.value === 'add' ? '已新增全校對調' : '已更新全校對調', 'success');
    if (typeof softRefreshInBackground === 'function') softRefreshInBackground({ force: true, delay: 300 });
  } catch (err) {
    showToast('儲存全校對調失敗：' + (err && err.message ? err.message : err), 'error');
  } finally {
    schoolSwapSaving.value = false;
  }
};

const deleteSchoolSwap = async (row) => {
  const id = String(row && (row.id || row['對調ID']) || '').trim();
  if (!id) return;
  const ok = await showConfirm('確定刪除這筆全校對調設定？\n刪除後不會再影響課表。', '刪除全校對調');
  if (!ok) return;
  try {
    await callGasApi('deleteSchoolSwap', { id: id });
    schoolSwaps.value = schoolSwaps.value.filter(item => String(FieldMap.mapSchoolSwap(item).id) !== id);
    clearScheduleCache();
    showToast('已刪除全校對調', 'success');
    if (typeof softRefreshInBackground === 'function') softRefreshInBackground({ force: true, delay: 300 });
  } catch (err) {
    showToast('刪除全校對調失敗：' + (err && err.message ? err.message : err), 'error');
  }
};

const buildClassSchoolSwapChanges = (className, scheduleRows, swapRows, weekDates, isSingleWeekFn) => {
  const cls = String(className || '').trim();
  if (!cls || !DomainSchoolSwap) return [];
  const weekSet = new Set(weekDates || []);
  const parseClasses = (raw) => (DateUtils && DateUtils.parseCombinedClasses)
    ? DateUtils.parseCombinedClasses(raw)
    : String(raw || '').split(/[、,，/／|｜\s]+/).map(s => s.trim()).filter(Boolean);
  const schedules = (scheduleRows || []).filter(schedule => {
    if (!schedule || !schedule.className || schedule.attr === '抽離' || schedule.isPullOut) return false;
    return parseClasses(schedule.className).includes(cls);
  });
  const changes = [];
  DomainSchoolSwap.normalizeRows(swapRows || [])
    .filter(row => row.enabled)
    .forEach(row => {
      const rowKey = row.id || `${row.dateA}-${row.periodA}-${row.dateB}-${row.periodB}`;
      [
        { endpoint: 'A', date: row.dateA, day: row.dayA, period: row.periodA, sourceDate: row.dateB, sourceDay: row.dayB, sourcePeriod: row.periodB },
        { endpoint: 'B', date: row.dateB, day: row.dayB, period: row.periodB, sourceDate: row.dateA, sourceDay: row.dayA, sourcePeriod: row.periodA }
      ].forEach(endpoint => {
        schedules.forEach((schedule, index) => {
           if (parseInt(schedule.dayOfWeek, 10) !== parseInt(endpoint.sourceDay, 10)
               || parseInt(schedule.period, 10) !== parseInt(endpoint.sourcePeriod, 10)) return;
           if (DomainSchedule && DomainSchedule.isActiveOnDate
               && !DomainSchedule.isActiveOnDate(schedule, endpoint.date)) return;
           const attr = String(schedule.attr || '').trim();
          if (typeof isSingleWeekFn === 'function') {
            if (attr === '單週' && !isSingleWeekFn(endpoint.date)) return;
            if (attr === '雙週' && isSingleWeekFn(endpoint.date)) return;
          }
          changes.push({
            id: `school-swap-${rowKey}-${endpoint.endpoint}-${schedule.id || index}`,
            date: endpoint.date,
            period: endpoint.period,
            dayNum: endpoint.day,
            sourceDate: endpoint.sourceDate,
            sourcePeriod: endpoint.sourcePeriod,
            subject: String(schedule.subject || '').trim() || '課程',
            swapName: row.name,
            inWeek: weekSet.has(endpoint.date)
          });
        });
      });
    });
  return changes;
};

    return {
      openAddSchoolSwapModal: openAddSchoolSwapModal,
      openEditSchoolSwapModal: openEditSchoolSwapModal,
      saveSchoolSwap: saveSchoolSwap,
      deleteSchoolSwap: deleteSchoolSwap,
      buildClassSchoolSwapChanges: buildClassSchoolSwapChanges,
    };
  }
  return { create: create };
})();

export { UiSchoolSwap };
