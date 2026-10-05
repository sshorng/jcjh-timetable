/**
 * ui-report.js — 經費報表（結算窗／月報／課表匯出／監考匯出）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
window.UiReport = (function () {
  function create(deps) {
    deps = deps || {};
    var activeTab = deps.activeTab;
    var adminSubTab = deps.adminSubTab;
    // R15：報表期間導航自 app.js 搬移（以下 deps 由 app 經 create 傳入）
    var accountingPeriodMonth = deps.accountingPeriodMonth;
    var nextTick = deps.nextTick || function (fn) { try { Promise.resolve().then(fn); } catch (e) {} };
    // 導航旗標由 app 持有（watch 續留 setup；此處經 accessor 讀寫，單一來源）
    var _isNav = deps._isNav || function () { return false; };
    var _setNav = deps._setNav || function () {};
    const shiftReportPeriod = (direction) => {
      if (!window.DateUtils || typeof window.DateUtils.shiftMonthKey !== 'function'
          || typeof window.DateUtils.shiftAccountingPeriod !== 'function') return;
      const targetMonth = window.DateUtils.shiftMonthKey(accountingPeriodMonth.value, direction);
      const nextPeriod = window.DateUtils.shiftAccountingPeriod({
        start: reportStartDate.value,
        end: reportEndDate.value
      }, targetMonth, direction);
      if (!targetMonth || !nextPeriod.start || !nextPeriod.end) return;
      _setNav(true);
      accountingPeriodMonth.value = targetMonth;
      reportMonth.value = targetMonth;
      reportStartDate.value = nextPeriod.start;
      reportEndDate.value = nextPeriod.end;
      nextTick(() => {
        _setNav(false);
      });
    };
    let monthlyReportScheduleTimer = null;
    let monthlyReportIdleHandle = null;
    var computed = deps.computed;
    var isValidReportPeriod = deps.isValidReportPeriod;
    var reportStartDate = deps.reportStartDate;
    var reportEndDate = deps.reportEndDate;
    var requestWindowInfo = deps.requestWindowInfo;
    var user = deps.user;
    var isAdmin = deps.isAdmin;
    var currentSemester = deps.currentSemester;
    var fetchInitialData = deps.fetchInitialData;
    var applyInitialPayload = deps.applyInitialPayload;
    var period8Ready = deps.period8Ready;
    var period8Loading = deps.period8Loading;
    var ensureBillingReady = deps.ensureBillingReady;
    var monthlyReportKey = deps.monthlyReportKey;
    var _getMonthlyReportLastCalculationKey = deps._getMonthlyReportLastCalculationKey;
    var monthlyReportLoading = deps.monthlyReportLoading;
    var monthlyReportData = deps.monthlyReportData;
    var reportWeeksCount = deps.reportWeeksCount;
    var teachersList = deps.teachersList;
    var allSchedules = deps.allSchedules;
    var schoolSwaps = deps.schoolSwaps;
    var substitutionRecords = deps.substitutionRecords;
    var reportMonth = deps.reportMonth;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var classAwayEvents = deps.classAwayEvents;
    var semesterEndDate = deps.semesterEndDate;
    var isSingleWeek = deps.isSingleWeek;
    var schoolExportTeacherFilter = deps.schoolExportTeacherFilter;
    var schoolExportSelectedEmails = deps.schoolExportSelectedEmails;
    var schoolExportStart = deps.schoolExportStart;
    var schoolExportEnd = deps.schoolExportEnd;
    var schoolExportIncludeWeekend = deps.schoolExportIncludeWeekend;
    var schoolExportOnlyChanged = deps.schoolExportOnlyChanged;
    var getApprovedScheduleForDate = deps.getApprovedScheduleForDate;
    var isClassAwayOnDate = deps.isClassAwayOnDate;
    var ensureDAC = deps.ensureDAC;
    var semestersList = deps.semestersList;
    var ensureExportReady = deps.ensureExportReady;
    var _getMonthlyReportCalculationId = deps._getMonthlyReportCalculationId;
    var _nextMonthlyReportCalculationId = deps._nextMonthlyReportCalculationId;
    var _getMonthlyReportLastCalculationKey = deps._getMonthlyReportLastCalculationKey;
    var _setMonthlyReportLastCalculationKey = deps._setMonthlyReportLastCalculationKey;
    let billingPeriodRequestsPromise = null;
    let period8ReadyPromise = null;
    const BILLING_REQUEST_DEFAULT_WINDOW_DAYS = 14;
    const BILLING_REQUEST_MAX_WINDOW_DAYS = 120;

const getBillingRequestWindow = () => {
  if (!isValidReportPeriod({ start: reportStartDate.value, end: reportEndDate.value })) return null;
  const today = window.DateUtils && typeof window.DateUtils.getTodayString === 'function'
    ? window.DateUtils.getTodayString() : new Date().toISOString().slice(0, 10);
  const startParts = reportStartDate.value.split('-').map(Number);
  const todayParts = today.split('-').map(Number);
  const startUtc = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const todayUtc = Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const elapsedDays = Math.max(0, Math.floor((todayUtc - startUtc) / 86400000));
  if (elapsedDays > BILLING_REQUEST_MAX_WINDOW_DAYS) {
    return { historyAll: true, windowDays: 0 };
  }
  return {
    historyAll: false,
    windowDays: Math.max(BILLING_REQUEST_DEFAULT_WINDOW_DAYS, elapsedDays)
  };
};

const billingRequestWindowIsLoaded = (required) => {
  const loaded = requestWindowInfo.value || {};
  if (loaded.historyAll) return true;
  return !required.historyAll && Number(loaded.windowDays || 0) >= required.windowDays;
};

const ensureBillingRequestsForPeriod = async () => {
  if (!user.value || !isAdmin.value) return;
  const required = getBillingRequestWindow();
  if (!required || billingRequestWindowIsLoaded(required)) return;
  if (billingPeriodRequestsPromise) {
    await billingPeriodRequestsPromise;
    return ensureBillingRequestsForPeriod();
  }
  const options = {
    semesterId: currentSemester.value,
    force: true,
    requestsOnly: true,
    historyAll: required.historyAll,
    windowDays: required.windowDays || BILLING_REQUEST_DEFAULT_WINDOW_DAYS
  };
  const request = fetchInitialData(options).then((res) => {
    if (!res || res.success === false) throw new Error('結算期間申請紀錄載入失敗');
    applyInitialPayload(res);
  });
  billingPeriodRequestsPromise = request;
  try {
    await request;
  } finally {
    if (billingPeriodRequestsPromise === request) billingPeriodRequestsPromise = null;
  }
  if (!billingRequestWindowIsLoaded(required)) {
    throw new Error('伺服器回傳的申請資料未涵蓋完整結算區間');
  }
  return ensureBillingRequestsForPeriod();
};

const ensurePeriod8Ready = async () => {
  if (period8Ready.value && window.DomainBilling) return;
  if (!period8ReadyPromise) {
    period8Loading.value = true;
    period8ReadyPromise = ensureBillingReady()
      .then(() => { period8Ready.value = true; })
      .finally(() => {
        period8Loading.value = false;
        period8ReadyPromise = null;
      });
  }
  await period8ReadyPromise;
};

const calculateMonthlyReport = async () => {
  cancelScheduledMonthlyReport();
  const calculationKey = monthlyReportKey();
  if (_getMonthlyReportLastCalculationKey() === calculationKey) {
    monthlyReportLoading.value = false;
    return;
  }
  const calculationId = _nextMonthlyReportCalculationId();
  monthlyReportLoading.value = true;
  if (!reportWeeksCount.value) {
    monthlyReportData.value = [];
    _setMonthlyReportLastCalculationKey(calculationKey);
    monthlyReportLoading.value = false;
    return;
  }
  try {
    await ensureBillingReady();
    await ensureBillingRequestsForPeriod();
    if (calculationId !== _getMonthlyReportCalculationId()) return;
  } catch (e) {
    if (calculationId === _getMonthlyReportCalculationId()) {
      monthlyReportData.value = [];
      monthlyReportLoading.value = false;
    }
    return;
  }
  try {
    const rows = window.DomainBilling.buildMonthlyReportRows({
      teachers: teachersList.value,
      allSchedules: allSchedules.value,
      schoolSwaps: schoolSwaps.value,
      substitutionRecords: substitutionRecords.value,
      reportMonth: reportMonth.value,
      reportWeeksCount: reportWeeksCount.value,
      reportStartDate: reportStartDate.value,
      reportEndDate: reportEndDate.value,
      getTeacherNameByEmail,
      classAwayEvents: classAwayEvents.value,
      semesterEndDate: semesterEndDate.value,
      isSingleWeek
    });
    if (calculationId === _getMonthlyReportCalculationId()) {
      monthlyReportData.value = rows;
      _setMonthlyReportLastCalculationKey(calculationKey);
    }
  } catch (e) {
    console.error('月報計算失敗：', e);
    if (calculationId === _getMonthlyReportCalculationId()) monthlyReportData.value = [];
  } finally {
    if (calculationId === _getMonthlyReportCalculationId()) monthlyReportLoading.value = false;
  }
};

const exportReportToExcel = async () => {
  try {
    await ensureBillingReady();
    if (typeof window.ensureXlsx === 'function') await window.ensureXlsx();
  } catch (e) {
    showToast('Excel 模組載入失敗', 'error');
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Excel 模組未載入', 'error');
    return;
  }
  await calculateMonthlyReport();
  const data = window.DomainBilling.toExcelRows(monthlyReportData.value);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
   const rangeLabel = `${reportStartDate.value}_${reportEndDate.value}`;
   XLSX.utils.book_append_sheet(wb, ws, `${rangeLabel}大鐘點1-7午休`);
   if (window.DomainBilling.toPeriod8ExcelRows) {
     const p8 = window.DomainBilling.toPeriod8ExcelRows({
       preparedPayout: monthlyReportData.value && monthlyReportData.value.period8Payout,
       reportMonth: reportMonth.value,
       reportStartDate: reportStartDate.value,
       reportEndDate: reportEndDate.value,
      allSchedules: allSchedules.value,
      substitutionRecords: substitutionRecords.value,
      classAwayEvents: classAwayEvents.value,
      semesterEndDate: semesterEndDate.value,
      getTeacherNameByEmail,
      isSingleWeek
    });
     const ws8 = XLSX.utils.json_to_sheet(p8.length ? p8 : [{ "日期": "", "說明": "本期無第8節應發或空堂列" }]);
     XLSX.utils.book_append_sheet(wb, ws8, `${rangeLabel}第8節明細`);
   }
    XLSX.writeFile(wb, `全校大鐘點早自習1-7午休與第8節費_${rangeLabel}.xlsx`);
};

const filteredSchoolExportTeachers = computed(() => {
  const q = String(schoolExportTeacherFilter.value || '').trim().toLowerCase();
  const list = teachersList.value || [];
  if (!q) return list;
  return list.filter(t => {
    const name = String(t.name || '').toLowerCase();
    const subj = String(t.subject || '').toLowerCase();
    const em = String(t.email || '').toLowerCase();
    return name.indexOf(q) >= 0 || subj.indexOf(q) >= 0 || em.indexOf(q) >= 0;
  });
});

const isSchoolExportTeacherSelected = (email) => {
  const em = String(email || '').toLowerCase();
  return schoolExportSelectedEmails.value.indexOf(em) >= 0;
};

const toggleSchoolExportTeacher = (email) => {
  const em = String(email || '').toLowerCase();
  if (!em) return;
  const arr = schoolExportSelectedEmails.value.slice();
  const i = arr.indexOf(em);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(em);
  schoolExportSelectedEmails.value = arr;
};

const selectAllSchoolExportTeachers = () => {
  // 若有篩選字，只全選目前可見；否則全校
  const src = schoolExportTeacherFilter.value
    ? filteredSchoolExportTeachers.value
    : (teachersList.value || []);
  const set = {};
  schoolExportSelectedEmails.value.forEach(e => { set[e] = 1; });
  src.forEach(t => {
    const em = String(t.email || '').toLowerCase();
    if (em) set[em] = 1;
  });
  schoolExportSelectedEmails.value = Object.keys(set);
};

const clearSchoolExportTeachers = () => {
  if (schoolExportTeacherFilter.value) {
    // 只清目前可見
    const hide = {};
    filteredSchoolExportTeachers.value.forEach(t => {
      const em = String(t.email || '').toLowerCase();
      if (em) hide[em] = 1;
    });
    schoolExportSelectedEmails.value = schoolExportSelectedEmails.value.filter(e => !hide[e]);
  } else {
    schoolExportSelectedEmails.value = [];
  }
};

const setSchoolExportThisWeek = async () => {
  try {
    await ensureExportReady();
  } catch (e) {
    showToast('匯出模組載入失敗', 'error');
    return;
  }
  if (!window.ExportSchoolTimetable || !window.ExportSchoolTimetable.thisWeekRange) {
    showToast('匯出模組未載入', 'error');
    return;
  }
  const r = window.ExportSchoolTimetable.thisWeekRange();
  schoolExportStart.value = r.startDate;
  schoolExportEnd.value = r.endDate;
  schoolExportIncludeWeekend.value = false;
};

const exportSchoolTimetableWord = async () => {
  if (!isAdmin.value) {
    showToast('僅管理員可匯出全校課表', 'warning');
    return;
  }
  try {
    await ensureExportReady();
  } catch (e) {
    showToast('匯出模組載入失敗，請重新整理頁面', 'error');
    return;
  }
  if (!window.ExportSchoolTimetable || !window.ExportSchoolTimetable.exportWord) {
    showToast('匯出模組未載入，請重新整理頁面', 'error');
    return;
  }
  const selected = {};
  schoolExportSelectedEmails.value.forEach(e => { selected[e] = 1; });
  // 維持 teachersList 順序（＝試算表順序），只留勾選
  const teachers = (teachersList.value || []).filter(t => {
    const em = String(t.email || '').toLowerCase();
    return em && selected[em];
  });
  if (!teachers.length) {
    showToast('請至少勾選一位教師', 'warning');
    return;
  }
  const res = window.ExportSchoolTimetable.exportWord({
    startDate: schoolExportStart.value,
    endDate: schoolExportEnd.value,
    includeWeekend: !!schoolExportIncludeWeekend.value,
    onlyChanged: !!schoolExportOnlyChanged.value,
    teachers,
    getCell: (email, dateStr, period, dayOfWeek) =>
      getApprovedScheduleForDate(email, dateStr, period, dayOfWeek),
    // 空堂事件班：匯出留白（與課表邏輯一致；畫面仍淡化）
     isClassAway: (className, dateStr, period) => isClassAwayOnDate(className, dateStr, period)
  });
  if (!res || !res.ok) {
    showToast((res && res.error) || '匯出失敗', 'warning');
    return;
  }
  if (res.warning) showToast(res.warning, 'info');
  showToast(`已下載：${res.fileName}（${res.teacherCount} 位教師 × ${res.dayCount} 天）`, 'success');
};

const ensureActivityCoverReady = async () => {
  if (typeof window.ensureJSZip === 'function') {
    await window.ensureJSZip();
  }
  if (typeof window.ensureExportActivityCover === 'function') {
    await window.ensureExportActivityCover();
  }
  if (!window.ExportActivityCover || !window.ExportActivityCover.exportWord) {
    throw new Error('輪值通知單匯出模組尚未載入');
  }
  if (!(window.JSZip || (typeof JSZip !== 'undefined' && JSZip))) {
    throw new Error('JSZip 未載入');
  }
};

const buildDefaultInvigilationTitle = () => {
  const sid = String(currentSemester.value || '').trim();
  const m = sid.match(/^(\d{2,3})\s*[-_]?\s*([12])$/);
  let semesterPart = '';
  if (m) {
    const termZh = m[2] === '2' ? '第二' : '第一';
    semesterPart = m[1] + '學年度' + termZh + '學期';
  } else {
    const sem = (semestersList.value || []).find(s => s && s.id === sid);
    const name = sem && sem.name ? String(sem.name).trim() : '';
    // 學期名稱常見「114學年度第1學期」→ 正規成「第一／第二」
    if (name) {
      semesterPart = name
        .replace(/第\s*1\s*學期/, '第一學期')
        .replace(/第\s*2\s*學期/, '第二學期')
        .replace(/\s+/g, '');
    } else {
      semesterPart = sid || '本學期';
    }
  }
  return '臺北市立建成國民中學' + semesterPart + '第一次段考監考表';
};

const ensureInvigilationExportReady = async () => {
  if (typeof window.ensureExcelJS === 'function') {
    await window.ensureExcelJS();
  }
  // 多份分發打 ZIP 用
  if (typeof window.ensureJSZip === 'function') {
    try { await window.ensureJSZip(); } catch (eZ) { /* 單份可不需 */ }
  }
  await ensureDAC();
  if (typeof window.ensureExportInvigilation === 'function') {
    await window.ensureExportInvigilation();
  }
  if (!window.ExportInvigilation || !window.ExportInvigilation.exportWorkbook) {
    throw new Error('監考表匯出模組尚未載入');
  }
  if (!(window.ExcelJS || (typeof ExcelJS !== 'undefined' && ExcelJS))) {
    throw new Error('ExcelJS 未載入（套版需要）');
  }
};

