/**
 * ui-interaction.js — 互動（modal 無障礙／點格／班級連結）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
window.UiInteraction = (function () {
  function create(deps) {
    deps = deps || {};
    var substitutionRecords = deps.substitutionRecords;
    var classList = deps.classList;
    var teachersList = deps.teachersList;
    var lookupTeacher = deps.lookupTeacher;
    var isMutualCover = deps.isMutualCover;
    var mutualActivityStart = deps.mutualActivityStart;
    var mutualActivityEnd = deps.mutualActivityEnd;
    var selectedWeekDate = deps.selectedWeekDate;
    var selectedSubject = deps.selectedSubject;
    var searchQuery = deps.searchQuery;
    var displayTimetableTeachers = deps.displayTimetableTeachers;
    var ttPageSize = deps.ttPageSize;
    var TT_PAGE_SIZE_DEFAULT = deps.TT_PAGE_SIZE_DEFAULT;
    var ttPage = deps.ttPage;
    var formatDateMMDD = deps.formatDateMMDD;
    var currentWeekDates = deps.currentWeekDates;
    var showMatchModal = deps.showMatchModal;
    var activeCell = deps.activeCell;
    var matchMode = deps.matchMode;
    var pendingClassView = deps.pendingClassView;
    var activeTab = deps.activeTab;
    var selectedClass = deps.selectedClass;
    var classReadonlyMode = deps.classReadonlyMode;
    var getTimetableApi = deps.getTimetableApi;
    var classSchedules = deps.classSchedules;
    var selectedClassWeekDates = deps.selectedClassWeekDates;
    var classSubstitutionMap = deps.classSubstitutionMap;
    var detailSubRecord = deps.detailSubRecord;
    var detailRequest = deps.detailRequest;
    var showDetailModal = deps.showDetailModal;
    var resolveDetailRequest = deps.resolveDetailRequest;
    var classViewerReadonly = deps.classViewerReadonly;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var inputRequestDate = deps.inputRequestDate;
    var exchangeTargetDate = deps.exchangeTargetDate;
    var exchangeWeekOffset = deps.exchangeWeekOffset;
    var exchangePeriodId = deps.exchangePeriodId;
    var exchangeTeacherEmail = deps.exchangeTeacherEmail;
    var matchPreview = deps.matchPreview;
    var recommendedTeachers = deps.recommendedTeachers;
    var matchSearchQuery = deps.matchSearchQuery;
    var matchDisplayCount = deps.matchDisplayCount;
    var fetchRecommendations = deps.fetchRecommendations;
    var isClassAwayOnDate = deps.isClassAwayOnDate;
    var canOperateOnTeacherEmail = deps.canOperateOnTeacherEmail;
    var ensureProxyTargetForTeacher = deps.ensureProxyTargetForTeacher;
    var user = deps.user;
    var isAdmin = deps.isAdmin;
    var isScheduleEditMode = deps.isScheduleEditMode;
    var openScheduleEditModal = deps.openScheduleEditModal;
    var isMutualLead = deps.isMutualLead;
    var getMutualDraftAt = deps.getMutualDraftAt;
    var removeMutualDraft = deps.removeMutualDraft;
    var isMutualActivitySlotInRange = deps.isMutualActivitySlotInRange;
    var showCompareModal = deps.showCompareModal;
    var batchSelectMode = deps.batchSelectMode;
    var batchFlowMode = deps.batchFlowMode;
    var toggleBatchSlot = deps.toggleBatchSlot;
    var exchangeTeacherClasses = deps.exchangeTeacherClasses;
    var allSchedules = deps.allSchedules;
    var openEmptySlotAssign = deps.openEmptySlotAssign;
    const _modalA11yDisposers = {};

const bindVueModalA11y = (flag, closeFn, sel, label) => {
  watch(flag, (open) => {
    const key = sel;
    if (_modalA11yDisposers[key]) {
      try { _modalA11yDisposers[key](); } catch (e) { /* ignore */ }
      _modalA11yDisposers[key] = null;
    }
    if (!open) return;
    nextTick(() => {
      const overlay = document.querySelector(sel);
      if (!overlay) return;
      _modalA11yDisposers[key] = installModalA11y(overlay, {
        label: label || '對話框',
        onClose: () => {
          try { closeFn(); } catch (eC) { /* ignore */ }
        }
      });
    });
  });
};

