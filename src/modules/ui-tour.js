import { nextTick } from 'vue';
/**
 * 自 v1 ui-tour.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import { notifyChunkLoadFailed } from './vendor-libs.js';

/**
 * ui-tour.js — 新手導覽（示範操作／邀請／回放）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
import { showToast } from '../ui/toast.js';
const UiTour = (() => {
  function create(deps) {
    deps = deps || {};
    var activeTab = deps.activeTab;
    var showMatchModal = deps.showMatchModal;
    var inputRequestDate = deps.inputRequestDate;
    var matchMode = deps.matchMode;
    var fetchRecommendations = deps.fetchRecommendations;
    var clearMatchPreview = deps.clearMatchPreview;
    var showCompareModal = deps.showCompareModal;
    var matchSearchQuery = deps.matchSearchQuery;
    var matchDisplayCount = deps.matchDisplayCount;
    var recommendedTeachers = deps.recommendedTeachers;
    var prepCompare = deps.prepCompare;
    var showSuccessModal = deps.showSuccessModal;
    var currentWeekDates = deps.currentWeekDates;
    var getTodayString = deps.getTodayString;
    var user = deps.user;
    var openPaperPrintDraft = deps.openPaperPrintDraft;
    var showPrintPreviewModal = deps.showPrintPreviewModal;
    var closePrintPreview = deps.closePrintPreview;
    var paperPrintDraft = deps.paperPrintDraft;
    var paperSignatureByTeacher = deps.paperSignatureByTeacher;
    var printPreview = deps.printPreview;
    var buildLineInviteText = deps.buildLineInviteText;
    var lineCopyText = deps.lineCopyText;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var notificationsSuppressed = deps.notificationsSuppressed;
    var successFlowMode = deps.successFlowMode;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineBatchParts = deps.lineBatchParts;
    var tourDemoInvite = deps.tourDemoInvite;
    var getWeekDayText = deps.getWeekDayText;
    var scrollMainToTop = deps.scrollMainToTop;
    var isAdmin = deps.isAdmin;
    var isStaff = deps.isStaff;
    var classReadonlyMode = deps.classReadonlyMode;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getScheduleForDate = deps.getScheduleForDate;
    var activeCell = deps.activeCell;
    var closeMatchModal = deps.closeMatchModal;
    let _tourDemoCellCache = null; // 重用示範格，少重算／少重複 API
    let _onboardingLoadP = null;
    const ONBOARDING_PAPER_STORAGE_KEY = 'jcjh_onboarding_paper_v1';

const ensureOnboardingTour = () => {
  if (typeof window !== 'undefined' && window.OnboardingTour && typeof window.OnboardingTour.start === 'function') {
    return Promise.resolve(window.OnboardingTour);
  }
  if (_onboardingLoadP) return _onboardingLoadP;
  // 2.1a：ESM 動態載入（取代已不存在的 onboarding-tour.js script 檔回退）。
  _onboardingLoadP = import('./onboarding-tour.js').then((m) => {
    const tour = m.OnboardingTour;
    if (typeof window !== 'undefined') window.OnboardingTour = tour;
    return tour;
  }).catch((e) => {
    _onboardingLoadP = null;
    try { notifyChunkLoadFailed(); } catch (_) {}
    throw e;
  });
  return _onboardingLoadP;
};

const openMatchDemoForTour = async () => {
  activeTab.value = 'timetable';
  await nextTick();
  const demo = findDemoScheduleCell();
  if (!demo) {
    showToast('本週找不到可示範的課堂，已略過媒合相關步驟（有課的週再點 ❓ 重播）', 'info');
    return false;
  }
  // 同一格且抽屜已開：不重打媒合
  const sameCell = activeCell.value
    && String(activeCell.value.teacherEmail || '').toLowerCase() === String(demo.teacherEmail).toLowerCase()
    && parseInt(activeCell.value.dayOfWeek, 10) === demo.dayOfWeek
    && parseInt(activeCell.value.period, 10) === demo.period
    && String(inputRequestDate.value || '') === String(demo.dateStr || '');
  if (showMatchModal.value && sameCell && document.querySelector('[data-tour="match-drawer"]')) {
    return true;
  }
  activeCell.value = {
    teacherEmail: demo.teacherEmail,
    teacherName: demo.teacherName,
    dayOfWeek: demo.dayOfWeek,
    period: demo.period,
    classData: demo.classData
  };
  inputRequestDate.value = demo.dateStr;
  matchMode.value = 'substitution';
  showMatchModal.value = true;
  await nextTick();
  try {
    fetchRecommendations();
  } catch (e) { /* ignore */ }
  await new Promise((r) => setTimeout(r, 280));
  return !!document.querySelector('[data-tour="match-drawer"]');
};

