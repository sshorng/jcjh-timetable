/**
 * ui-data.js — 資料層（載入／同步／學期／樂觀更新）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 * 共享可變狀態：_softRefresh*／_approvedConvertSig 已隨函數遷入；
 * _dataLoadSeq／_requestsWatermark 留守 app.js（logout／水位讀者共用），經 accessor deps 存取。
 */
window.UiData = (function () {
  function create(deps) {
    deps = deps || {};
    var dataRefreshing = deps.dataRefreshing;
    var callGasApi = deps.callGasApi;
    var computed = deps.computed;
    var activeCell = deps.activeCell;
    var matchMode = deps.matchMode;
    var matchSearchQuery = deps.matchSearchQuery;
    var exchangeWeekdayFilter = deps.exchangeWeekdayFilter;
    var clearMatchPreview = deps.clearMatchPreview;
    var triangleCellIsUsable = deps.triangleCellIsUsable;
    var resetTriangleDraft = deps.resetTriangleDraft;
    var fetchRecommendations = deps.fetchRecommendations;
    var teachersList = deps.teachersList;
    var allSchedules = deps.allSchedules;
    var currentWeekDates = deps.currentWeekDates;
    var lookupTeacher = deps.lookupTeacher;
    var devTeacherQuery = deps.devTeacherQuery;
    var isTriangleRequest = deps.isTriangleRequest;
    var requestsList = deps.requestsList;
    var isAdminDirectRequest = deps.isAdminDirectRequest;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var user = deps.user;
    var userRole = deps.userRole;
    var currentSemester = deps.currentSemester;
    var scheduleScope = deps.scheduleScope;
    var semestersList = deps.semestersList;
    var classDirectory = deps.classDirectory;
    var schoolSwaps = deps.schoolSwaps;
    var homeroomRecords = deps.homeroomRecords;
    var sortRequestListDesc = deps.sortRequestListDesc;
    var substitutionRecords = deps.substitutionRecords;
    var convertRequestsToSubstitutions = deps.convertRequestsToSubstitutions;
    var approvedConvertSig = deps.approvedConvertSig;
    var bumpRequestsWatermarkFromRows = deps.bumpRequestsWatermarkFromRows;
    var effectiveUserEmail = deps.effectiveUserEmail;
    var mySentRequests = deps.mySentRequests;
    var myPendingRequests = deps.myPendingRequests;
    var adminPendingRequests = deps.adminPendingRequests;
    var collapseTriangleRows = deps.collapseTriangleRows;
    var allPendingRequests = deps.allPendingRequests;
    var classAwayEvents = deps.classAwayEvents;
    var applySettings = deps.applySettings;
    var requestWindowInfo = deps.requestWindowInfo;
    var historyFullLoaded = deps.historyFullLoaded;
    var stampIsNewer = deps.stampIsNewer;
    var clearScheduleCache = deps.clearScheduleCache;
    var softSyncing = deps.softSyncing;
    var softSyncRequestsDelta = deps.softSyncRequestsDelta;
    var softSyncRequestsOnly = deps.softSyncRequestsOnly;
    var softSyncPendingOnly = deps.softSyncPendingOnly;
    var isAdmin = deps.isAdmin;
    var loadHomeroomRecords = deps.loadHomeroomRecords;
    var dataUpdatedAt = deps.dataUpdatedAt;
    var gasApiUrl = deps.gasApiUrl;
    var fetchMetaData = deps.fetchMetaData;
    var classViewSchedules = deps.classViewSchedules;
    var classViewSchoolSwaps = deps.classViewSchoolSwaps;
    var classViewLoadedClass = deps.classViewLoadedClass;
    var classViewSubstitutionRecords = deps.classViewSubstitutionRecords;
    var mapPublicClassRequests = deps.mapPublicClassRequests;
    var classViewClassAwayEvents = deps.classViewClassAwayEvents;
    var pendingClassView = deps.pendingClassView;
    var selectedClass = deps.selectedClass;
    var cancelAll = deps.cancelAll;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var classReadonlyMode = deps.classReadonlyMode;
    var activeTab = deps.activeTab;
    var fetchPublicClassData = deps.fetchPublicClassData;
    var resolvePendingClassView = deps.resolvePendingClassView;
    var fetchInitialData = deps.fetchInitialData;
    var logout = deps.logout;
    var semesterForm = deps.semesterForm;
    var semesterModalMode = deps.semesterModalMode;
    var showSemesterModal = deps.showSemesterModal;
    var gsiButtonError = deps.gsiButtonError;
    var SOFT_REFRESH_MIN_GAP_MS = deps.SOFT_REFRESH_MIN_GAP_MS;
    var _getDataLoadSeq = deps._getDataLoadSeq;
    var _nextDataLoadSeq = deps._nextDataLoadSeq;
    var _getRequestsWatermark = deps._getRequestsWatermark;
    var _setRequestsWatermark = deps._setRequestsWatermark;
    let _softRefreshTimer = null;
    let _softRefreshRunning = false;
    let _softRefreshQueued = null;
    let _softRefreshLastAt = 0;
    /** 已核准集合指紋：未變則 recompute 可略過 convert（H5） */
    let _approvedConvertSig = '';

const changeMatchMode = async (mode) => {
  // 巡堂不可調課／代課（點格已擋；此為保險）
  if (activeCell.value && activeCell.value.classData &&
      (activeCell.value.classData.isPatrol || activeCell.value.classData.attr === '巡堂')) {
    showToast('巡堂節不需系統調代課或三角調，請私下安排代巡', 'info');
    matchMode.value = 'substitution';
    clearMatchPreview();
    return;
  }
  if (mode !== matchMode.value) matchSearchQuery.value = '';
  if (mode === 'triangle') {
    const source = activeCell.value || {};
    if (!source.classData || !triangleCellIsUsable(source.classData)) {
      showToast('三角調只能從有效一般課程開始', 'warning');
      return;
    }
    matchMode.value = 'triangle';
    clearMatchPreview();
    resetTriangleDraft();
    return;
  }
  // 抽離：可調課，但僅限與另一節抽離互調（候選列表已過濾；此處提示）
  if (mode === 'exchange' && activeCell.value && activeCell.value.classData &&
      (activeCell.value.classData.isPullOut || activeCell.value.classData.attr === '抽離')) {
    const tip = (window.DomainSchedule && window.DomainSchedule.PULL_OUT_EXCHANGE_TIP)
      || '抽離課僅可與另一節「抽離」互調，不可與一般課調課。';
    showToast(tip, 'info', 4500);
  }
  // 綁課：可調課，但需確認提醒（特殊狀況）
  if (mode === 'exchange' && activeCell.value && activeCell.value.classData &&
      activeCell.value.classData.restriction === 'restricted') {
    const ok = await showConfirm(
      '此堂為綁課／特殊課程，原則上建議申請代課。\n\n特殊狀況仍可調課，請確認已與相關人員（領域／導師／教學組）溝通後再繼續。\n\n仍要切換到「節次調課」？',
      '綁課提醒'
    );
    if (!ok) {
      matchMode.value = 'substitution';
      clearMatchPreview();
      if (activeCell.value.dayOfWeek) fetchRecommendations();
      return;
    }
  }
  if (mode === 'exchange' && matchMode.value !== 'exchange') {
    exchangeWeekdayFilter.value = 0;
  }
  matchMode.value = mode;
  clearMatchPreview();
  if (activeCell.value.dayOfWeek) {
    fetchRecommendations();
  }
};

const teacherTimetableHours = computed(() => {
  const map = Object.create(null);
  (teachersList.value || []).forEach(teacher => {
    const basicHours = teacher.baseHours === 0 || teacher.baseHours === '0'
      ? 0
      : (parseInt(teacher.baseHours, 10) || 16);
    const scheduledHours = window.DomainSchedule && typeof window.DomainSchedule.countTeacherFormalScheduleHours === 'function'
       ? window.DomainSchedule.countTeacherFormalScheduleHours(teacher, allSchedules.value, currentWeekDates.value)
       : 0;
    const fixedSetting = window.FieldMap && typeof window.FieldMap.fixedOvertimeSetting === 'function'
      ? window.FieldMap.fixedOvertimeSetting(teacher)
      : { configured: false, valid: false, hours: 0, slotsText: '' };
    const summary = {
      basicHours,
      overtimeHours: fixedSetting.configured && fixedSetting.valid
        ? fixedSetting.hours : Math.max(0, scheduledHours - basicHours),
      fixedOvertimeConfigured: fixedSetting.configured,
      fixedOvertimeValid: fixedSetting.valid,
      fixedOvertimeSlots: fixedSetting.slotsText
    };
    [teacher.email, teacher.loginEmail, teacher.teacherEmail, teacher.teacherName, teacher.name]
      .filter(Boolean)
      .forEach(key => {
        map[String(key).trim().toLowerCase()] = summary;
      });
  });
  return map;
});

const getTeacherTimetableHours = (teacher) => {
  const map = teacherTimetableHours.value || {};
  const keys = [teacher && teacher.email, teacher && teacher.loginEmail, teacher && teacher.teacherName, teacher && teacher.name]
    .filter(Boolean)
    .map(key => String(key).trim().toLowerCase());
  for (const key of keys) {
    if (map[key]) return map[key];
  }
  return { basicHours: 0, overtimeHours: 0 };
};

const getRealTeacherName = (s) => {
  if (!s) return '';
  const rawName = s.teacherName || '';
  if (rawName && !rawName.includes('(') && !rawName.includes(')') && !/^\d/.test(rawName)) {
    return rawName;
  }
  if (s.teacherEmail) {
    const t = lookupTeacher(s.teacherEmail);
    if (t && t.name) return t.name;
  }
  return rawName.includes('(') ? '' : rawName;
};

const filteredDevTeachers = computed(() => {
  const q = String(devTeacherQuery.value || '').trim().toLowerCase();
  const list = teachersList.value || [];
  if (!q) return list;
  return list.filter(t => {
    const name = String(t.name || '').toLowerCase();
    const em = String(t.email || '').toLowerCase();
    const sub = String(t.subject || '').toLowerCase();
    return name.includes(q) || em.includes(q) || sub.includes(q);
  });
});

const getTriangleGroupRequests = (request) => {
  if (!isTriangleRequest(request)) return request ? [request] : [];
  const triangleId = String(request.triangleId || request.batchId || '').trim();
  const rows = (requestsList.value || []).filter((row) => {
    if (!isTriangleRequest(row)) return false;
    return triangleId && String(row.triangleId || row.batchId || '').trim() === triangleId;
  });
  return (rows.length ? rows : [request]).slice().sort((a, b) =>
    (parseInt(a.triangleLegIndex, 10) || 0) - (parseInt(b.triangleLegIndex, 10) || 0)
  );
};

const isMySentRequest = (r, email) => {
  if (!r || !email) return false;
  if (isAdminDirectRequest(r)) return false;
  const me = String(email).toLowerCase().trim();
  const myName = String(getTeacherNameByEmail(me) || '').toLowerCase().trim();
  const reqName = String(r.requesterName || '').toLowerCase().trim();
  const proxyName = String(r.proxyByName || '').toLowerCase().trim();
  const note = String(r.note || '');
  const noteIsProxy = note.indexOf('[行政代申請') >= 0;
  // 只要有代申請跡象：絕不能用「請假人＝我」混進來
  if (proxyName || noteIsProxy || r.isProxySubmit === true) {
    if (proxyName) return proxyName === myName;
    // 無代申請人 Email 欄時：用備註姓名對 lookup（模擬 displayName 去「(模擬)」）
    const m = note.match(/\[行政代申請[：:]\s*([^代\]]+?)\s*代/);
    if (m) {
      const proxyName = String(m[1] || '').trim();
       const noteMyName = String(getTeacherNameByEmail(me) || '')
        .trim()
        .replace(/\s*\(模擬\)\s*$/, '');
      const disp = String((user.value && user.value.displayName) || '')
        .trim()
        .replace(/\s*\(模擬\)\s*$/, '');
       if (proxyName && (proxyName === noteMyName || proxyName === disp)) return true;
    }
    return false;
  }
  return reqName === myName;
};

const applyInitialPayload = (res) => {
  if (!res) return;
  if (res.userRole && ['admin', 'staff', 'teacher'].includes(String(res.userRole))) {
    userRole.value = String(res.userRole);
  }
  if (res.scheduleScope) scheduleScope.value = String(res.scheduleScope);
  else if (res.scope === 'teacher') scheduleScope.value = 'teacher_self_and_class';
  else if (res.scope === 'admin') scheduleScope.value = 'full';
  if (res.semesters) {
    semestersList.value = res.semesters.map(s => window.FieldMap.mapSemester(s));
    semestersList.value.sort((a, b) => a.id.localeCompare(b.id));
    if (semestersList.value.length > 0 && (!currentSemester.value || !semestersList.value.find(s => s.id === currentSemester.value))) {
      const defaultSem = semestersList.value.find(s => s.isDefault);
      const latest = defaultSem || semestersList.value[semestersList.value.length - 1];
      currentSemester.value = latest.id;
      localStorage.setItem('jcjh_semester', latest.id);
    }
  }
  if (res.teachers) {
    teachersList.value = res.teachers.map(t => window.FieldMap.mapTeacher(t));
  }
  if (Array.isArray(res.classNames)) {
    classDirectory.value = res.classNames.map(c => String(c || '').trim()).filter(Boolean);
  }
  if (res.schedules) {
    allSchedules.value = res.schedules.map(s => window.FieldMap.mapSchedule(s));
  }
  if (Array.isArray(res.schoolSwaps)) {
    schoolSwaps.value = res.schoolSwaps.map(s => window.FieldMap.mapSchoolSwap(s));
  }
  if (Array.isArray(res.homeroomRecords)) {
    homeroomRecords.value = res.homeroomRecords.map(r => window.FieldMap.mapHomeroomRecord(r));
  }
  if (res.requests) {
    const allRequests = res.requests.map(r => window.FieldMap.mapRequest(r));
    const sortedAll = sortRequestListDesc(allRequests);
    requestsList.value = sortedAll;
    // 關鍵：動態從 requestsList 轉換出 substitutionRecords（公開唯讀也需要）
    substitutionRecords.value = convertRequestsToSubstitutions(sortedAll);
    _approvedConvertSig = approvedConvertSig(sortedAll);
    bumpRequestsWatermarkFromRows(sortedAll);
    if (user.value) {
      // 模擬身份時用被模擬者 Email（user.value.email），不用 JWT 原帳
       const email = effectiveUserEmail.value || String(user.value.email || '').toLowerCase();
       const name = String(getTeacherNameByEmail(email) || '').toLowerCase();
       mySentRequests.value = sortedAll.filter(r => isMySentRequest(r, email));
       myPendingRequests.value = sortedAll.filter(r => r.targetTeacherName && r.targetTeacherName.toLowerCase() === name && r.status === 'pending_teacher');
       // 教學組可核准；行政只讀全校待辦，不提供核准／駁回操作。
       const stOf = (r) => (window.FieldMap && window.FieldMap.normalizeRequestStatus)
         ? window.FieldMap.normalizeRequestStatus(r && r.status)
         : String((r && r.status) || '').toLowerCase();
        const schoolPendingRows = sortedAll.filter(r => {
          const s = stOf(r);
          return s === 'pending_teacher' || s === 'pending_admin';
        });
        adminPendingRequests.value = userRole.value === 'admin'
          ? collapseTriangleRows(schoolPendingRows.filter(r => stOf(r) === 'pending_admin'))
          : (userRole.value === 'staff' ? collapseTriangleRows(schoolPendingRows) : []);
      allPendingRequests.value = sortedAll.filter(r => {
        const s = stOf(r);
        return s === 'pending_teacher' || s === 'pending_admin';
      });
    } else {
      mySentRequests.value = [];
      myPendingRequests.value = [];
      adminPendingRequests.value = [];
      allPendingRequests.value = [];
    }
  }
  if (res.classAwayEvents) {
    classAwayEvents.value = res.classAwayEvents.map(e => window.FieldMap.mapClassAwayEvent(e));
  } else if (res.classAwayEvents === undefined) {
    // 舊快取可能沒此欄
  } else {
    classAwayEvents.value = [];
  }
  if (res.settings) applySettings(res.settings);
  if (res.requestWindow) {
    requestWindowInfo.value = res.requestWindow;
    if (res.requestWindow.historyAll) historyFullLoaded.value = true;
  }
  // 伺服器時間推進水位（即使本包無申請列）
  if (res.serverTime && stampIsNewer(res.serverTime, _getRequestsWatermark())) {
    _setRequestsWatermark(String(res.serverTime).trim());
  }
  clearScheduleCache();
};

const recomputeRequestBuckets = () => {
  if (!user.value) return;
  // 模擬身份：一律用目前 user.value.email（被模擬者），勿用 originalUser／JWT
  const email = effectiveUserEmail.value || String(user.value.email || '').toLowerCase().trim();
  const name = String(getTeacherNameByEmail(email) || '').toLowerCase().trim();
  const all = sortRequestListDesc(requestsList.value || []);
  requestsList.value = all;
  const stOf = (r) => (window.FieldMap && window.FieldMap.normalizeRequestStatus)
    ? window.FieldMap.normalizeRequestStatus(r && r.status)
    : String((r && r.status) || '').toLowerCase();
  mySentRequests.value = all.filter(r => isMySentRequest(r, email));
  myPendingRequests.value = all.filter(r =>
    r.targetTeacherName && String(r.targetTeacherName).toLowerCase() === name
    && stOf(r) === 'pending_teacher'
  );
  const schoolPendingRows = all.filter(r => {
    const s = stOf(r);
    return s === 'pending_teacher' || s === 'pending_admin';
  });
  adminPendingRequests.value = userRole.value === 'admin'
    ? collapseTriangleRows(schoolPendingRows.filter(r => stOf(r) === 'pending_admin'))
    : (userRole.value === 'staff' ? collapseTriangleRows(schoolPendingRows) : []);
  allPendingRequests.value = all.filter(r => {
    const s = stOf(r);
    return s === 'pending_teacher' || s === 'pending_admin';
  });

  // H5：已核准集合未變時略過 convert（pending 狀態變更最常見）
  const sig = approvedConvertSig(all);
  if (sig !== _approvedConvertSig) {
    substitutionRecords.value = convertRequestsToSubstitutions(all);
    _approvedConvertSig = sig;
    clearScheduleCache();
  }
};

const optimisticPatchRequestStatuses = (updates) => {
  const statusById = Object.create(null);
  (updates || []).forEach(update => {
    if (!update || update.id == null) return;
    statusById[String(update.id)] = update.status;
  });
  if (!Object.keys(statusById).length) return false;
  let found = false;
  let changed = false;
  const next = requestsList.value.map(r => {
    const key = r && r.id != null ? String(r.id) : '';
    if (!Object.prototype.hasOwnProperty.call(statusById, key)) return r;
    found = true;
    const status = statusById[key];
    if (r.status === status) return r;
    changed = true;
    return Object.assign({}, r, { status });
  });
  if (!found) return false;
  if (!changed) return true;
  requestsList.value = next;
  // 批次狀態一次寫入，避免每筆都觸發列表與課表重算。
  recomputeRequestBuckets();
  return true;
};

const optimisticPatchRequestStatus = (id, status) => {
  return optimisticPatchRequestStatuses([{ id, status }]);
};

const optimisticPatchTriangleGroup = (request, groupStatus, responseStatus) => {
  if (!request) return false;
  const triangleId = String(request.triangleId || request.batchId || '').trim();
  if (!triangleId) return optimisticPatchRequestStatus(request.id, groupStatus);
  const status = String(groupStatus || '').trim();
  const next = requestsList.value.map((row) => {
    if (!row || String(row.triangleId || row.batchId || '').trim() !== triangleId) return row;
    const patch = {};
    if (status) {
      patch.status = status;
      patch.triangleGroupStatus = status;
    }
    if (String(row.id) === String(request.id) && responseStatus) {
      patch.triangleConsentStatus = responseStatus;
      patch.triangleConsentAt = new Date().toISOString();
    }
    return Object.keys(patch).length ? Object.assign({}, row, patch) : row;
  });
  requestsList.value = next;
  recomputeRequestBuckets();
  return true;
};

const optimisticRemoveRequest = (id) => {
  requestsList.value = requestsList.value.filter(r => r.id !== id);
  recomputeRequestBuckets();
};

const markDataUpdated = () => {
  dataUpdatedAt.value = Date.now();
  _softRefreshLastAt = dataUpdatedAt.value;
};

const softRefreshInBackground = (opts) => {
  opts = opts || {};
  if (opts.skip) return;
  const force = !!opts.force;
  const requestsOnly = !!opts.requestsOnly;
  // local 預設：狀態類操作延後對齊
  const delay = opts.delay != null
    ? opts.delay
    : (force ? 450 : 2800);
  const nextForce = force || !!(_softRefreshQueued && _softRefreshQueued.force);
  const nextReqOnly = !nextForce && (requestsOnly || !!(_softRefreshQueued && _softRefreshQueued.requestsOnly));
  const nextDelay = _softRefreshQueued
    ? Math.min(_softRefreshQueued.delay != null ? _softRefreshQueued.delay : delay, delay)
    : delay;
  _softRefreshQueued = { force: nextForce, delay: nextDelay, requestsOnly: nextReqOnly };
  if (_softRefreshTimer) clearTimeout(_softRefreshTimer);
  const runDelay = _softRefreshQueued.delay;
  const runForce = _softRefreshQueued.force;
  const runReqOnly = _softRefreshQueued.requestsOnly;
  softSyncing.value = true;
  _softRefreshTimer = setTimeout(async () => {
    _softRefreshTimer = null;
    _softRefreshQueued = null;
    if (_softRefreshRunning) {
      _softRefreshQueued = { force: runForce, delay: 500, requestsOnly: runReqOnly };
      return;
    }
    const since = Date.now() - _softRefreshLastAt;
    if (!runForce && since < SOFT_REFRESH_MIN_GAP_MS && _softRefreshLastAt > 0) {
      softRefreshInBackground({
        force: false,
        requestsOnly: runReqOnly,
        delay: SOFT_REFRESH_MIN_GAP_MS - since + 200
      });
      return;
    }
    _softRefreshRunning = true;
    softSyncing.value = true;
    try {
      if (runForce) {
        await loadWeeklyData({ force: true, silent: true });
      } else if (runReqOnly) {
        // 核准後課表／狀態：增量有變更即夠；empty／false → 全窗 → 全量
        const d = await softSyncRequestsDelta();
        if (d !== true) {
          const okRo = await softSyncRequestsOnly();
          if (!okRo) await loadWeeklyData({ force: false, silent: true });
        }
      } else {
        // 預設：pending → 增量
        // - delta 有變更：完成
        // - pending 幽靈結案或 delta 失敗：全窗 → 全量
        // - 無幽靈且 empty：完成（省一次全窗）
        const p = await softSyncPendingOnly();
        const d = await softSyncRequestsDelta();
        if (d === true) {
          // ok
        } else if (p === false || p === 'ghost' || d === false) {
          const okR = await softSyncRequestsOnly();
          if (!okR) await loadWeeklyData({ force: false, silent: true });
        }
        // p===true && d==='empty'：無異動，結束
      }
      if (isAdmin.value && user.value) await loadHomeroomRecords({ silent: true });
      markDataUpdated();
    } catch (e) {
      console.warn('背景同步失敗：', e);
      showToast('背景同步失敗，可按 ↻ 手動重整', 'warning', 2800);
    } finally {
      _softRefreshRunning = false;
      if (_softRefreshQueued) {
        const q = _softRefreshQueued;
        _softRefreshQueued = null;
        softRefreshInBackground(q);
      } else {
        softSyncing.value = false;
      }
    }
  }, runDelay);
};

const resolveUserRoleFromTeachers = async () => {
  if (!user.value) return true;
  const email = user.value.email.toLowerCase();
  const currentTeacher = lookupTeacher(email);
  if (currentTeacher) {
    const raw = currentTeacher.role || 'teacher';
    userRole.value = (window.FieldMap && window.FieldMap.normalizeTeacherRole)
      ? window.FieldMap.normalizeTeacherRole(raw, currentTeacher.jobTitle)
      : ((window.FieldMap && window.FieldMap.normalizeRole) ? window.FieldMap.normalizeRole(raw) : raw);
    return true;
  }
  if (teachersList.value.length === 0) {
    if (userRole.value === 'admin') return true;
    logout();
    showToast('目前學期尚未建立教師名單，請由系統管理員先設定 SUPER_ADMIN_EMAILS 並完成初始化。', 'error');
    return false;
  }
  logout();
  showToast(`⚠️ 登入失敗：您的帳號 (${user.value.email}) 不在本校教師名單中，請聯繫教學組協助開通。`, 'error');
  return false;
};

const loadSemesters = async () => {
  const url = gasApiUrl.value;
  if (!url) {
    semestersList.value = [{ id: '114-1', name: '114學年度第1學期', startDate: '', endDate: '', isDefault: true }];
    return;
  }
  try {
    const res = await fetchMetaData({ semesterId: currentSemester.value });
    if (res.success && res.semesters) {
      semestersList.value = res.semesters.map(s => window.FieldMap.mapSemester(s));
      semestersList.value.sort((a, b) => a.id.localeCompare(b.id));
    }
    if (res.teachers) {
      teachersList.value = res.teachers.map(t => window.FieldMap.mapTeacher(t));
    }
    if (res.settings) applySettings(res.settings);
    if (res.userRole && ['admin', 'staff', 'teacher'].includes(String(res.userRole))) {
      userRole.value = String(res.userRole);
    }
    if (semestersList.value.length === 0) {
      semestersList.value = [{ id: '114-1', name: '114學年度第1學期', startDate: '', endDate: '', isDefault: true }];
    }
  } catch (e) {
    console.warn('載入學期失敗：', e);
    semestersList.value = [{ id: '114-1', name: '114學年度第1學期', startDate: '', endDate: '', isDefault: true }];
  }
};

const applyClassPayload = (res, className) => {
  if (!res) return;
  if (Array.isArray(res.classNames)) {
    classDirectory.value = res.classNames.map(c => String(c || '').trim()).filter(Boolean);
  }
  if (res.semesters) {
    semestersList.value = res.semesters.map(s => window.FieldMap.mapSemester(s));
    semestersList.value.sort((a, b) => a.id.localeCompare(b.id));
  }
  classViewSchedules.value = (res.schedules || []).map(s => window.FieldMap.mapSchedule(s));
  classViewSchoolSwaps.value = (res.schoolSwaps || []).map(s => window.FieldMap.mapSchoolSwap(s));
  classViewLoadedClass.value = String(className || res.className || '').trim();
  classViewSubstitutionRecords.value = mapPublicClassRequests(res.requests || [], classViewLoadedClass.value);
  classViewClassAwayEvents.value = (res.classAwayEvents || []).map(e => window.FieldMap.mapClassAwayEvent(e));
};

const preflightGoogleLogin = async (payload) => {
  try {
    const res = await fetchMetaData({ semesterId: currentSemester.value, force: true });
    if (!res || res.success === false || !['admin', 'staff', 'teacher'].includes(String(res.userRole || ''))) {
      throw new Error('您的帳號不在目前學期教師名單中，無法登入本系統。');
    }
    const resolvedSemester = String(res.semesterId || '').trim();
    if (resolvedSemester && resolvedSemester !== currentSemester.value) {
      currentSemester.value = resolvedSemester;
      localStorage.setItem('jcjh_semester', resolvedSemester);
    }
    if (res.teachers) teachersList.value = res.teachers.map(t => window.FieldMap.mapTeacher(t));
    if (res.settings) applySettings(res.settings);
    return res;
  } catch (err) {
    try { sessionStorage.removeItem('jcjh_google_id_token'); } catch (e) { /* ignore */ }
    user.value = null;
    loading.value = false;
    const raw = err && err.message ? String(err.message) : String(err || '登入驗證失敗');
    const message = /不在|名單|開通/.test(raw)
      ? '此 Google 帳號不在本校教師名單內，請聯繫教學組開通。'
      : '登入驗證失敗：' + raw;
    gsiButtonError.value = message;
    showToast(message, 'error', 6000);
    return null;
  }
};

const loadPublicClassData = async (className) => {
  const cls = String(className || pendingClassView.value || selectedClass.value || '').trim();
  if (!cls) return false;
  if (typeof cancelAll === 'function') cancelAll();
  const loadSeq = _nextDataLoadSeq();
  const requestedSemester = currentSemester.value;
  const isCurrentLoad = () => loadSeq === _getDataLoadSeq();
  const guestLoad = !user.value;
  loading.value = true;
  loadingMessage.value = '載入班級課表中...';
  if (guestLoad) classReadonlyMode.value = true;
  activeTab.value = 'class';
  selectedClass.value = cls;
  pendingClassView.value = cls;
  try {
    const res = await fetchPublicClassData({
      className: cls,
      semesterId: requestedSemester
     });
     if (!isCurrentLoad()) return false;
     applyClassPayload(res, cls);
     if (res.semesterId) {
       currentSemester.value = res.semesterId;
       localStorage.setItem('jcjh_semester', res.semesterId);
     }
     if (guestLoad) resolvePendingClassView();
     else pendingClassView.value = '';
     loading.value = false;
    return true;
  } catch (err) {
    console.error('公開班級課表載入失敗：', err);
    showToast('載入班級課表失敗：' + (err.message || err), 'error');
    loading.value = false;
    return false;
  }
};

const loadWeeklyData = async (opts) => {
  if (!user.value) return;
  if (typeof cancelAll === 'function') cancelAll();
  opts = opts || {};
  const silent = !!opts.silent;
  const force = !!opts.force;
  const loadSeq = _nextDataLoadSeq();
  const requestedSemester = currentSemester.value;
  const isCurrentLoad = () => loadSeq === _getDataLoadSeq() && requestedSemester === currentSemester.value;

  if (!silent) {
    loading.value = true;
    loadingMessage.value = '同步基本資料中...';
  }

  const url = gasApiUrl.value;
  if (!url) {
    if (!silent) loading.value = false;
    throw new Error('主要資料庫 GAS API 網址尚未設定！');
  }

  try {
    // 0) SWR 分鍵先畫舊畫面（structure 可較久；requests 較短）
    const stale = window.GasApi.readSWR(currentSemester.value, {
      meta: 180000,
      structure: 300000,
      requests: 120000
    });
    if (stale && isCurrentLoad()) {
      applyInitialPayload(stale);
      loadingMessage.value = '正在更新最新資料...';
    }

    // 全量回應已包含學期、教師、課表與申請，避免首載先打 meta 再打全量。
    if (!isCurrentLoad()) return false;
    loadingMessage.value = '同步課表與異動中...';
    const res = await fetchInitialData({
      semesterId: requestedSemester,
      force: force
    });
    if (!isCurrentLoad()) return false;
    applyInitialPayload(res);
    await resolveUserRoleFromTeachers();
    if (!isCurrentLoad() || !user.value) return false;
    recomputeRequestBuckets();
    resolvePendingClassView();
    if (isAdmin.value && user.value && !Array.isArray(res.homeroomRecords)) {
      await loadHomeroomRecords({ silent: true });
    }
    if (!isCurrentLoad()) return false;
    markDataUpdated();
    if (!silent) loading.value = false;
    return true;
  } catch (err) {
    if (!isCurrentLoad()) return false;
     console.error("載入課表系統資料失敗：", err);
    if (!silent) {
      showToast("載入資料失敗：" + err.message, 'error');
      loading.value = false;
    }
    throw err;
  }
};

const saveClientSettings = () => {
  showToast('連線設定已固定，無法於介面修改', 'info');
};

const saveSemester = async () => {
  const form = semesterForm.value;
  if (!form.id.trim()) { showToast('請輸入學期代號（如 114-2）', 'info'); return; }
  loading.value = true;
  try {
    const data = {
      "學期代號": form.id.trim(),
      "學期名稱": form.name || form.id.trim(),
      "開始日期": form.startDate,
      "結束日期": form.endDate,
      "是否預設": semesterModalMode.value === 'add' ? "FALSE" : undefined
    };
    
    if (semesterModalMode.value === 'add') {
      const teachersToCopy = teachersList.value.map(t => ({
        "學期代號": form.id.trim(),
         "教師Email": t.loginEmail || t.email,
         "教師姓名": t.name,
         "授課科目": t.subject,
         "系統角色": t.role,
         "基本鐘點": t.baseHours,
         "超鐘點節數": t.fixedOvertimeConfigured ? t.fixedOvertimeHours : '',
         "超鐘點節次": t.fixedOvertimeConfigured ? (t.fixedOvertimeSlotsText || t.fixedOvertimeSlots || '') : ''
       }));
      data.teachersToCopy = teachersToCopy;
    }

    await callGasApi('saveSemester', data);
    showToast('✅ 學期已儲存！', 'success');
    showSemesterModal.value = false;
    await loadSemesters();
    await loadWeeklyData();
  } catch (e) {
    console.error('儲存學期失敗', e);
    showToast('❌ 儲存學期失敗：' + e.message, 'error');
  } finally {
    loading.value = false;
  }
};

const deleteSemester = async (semId) => {
  if (semId === currentSemester.value) {
    showToast('⚠️ 無法刪除目前使用中的學期，請先切換到其他學期', 'warning');
    return;
  }
  if (!await showConfirm(`確定要刪除學期「${semId}」及其所有資料嗎？此操作不可復原！`)) return;
  loading.value = true;
  try {
    await callGasApi('deleteSemester', { semesterId: semId });
    showToast('✅ 學期已刪除', 'success');
    await loadSemesters();
  } catch (e) {
    console.error('刪除學期失敗', e);
    showToast('❌ 刪除學期失敗：' + e.message, 'error');
  } finally {
    loading.value = false;
  }
};

const setDefaultSemester = async (semId) => {
  loading.value = true;
  try {
    await callGasApi('setDefaultSemester', { semesterId: semId });
    showToast('✅ 已將「' + (semestersList.value.find(s => s.id === semId)?.name || semId) + '」設為預設學期', 'success');
    await loadSemesters();
  } catch (e) {
    console.error('設定預設學期失敗', e);
    showToast('❌ 設定失敗：' + e.message, 'error');
  } finally {
    loading.value = false;
  }
};

const manualRefreshData = async () => {
  if (!user.value || dataRefreshing.value) return;
  dataRefreshing.value = true;
  try {
    await loadWeeklyData({ force: true, silent: false });
    showToast('資料已重新整理', 'success', 2000);
  } catch (e) {
    showToast('重新整理失敗：' + (e && e.message ? e.message : e), 'error');
  } finally {
    dataRefreshing.value = false;
  }
};

const dataUpdatedLabel = computed(() => {
  if (!dataUpdatedAt.value) return '尚未同步';
  const d = new Date(dataUpdatedAt.value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return '更新於 ' + hh + ':' + mm;
});

const teachersByEmail = computed(() => {
  const map = Object.create(null);
  (teachersList.value || []).forEach(t => {
    if (!t) return;
    [t.teacherName || t.name, t.loginEmail].filter(Boolean).forEach(rawValue => {
      const raw = String(rawValue);
      map[raw] = t;
      const low = raw.toLowerCase();
      if (low !== raw) map[low] = t;
    });
  });
  return map;
});

    return {
      changeMatchMode: changeMatchMode,
      teacherTimetableHours: teacherTimetableHours,
      getTeacherTimetableHours: getTeacherTimetableHours,
      getRealTeacherName: getRealTeacherName,
      filteredDevTeachers: filteredDevTeachers,
      getTriangleGroupRequests: getTriangleGroupRequests,
      isMySentRequest: isMySentRequest,
      applyInitialPayload: applyInitialPayload,
      recomputeRequestBuckets: recomputeRequestBuckets,
      optimisticPatchRequestStatuses: optimisticPatchRequestStatuses,
      optimisticPatchRequestStatus: optimisticPatchRequestStatus,
      optimisticPatchTriangleGroup: optimisticPatchTriangleGroup,
      optimisticRemoveRequest: optimisticRemoveRequest,
      markDataUpdated: markDataUpdated,
      softRefreshInBackground: softRefreshInBackground,
      resolveUserRoleFromTeachers: resolveUserRoleFromTeachers,
      loadSemesters: loadSemesters,
      applyClassPayload: applyClassPayload,
      preflightGoogleLogin: preflightGoogleLogin,
      loadPublicClassData: loadPublicClassData,
      loadWeeklyData: loadWeeklyData,
      saveClientSettings: saveClientSettings,
      saveSemester: saveSemester,
      deleteSemester: deleteSemester,
      setDefaultSemester: setDefaultSemester,      manualRefreshData: manualRefreshData,
      dataUpdatedLabel: dataUpdatedLabel,
      teachersByEmail: teachersByEmail,

    };
  }
  return { create: create };
})();