const bindFlagModal = (flag, closeFn, label) => {
  if (!flag || typeof flag !== 'object' || !('value' in flag)) return;
  watch(flag, (open) => {
    const key = 'flag:' + label;
    if (_modalA11yDisposers[key]) {
      try { _modalA11yDisposers[key](); } catch (e) { /* ignore */ }
      _modalA11yDisposers[key] = null;
    }
    if (!open) return;
    nextTick(() => {
      const overlays = document.querySelectorAll('.modal-overlay');
      let overlay = null;
      for (let i = overlays.length - 1; i >= 0; i--) {
        const el = overlays[i];
        const st = window.getComputedStyle(el);
        if (st.display !== 'none' && st.visibility !== 'hidden') {
          overlay = el;
          break;
        }
      }
      if (!overlay && overlays.length) overlay = overlays[overlays.length - 1];
      if (!overlay) return;
      _modalA11yDisposers[key] = installModalA11y(overlay, {
        label: label,
        onClose: () => { try { closeFn(); } catch (eC) { /* ignore */ } }
      });
    });
  });
};

const paintMatchSourceDom = () => {
  try {
    document.querySelectorAll('.grid-cell-class.is-match-source')
      .forEach((el) => {
        el.classList.remove('is-match-source', 'is-match-exchange-source');
      });
    if (!showMatchModal.value || !activeCell.value) return;
    const em = String(activeCell.value.teacherEmail || '').toLowerCase();
    const day = parseInt(activeCell.value.dayOfWeek, 10);
    const period = parseInt(activeCell.value.period, 10);
    if (!em || isNaN(day) || isNaN(period)) return;
    const nodes = document.querySelectorAll(
      '.grid-cell-class[data-tt-email="' + em + '"][data-tt-day="' + day + '"][data-tt-period="' + period + '"]'
    );
     const isEx = matchMode.value === 'exchange' || matchMode.value === 'triangle';
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].classList.add('is-match-source');
      if (isEx) nodes[i].classList.add('is-match-exchange-source');
    }
  } catch (e) { /* ignore */ }
};

const applyClassViewFromUrl = () => {
  const urlParams = new URLSearchParams(window.location.search);
  // 唯讀深連結：?class=701（相容舊式 ?view=class&class=701）
  const cls = String(urlParams.get('class') || urlParams.get('cls') || '').trim();
  if (!cls) return false;
  classReadonlyMode.value = true;
  pendingClassView.value = cls;
  activeTab.value = 'class';
  selectedClass.value = cls;
  return true;
};

const getClassReadonlyLink = (cls) => {
  const c = encodeURIComponent(cls || selectedClass.value || '');
  return `${window.location.origin}${window.location.pathname}?class=${c}`;
};

const copyClassReadonlyLink = async (cls) => {
  const link = getClassReadonlyLink(cls || selectedClass.value);
  if (!cls && !selectedClass.value) {
    showToast('請先選擇班級', 'warning');
    return;
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast('已複製該班唯讀課表連結', 'success');
  } catch (e) {
    window.prompt('請手動複製連結：', link);
  }
};

const handleClassCellClick = (cls, day, period, entryOrIndex) => {
  const a = getTimetableApi();
  if (!a) return;
  a.handleClassCellClick({
    classSchedules, selectedClassWeekDates, classSubstitutionMap, detailSubRecord, detailRequest,
     showDetailModal, resolveDetailRequest, classReadonlyMode: classViewerReadonly, isAdmin, getTeacherNameByEmail,
    activeCell, inputRequestDate, matchMode, exchangeTargetDate, exchangeWeekOffset, exchangePeriodId,
     exchangeTeacherEmail, matchPreview, recommendedTeachers, matchSearchQuery, matchDisplayCount,
     showMatchModal, fetchRecommendations,
     showToast, isClassAwayOnDate,
     canOperateOnTeacherEmail: canOperateOnTeacherEmail,
    ensureProxyTargetForTeacher: ensureProxyTargetForTeacher
  }, cls, day, period, entryOrIndex);
};

const handlePeriod8CellClick = (cell) => {
  const a = getTimetableApi();
  if (!a || typeof a.handlePeriod8CellClick !== 'function') {
    showToast('課表模組未載入', 'error');
    return;
  }
  return a.handlePeriod8CellClick({
    activeCell, inputRequestDate, matchMode, matchPreview, showMatchModal,
    recommendedTeachers, matchSearchQuery, matchDisplayCount, fetchRecommendations,
    detailRequest, detailSubRecord, showDetailModal, resolveDetailRequest,
    getTeacherNameByEmail, isAdmin, user, showToast,
    canOperateOnTeacherEmail: canOperateOnTeacherEmail,
    ensureProxyTargetForTeacher: ensureProxyTargetForTeacher
  }, cell);
};