const closeMatchDemoForTour = () => {
  try {
    if (typeof closeMatchModal === 'function') closeMatchModal();
    else {
      showMatchModal.value = false;
      if (typeof clearMatchPreview === 'function') clearMatchPreview();
    }
  } catch (e) {
    showMatchModal.value = false;
  }
};

const openExchangeModeDemoForTour = async () => {
  if (!showMatchModal.value) {
    const opened = await openMatchDemoForTour();
    if (!opened) return false;
  }
  matchMode.value = 'exchange';
  matchSearchQuery.value = '';
  matchDisplayCount.value = 10;
  try { clearMatchPreview(); } catch (e) {}
  await nextTick();
  try { fetchRecommendations(); } catch (e) { /* ignore */ }
  await new Promise((resolve) => setTimeout(resolve, 320));
  return !!document.querySelector('[data-tour="exchange-mode-btn"]')
    && !!document.querySelector('[data-tour="exchange-controls"]');
};

const openCompareDemoForTour = async () => {
  // 確保媒合已開
  if (!showMatchModal.value) {
    const ok = await openMatchDemoForTour();
    if (!ok) return false;
  }
  await nextTick();
  // 調課介紹後回到代課模擬，避免沿用調課名單造成示範錯位。
  if (matchMode.value !== 'substitution') {
    matchMode.value = 'substitution';
    try { clearMatchPreview(); } catch (e) {}
    try { fetchRecommendations(); } catch (e) { /* ignore */ }
    await new Promise((r) => setTimeout(r, 280));
  }
  // 等名單出現（真實 API 可能稍慢）
  let list = recommendedTeachers.value || [];
  for (let i = 0; i < 12 && (!list || !list.length); i++) {
    await new Promise((r) => setTimeout(r, 200));
    list = recommendedTeachers.value || [];
  }
  const cand = (list || []).find((t) => t && t.email);
  if (!cand) {
    showToast('目前沒有可模擬的代課人選，已略過模擬畫面步驟', 'info');
    return false;
  }
  try {
    // 代課模式模擬（與點「模擬」相同）
    const result = await prepCompare('substitution', cand.email);
    if (result === 'cancelled') return false;
  } catch (e) {
    console.warn(e);
    showToast('無法開啟模擬畫面', 'warning');
    return false;
  }
  await nextTick();
  await new Promise((r) => setTimeout(r, 200));
  return !!document.querySelector('[data-tour="compare-modal"]');
};

const closeCompareDemoForTour = () => {
  try { showCompareModal.value = false; } catch (e) {}
};

const openPaperPrintDemoForTour = async () => {
  closeCompareDemoForTour();
  closeMatchDemoForTour();
  try { showSuccessModal.value = false; } catch (e) {}
  const demo = findDemoScheduleCell();
  const classData = (demo && demo.classData) || {};
  const date = (demo && demo.dateStr) || currentWeekDates.value[0] || getTodayString();
  const period = (demo && demo.period) || 3;
  const records = [{
    id: 'tour-paper-print',
    requestId: 'tour-paper-print',
    serial: '導覽示範',
    type: 'substitution',
    originalTeacherEmail: (demo && demo.teacherEmail) || 'tour-owner',
    originalTeacherName: (demo && demo.teacherName) || (user.value && user.value.displayName) || '申請教師',
    actualTeacherEmail: 'tour-substitute',
    actualTeacherName: '王小明（示範）',
    date: date,
    period: period,
    className: classData.className || '701',
    subject: classData.subject || '國文',
    reason: '事假',
    subFee: '自費代課',
    leaveTimeType: '全天',
    leaveTime: '08:00~16:00',
    note: '操作教學示範',
    isPaperDraft: true,
    paperFlow: true,
    printed: false
  }];
  const opened = await openPaperPrintDraft(records, { canPrint: true, source: 'paperTour' });
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 160));
  return !!(opened && document.querySelector('[data-tour="print-preview-modal"]'));
};