const cancelScheduledMonthlyReport = () => {
  if (monthlyReportScheduleTimer) {
    clearTimeout(monthlyReportScheduleTimer);
    monthlyReportScheduleTimer = null;
  }
  if (monthlyReportIdleHandle !== null && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(monthlyReportIdleHandle);
    monthlyReportIdleHandle = null;
  }
};

const scheduleMonthlyReportCalculation = () => {
  cancelScheduledMonthlyReport();
  if (activeTab.value !== 'admin' || adminSubTab.value !== 'billing') {
    monthlyReportLoading.value = false;
    return;
  }
  if (_getMonthlyReportLastCalculationKey() === monthlyReportKey()) {
    monthlyReportLoading.value = false;
    return;
  }
  monthlyReportLoading.value = true;
  const run = () => {
    monthlyReportScheduleTimer = null;
    monthlyReportIdleHandle = null;
    if (activeTab.value === 'admin' && adminSubTab.value === 'billing') {
      calculateMonthlyReport();
    } else {
      monthlyReportLoading.value = false;
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    monthlyReportIdleHandle = window.requestIdleCallback(run, { timeout: 500 });
  } else {
    // 先讓後台外框完成一次繪製，再執行同步月報計算。
    monthlyReportScheduleTimer = setTimeout(run, 0);
  }
};

const monthlyReportTotals = computed(() =>
  window.DomainBilling && typeof window.DomainBilling.sumMonthlyReportRows === 'function'
    ? window.DomainBilling.sumMonthlyReportRows(monthlyReportData.value)
    : {}
);

const accountingPlanOptions = computed(() => {
  const sources = new Set();
  (teachersList.value || []).forEach((teacher) => {
    if (window.FieldMap && typeof window.FieldMap.expensePlanSources === 'function') {
      window.FieldMap.expensePlanSources(teacher && teacher.expensePlan).forEach(source => sources.add(source));
    } else if (teacher && teacher.expensePlan) {
      sources.add(String(teacher.expensePlan).trim());
    }
  });
  return Array.from(sources).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
});

    return {
      getBillingRequestWindow: getBillingRequestWindow,
      billingRequestWindowIsLoaded: billingRequestWindowIsLoaded,
      ensureBillingRequestsForPeriod: ensureBillingRequestsForPeriod,
      ensurePeriod8Ready: ensurePeriod8Ready,
      calculateMonthlyReport: calculateMonthlyReport,
      exportReportToExcel: exportReportToExcel,
      filteredSchoolExportTeachers: filteredSchoolExportTeachers,
      isSchoolExportTeacherSelected: isSchoolExportTeacherSelected,
      toggleSchoolExportTeacher: toggleSchoolExportTeacher,
      selectAllSchoolExportTeachers: selectAllSchoolExportTeachers,
      clearSchoolExportTeachers: clearSchoolExportTeachers,
      setSchoolExportThisWeek: setSchoolExportThisWeek,
      exportSchoolTimetableWord: exportSchoolTimetableWord,
      ensureActivityCoverReady: ensureActivityCoverReady,
      buildDefaultInvigilationTitle: buildDefaultInvigilationTitle,
      ensureInvigilationExportReady: ensureInvigilationExportReady,      cancelScheduledMonthlyReport: cancelScheduledMonthlyReport,
      scheduleMonthlyReportCalculation: scheduleMonthlyReportCalculation,
      monthlyReportTotals: monthlyReportTotals,
      accountingPlanOptions: accountingPlanOptions,
      shiftReportPeriod: shiftReportPeriod,

    };
  }
  return { create: create };
})();