const handleCellClick = async (teacherEmail, dayOfWeek, period, dateStr) => {
  const a = getTimetableApi();
  if (!a) {
    showToast('課表模組未載入', 'error');
    return;
  }
  return a.handleCellClick({
    isScheduleEditMode, openScheduleEditModal, showToast, showConfirm,
    isMutualLead, getMutualDraftAt, removeMutualDraft, activeCell, inputRequestDate,
    isMutualActivitySlotInRange,
    matchMode, matchPreview, showCompareModal, showMatchModal,
    fetchRecommendations, batchSelectMode, batchFlowMode, isAdmin, user, toggleBatchSlot,
    detailRequest, detailSubRecord, showDetailModal, resolveDetailRequest,
    getTeacherNameByEmail, exchangeTargetDate, exchangeWeekOffset, exchangePeriodId, exchangeTeacherEmail,
    canOperateOnTeacherEmail: canOperateOnTeacherEmail,
    ensureProxyTargetForTeacher: ensureProxyTargetForTeacher,
    openEmptySlotAssign: openEmptySlotAssign
  }, teacherEmail, dayOfWeek, period, dateStr);
};

const startSecondSub = () => {
  if (!canStartSecondSubFromDetail.value) {
    showToast('只有自己的實際課時可以再辦', 'warning');
    return;
  }
  const a = getTimetableApi();
  if (!a) return;
  a.startSecondSub({
    detailSubRecord, getTeacherNameByEmail, activeCell, inputRequestDate, showDetailModal,
    exchangeTargetDate, exchangeWeekOffset, exchangePeriodId, exchangeTeacherEmail,
    matchMode, fetchRecommendations, matchPreview, showMatchModal
  });
};

const loadTeacherClassesForExchange = () => {
  if (!exchangeTeacherEmail.value) {
    exchangeTeacherClasses.value = [];
    return;
  }
   const exchangeDate = String(inputRequestDate.value || '').trim();
   exchangeTeacherClasses.value = allSchedules.value.filter(s =>
     s.teacherEmail === exchangeTeacherEmail.value &&
     s.className === activeCell.value.classData.className &&
     (!exchangeDate || !window.DomainSchedule || !window.DomainSchedule.isActiveOnDate
       || window.DomainSchedule.isActiveOnDate(s, exchangeDate))
   );
};

const jumpToTeacherTimetable = (email, opts) => {
  const em = String(email || '').trim();
  if (!em) return;
  const t = lookupTeacher(em);
  if (!t) {
    showToast('找不到該教師', 'warning');
    return;
  }
  opts = opts || {};
  // 活動互代：預設跳到活動起日所在週
  let jumpDate = opts.date ? String(opts.date).slice(0, 10) : '';
  if (!jumpDate && (opts.useActivityWeek || isMutualCover.value)) {
    jumpDate = String(mutualActivityStart.value || mutualActivityEnd.value || '').slice(0, 10);
  }
  if (jumpDate && /^\d{4}-\d{2}-\d{2}$/.test(jumpDate)) {
    selectedWeekDate.value = jumpDate;
  }
  activeTab.value = 'timetable';
  selectedSubject.value = 'all';
  searchQuery.value = t.name || '';
  nextTick(() => {
    const list = displayTimetableTeachers.value || [];
    const idx = list.findIndex(x => String(x.email || '').toLowerCase() === String(t.email).toLowerCase());
    if (idx >= 0) {
      const size = ttPageSize.value || TT_PAGE_SIZE_DEFAULT;
      ttPage.value = Math.floor(idx / size) + 1;
    }
    nextTick(() => {
      const id = 'tt-teacher-' + String(t.email).replace(/[^a-zA-Z0-9_-]/g, '_');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('tt-teacher-flash');
        setTimeout(() => el.classList.remove('tt-teacher-flash'), 1600);
      }
      const weekTip = jumpDate
        ? `（週次 ${formatDateMMDD(currentWeekDates.value[0])}～${formatDateMMDD(currentWeekDates.value[4])}）`
        : '';
      showToast(`已定位：${t.name} 老師課表${weekTip}`, 'success');
    });
  });
};