const closePaperPrintDemoForTour = () => {
  try {
    if (showPrintPreviewModal.value) closePrintPreview(false);
    paperPrintDraft.value = null;
    paperSignatureByTeacher.value = {};
  } catch (e) {
    showPrintPreviewModal.value = false;
    printPreview.value = null;
  }
};

const openLineDemoForTour = async () => {
  try {
    showCompareModal.value = false;
    showMatchModal.value = false;
  } catch (e) {}
  const demo = findDemoScheduleCell();
  const currentUrl = window.location.origin + window.location.pathname;
  // 與正式送出後範本同一套 buildLineInviteText
  const dateA = demo ? demo.dateStr : '2026-03-20';
  const dayA = demo ? demo.dayOfWeek : 3;
  const periodA = demo ? demo.period : 3;
  const classA = (demo && demo.classData && demo.classData.className) || '701';
  const subjectA = (demo && demo.classData && demo.classData.subject) || '國文';
  // 示範用假 id（格式與正式連結相同，點了不會對到真實單）
  const demoId = 'demo_tour_invite';
  lineCopyText.value = buildLineInviteText({
    targetName: '王小明',
    requesterName: '',
    dateA: dateA,
    dayA: dayA,
    periodA: periodA,
    classA: classA,
    subjectA: subjectA,
    isExchange: false,
    agreeLink: `${currentUrl}?action=respond&id=${encodeURIComponent(demoId)}&status=agree`,
    declineLink: `${currentUrl}?action=respond&id=${encodeURIComponent(demoId)}&status=decline`,
    systemUrl: currentUrl,
    paperFlow: notificationsSuppressed.value
  });
  // 文末加註：導覽示範
  lineCopyText.value += '\n\n（以上為操作教學示範範本，與正式送出後格式相同；此連結不會對應真實申請單。）';
  successModalTitle.value = '🎉 申請已送出（導覽示範）';
  successModalMessage.value = '這是送出成功後的畫面示範，並未真正送出申請。下方 LINE 範本格式與正式通知相同。';
  successFlowMode.value = 'tour';
  hasLineTemplate.value = true;
  lineBatchParts.value = [];
  showSuccessModal.value = true;
  await nextTick();
  await new Promise((r) => setTimeout(r, 200));
  return !!document.querySelector('[data-tour="success-modal"]');
};

const closeLineDemoForTour = () => {
  try {
    showSuccessModal.value = false;
    hasLineTemplate.value = false;
    lineCopyText.value = '';
    lineBatchParts.value = [];
  } catch (e) {}
};

const clearTourDemoInvite = () => { tourDemoInvite.value = null; };

const showTourDemoInvite = async () => {
  activeTab.value = 'pending';
  await nextTick();
  scrollMainToTop();
  const me = (user.value && user.value.displayName) || '您';
  const demo = findDemoScheduleCell();
  let leaveSlot = '03/20(三) 第3節 701國文';
  if (demo && demo.classData) {
    const d = String(demo.dateStr || '');
    const mmdd = d.length >= 10 ? d.slice(5, 10).replace('-', '/') : d;
    const dayTxt = typeof getWeekDayText === 'function' ? getWeekDayText(demo.dayOfWeek) : '';
    const cls = ((demo.classData.className || '') + (demo.classData.subject || '')).trim();
    leaveSlot = mmdd + (dayTxt ? '(' + dayTxt + ')' : '') + ' 第' + demo.period + '節' + (cls ? ' ' + cls : '');
  }
  const today = typeof getTodayString === 'function' ? getTodayString() : DateUtils.toLocalDateStr(new Date());
  tourDemoInvite.value = {
    serial: 'DEMO-導覽',
    createdAt: today,
    requesterName: '王小明（示範）',
    targetTeacherName: me,
    leaveSlot: leaveSlot,
    type: 'substitution'
  };
  await nextTick();
  for (let i = 0; i < 20; i++) {
    if (document.querySelector('[data-tour="pending-invite-demo"]')) break;
    await new Promise((r) => setTimeout(r, 60));
    await nextTick();
  }
  const row = document.querySelector('[data-tour="pending-invite-demo"]');
  const card = document.querySelector('[data-tour="pending-invite"]');
  scrollMainToTop(row || card);
  await new Promise((r) => setTimeout(r, 40));
  scrollMainToTop(row || card);
  return !!document.querySelector('[data-tour="pending-invite-demo"]')
    || !!document.querySelector('[data-tour="pending-invite"]');
};

const tourDemoInviteRespond = (action) => {
  if (action === 'agree') {
    showToast('（導覽）您按了「同意」— 真實操作時會通知行政繼續核准。此為示範，未送出。', 'success');
  } else {
    showToast('（導覽）您按了「拒絕」— 真實操作時申請會取消。此為示範，未送出。', 'info');
  }
};

const goTimetableForTour = async () => {
  clearTourDemoInvite();
  activeTab.value = 'timetable';
  await nextTick();
  // 等課表區掛上
  for (let i = 0; i < 12; i++) {
    if (document.querySelector('[data-tour="week-nav"]')
      || document.querySelector('[data-tour="week-and-grid"]')
      || document.querySelector('[data-tour="batch-btn"]')) break;
    await new Promise((r) => setTimeout(r, 40));
    await nextTick();
  }
  const weekNav = document.querySelector('[data-tour="week-nav"]');
  const weekGrid = document.querySelector('[data-tour="week-and-grid"]');
  const batchBtn = document.querySelector('[data-tour="batch-btn"]');
  // 兩次：第一次整頁歸零，第二次對準週次列（優先，才看得到切週）
  scrollMainToTop(weekNav || weekGrid || batchBtn);
  await new Promise((r) => setTimeout(r, 50));
  scrollMainToTop(weekNav || weekGrid || batchBtn);
  await new Promise((r) => setTimeout(r, 50));
  return true;
};

const tourCallbacks = () => ({
  scrollToTop: (el) => { scrollMainToTop(el || null); return true; },
  goTimetable: () => goTimetableForTour(),
  goPending: () => { activeTab.value = 'pending'; return true; },
  goRecords: async () => {
    clearTourDemoInvite();
    activeTab.value = 'records';
    await nextTick();
    for (let i = 0; i < 10; i++) {
      if (document.querySelector('[data-tour="history-panel"]')) break;
      await new Promise((r) => setTimeout(r, 40));
      await nextTick();
    }
    const hist = document.querySelector('[data-tour="history-panel"]');
    scrollMainToTop(hist);
    await new Promise((r) => setTimeout(r, 40));
    scrollMainToTop(hist);
    return true;
  },
  goClass: () => {
    clearTourDemoInvite();
    if (isAdmin.value || isStaff.value || classReadonlyMode.value) {
      activeTab.value = 'class';
      return true;
    }
    return false;
  },
  openMatchDemo: () => openMatchDemoForTour(),
  closeMatchDemo: () => { closeMatchDemoForTour(); return true; },
  openExchangeModeDemo: () => openExchangeModeDemoForTour(),
  openCompareDemo: () => openCompareDemoForTour(),
  closeCompareDemo: () => { closeCompareDemoForTour(); return true; },
  openPaperPrintDemo: () => openPaperPrintDemoForTour(),
  closePaperPrintDemo: () => { closePaperPrintDemoForTour(); return true; },
  openLineDemo: () => openLineDemoForTour(),
  closeLineDemo: () => { closeLineDemoForTour(); return true; },
  closeLineCompareMatchGoPending: () => {
    closeLineDemoForTour();
    closeCompareDemoForTour();
    closeMatchDemoForTour();
    clearTourDemoInvite();
    activeTab.value = 'pending';
    return true;
  },
  closeLineAndShowDemoInvite: async () => {
    closeLineDemoForTour();
    closeCompareDemoForTour();
    closeMatchDemoForTour();
    await nextTick();
    return showTourDemoInvite();
  },
  showDemoInvite: () => showTourDemoInvite(),
  clearDemoInvite: () => { clearTourDemoInvite(); return true; }
});