const scrollMainToTop = (targetEl) => {
  try {
    const zero = (el) => {
      if (!el) return;
      try {
        if (typeof el.scrollTo === 'function') el.scrollTo(0, 0);
        el.scrollTop = 0;
        el.scrollLeft = 0;
      } catch (e0) { /* ignore */ }
    };
    zero(window);
    zero(document.documentElement);
    zero(document.body);
    zero(document.scrollingElement);
    // 掃所有目前有 scrollTop 的節點
    document.querySelectorAll('body *').forEach((el) => {
      try {
        if (el.scrollTop > 0 || el.scrollLeft > 0) zero(el);
      } catch (e1) { /* ignore */ }
    });
    if (targetEl && targetEl.nodeType === 1) {
      // 從目標往上把可捲動祖先歸零
      let p = targetEl.parentElement;
      while (p) {
        try {
          const st = window.getComputedStyle(p);
          const oy = st.overflowY;
          if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight) {
            zero(p);
          }
        } catch (e2) { /* ignore */ }
        p = p.parentElement;
      }
      targetEl.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'auto' });
      const nav = document.querySelector('.navbar');
      const navH = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      const top = targetEl.getBoundingClientRect().top;
      // 固定把目標頂緣對齊導覽列下緣
      window.scrollBy(0, top - navH - 10);
    }
  } catch (e) { /* ignore */ }
};

const canStartSecondSubFromDetail = computed(() => {
  const record = detailSubRecord.value;
  const currentUser = user.value;
  if (!record || !currentUser) return false;
  if (isAdmin.value) return true;

  const normalize = (value) => String(value || '').trim().toLowerCase();
  const currentEmail = normalize(currentUser.email);
  if (!currentEmail) return false;
  const profile = (teachersList.value || []).find((teacher) =>
    [teacher && teacher.loginEmail, teacher && teacher.email, teacher && teacher.teacherEmail,
      teacher && teacher.teacherName, teacher && teacher.name]
      .some(value => normalize(value) === currentEmail)
  );
  const currentKeys = [
    currentUser.email,
    currentUser.displayName,
    profile && profile.loginEmail,
    profile && profile.email,
    profile && profile.teacherEmail,
    profile && profile.teacherName,
    profile && profile.name
  ].map(normalize).filter(Boolean);
  const ownerKeys = [record.actualTeacherEmail, record.actualTeacherName]
    .map(normalize).filter(Boolean);
  return ownerKeys.some(key => currentKeys.includes(key));
});

const showDetailForRecord = (recId, requestId) => {
  const subRec = substitutionRecords.value.find(r => r.id === recId);
  detailSubRecord.value = subRec || null;
  
  const resolved = resolveDetailRequest(requestId, subRec);
  if (resolved) {
    detailRequest.value = resolved;
  } else {
    showToast("⚠️ 找不到該筆異動詳情資料。", "error");
    return;
  }
  showDetailModal.value = true;
};

const resolvePendingClassView = () => {
  if (!pendingClassView.value) return;
  const target = String(pendingClassView.value).trim();
  const list = classList.value || [];
  const matched = list.find(c => String(c) === target)
    || list.find(c => String(c).toLowerCase() === target.toLowerCase())
    || list.find(c => String(c).includes(target) || target.includes(String(c)));
  selectedClass.value = matched || target;
  activeTab.value = 'class';
  classReadonlyMode.value = true;
  pendingClassView.value = '';
};


    return {
      bindVueModalA11y: bindVueModalA11y,
      bindFlagModal: bindFlagModal,
      paintMatchSourceDom: paintMatchSourceDom,
      applyClassViewFromUrl: applyClassViewFromUrl,
      getClassReadonlyLink: getClassReadonlyLink,
      copyClassReadonlyLink: copyClassReadonlyLink,
      handleClassCellClick: handleClassCellClick,
      handlePeriod8CellClick: handlePeriod8CellClick,
      handleCellClick: handleCellClick,
      startSecondSub: startSecondSub,
      loadTeacherClassesForExchange: loadTeacherClassesForExchange,      jumpToTeacherTimetable: jumpToTeacherTimetable,
      scrollMainToTop: scrollMainToTop,
      canStartSecondSubFromDetail: canStartSecondSubFromDetail,
      showDetailForRecord: showDetailForRecord,
      resolvePendingClassView: resolvePendingClassView,
      canStartSecondSubFromDetail: canStartSecondSubFromDetail,

    };
  }
  return { create: create };
})();