const startOnboarding = async () => {
  try {
    clearTourDemoInvite();
    _tourDemoCellCache = null;
    showToast('載入操作教學…', 'info');
    const tour = await ensureOnboardingTour();
    if (!tour || typeof tour.start !== 'function') throw new Error('教學模組未就緒');
    await tour.start({ callbacks: tourCallbacks(), mode: notificationsSuppressed.value ? 'paper' : 'online' });
  } catch (e) {
    console.error(e);
    showToast('無法載入操作教學：' + (e && e.message ? e.message : e), 'error');
  }
};

const skipOnboarding = () => {
  if (window.OnboardingTour && window.OnboardingTour.isActive && window.OnboardingTour.isActive()) {
    window.OnboardingTour.stop(true);
  }
};

const shouldAutoStartOnboarding = () => {
  if (classReadonlyMode.value) return false;
  const storageKey = notificationsSuppressed.value ? ONBOARDING_PAPER_STORAGE_KEY : 'jcjh_onboarding_v2';
  try {
    return !localStorage.getItem(storageKey);
  } catch (e) {
    return true;
  }
};

const findDemoScheduleCell = () => {
  if (_tourDemoCellCache) return _tourDemoCellCache;
  const email = user.value && getTeacherNameByEmail(user.value.email);
  if (!email) return null;
  const dates = currentWeekDates.value || [];
  for (let day = 1; day <= 5; day++) {
    const dateStr = dates[day - 1];
    if (!dateStr) continue;
    const periodList = (DateUtils && DateUtils.getTimetablePeriods)
      ? DateUtils.getTimetablePeriods()
      : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
    for (let pi = 0; pi < periodList.length; pi++) {
      const period = periodList[pi];
      try {
        const cell = getScheduleForDate(email, dateStr, period, day);
        if (!cell) continue;
        if (cell.isSubstituted) continue;
        if (cell.isPatrol || cell.attr === '巡堂') continue;
        if (cell.isPending) continue;
        if (!cell.className && !cell.subject) continue;
        _tourDemoCellCache = {
          teacherEmail: email,
          teacherName: getTeacherNameByEmail(email),
          dayOfWeek: day,
          period: period,
          dateStr: dateStr,
          classData: cell
        };
        return _tourDemoCellCache;
      } catch (e) { /* ignore */ }
    }
  }
  return null;
};

    return {
      ensureOnboardingTour: ensureOnboardingTour,
      openMatchDemoForTour: openMatchDemoForTour,
      closeMatchDemoForTour: closeMatchDemoForTour,
      openExchangeModeDemoForTour: openExchangeModeDemoForTour,
      openCompareDemoForTour: openCompareDemoForTour,
      closeCompareDemoForTour: closeCompareDemoForTour,
      openPaperPrintDemoForTour: openPaperPrintDemoForTour,
      closePaperPrintDemoForTour: closePaperPrintDemoForTour,
      openLineDemoForTour: openLineDemoForTour,
      closeLineDemoForTour: closeLineDemoForTour,
      clearTourDemoInvite: clearTourDemoInvite,
      showTourDemoInvite: showTourDemoInvite,
      tourDemoInviteRespond: tourDemoInviteRespond,
      goTimetableForTour: goTimetableForTour,
      tourCallbacks: tourCallbacks,
      startOnboarding: startOnboarding,
      skipOnboarding: skipOnboarding,
      shouldAutoStartOnboarding: shouldAutoStartOnboarding,
      findDemoScheduleCell: findDemoScheduleCell,
    };
  }
  return { create: create };
})();

export { UiTour };
