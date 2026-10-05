/**
 * app.js — Vue setup() 主閉包（2A 模組地圖）
 *
 * 全檔為單一 setup() 作用域：228+ ref／140+ computed 共用，跨區直接引用。
 * 拆分紀律：只搬「經測試證明無 ref 依賴」的純函式區塊；搬移需同步更新
 * tests/ 內對 app.js 的源碼切片斷言（grep appSource.indexOf）。
 *
 * 區段（搜尋 §N 定位）：
 * §1 系統狀態／登入／學期／GSI        §3 計算屬性（課表／待辦／歷史）
 * §4 提交申請／課表渲染／簽核          §5 輔助／載入／生命週期（loadWeeklyData／softRefresh）
 * §6 後台代理（needUiAdmin／額度／互代送出）
 *
 * 已抽出（勿搬回）：
 * ui-line-template.js ← LINE 模板 8 純函式（formatLineSlot／buildLineInviteText…）
 * ui-mutual.js        ← UiMutualPanelState／UiMutualSubmit（app.js 經 ensureUiMutual 懶載）
 * template-buffer.js  ← 範本抓取（匯出模組用，app.js 未直接引用）
 */
const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

/** 單行自動縮小字級：內容超過一行寬度時逐級縮小，直到下限；hover 靠 title 顯示全文 */
function fitSingleLineText(el) {
  if (!el || !el.isConnected) return;
  var max = parseFloat((el.dataset && el.dataset.autofitMax) || '13.5');
  var min = parseFloat((el.dataset && el.dataset.autofitMin) || '9');
  if (!(max > 0)) max = 13.5;
  if (!(min > 0)) min = 9;
  var size = max;
  el.style.fontSize = size + 'px';
  var guard = 0;
  while (el.scrollWidth > el.clientWidth + 1 && size > min && guard < 20) {
    size = Math.max(min, size - 0.5);
    el.style.fontSize = size + 'px';
    guard++;
  }
}

const app = createApp({
  setup() {
    // 2A 拆分：setup 執行期間 wrapper 不得建廠（依賴 TDZ）；就緒前回 fallback，就緒後自動重算
    const _setupReady = ref(false);

    // 清空舊有的系統設定快取避免衝突
    localStorage.removeItem('jcjh_google_client_id');
    localStorage.removeItem('jcjh_gas_url');
    localStorage.removeItem('jcjh_gas_mail_api');
    // ID Token 只保留在目前分頁，並清掉舊版 localStorage 憑證。
    try { localStorage.removeItem('jcjh_google_id_token'); } catch (eToken) { /* ignore */ }

    // 2A 抽離：純函式來自 UiListHelpers／UiLineTemplate（eager，index.html 保證先載入）。
    // 解構集中於 setup 頂部，避免 TDZ（以下所有呼叫皆在 setup 執行後發生）。
    const {
      requestTimestampText, firstRequestTimestamp, getRequestApplicationStamp,
      formatRequestApplicationDate, serialRoot, parseTimeMs, requestGroupKey, requestTimeMs,
      sortListRowsDesc, sortRequestListDesc, sortRequestsDesc,
      isTriangleRequest, collapseTriangleRows,
      getBatchGroupTeacherSummary, getBatchGroupStatusValues,
      getStatusText, isCollapsibleBatchRecord, makeBatchItemRow,
      buildBatchDisplayGroups, getBatchGroupSlotSummary,
      getBatchGroupStatusText, getBatchGroupStatusClass,
      requestRowStamp, stampIsNewer, serverRequestChangesLocal,
      extractNameFromFormatted
    } = window.UiListHelpers;
    const {
      formatLineSlot, cleanLineTeacherName, getLineExchangePartner,
      buildLineInviteText, shortTeacherName, getLineHandledSlot,
      buildAskFirstLineText, buildLineBatchInviteText,
      isCombinedReturnRequest, getRequestTypeTags, getRequestRiskTags,
      formatCourseDisplayText, _fmtSlot, formatLeaveClassSlot, formatQuickSlotCompact,
      getScheduleSpecialTags, hasScheduleSpecialTag, isTimetablePullout,
      isTimetableRestricted, getCellPlainStatus,
      formatTriangleSlot, buildTriangleLineText
    } = window.UiLineTemplate;

    // ════════════════════════════════════════
    // §1 系統狀態 / 登入 / 學期
    // ════════════════════════════════════════
    // 系統狀態
    const user = ref(null);
    const userRole = ref('teacher'); // 'admin' | 'staff' | 'teacher'
    const originalUser = ref(null); // 模擬前的原始管理員身分
    /** 行政代申請：代理對象 Email（請假老師）；空＝只處理自己 */
    const proxyTargetEmail = ref('');
    const PROXY_SUBMIT_EMAILS_LS_KEY = 'jcjh_proxy_submit_emails';
    /** 可代申請人員白名單（Email 小寫）；空＝全關。後端 settings 優先，localStorage 備援 */
    const proxySubmitEmails = ref((() => {
      try {
        const raw = localStorage.getItem('jcjh_proxy_submit_emails') || '';
        return raw.split(/[,，;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      } catch (e) { return []; }
    })());
    const proxySubmitEnabledBy = ref('');
    const proxySubmitEnabledAt = ref('');
    // 線上調代課總開關：設定缺少時維持既有線上模式。
    const onlineSubstitutionEnabled = ref(true);
    const showProxyTargetDropdown = ref(false);
    const proxyTargetQuery = ref('');
    const proxyGrantQuery = ref('');
    const avatarLoadFailed = ref(false);
    const avatarSrc = computed(() => {
      const src = user.value && user.value.photoURL ? String(user.value.photoURL).trim() : '';
      return (!src || avatarLoadFailed.value) ? fallbackAvatarDataUri : src;
    });
    const handleAvatarError = (event) => {
      avatarLoadFailed.value = true;
      if (event && event.target) {
        event.target.src = fallbackAvatarDataUri;
      }
    };
    watch(user, () => {
      avatarLoadFailed.value = false;
    });
    
    // GAS & GSI 設定
    const googleClientId = ref(atob('MTA4MTQ5MTA4NTI3OC12ZWZqY3BrdW0xM3Iydm0zbnVuZ3ZuNnZiMjU5bzJhdC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=='));
    const gasApiUrl = ref(atob('aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J3Q0UwZm5JVWlyd2x3QWQ2WXJoZFJDWnNBX0tYczMxQW16Y2RZY2EwU05DY0dTWVdnTGUxYXpFY3l4MlA3bmlkb01NZy9leGVj'));


    // 統一呼叫 GAS API（抽離至 gas-api.js）
    /** 靜默刷新 Google ID Token（A）；供 gas-api 請求前／背景換票 */
    let _gsiButtonRendered = false;
    let _gsiWaitTimer = null;
    let _gsiPopupHintTimer = null;
    let _gsiClickGen = 0;
    const gsiButtonReady = ref(true);
    const gsiButtonError = ref('');
    const gsiLoggingIn = ref(false);

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const isGoogleGsiReady = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.isGoogleGsiReady(...args) : undefined;
    };

    /** 等待 GSI 腳本（async defer 常比 Vue onMounted 晚到） */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const waitForGoogleGsi = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.waitForGoogleGsi(...args) : undefined;
    };

    /** GSI 固定橋接：initialize 只綁一次，實際邏輯永遠走最新 handler */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const gsiCredentialBridge = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.gsiCredentialBridge(...args) : undefined;
    };

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const isSecureHttpsOrigin = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.isSecureHttpsOrigin(...args) : undefined;
    };

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const isGsiInitialized = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.isGsiInitialized(...args) : undefined;
    };

    /** 清本站 GSI 狀態（renderButton 已不用；仍供 revoke／殘留清理） */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const suppressGsiAutoLogin = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.suppressGsiAutoLogin(...args) : undefined;
    };

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const ensureGsiInitialized = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.ensureGsiInitialized(...args) : undefined;
    };

    function renderGsiLoginButton() {
      gsiButtonReady.value = true;
      return true;
    }

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const setupGoogleSignInUi = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.setupGoogleSignInUi(...args) : undefined;
    };

    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const reloadGsiLoginButton = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.reloadGsiLoginButton(...args) : undefined;
    };

    /**
     * 只允許已在 Google Console 登記的 origin → 固定 redirect_uri。
     * 間歇「要求無效」常見原因：本機/正式站混用、尾斜線不一致、預覽網域未授權。
     */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const getOAuthRedirectUri = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.getOAuthRedirectUri(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const makeOAuthNonce = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.makeOAuthNonce(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const clearOAuthUrlResidue = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.clearOAuthUrlResidue(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const parseOAuthReturnParams = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.parseOAuthReturnParams(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const consumeOAuthRedirectToken = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.consumeOAuthRedirectToken(...args) : undefined;
    };

    /**
     * 單一 Google 風格按鈕 + OAuth 整頁導向。
     * 官方 renderButton 無法設 prompt=select_account；OAuth select_account 可強制選帳。
     */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const loginWithGoogle = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.loginWithGoogle(...args) : undefined;
    };

    // 從 Google 錯誤頁按「上一頁」回來時，解鎖登入鈕
    try {
      window.addEventListener('pageshow', function () {
        try { gsiLoggingIn.value = false; } catch (e) { /* ignore */ }
      });
    } catch (ePs) { /* ignore */ }

    /** 票過期：請再按登入鈕 */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const refreshGoogleIdToken = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.refreshGoogleIdToken(...args) : undefined;
    };

    const {
      callGasApi, fetchInitialData, fetchMetaData, fetchPublicClassData,
      fetchPendingOnly, fetchRequestsDelta, fetchHistoryMonth, fetchMatchCandidates,
      fetchMutualQuotaLedger, fetchQuotaSpendPreview,
      decodeJwt, isTokenExpired, isTokenExpiringSoon,
      formatError, clearSWR, cancelAll, parseAllowedHd, isEmailDomainAllowed, DEFAULT_ALLOWED_HD
    } = window.GasApi.createClient({
      getApiUrl: () => gasApiUrl.value,
      getSemesterId: () => currentSemester.value,
      refreshIdToken: () => refreshGoogleIdToken(),
      // B：過期只清 user，不 reload（gas-api 已移除 location.reload）
      onAuthExpired: () => {
        user.value = null;
        // 不呼叫 prompt()（One Tap 易無反應）；回登入頁後由 setupGoogleSignInUi 重畫按鈕
        try {
          if (!user.value) {
            gsiButtonReady.value = false;
            nextTick(() => setupGoogleSignInUi());
          }
        } catch (e) { /* ignore */ }
      },
      showToast
    });

    /** 長操作進度：寫入 loadingMessage（匯入／批次核准等） */
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const gasProgressHandler = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.gasProgressHandler(...args) : undefined;
    };
    const callGasApiWithProgress = (action, data, label) =>
      callGasApi(action, data, { onProgress: gasProgressHandler(label || action), longOp: true });
    // 網域白名單：預設 → 後端 settings.allowedHd 覆寫
    const allowedHdList = ref(DEFAULT_ALLOWED_HD.slice());
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const applySettings = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.applySettings(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const assertSchoolDomain = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.assertSchoolDomain(...args) : undefined;
    };

    
    // 手機板星期選擇狀態與偵測
    const selectedMobileDay = ref(1);
    const isMobile = ref(false);
    const showMatchModal = ref(false);

    const checkMobile = () => {
      isMobile.value = window.innerWidth <= 768;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const initMobileDay = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.initMobileDay(...args) : undefined;
    };
    const loading = ref(true);
    const loadingMessage = ref('初始化系統中...');
    // 分頁記憶：URL hash 優先（#records），localStorage 備援
    const TAB_LS_KEY = 'jcjh_active_tab';
    const ADMIN_SUBTAB_LS_KEY = 'jcjh_admin_sub_tab';
    const VALID_TABS = ['timetable', 'pending', 'records', 'class', 'admin'];
     const VALID_ADMIN_SUBTABS = ['billing', 'period8', 'teachers', 'classAway', 'schoolSwap', 'settings', 'schoolExport'];
    const readHashTab = () => {
      try {
        const h = String(window.location.hash || '').replace(/^#/, '').split('?')[0].trim().toLowerCase();
        // 相容 #admin/billing 這類寫法
        const base = h.split('/')[0];
        return VALID_TABS.includes(base) ? base : '';
      } catch (e) { return ''; }
    };
    const readHashAdminSub = () => {
      try {
        const h = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
        const parts = h.split('/');
        if (parts[0] === 'admin' && parts[1] && VALID_ADMIN_SUBTABS.includes(parts[1])) return parts[1];
        return '';
      } catch (e) { return ''; }
    };
    const readStoredTab = () => {
      try {
        const fromHash = readHashTab();
        if (fromHash) return fromHash;
        const t = String(localStorage.getItem(TAB_LS_KEY) || '').trim();
        return VALID_TABS.includes(t) ? t : 'timetable';
      } catch (e) { return 'timetable'; }
    };
    const readStoredAdminSubTab = () => {
      try {
        const fromHash = readHashAdminSub();
        if (fromHash) return fromHash;
        const t = String(localStorage.getItem(ADMIN_SUBTAB_LS_KEY) || '').trim();
        return VALID_ADMIN_SUBTABS.includes(t) ? t : 'billing';
      } catch (e) { return 'billing'; }
    };
    const activeTab = ref(readStoredTab());
    const adminSubTab = ref(readStoredAdminSubTab());
    let _navPersistReady = false;
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const persistNavPosition = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.persistNavPosition(...args) : undefined;
    };
    // 2A：已移至 ui-auth.js（經 getAuthApi 委派）
    const setActiveTab = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getAuthApi();
      return a ? a.setActiveTab(...args) : undefined;
    };
    watch(activeTab, () => { if (_navPersistReady) persistNavPosition(); });
    watch(adminSubTab, () => { if (_navPersistReady) persistNavPosition(); });

    // 學期設定
    const currentSemester = ref(localStorage.getItem('jcjh_semester') || '114-1');
    // 學期列表（動態從 GAS 讀取）
    const semestersList = ref([]);
    const availableSemesters = computed(() => semestersList.value.map(s => s.id));
    const currentSemesterName = computed(() => {
      const sem = semestersList.value.find(s => s.id === currentSemester.value);
      return sem ? sem.name : currentSemester.value;
    });
    const showSemesterModal = ref(false);
    const semesterModalMode = ref('add');
    const semesterForm = ref({ id: '', name: '', startDate: '', endDate: '' });

    // 課表看板資料
    const toLocalDateStr = (date) => window.DateUtils.toLocalDateStr(date);

    const selectedWeekDate = ref(toLocalDateStr(new Date())); 
    const searchQuery = ref('');
    // 管理員課表範圍：mine＝只看自己（預設）；all＝全校；其餘＝依科目篩選
    const selectedSubject = ref('mine');
    // 課表預設只呈現班級／科目，排課時可切換完整屬性。
    const timetableDisplayMode = ref('clean');
    // I：切到全校時輕提示（分頁＋搜尋）
    let _allSchoolTipOnce = false;
    watch(selectedSubject, (v) => {
      if (v === 'all' && !_allSchoolTipOnce) {
        _allSchoolTipOnce = true;
        showToast('全校課表已分頁；可用上方搜尋姓名快速定位', 'info', 2800);
      }
    });
    const teachersList = ref([]); // roster [{loginEmail, teacherName, subject, role, baseHours}]
    const allSchedules = ref([]); // name-keyed base schedule
    const schoolSwaps = ref([]); // 全校指定日期節次對調
    const substitutionRecords = ref([]);
    const homeroomRecords = ref([]);
    const homeroomAssignSelections = ref({});
    const homeroomRecordsLoading = ref(false);
    const isCourseAdjustmentOnlyRequest = (record) => {
      if (window.FieldMap && typeof window.FieldMap.isCourseAdjustmentOnly === 'function') {
        return window.FieldMap.isCourseAdjustmentOnly(record || {});
      }
      const raw = record && (record.courseAdjustmentOnly !== undefined
        ? record.courseAdjustmentOnly : record['僅課務調整']);
      const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
      return raw === true || raw === 1
        || normalized === 'true' || normalized === '1' || normalized === '是' || normalized === 'yes'
        || String(record && (record.reason || record['請假事由']) || '').trim() === '課務調整';
    };
    const isEmptySlotAssignmentRequest = (record) => {
      if (!record) return false;
      if (record.isEmptySlotAssign === true) return true;
      const reason = String(record.reason || record['請假事由'] || '').trim();
      const note = String(record.note || record['備註'] || '');
      return reason === '空堂排班' || note.indexOf('[空堂排班]') >= 0;
    };
    // R16：代導判定 7 件已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const isBillableHomeroomRecord = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.isBillableHomeroomRecord(...args) : undefined;
    };
    /**
     * 從「已組裝的 substitution 列 + 基礎課表」解析教師在該日該節的有效班科
     * 支援多段調代鏈：沿 original→actual 走到目前 email，班科取鏈上第一筆有值的 record／起點基礎課
     */
    // 2A：resolveCellFromBaseAndSubs 已移至 ui-timetable.js（經 getTimetableApi 委派，呼叫端零修改）
    const resolveCellFromBaseAndSubs = (...args) => {
      const a = getTimetableApi();
      return a ? a.resolveCellFromBaseAndSubs(...args) : null;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const approvedConvertSig = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.approvedConvertSig(...args) : undefined;
    };

    // 2A：合班判定已移至 ui-line-template.js（解構見 setup 頂部）

    // 2A：convertRequestsToSubstitutions 已移至 ui-timetable.js（經 getTimetableApi 委派，呼叫端零修改）
    const convertRequestsToSubstitutions = (...args) => {
      const a = getTimetableApi();
      return a ? a.convertRequestsToSubstitutions(...args) : [];
    };
    const requestsList = ref([]); // Approved substitutions keyed by teacher names.

    // 單/雙週課輔課輔助
    const semesterStartDate = computed(() => {
      const sem = semestersList.value.find(s => s.id === currentSemester.value);
      return sem ? sem.startDate : '';
    });
    const getWeekNumber = (dateStr) => {
      if (!dateStr || !semesterStartDate.value) return 0;
      const refDate = new Date(semesterStartDate.value.replace(/-/g, '/'));
      // 以學期 startDate 所在「週的週一」為第 1 週起點
      const refDay = refDate.getDay();
      const monDiff = refDay === 0 ? -6 : 1 - refDay;
      const refMonday = new Date(refDate);
      refMonday.setDate(refDate.getDate() + monDiff);
      const targetDate = new Date(dateStr.replace(/-/g, '/'));
      const diffDays = Math.floor((targetDate - refMonday) / (1000 * 60 * 60 * 24));
      return Math.floor(diffDays / 7) + 1;
    };

    const currentWeekNumber = computed(() => {
      if (!currentWeekDates.value.length) return '';
      const wn = getWeekNumber(currentWeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });

    const isSingleWeek = (dateStr) => {
      const wn = getWeekNumber(dateStr);
      return wn === 0 || wn % 2 === 1;
    };

    // 空堂事件（畢旅 keep／畢業 reduce）；取代舊「畢業日隱藏九年級」
    const classAwayEvents = ref([]);
    const semesterEndDate = computed(() => {
      const sem = semestersList.value.find(s => s.id === currentSemester.value);
      return sem ? (sem.endDate || '') : '';
    });
    /** 該班該日是否落在空堂事件（視覺淡化用；不再把格子當空堂刪除） */
    const isClassAwayOnDate = (className, dateStr, period) => {
      if (!className || !window.DomainClassAway) return false;
      const d = dateStr || getTodayString();
      const events = getClassAwayEventsForView();
      return window.DomainClassAway.isClassAwayOnDate(
        className, d, events, semesterEndDate.value, period
      );
    };
    const getClassAwayEventsForView = () => {
      const useClassViewEvents = classReadonlyMode.value
        || (activeTab.value === 'class' && userRole.value === 'teacher');
      return useClassViewEvents ? classViewClassAwayEvents.value : classAwayEvents.value;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const getClassAwayEventName = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTimetableApi();
      return a ? a.getClassAwayEventName(...args) : undefined;
    };
    // 空堂契約：畫面 is-away-class 淡化；邏輯 isClassAway（媒合／衝堂／模擬／匯出當空堂）
    // 已廢止 shouldHideClass（勿再回傳 false 的殭屍函式）
    const activeAwayBanner = computed(() => {
      if (!_setupReady.value) return null;
      const a = getTimetableApi();
      return a ? a.activeAwayBanner.value : null;
    });

    // 全校日期節次對調：獨立於固定週課表保存，僅影響指定實際日期。
    const showSchoolSwapModal = ref(false);
    const schoolSwapModalMode = ref('add');
    const schoolSwapSaving = ref(false);
    const schoolSwapForm = ref({
      id: '',
      name: '',
      dateA: '',
      periodA: 1,
      dateB: '',
      periodB: 1,
      enabled: true,
      note: ''
    });
    const schoolSwapRows = computed(() => {
      const rows = window.DomainSchoolSwap
        ? window.DomainSchoolSwap.normalizeRows(schoolSwaps.value)
        : [];
      return rows.slice().sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    });
    const schoolSwapWeekdayNumber = (dateStr) => {
      const parts = String(dateStr || '').split('-').map(x => parseInt(x, 10));
      if (parts.length !== 3 || parts.some(x => Number.isNaN(x))) return 0;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay();
      return day === 0 ? 7 : day;
    };
    const schoolSwapWeekdayText = (dateStr) => {
      const day = schoolSwapWeekdayNumber(dateStr);
      return day >= 1 && day <= 5 ? getWeekDayText(day) : '非上課日';
    };
    // 2A：已移至 ui-schoolswap.js（經 getSchoolSwapApi 委派）
    const openAddSchoolSwapModal = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSchoolSwapApi();
      return a ? a.openAddSchoolSwapModal(...args) : undefined;
    };
    // 2A：已移至 ui-schoolswap.js（經 getSchoolSwapApi 委派）
    const openEditSchoolSwapModal = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSchoolSwapApi();
      return a ? a.openEditSchoolSwapModal(...args) : undefined;
    };
    // 2A：已移至 ui-schoolswap.js（經 getSchoolSwapApi 委派）
    const saveSchoolSwap = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSchoolSwapApi();
      return a ? a.saveSchoolSwap(...args) : undefined;
    };
    // 2A：已移至 ui-schoolswap.js（經 getSchoolSwapApi 委派）
    const deleteSchoolSwap = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSchoolSwapApi();
      return a ? a.deleteSchoolSwap(...args) : undefined;
    };

    // 新手引導 UI（簡潔版：置中卡牌，無 spotlight，手機友善）
    // ── 新手 Spotlight 導覽（懶載入 onboarding-tour.js）──
    /** 導覽用虛擬「收到的邀請」（不寫入後端） */
    const tourDemoInvite = ref(null);
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const ensureOnboardingTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.ensureOnboardingTour(...args) : undefined;
    };

    /** 導覽用：找登入者本週第一格有課（非巡堂、非調出）；同一次導覽快取 */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const findDemoScheduleCell = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.findDemoScheduleCell(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const openMatchDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.openMatchDemoForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const closeMatchDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.closeMatchDemoForTour(...args) : undefined;
    };

    /** 導覽：切到節次調課模式，僅顯示可調課條件，不選取也不送出 */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const openExchangeModeDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.openExchangeModeDemoForTour(...args) : undefined;
    };

    /** 導覽：選第一位媒合老師並開啟「模擬」視窗（不送出） */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const openCompareDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.openCompareDemoForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const closeCompareDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.closeCompareDemoForTour(...args) : undefined;
    };

    /** 導覽：顯示送出後的紙本列印預覽（只用虛擬資料，不會送出申請） */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const openPaperPrintDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.openPaperPrintDemoForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const closePaperPrintDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.closePaperPrintDemoForTour(...args) : undefined;
    };

    /** 導覽：示範「送出成功」視窗與 LINE 範本（與正式 buildLineInviteText 同格式，不真的送出） */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const openLineDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.openLineDemoForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const closeLineDemoForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.closeLineDemoForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const clearTourDemoInvite = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.clearTourDemoInvite(...args) : undefined;
    };

    /** 導覽：把所有可捲動層歸零，並把 target 頂到 sticky 導覽列下方 */
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const scrollMainToTop = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.scrollMainToTop(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const showTourDemoInvite = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.showTourDemoInvite(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const tourDemoInviteRespond = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.tourDemoInviteRespond(...args) : undefined;
    };

    /** 導覽：切到課表並強制捲到最頂（週次列／批次鈕框選才準） */
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const goTimetableForTour = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.goTimetableForTour(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const tourCallbacks = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.tourCallbacks(...args) : undefined;
    };

    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const startOnboarding = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.startOnboarding(...args) : undefined;
    };
    const nextOnboardingStep = () => {};
    const prevOnboardingStep = () => {};
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const skipOnboarding = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.skipOnboarding(...args) : undefined;
    };
    // 舊模板殘留用不到；保留 ref 避免 return 解構報錯
    const showOnboarding = ref(false);
    const onboardingStep = ref(0);
    const onboardingSteps = [];
    
    // 申請單紀錄
    const mySentRequests = ref([]);
    const myPendingRequests = ref([]);
    const adminPendingRequests = ref([]);
    const allPendingRequests = ref([]);

    // 智慧媒合與調課
    const matchMode = ref('substitution'); // 'substitution'、'exchange' 或 'triangle'
    const activeCell = ref({ teacherEmail: '', teacherName: '', dayOfWeek: 1, period: 1, classData: null });
    // matchPreview 保留給舊接線／模擬；列表點選改走 plain DOM（見 selectMatchPreview*）
    const matchPreview = ref(null);
    const inputRequestDate = ref('');
    const recommendedTeachers = ref([]);
    const recommendationLoading = ref(false);
    const trianglePickB = ref('');
    const trianglePickC = ref('');
    const triangleReason = ref('');
    const triangleNote = ref('');
    const triangleSubmitting = ref(false);
    // 批次調代課（方案 A：多筆申請＋同一 batchId；可同一人全代或每節不同人）
    const batchSelectMode = ref(false);
    const batchFlowMode = ref('substitution'); // 'substitution' | 'exchange'
    const batchSlots = ref([]); // [{ key, teacherEmail, teacherName, dateStr, dayOfWeek, period, className, subject, restriction, subTeacherEmail?, subTeacherName? }]
    const showBatchConfirmModal = ref(false);
    const batchSubTeacher = ref('');
    const batchReason = ref('');
    const batchSubFee = ref('自費代課');
    const batchNote = ref('');
    const batchAssignMode = ref('same'); // 'same' | 'perSlot'
    const batchActiveSlotKey = ref(''); // 每節不同人：目前正在媒合的節次 key
    // 活動互代（僅管理員）：額度>0→扣額度；＝0→活動公費；第8節→第8節代課
    const isMutualCover = ref(false);
    // 常數與純邏輯見 domain-activity-cover.js
    // MUTUAL_COVER_FEE 與 QUOTA_DEDUCT_FEE 同值「扣額度」（活動／一般統一）
    // 2C：優先吃 eager 的 FeeUtils，免等懶載 DomainActivityCover（值相同，行為不變）
    const QUOTA_DEDUCT_FEE = (window.FeeUtils && window.FeeUtils.QUOTA)
      || (window.DomainActivityCover && window.DomainActivityCover.QUOTA_DEDUCT_FEE) || '扣額度';
    const MUTUAL_COVER_FEE = (window.FeeUtils && window.FeeUtils.QUOTA)
      || (window.DomainActivityCover && window.DomainActivityCover.MUTUAL_COVER_FEE) || QUOTA_DEDUCT_FEE;
    const ACTIVITY_PUBLIC_FEE = (window.DomainActivityCover && window.DomainActivityCover.ACTIVITY_PUBLIC_FEE) || '活動公費';
    const isQuotaDeductFee = (fee) => {
      if (DAC() && DAC().isQuotaDeductFee) return DAC().isQuotaDeductFee(fee);
      return String(fee || '') === QUOTA_DEDUCT_FEE || String(fee || '') === '互代不結';
    };
    const PERIOD8_FEE = (window.DomainActivityCover && window.DomainActivityCover.PERIOD8_FEE) || '第8節代課';
    const TIMETABLE_ONLY_FEE = (window.FeeUtils && window.FeeUtils.TIMETABLE_ONLY) || '僅課表呈現（不結算）';
    const isTimetableOnlyFee = (fee) => {
      if (window.FeeUtils && window.FeeUtils.isTimetableOnlyFee) {
        return window.FeeUtils.isTimetableOnlyFee(fee);
      }
      const value = String(fee || '').trim();
      return value === TIMETABLE_ONLY_FEE || value === '僅課表呈現';
    };
    const MUTUAL_PANEL_LS_KEY = 'jcjh_mutual_panel_draft_v1';
    const mutualAwayClasses = ref([]);
    // 帶隊／請假外出教師（重算額度時排除，不寫入折抵額度）
    const mutualLeadEmails = ref([]);
    // 活動互代：先寫單不寄信（稍後用 LINE 手動通知）
    const mutualSkipNotify = ref(true);
    // 一般代課：直接核准送出時可選不寄通知信（預設會寄；待審核准一律寄）
    const directApproveSkipNotify = ref(false);
    // 活動統一備註（寫入每筆申請「備註」）
    const mutualNote = ref('');
    // 活動互代草稿：課表上先暫定代課，全部排完再一次送出
    // [{ key, leaveEmail, leaveName, dateStr, dayOfWeek, period, className, subject, restriction, subEmail, subName, fee }]
    const mutualDrafts = ref([]);
    // 活動期間（預設本週一～五，避免釋出節數算到整份課表）
    const mutualActivityStart = ref('');
    const mutualActivityEnd = ref('');
    const mutualActivityStartPeriod = ref('0');
    const mutualActivityEndPeriod = ref('8');
    const mutualActivityPeriodMode = ref('range');
    const mutualActivityPeriods = ref(['all']);
    const DAC = () => window.DomainActivityCover;
    const isMutualActivitySlotInRange = (dateStr, period) => {
      const date = String(dateStr || '').slice(0, 10);
      const startDate = String(mutualActivityStart.value || '').slice(0, 10);
      const endDate = String(mutualActivityEnd.value || mutualActivityStart.value || '').slice(0, 10);
      if (startDate && date && date < startDate) return false;
      if (endDate && date && date > endDate) return false;
      const dca = window.DomainClassAway;
      if (!dca || typeof dca.eventAppliesToPeriod !== 'function') return true;
      const useRange = mutualActivityPeriodMode.value !== 'daily';
      return dca.eventAppliesToPeriod({
        startDate: startDate,
        endDate: endDate,
        startPeriod: useRange ? String(mutualActivityStartPeriod.value || '0') : '',
        endPeriod: useRange ? String(mutualActivityEndPeriod.value || '8') : '',
        periods: mutualActivityPeriods.value || ['all'],
        period: mutualActivityPeriods.value || ['all']
      }, period, date, endDate || startDate);
    };
    // R17：已移至 ui-mutual.js（經 getMutualPanelApi 委派）
    const setMutualActivityPeriodBoundary = (field, value) => { const a = getMutualPanelApi(); if (a) a.setMutualActivityPeriodBoundary(field, value); };
    /** 活動互代領域：首次用到再載 domain-activity-cover.js */
    const ensureDAC = async () => {
      if (window.DomainActivityCover) return window.DomainActivityCover;
      if (typeof window.ensureDomainActivityCover === 'function') {
        await window.ensureDomainActivityCover();
      }
      return window.DomainActivityCover || null;
    };
    // ── 活動互代面板狀態（ui-mutual.js → UiMutualPanelState，懶載）──
    // 延後 create：需 currentWeekDates / getScheduleForDate / softRefresh 就緒
    let _mutualPanelApi = null;
    /** 延後取空堂事件 ID（UiMutualBridge 較晚 create） */
    let _getMutualImportEventId = () => '';
    const getMutualPanelApi = () => {
      if (_mutualPanelApi) return _mutualPanelApi;
      if (!window.UiMutualPanelState) {
        // 2B 懶載：互代模組尚未載入時觸發背景載入，下次互動即就緒
        if (typeof window.ensureUiMutual === 'function') {
          window.ensureUiMutual().catch(function () {});
        } else {
          console.error('UiMutualPanelState 未載入');
        }
        return null;
      }
      // 同步路徑：若尚未載入 DAC，先觸發背景載入（常數有 fallback）
      if (!window.DomainActivityCover && typeof window.ensureDomainActivityCover === 'function') {
        window.ensureDomainActivityCover().catch(function () {});
      }
      _mutualPanelApi = window.UiMutualPanelState.create({
        showToast, showConfirm, callGasApi, isAdmin, loading, loadingMessage,
        isMutualCover, mutualAwayClasses, mutualLeadEmails, mutualSkipNotify, mutualNote, mutualDrafts,
        mutualActivityStart, mutualActivityEnd, mutualActivityStartPeriod, mutualActivityEndPeriod,
        mutualActivityPeriodMode, mutualActivityPeriods,
        currentWeekDates, classList, teachersList, allSchedules, requestsList,
        activeCell, inputRequestDate, recommendedTeachers, showMatchModal, pendingRequestData, batchSubFee, directApproveMode,
        ACTIVITY_PUBLIC_FEE, PERIOD8_FEE, getTeacherNameByEmail, softRefreshInBackground, defaultSubFeeForReason, getScheduleForDate,
        classAwayEvents,
        getMutualImportEventId: function () { return _getMutualImportEventId(); },
        DAC
      });
      return _mutualPanelApi;
    };
    const persistMutualPanelDraft = () => { const a = getMutualPanelApi(); if (a) a.persistMutualPanelDraft(); };
    const restoreMutualPanelDraft = () => { const a = getMutualPanelApi(); return a ? a.restoreMutualPanelDraft() : null; };
    const applyMutualPanelDraft = (saved) => { const a = getMutualPanelApi(); if (a) a.applyMutualPanelDraft(saved); };
    const clearMutualPanel = async () => { const a = getMutualPanelApi(); if (a) await a.clearMutualPanel(); };
    const ensureMutualActivityRange = () => { const a = getMutualPanelApi(); if (a) a.ensureMutualActivityRange(); };
    const setMutualActivityThisWeek = () => { const a = getMutualPanelApi(); if (a) a.setMutualActivityThisWeek(); };
    const setMutualActivityPeriodMode = (mode) => { const a = getMutualPanelApi(); if (a) a.setMutualActivityPeriodMode(mode); };
    const toggleMutualActivityPeriod = (period) => { const a = getMutualPanelApi(); if (a) a.toggleMutualActivityPeriod(period); };
    const isMutualActivityPeriodSelected = (period) => { const a = getMutualPanelApi(); return a ? a.isMutualActivityPeriodSelected(period) : false; };
    const activityBalanceCtx = (extra) => { const a = getMutualPanelApi(); return a ? a.activityBalanceCtx(extra) : {}; };
    const patchLocalMutualQuota = (email, nextQuota) => { const a = getMutualPanelApi(); if (a) a.patchLocalMutualQuota(email, nextQuota); };
    const recalculateMutualQuotasFromActivity = async () => {
      await ensureDAC();
      const a = getMutualPanelApi();
      if (a) await a.recalculateMutualQuotasFromActivity();
    };
    const toggleMutualLead = (email) => { const a = getMutualPanelApi(); if (a) a.toggleMutualLead(email); };
    const isMutualLead = (email) => { const a = getMutualPanelApi(); return a ? a.isMutualLead(email) : false; };

    /** 點帶隊老師：未選→加入；已選→取消（跳課表請用下方「各帶隊老師課務」） */
    const onMutualLeadChipClick = (email) => {
      const em = String(email || '').trim();
      if (!em) return;
      const wasLead = isMutualLead(em);
      toggleMutualLead(em);
      const t = lookupTeacher(em);
      const name = t ? t.name : em;
      if (wasLead) showToast(`已取消帶隊：${name}`, 'info');
      else showToast(`已加入帶隊：${name}`, 'info');
    };
    /**
     * 定位到指定教師課表（搜尋姓名並捲動）
     * opts.date / opts.useActivityWeek：一併切到該日期所在週（活動互代用起日）
     */
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const jumpToTeacherTimetable = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.jumpToTeacherTimetable(...args) : undefined;
    };
    /**
     * 送出後樂觀扣減畫面餘額（真正扣包／流水由 GAS 送出或核准時冪等完成）
     */
    const bustQuotaLedgerViewCache = () => {
      try {
        if (typeof window !== 'undefined' && typeof window.__quotaLedgerCacheBust === 'function') {
          window.__quotaLedgerCacheBust();
        }
      } catch (e) { /* ignore */ }
    };
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const deductMutualQuotaForRows = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.deductMutualQuotaForRows(...args) : undefined;
    };
    /**
     * 申請作廢時樂觀還原折抵額度（後端已寫回試算表；此處只更新畫面）
     * 請傳入「改狀態前」的申請單；已作廢狀態不重複加回
     * @param {object|object[]} reqs 前端申請單或 sheet 列
     */
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const restoreMutualQuotaForRows = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.restoreMutualQuotaForRows(...args) : undefined;
    };
    const selectedClass = ref('');
    const classReadonlyMode = ref(false);
    const pendingClassView = ref('');
    const classDirectory = ref([]);
    const classViewSchedules = ref([]);
    const classViewSchoolSwaps = ref([]);
    const classViewSubstitutionRecords = ref([]);
    const classViewClassAwayEvents = ref([]);
    const classViewLoadedClass = ref('');
    const selectedClassDate = ref(toLocalDateStr(new Date()));
    const period8WeekDate = ref(toLocalDateStr(new Date()));
    const selectedClassWeekDates = computed(() => {
      if (!_setupReady.value) return [];
      const a = getScheduleApi();
      return a ? a.selectedClassWeekDates.value : [];
    });
    const period8WeekDates = computed(() => {
      if (!_setupReady.value) return [];
      const a = getScheduleApi();
      return a ? a.period8WeekDates.value : [];
    });
    const classWeekNumber = computed(() => {
      if (!selectedClassWeekDates.value.length) return '';
      const wn = getWeekNumber(selectedClassWeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });
    const period8WeekNumber = computed(() => {
      if (!period8WeekDates.value.length) return '';
      const wn = getWeekNumber(period8WeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });

    const classSubstitutionMap = computed(() => {
      if (!_setupReady.value) return {};
      const a = getScheduleApi();
      return a ? a.classSubstitutionMap.value : {};
    });

    // 2A：已移至 ui-schoolswap.js（經 getSchoolSwapApi 委派）
    const buildClassSchoolSwapChanges = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSchoolSwapApi();
      return a ? a.buildClassSchoolSwapChanges(...args) : undefined;
    };
    // 2A：已移至 ui-tour.js（經 getTourApi 委派）
    const shouldAutoStartOnboarding = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTourApi();
      return a ? a.shouldAutoStartOnboarding(...args) : undefined;
    };

    // 該班異動摘要：每節一列；調課雙向各一列
    // 格式：月/日（星期）第○節 改上 ○○課（○○師）
    // 2A：已移至 ui-classview.js（經 getClassViewApi 委派）
    const classChangeSummary = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getClassViewApi();
      return a ? a.classChangeSummary.value : [];
    });
    const classChangeTypeLabels = Object.freeze({
      '全校對調': '全校',
      '併班上課': '併班',
      '合班回原班': '併班',
      '課務調整': '調課',
      '互代不結': '互代',
      '空堂任務': '空堂'
    });
    const getClassChangeTypeLabel = (type) => {
      const value = String(type || '').trim();
      return classChangeTypeLabels[value] || value;
    };
    const matchSearchQuery = ref('');
    const matchDisplayCount = ref(10);
    const matchShowNoTeacherWarning = ref(false);
    /** 媒合 0 人時的可能原因（字串陣列） */
    const matchEmptyReasons = ref(null);

    // 調課推薦
    const exchangeTeacherEmail = ref('');
    const exchangeTeacherClasses = ref([]);
    const exchangePeriodId = ref('');
    const exchangeTargetDate = ref('');
    const exchangeWeekOffset = ref(0);
    const exchangeWeekdayFilter = ref(0); // 0＝全部；1～5＝週一至週五
    const exchangeWeekdayOptions = [
      { value: 0, label: '全部' },
      { value: 1, label: '週一' },
      { value: 2, label: '週二' },
      { value: 3, label: '週三' },
      { value: 4, label: '週四' },
      { value: 5, label: '週五' }
    ];
    const setExchangeWeekdayFilter = (day) => {
      const value = parseInt(day, 10);
      exchangeWeekdayFilter.value = value >= 1 && value <= 5 ? value : 0;
      matchDisplayCount.value = 10;
    };


    // 雙人對比 Modal 與列印
    const showCompareModal = ref(false);
    const showTriangleTimetablePreview = ref(false);
    const showSuccessModal = ref(false);
    const showLineMessageModal = ref(false);
    const lineMessageTitle = ref('LINE 訊息');
    const lineMessageText = ref('');
    const successModalTitle = ref('');
    const successModalMessage = ref('');
    /** 成功畫面固定步驟：normal 三步／direct 兩步／tour 導覽 */
    const successFlowMode = ref('normal');
    const successActionRequests = ref([]);
    const lineCopyText = ref('');
    const hasLineTemplate = ref(false);
    // 多受邀人：[{ name, text }] 方便分開複製／傳送
    const lineBatchParts = ref([]);

    const copyLineMessage = async (text) => {
      const payload = (text != null && String(text).length) ? String(text) : lineCopyText.value;
      try {
        await navigator.clipboard.writeText(payload);
        showToast("📋 LINE 邀請訊息已複製至剪貼簿！可以直接貼給對方老師囉～", 'success');
      } catch (err) {
        console.error("複製失敗：", err);
        showToast("複製失敗，請手動複製文字框內的內容。", 'error');
      }
    };

    const sendLineMessage = (text) => {
      const payload = (text != null && String(text).length) ? String(text) : lineCopyText.value;
      if (!payload) return;
      try {
        navigator.clipboard.writeText(payload);
      } catch (e) {}
      const url = `https://line.me/R/msg/text/?${encodeURIComponent(payload)}`;
      window.open(url, '_blank');
    };

    const openLineMessageEditor = (text, title = 'LINE 訊息') => {
      // LINE 編輯器取代目前的內容視窗，避免兩個 modal 疊在一起。
      showDetailModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
      lineMessageTitle.value = title;
      lineMessageText.value = String(text || '');
      showLineMessageModal.value = true;
    };
    const copyEditedLineMessage = () => copyLineMessage(lineMessageText.value);
    const sendEditedLineMessage = () => sendLineMessage(lineMessageText.value);

    const copyLineBatchPart = (idx) => {
      const part = lineBatchParts.value[idx];
      if (part && part.text) copyLineMessage(part.text);
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const sendLineBatchPart = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.sendLineBatchPart(...args) : undefined;
    };

    /**
     * 行事曆內容：依登入者角色
     * - 請假／調出方：標【不用上】＋原課節次
     * - 代課／調入方：標【代課】／【調入】＋實際要上的節次
     * 按鈕文案固定「行事曆」
     */
    // 2A：getCalendarDetails 已移至 ui-calendar.js（getCalendarApi 委派見下方）;

    // 2A：行事曆改走 getCalendarApi 懶載（getTriangleGroupRequests 在後方定義，首次取用時再 create）
    let _calendarApi = null;
    const getCalendarApi = () => {
      if (_calendarApi) return _calendarApi;
      if (!window.UiCalendar) {
        console.error('UiCalendar 未載入');
        return null;
      }
      _calendarApi = window.UiCalendar.create({
        user, substitutionRecords, getTeacherNameByEmail,
        isExchangeLikeRequest, isTriangleRequest, getTriangleGroupRequests,
        getTargetClassAndSubject, isCombinedReturnRequest, formatPeriodText
      });
      return _calendarApi;
    };
    const getCalendarDetails = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getCalendarApi();
      return a ? a.getCalendarDetails(...args) : null;
    };
    const addToGoogleCalendar = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getCalendarApi();
      return a ? a.addToGoogleCalendar(...args) : undefined;
    };
    const downloadIcsCalendar = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getCalendarApi();
      return a ? a.downloadIcsCalendar(...args) : undefined;
    };
    const addEventToCalendar = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getCalendarApi();
      return a ? a.addEventToCalendar(...args) : undefined;
    };
    // 2A：交換目標鏈已移至 ui-timetable.js（經 getTimetableApi 委派，呼叫端零修改）
    const timetableApiOrNull = () => getTimetableApi();
    const isExchangeLikeRequest = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.isExchangeLikeRequest(...args) : false;
    };
    const getTargetSubject = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getTargetSubject(...args) : '';
    };
    const getTargetClassAndSubject = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getTargetClassAndSubject(...args) : { className: '', subject: '' };
    };
    const getOriginalRequestSubject = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getOriginalRequestSubject(...args) : '';
    };
    const getOriginalRequestClass = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getOriginalRequestClass(...args) : '';
    };
    const getOriginalTargetSubject = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getOriginalTargetSubject(...args) : '';
    };
    const getOriginalTargetClass = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.getOriginalTargetClass(...args) : '';
    };


    // 2A：已移至 ui-classview.js（經 getClassViewApi 委派）
    const resolveDetailRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getClassViewApi();
      return a ? a.resolveDetailRequest(...args) : null;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const printSingleRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.printSingleRequest(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const showDetailForRecord = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.showDetailForRecord(...args) : undefined;
    };

    // LINE 範本：短版、先說明需求，再列課務與回覆方式。
    // 2A：LINE 邀請／詢問模板已移至 ui-line-template.js（解構見 setup 頂部）

    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const copyLineMessageForRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTimetableApi();
      return a ? a.copyLineMessageForRequest(...args) : undefined;
    };
    const pendingRequestData = ref({
      mode: '', leaveTeacher: '', subTeacher: '', cls: '', subject: '', date: '', timeKey: '',
      reason: '', leaveReasonBeforeCourseAdjustment: '', courseAdjustmentOnly: false,
      subFee: '', dateB: '', timeB: '', subB: '', note: '',
      leaveTimeType: '', leaveTimeStart: '', leaveTimeEnd: '', leaveTime: '',
      submitRequestId: '', submitSerial: '', submitBatchId: ''
    });
    const combinedReturnCandidates = ref([]);
    // 送出前「先問對方」LINE 範本：依當前申請資料即時更新（批次暫不提供）
    const askFirstLineText = computed(() => {
      if (!_setupReady.value) return '';;
      const a = getSubmitApi();
      return a ? a.askFirstLineText.value : '';
    });
    const askFirstLineDraft = ref('');
    watch(askFirstLineText, (text) => {
      if (!showLineMessageModal.value) askFirstLineDraft.value = text || '';
    }, { immediate: true });
    const selectedRecordIds = ref([]);
    const showDevDropdown = ref(false);
    const paperPrintDraft = ref(null);
    const paperSignatureByTeacher = ref({});
    const showPrintPreviewModal = ref(false);
    const printPreview = ref(null);
    const printPreviewImageBusy = ref(false);
    // 防連點：送出申請期間鎖住按鈕（含 validate／confirm 等待）
    const isSubmitting = ref(false);

    // 異動詳情對話框 (已經生效或簽核中的調代課格子)
    const showDetailModal = ref(false);
    const consecAlertsA = ref([]);
    const consecAlertsB = ref([]);
    const detailRequest = ref(null);
    const detailSubRecord = ref(null);

    // 內容型 modal 只保留一個，避免詳情、LINE、列印視窗互相遮住。
    watch(showDetailModal, (open) => {
      if (!open) return;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
    });
    watch(showLineMessageModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
      showSuccessModal.value = false;
    });
    watch(showPrintPreviewModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showCompareModal.value = false;
      showTriangleTimetablePreview.value = false;
      showSuccessModal.value = false;
    });
    watch(showTriangleTimetablePreview, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showSuccessModal.value = false;
    });
    watch(showSuccessModal, (open) => {
      if (!open) return;
      showDetailModal.value = false;
      showLineMessageModal.value = false;
      showPrintPreviewModal.value = false;
      showCompareModal.value = false;
    });

    // 歷史紀錄篩選與分頁（預設顯示全部，避免新送出的申請被日期篩選排除）
    const historyFilterMode = ref('all');
    const historyTypeFilter = ref('all');
    const historyFilterDate = ref(new Date().toISOString().split('T')[0]);
    const historySearchQuery = ref('');
    const historyPage = ref(1);

    const isHistoryExchangeType = (record) => {
      const type = String(record && record.type || '').trim().toLowerCase();
      return type === 'exchange' || type === '對調' || type === '調課' || type === 'triangle' || type === '三角調';
    };
    const historyPageSize = ref(20);

    // ── 申請時間窗／歷史按月／待辦輕量對齊 ──
    const requestWindowInfo = ref(null);
    const historyFullLoaded = ref(false);
    const historyLoadingFull = ref(false);
    const historyLoadedMonths = ref([]); // 已合併的 YYYY-MM
    const historyMonthLoading = ref(false);

    /** 合併伺服器回傳的申請列（不丟既有、同 id 以伺服器為準） */
    // 申請水位線：增量 softRefresh 用（更新時間優先，其次建立時間）
    let _requestsWatermark = '';
    // 2A：同步水位印記已移至 ui-list-helpers.js（bump／age 吃 state 留守；解構見 setup 頂部）
    const bumpRequestsWatermarkFromRows = (rows) => {
      let max = _requestsWatermark;
      (rows || []).forEach(r => {
        const s = requestRowStamp(r);
        if (stampIsNewer(s, max)) max = s;
      });
      if (stampIsNewer(max, _requestsWatermark)) _requestsWatermark = max;
      return _requestsWatermark;
    };
    const watermarkAgeMs = () => {
      const s = String(_requestsWatermark || '').trim();
      if (!s) return Infinity;
      const t = s.replace('T', ' ');
      const norm = t.includes('/') ? t : t.replace(/-/g, '/');
      const ms = Date.parse(norm);
      if (!Number.isFinite(ms)) return Infinity;
      return Date.now() - ms;
    };

    // 2A：serverRequestChangesLocal 已移至 ui-list-helpers.js（解構見 setup 頂部）

    // 2A：已移至 ui-sync.js（經 getSyncApi 委派）
    const mergeRequestsFromServer = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSyncApi();
      return a ? a.mergeRequestsFromServer(...args) : undefined;
    };

    /**
     * 輕量：只同步進行中申請（同意／核准後背景用）
     * 回傳：true | 'ghost'（有本地 pending 被暫標 cancelled）| false
     */
    // 2A：已移至 ui-sync.js（經 getSyncApi 委派）
    const softSyncPendingOnly = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSyncApi();
      return a ? a.softSyncPendingOnly(...args) : undefined;
    };

    /**
     * 增量：只合併 updatedSince 之後變更的申請列
     * 回傳：true=有變更合併、'empty'=成功但 0 筆、false=失敗／跳過
     * 水位線過舊（>48h）或無水位 → false，改走全窗
     */
    // 2A：已移至 ui-sync.js（經 getSyncApi 委派）
    const softSyncRequestsDelta = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSyncApi();
      return a ? a.softSyncRequestsDelta(...args) : undefined;
    };

    /** 中量：只同步申請窗＋空堂（不含課表；核准後課表異動對齊） */
    // 2A：已移至 ui-sync.js（經 getSyncApi 委派）
    const softSyncRequestsOnly = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSyncApi();
      return a ? a.softSyncRequestsOnly(...args) : undefined;
    };

    /** G：本地標記已列印（不整包重抓） */
    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const markLocalPrinted = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.markLocalPrinted(...args) : undefined;
    };

    /**
     * 載入指定月歷史
     * opts.silent：不開全螢幕 loading、不 toast 成功（自動觸發用）
     * opts.force：已載入過仍重抓
     */
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const loadHistoryMonth = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.loadHistoryMonth(...args) : undefined;
    };

    /** 點「本月」或改日期：自動補抓該月（未載入過才打 API） */
    const ensureHistoryMonthLoaded = (ym) => {
      const m = String(ym || historyFilterDate.value || toLocalDateStr(new Date())).slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      if (historyFullLoaded.value || historyLoadedMonths.value.indexOf(m) >= 0) return;
      if (historyMonthLoading.value) return;
      loadHistoryMonth(m, { silent: true });
    };

    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const setHistoryFilterMode = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.setHistoryFilterMode(...args) : undefined;
    };

    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const setHistoryTypeFilter = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.setHistoryTypeFilter(...args) : undefined;
    };

    watch(historyFilterDate, (d) => {
      if (historyFilterMode.value !== 'month') return;
      ensureHistoryMonthLoaded(String(d || '').slice(0, 7));
    });

    /** 完整學期（較慢，後備） */
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const loadFullSemesterHistory = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.loadFullSemesterHistory(...args) : undefined;
    };
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const reloadWindowedHistory = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.reloadWindowedHistory(...args) : undefined;
    };

    // 管理員編輯歷史紀錄（可改全部代／調課欄位）
    const showHistoryEditModal = ref(false);
    const historyEditForm = ref({
      id: '',
      requestId: '',
      specialFlow: '',
      type: 'substitution',
      requesterEmail: '',
      targetTeacherEmail: '',
      className: '',
      subject: '',
      requestDate: '',
      requestPeriodDay: 1,
      requestPeriod: 1,
      targetDate: '',
      targetDayOfWeek: 1,
      targetPeriod: 1,
      reason: '',
      courseAdjustmentOnly: false,
      leaveTimeType: '',
      leaveTime: '',
      subFee: '自費代課',
      note: '',
      printed: false
    });

    // 待辦分頁
    const pendingPage = { pending: ref(1), sent: ref(1), admin: ref(1) };
    const pendingPageSize = 10;

    // 基礎課表編輯模式
    const isScheduleEditMode = ref(false);
    // 月底報表統計：日期區間是唯一設定，週數由區間自動計算。
    const REPORT_PERIOD_STORAGE_KEY = 'school-substitution-report-period-v1';
    const isValidReportPeriod = (period) => {
      const start = String(period && period.start || '').trim();
      const end = String(period && period.end || '').trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(start)
        && /^\d{4}-\d{2}-\d{2}$/.test(end)
        && start <= end
        && !!(window.DateUtils && window.DateUtils.countWeeksInRange(start, end));
    };
    const readStoredReportPeriod = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(REPORT_PERIOD_STORAGE_KEY) || 'null');
        if (stored && isValidReportPeriod(stored)) {
          return {
            month: /^\d{4}-\d{2}$/.test(String(stored.month || '')) ? stored.month : stored.start.slice(0, 7),
            start: stored.start,
            end: stored.end
          };
        }

        // 舊版匯出流程已按月份保存過區間，首次升級時沿用最近一次設定。
        const legacy = JSON.parse(localStorage.getItem('school-substitution-accounting-periods-v1') || '{}');
        const months = Object.keys(legacy).filter(month => /^\d{4}-\d{2}$/.test(month)).sort();
        for (let i = months.length - 1; i >= 0; i -= 1) {
          const saved = legacy[months[i]] || {};
          const period = saved.period || saved;
          if (isValidReportPeriod(period)) {
            return { month: months[i], start: period.start, end: period.end };
          }
        }
      } catch (e) { /* 無法讀取瀏覽器儲存時使用預設日期 */ }
      return null;
    };
    const storedReportPeriod = readStoredReportPeriod();
    const todayForReport = window.DateUtils && typeof window.DateUtils.getTodayString === 'function'
      ? window.DateUtils.getTodayString() : new Date().toISOString().slice(0, 10);
    const reportMonth = ref(storedReportPeriod ? storedReportPeriod.month : todayForReport.slice(0, 7));
    const accountingPeriodMonth = ref(reportMonth.value);
    const monthEndDate = (month) => {
      const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
      if (!match) return '';
      const date = new Date(Number(match[1]), Number(match[2]), 0);
      return `${match[1]}-${match[2]}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const defaultReportPeriod = window.DateUtils && typeof window.DateUtils.getAccountingPeriodForMonth === 'function'
      ? window.DateUtils.getAccountingPeriodForMonth(reportMonth.value)
      : { start: `${reportMonth.value}-01`, end: monthEndDate(reportMonth.value) };
    const reportStartDate = ref(storedReportPeriod ? storedReportPeriod.start : defaultReportPeriod.start);
    const reportEndDate = ref(storedReportPeriod ? storedReportPeriod.end : defaultReportPeriod.end);
    let accountingPeriodNavigation = false;
    const accountingPeriod = computed(() => ({
      start: reportStartDate.value,
      end: reportEndDate.value
    }));
    const reportWeeksCount = computed(() => {
      if (window.DateUtils && typeof window.DateUtils.countWeeksInRange === 'function') {
        return window.DateUtils.countWeeksInRange(reportStartDate.value, reportEndDate.value);
      }
      return 0;
    });
    const monthlyReportData = ref([]);
    const monthlyReportLoading = ref(false);
    let monthlyReportRevision = 0;
    let monthlyReportLastCalculationKey = null;
    let monthlyReportCalculationId = 0;
    const monthlyReportKey = () => [
      monthlyReportRevision,
      reportMonth.value,
      reportStartDate.value,
      reportEndDate.value,
      reportWeeksCount.value
    ].join('|');
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const cancelScheduledMonthlyReport = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.cancelScheduledMonthlyReport(...args) : undefined;
    };
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const scheduleMonthlyReportCalculation = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.scheduleMonthlyReportCalculation(...args) : undefined;
    };
    const monthlyReportTotals = computed(() => {
      if (!_setupReady.value) return {};
      const a = getReportApi();
      return a ? a.monthlyReportTotals.value : {};
    });
    const accountingExportLoading = ref(false);
    const period8Ready = ref(false);
    const period8Loading = ref(false);
    const period8ExportLoading = ref(false);
    watch([reportStartDate, reportEndDate], ([start, end]) => {
      if (!accountingPeriodNavigation && /^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) {
        reportMonth.value = String(start).slice(0, 7);
        accountingPeriodMonth.value = reportMonth.value;
      }
      const period = { start: String(start || ''), end: String(end || '') };
      if (isValidReportPeriod(period)) {
        try {
          localStorage.setItem(REPORT_PERIOD_STORAGE_KEY, JSON.stringify({
            month: reportMonth.value,
            start: period.start,
            end: period.end
          }));
        } catch (e) { /* 瀏覽器封鎖儲存時不影響頁面操作 */ }
        if (window.ExportAccounting && typeof window.ExportAccounting.savePeriodSettings === 'function') {
          window.ExportAccounting.savePeriodSettings(reportMonth.value, period);
        }
      }
    });
    // R15：shiftReportPeriod 已移至 ui-report.js（經 getReportApi 委派；旗標續留 setup 供 watch）
    const shiftReportPeriod = (...args) => {
      const a = getReportApi();
      return a ? a.shiftReportPeriod(...args) : undefined;
    };

    // 行政直接審核生效開關
    const directApproveMode = ref(true);

    // 監聽請假日期或對調節次改變，自動推算對調課的具體日期（支援跨週對調）
    watch([inputRequestDate, exchangePeriodId, exchangeWeekOffset], () => {
      if (!inputRequestDate.value || !exchangePeriodId.value) {
        exchangeTargetDate.value = '';
        return;
      }
      try {
        if (window.DateUtils && typeof window.DateUtils.getExchangeTargetDate === 'function') {
          exchangeTargetDate.value = window.DateUtils.getExchangeTargetDate(
            inputRequestDate.value, exchangePeriodId.value, exchangeWeekOffset.value
          );
          return;
        }
        const [targetDayStr] = exchangePeriodId.value.split('-');
        const targetDay = parseInt(targetDayStr);
        const [y, m, d] = inputRequestDate.value.split('-').map(Number);
        const reqDate = new Date(y, m - 1, d);
        const reqDay = reqDate.getDay();
        const currentDayOfWeek = reqDay === 0 ? 7 : reqDay;
        const diffDays = (targetDay - currentDayOfWeek) + (exchangeWeekOffset.value * 7);
        const targetDateObj = new Date(reqDate);
        targetDateObj.setDate(reqDate.getDate() + diffDays);
        const year = targetDateObj.getFullYear();
        const month = String(targetDateObj.getMonth() + 1).padStart(2, '0');
        const dateVal = String(targetDateObj.getDate()).padStart(2, '0');
        exchangeTargetDate.value = `${year}-${month}-${dateVal}`;
      } catch (err) {
        console.error("推算對調日期失敗：", err);
        exchangeTargetDate.value = '';
      }
    });

    // P2：月報只在後台「經費／鐘點」分頁時重算（避免全校異動就掃全表）
    watch(
      [substitutionRecords, teachersList, allSchedules, schoolSwaps, classAwayEvents, semesterEndDate, reportMonth, reportStartDate, reportEndDate, reportWeeksCount, adminSubTab, activeTab],
      () => {
        monthlyReportRevision += 1;
        if (activeTab.value === 'admin' && adminSubTab.value === 'billing') {
          scheduleMonthlyReportCalculation();
        } else {
          cancelScheduledMonthlyReport();
          monthlyReportLoading.value = false;
        }
      }
    );


    // ════════════════════════════════════════
    // §3 計算屬性（課表 / 待辦 / 歷史）
    // ════════════════════════════════════════
    // --- 計算屬性 ---

    // 週日曆
    const classList = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getScheduleApi();
      return a ? a.classList.value : [];
    });

    const period8RosterData = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getScheduleApi();
      return a ? a.period8RosterData.value : [];
    });
    const period8RosterRows = computed(() => period8RosterData.value.rows || []);
    const period8CellsFor = (row, dateStr) => (row && row.cells && row.cells[dateStr]) || [];
    const period8StatusLabel = (cell) => {
      if (!cell) return '';
       if (cell.status === 'away') return cell.awayName || '空堂事件';
      if (cell.status === 'exchange') return '調課';
      if (cell.status === 'combined_return') return '併班';
      if (cell.status === 'timetable_only') return '僅課務';
      if (cell.status === 'substitution') return '代課';
      return '';
    };

    const parseScheduleClasses = (raw) => (window.DateUtils && window.DateUtils.parseCombinedClasses)
      ? window.DateUtils.parseCombinedClasses(raw)
      : String(raw || '').split(/[、,，/／|｜\s]+/).map(s => s.trim()).filter(Boolean);

    // P1：班級索引只隨基礎課表重建，切換班級時不再掃描全校課表。
    const classScheduleIndex = computed(() => {
      if (!_setupReady.value) return {};;
      const a = getScheduleApi();
      return a ? a.classScheduleIndex.value : {};
    });

    // 只建「目前選取班」的格；週次判斷仍在此層處理。
    // 併班：班級欄寫「701、702」時，701 與 702 班級課表都會看到此節
    const classSchedules = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getScheduleApi();
      return a ? a.classSchedules.value : [];
    });

    const timetablePeriods = (window.DateUtils && window.DateUtils.getTimetablePeriods)
      ? window.DateUtils.getTimetablePeriods()
      : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
    const getPeriodLabel = (p) =>
      (window.DateUtils && window.DateUtils.getPeriodLabel)
        ? window.DateUtils.getPeriodLabel(p)
        : String(p);
    const formatPeriodText = (p) =>
      (window.DateUtils && window.DateUtils.formatPeriodText)
        ? window.DateUtils.formatPeriodText(p)
         : (Number(p) === 0 ? '早自習' : (Number(p) === 45 ? '午休' : ('第' + p + '節')));
    const isLunchPeriod = (p) =>
      !!(window.DateUtils && window.DateUtils.isLunchPeriod && window.DateUtils.isLunchPeriod(p));
    const getPeriodClass = (p) => {
      const period = Number(p);
      if (period === 0) return 'is-early-period';
      if (isLunchPeriod(p)) return 'is-lunch-period';
      if (period === 8) return 'is-p8-period';
      return '';
    };
    const formatClassName = (raw) =>
      (window.DateUtils && window.DateUtils.formatClassName)
        ? window.DateUtils.formatClassName(raw)
        : String(raw || '');
    const isCombinedClass = (raw) =>
      !!(window.DateUtils && window.DateUtils.isCombinedClass && window.DateUtils.isCombinedClass(raw));
    // 2A：課表細胞屬性已移至 ui-line-template.js（解構見 setup 頂部）

    const currentWeekDates = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getScheduleApi();
      return a ? a.currentWeekDates.value : [];
    });

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const getWeekDatesForCompare = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.getWeekDatesForCompare(...args) : undefined;
    };
    const getBatchCompareSlots = () => {
      const pending = pendingRequestData.value || {};
      if (!pending.isBatch) return [];
      if (Array.isArray(batchSlots.value) && batchSlots.value.length) return batchSlots.value;
      return Array.isArray(pending.batchSlots) ? pending.batchSlots : [];
    };
    const batchCompareWeeks = computed(() => {
      if (!(pendingRequestData.value || {}).isBatch) return [];
      if (window.UiSubmitHelpers && typeof window.UiSubmitHelpers.getBatchCompareWeeks === 'function') {
        return window.UiSubmitHelpers.getBatchCompareWeeks(getBatchCompareSlots());
      }
      return [];
    });
    const batchCompareWeekIndex = ref(0);
    const batchExchangePreviewSlotKey = ref('');
    const batchExchangePreviewBatchId = ref('');
    const batchCompareWeekTotal = computed(() => batchCompareWeeks.value.length);
    const batchCompareWeekDates = computed(() => {
      const weeks = batchCompareWeeks.value;
      const index = Math.max(0, Math.min(batchCompareWeekIndex.value, weeks.length - 1));
      if (weeks[index]) return weeks[index];
      const pending = pendingRequestData.value || {};
      return getWeekDatesForCompare(pending.date || inputRequestDate.value);
    });
    const batchCompareWeekSlotCount = computed(() => {
      const dates = new Set(batchCompareWeekDates.value || []);
      return getBatchCompareSlots().filter(slot => {
        const dateStr = String(slot && (slot.dateStr || slot.date) || '').slice(0, 10);
        return dates.has(dateStr);
      }).length;
    });
    const shiftBatchCompareWeek = (delta) => {
      const total = batchCompareWeekTotal.value;
      if (total <= 1) return;
      const current = parseInt(batchCompareWeekIndex.value, 10) || 0;
      const amount = parseInt(delta, 10) || 0;
      batchCompareWeekIndex.value = Math.max(0, Math.min(total - 1, current + amount));
    };
    const compareWeekDatesA = computed(() => {
      if (!_setupReady.value) return [];
      const a = getSubmitApi();
      return a ? a.compareWeekDatesA.value : [];
    });
    const compareWeekDatesB = computed(() => {
      if (!_setupReady.value) return [];
      const a = getSubmitApi();
      return a ? a.compareWeekDatesB.value : [];
    });
    const compareWeekSelectionA = ref('source');
    const compareWeekSelectionB = ref('target');
    const compareDisplayDatesA = computed(() =>
      compareWeekSelectionA.value === 'target' ? compareWeekDatesB.value : compareWeekDatesA.value
    );
    const compareDisplayDatesB = computed(() =>
      compareWeekSelectionB.value === 'target' ? compareWeekDatesB.value : compareWeekDatesA.value
    );
    const setCompareWeekSelection = (who, view) => {
      const value = view === 'target' ? 'target' : 'source';
      if (who === 'A') compareWeekSelectionA.value = value;
      if (who === 'B') compareWeekSelectionB.value = value;
    };
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const setBatchExchangePreviewSlot = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.setBatchExchangePreviewSlot(...args) : undefined;
    };
    watch(pendingRequestData, (pending) => {
      if (pending && pending.mode === 'exchange') {
        compareWeekSelectionA.value = 'source';
        compareWeekSelectionB.value = 'target';
      }
      if (pending && pending.isExchangeBatch) {
        const batchId = String(pending.submitBatchId || '');
        if (batchId !== batchExchangePreviewBatchId.value) {
          batchExchangePreviewBatchId.value = batchId;
          const slots = Array.isArray(pending.batchSlots) ? pending.batchSlots : [];
          const first = slots.find(slot => !slot.exchangeSubmitted) || slots[0];
          batchExchangePreviewSlotKey.value = first ? String(first.key) : '';
        }
      } else if (!pending) {
        batchExchangePreviewBatchId.value = '';
        batchExchangePreviewSlotKey.value = '';
      }
      if (pending && pending.isBatch) batchCompareWeekIndex.value = 0;
    });
    watch(batchSlots, () => {
      if (!(pendingRequestData.value || {}).isBatch) return;
      const total = batchCompareWeekTotal.value;
      if (!total) {
        batchCompareWeekIndex.value = 0;
        return;
      }
      batchCompareWeekIndex.value = Math.max(
        0,
        Math.min(total - 1, parseInt(batchCompareWeekIndex.value, 10) || 0)
      );
    });
    const isCrossWeekExchange = computed(() => {
      const pending = pendingRequestData.value || {};
      return pending.mode === 'exchange'
        && compareWeekDatesA.value[0]
        && compareWeekDatesB.value[0]
        && compareWeekDatesA.value[0] !== compareWeekDatesB.value[0];
    });
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const getExchangeEndpointText = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.getExchangeEndpointText(...args) : undefined;
    };

    const isAdmin = computed(() => userRole.value === 'admin');
    const isStaff = computed(() => userRole.value === 'staff');
    const classUsesPublicData = computed(() => classReadonlyMode.value || userRole.value === 'teacher');
    const classScheduleRows = computed(() => classUsesPublicData.value ? classViewSchedules.value : allSchedules.value);
    const classSubstitutionRows = computed(() => classUsesPublicData.value ? classViewSubstitutionRecords.value : substitutionRecords.value);
    const classViewerReadonly = computed(() => classUsesPublicData.value);
    const notificationsSuppressed = computed(() => !onlineSubstitutionEnabled.value);
    const paperMode = computed(() => notificationsSuppressed.value && !isAdmin.value);
    const getLeaveTimeDefaults = (leaveEmail) => {
      const t = lookupTeacher(leaveEmail);
      const isAdministrative = !!(t && (t.role === 'admin' || t.role === 'staff'));
      const end = isAdministrative ? '17:00' : '16:00';
      return { type: '全天', start: '08:00', end, range: '08:00~' + end };
    };
    const getLeaveTimePresetRange = (leaveEmail, type) => {
      const d = getLeaveTimeDefaults(leaveEmail);
      if (type === '上午') return d.start + '~12:00';
      if (type === '下午') return '12:00~' + d.end;
      return d.range;
    };
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const setLeaveTimePreset = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.setLeaveTimePreset(...args) : undefined;
    };
    const updatePendingLeaveTime = () => {
      const p = pendingRequestData.value || {};
      if (p.mode !== 'substitution') return;
      const start = String(p.leaveTimeStart || '').trim();
      const end = String(p.leaveTimeEnd || '').trim();
      pendingRequestData.value = Object.assign({}, p, {
        leaveTimeType: '自訂',
        leaveTime: start && end ? (start + '~' + end) : ''
      });
    };
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const toggleCourseAdjustmentOnly = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.toggleCourseAdjustmentOnly(...args) : undefined;
    };
    const isSimulating = computed(() => !!originalUser.value);
    /** 目前登入者是否在「可代申請」白名單（Email） */
    const isProxySubmitGranted = computed(() => {
      if (!_setupReady.value) return false;
      const a = getProxyApi();
      return a ? a.isProxySubmitGranted.value : false;
    });
    /** 可瀏覽全校課表：教學組 or 行政（與代申請授權無關） */
    const canViewAllTimetables = computed(() => isAdmin.value || isStaff.value);
    /**
     * 可代申請：必須是「行政」角色，且被教學組勾進授權名單。
     * 不是一鍵全開所有行政，也不是一般教師。
     */
    const canStaffProxySubmit = computed(() => isStaff.value && isProxySubmitGranted.value);
    /** 管理員可協助他人再辦；其他身分只限自己的實際授課／代課時段。 */
    const canStartSecondSubFromDetail = computed(() => {
      if (!_setupReady.value) return false;;
      const a = getInteractApi();
      return a ? a.canStartSecondSubFromDetail.value : false;
    });
    /** 後台狀態：至少授權一位行政時為「部分開放」 */
    const proxySubmitEnabled = computed(() => (proxySubmitEmails.value || []).length > 0);
    /** 目前是否處於「代別人申請」模式（代理對象 ≠ 自己） */
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    // 2A：已移至 ui-submit.js（computed 保持模板值語義）
    const isProxySubmitActive = computed(() => {
      if (!_setupReady.value) return false;;
      const a = getSubmitApi();
      return a ? a.isProxySubmitActive.value : false;
    });
    // 紙本模式：非代理申請與非活動互代一律走「送出並列印」。
    const paperFlow = computed(() =>
      !isMutualCover.value
      && notificationsSuppressed.value
      && !isProxySubmitActive.value
    );
    const proxyTargetName = computed(() => {
      const em = proxyTargetEmail.value;
      if (!em) return '';
      return getTeacherNameByEmail(em) || em;
    });
    const filteredProxyTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getProxyApi();
      return a ? a.filteredProxyTeachers.value : [];
    });
    /** 後台：僅「行政」角色可被勾選授權（非全校教師） */
    const proxyGrantCandidateTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getProxyApi();
      return a ? a.proxyGrantCandidateTeachers.value : [];
    });
    const proxyGrantedTeachers = computed(() => {
      const set = {};
      (proxySubmitEmails.value || []).forEach(e => { set[e] = 1; });
      return (teachersList.value || []).filter(t =>
        t.role === 'staff' && set[String(t.loginEmail || '').toLowerCase()]
      );
    });
    const isProxySubmitEmailGranted = (email) => {
      const em = String(email || '').toLowerCase();
      return !!(em && (proxySubmitEmails.value || []).indexOf(em) >= 0);
    };

    const parseTeacherSubjects = (raw) => {
      if (window.DomainMatch && typeof window.DomainMatch.parseSubjects === 'function') {
        return window.DomainMatch.parseSubjects(raw);
      }
      return String(raw || '')
        .split(/[、,，/／|｜\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
    };

    const userRoleText = computed(() => {
      if (!_setupReady.value) return '';;
      const a = getProxyApi();
      return a ? a.userRoleText.value : '';
    });

    /**
     * 可否對指定教師操作（點格申請／批次）：
     * 自己 / 教學組 / 已授權行政（可對任何教師；點格時自動切代理對象）
     */
    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const canOperateOnTeacherEmail = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.canOperateOnTeacherEmail(...args) : undefined;
    };

    /** 點別人課格時，若是已授權行政，自動把該人設為代申請對象 */
    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const ensureProxyTargetForTeacher = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.ensureProxyTargetForTeacher(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const assertCanSubmitAsLeaveTeacher = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.assertCanSubmitAsLeaveTeacher(...args) : undefined;
    };

    const getProxyActor = () => {
      // 只要目前登入者有代申請能力就回傳本人（送出時再比對請假人）
      if (!user.value) return null;
      if (!canStaffProxySubmit.value && !isProxySubmitActive.value) return null;
      return {
        email: String(user.value.email || '').toLowerCase(),
        name: (user.value.displayName || getTeacherNameByEmail(user.value.email) || '').replace(/\s*\(模擬\)\s*$/, '')
      };
    };

    /** 請假人不是自己，且目前帳號是已授權行政 → 應走代申請 */
    const shouldProxySubmitForLeave = (leaveName) => {
      if (!canStaffProxySubmit.value || !user.value) return false;
      const me = String(getTeacherNameByEmail(user.value.email) || '').trim().toLowerCase();
      const leave = String(getTeacherNameByEmail(leaveName) || leaveName || '').trim().toLowerCase();
      return !!(me && leave && leave !== me);
    };

    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const setProxyTarget = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.setProxyTarget(...args) : undefined;
    };

    const clearProxyTarget = () => {
      proxyTargetEmail.value = '';
      proxyTargetQuery.value = '';
      showProxyTargetDropdown.value = false;
      searchQuery.value = '';
      if (isStaff.value) selectedSubject.value = 'mine';
      showToast('已改回處理自己的課', 'info');
    };

    /** 只允許 role=staff 的 Email 進授權名單 */
    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const filterStaffEmailsOnly = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.filterStaffEmailsOnly(...args) : undefined;
    };

    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const persistProxySubmitEmails = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.persistProxySubmitEmails(...args) : undefined;
    };

    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const toggleProxySubmitEmail = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.toggleProxySubmitEmail(...args) : undefined;
    };

    const clearAllProxySubmitEmails = async () => {
      if (!(proxySubmitEmails.value || []).length) return;
      const ok = await showConfirm('確定清空所有行政的代申請授權？清空後沒有行政可代他人申請。', '清空授權');
      if (!ok) return;
      await persistProxySubmitEmails([]);
    };

    /** 相容舊按鈕：不再「一鍵全開所有行政」 */
    const setProxySubmitEnabled = async (enabled) => {
      if (enabled) {
        showToast('請在下方勾選「指定行政」授權，不會一次開放全部行政', 'info');
        return;
      }
      await clearAllProxySubmitEmails();
    };

    // 2A：已移至 ui-proxy.js（經 getProxyApi 委派）
    const setOnlineSubstitutionEnabled = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getProxyApi();
      return a ? a.setOnlineSubstitutionEnabled(...args) : undefined;
    };

    const subjectsList = computed(() => {
      const list = new Set();
      teachersList.value.forEach(t => {
        parseTeacherSubjects(t.subject).forEach(s => list.add(s));
      });
      return Array.from(list).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    });

    const filteredTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getScheduleApi();
      return a ? a.filteredTeachers.value : [];
    });

    // 媒合開啟時只釘「申請人自己」課表，不彈出對方課表
    const displayTimetableTeachers = computed(() => {
      if (!_setupReady.value) return [];
      const a = getScheduleApi();
      return a ? a.displayTimetableTeachers.value : [];
    });

    // ── 第 1 階 A：全校課表教師分頁（避免一次畫 60+ 人）──
    const TT_PAGE_SIZE_DEFAULT = 10;
    const ttPageSize = ref(TT_PAGE_SIZE_DEFAULT);
    const ttPage = ref(1);
    const ttTotalPages = computed(() =>
      Math.max(1, Math.ceil((displayTimetableTeachers.value || []).length / (ttPageSize.value || TT_PAGE_SIZE_DEFAULT)))
    );
    const visibleTimetableTeachers = computed(() => {
      if (!_setupReady.value) return [];
      const a = getScheduleApi();
      return a ? a.visibleTimetableTeachers.value : [];
    });
    const ttNeedPager = computed(() => (displayTimetableTeachers.value || []).length > ttPageSize.value);
    watch([searchQuery, selectedSubject, () => (displayTimetableTeachers.value || []).length], () => {
      ttPage.value = 1;
    });
    watch(ttPageSize, () => { ttPage.value = 1; });
    watch(ttTotalPages, (max) => {
      if (ttPage.value > max) ttPage.value = max;
    });
    const changeTtPage = (n) => {
      ttPage.value = Math.max(1, Math.min(n, ttTotalPages.value));
    };

    const pendingCount = computed(() => {
      let count = myPendingRequests.value.length;
      if (isAdmin.value || isStaff.value) count += adminPendingRequests.value.length;
      return count;
    });
    const myInviteCount = computed(() => myPendingRequests.value.length);
    const adminTodoCount = computed(() => (isAdmin.value || isStaff.value) ? adminPendingRequests.value.length : 0);
    // 快速待辦：避免模板每次 filter
    const quickTodoSentOpen = computed(() =>
      (mySentRequests.value || []).filter(r =>
        r.status === 'pending_teacher' || r.status === 'pending_admin'
      )
    );
    const hasQuickTodo = computed(() =>
      (myPendingRequests.value || []).length > 0 || quickTodoSentOpen.value.length > 0
    );

    const allTeachersList = computed(() => {
      const excludeName = activeCell.value?.teacherEmail || getTeacherNameByEmail(user.value?.email);
      return teachersList.value.filter(t => (t.teacherName || t.name) !== excludeName);
    });

    const teachersListDetails = computed(() => teachersList.value);
    const accountingPlanOptions = computed(() => {
      if (!_setupReady.value) return [];
      const a = getReportApi();
      return a ? a.accountingPlanOptions.value : [];
    });
    const getExpensePlanSummary = (value) => window.FieldMap && window.FieldMap.formatExpensePlanSummary
      ? window.FieldMap.formatExpensePlanSummary(value)
      : String(value || '預設').trim() || '預設';
    const isExpensePlanSlotConfig = (value) => {
      if (!window.FieldMap || typeof window.FieldMap.parseExpensePlan !== 'function') return false;
      return window.FieldMap.parseExpensePlan(value).mode === 'slots';
    };
    const pendingHomeroomRecords = computed(() => {
      return (homeroomRecords.value || [])
        .filter(r => r && r.enabled !== false && String(r.status || '').toLowerCase() !== 'cancelled')
        .filter(isBillableHomeroomRecord)
        .filter(r => !r.actualTeacherName);
    });
    const getHomeroomCoverCandidates = (record) => {
      const original = String(record && record.originalTeacherName || '').toLowerCase();
      return (teachersList.value || [])
        .filter(t => t && (t.teacherName || t.name) && String(t.teacherName || t.name).toLowerCase() !== original)
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
    };
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const loadHomeroomRecords = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.loadHomeroomRecords(...args) : undefined;
    };
    /**
     * 全域 Optimistic UI 樂觀執行器
     * 0 毫秒本地更新 -> 背景同步 -> 成功跳右下氣泡 -> 失敗自動回滾並彈出需手動點擊關閉的警示 Modal
     */
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const executeOptimisticAction = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.executeOptimisticAction(...args) : undefined;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const assignHomeroomTeacher = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.assignHomeroomTeacher(...args) : undefined;
    };

    // 2A：extractNameFromFormatted 已移至 ui-list-helpers.js（解構見 setup 頂部）

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const onHomeroomInputSelect = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.onHomeroomInputSelect(...args) : undefined;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const onManualCoverTeacherInput = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.onManualCoverTeacherInput(...args) : undefined;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const getFilteredHomeroomCandidates = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.getFilteredHomeroomCandidates(...args) : undefined;
    };

    const filteredManualCoverTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHomeroomApi();
      return a ? a.filteredManualCoverTeachers.value : [];
    });

    // 2A：getTodayYmdStr 與 DateUtils.getTodayString 等價，改委派（呼叫端零修改）
    const getTodayYmdStr = window.DateUtils.getTodayString;

    const homeroomTeachersList = computed(() => {
      return (teachersList.value || []).filter(t => {
        const title = String(t && t.jobTitle || '').trim();
        return title.indexOf('導師') >= 0;
      }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant'));
    });

    const showManualHomeroomModal = ref(false);
    const homeroomStatusFilter = ref('all');
    const manualHomeroomForm = ref({
      leaveEmail: '',
      className: '',
         date: getTodayYmdStr(),
         leaveTimeType: '全天',
         leaveTime: '08:00~16:00',
      actualTeacherEmail: '',
      note: ''
    });

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const openManualHomeroomModal = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.openManualHomeroomModal(...args) : undefined;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const onManualHomeroomLeaveTeacherChange = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.onManualHomeroomLeaveTeacherChange(...args) : undefined;
    };

    const currentMonthHomeroomRecords = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHomeroomApi();
      return a ? a.currentMonthHomeroomRecords.value : [];
    });

    const currentMonthHomeroomFeeTotal = computed(() => {
      return (currentMonthHomeroomRecords.value || []).reduce((sum, r) => sum + (Number(r.feeAmount) || 455), 0);
    });

    const currentMonthHomeroomAssignedCount = computed(() => {
      return (currentMonthHomeroomRecords.value || []).filter(r => !!r.actualTeacherName).length;
    });

    const currentMonthHomeroomPendingCount = computed(() => {
      return (currentMonthHomeroomRecords.value || []).filter(r => !r.actualTeacherName).length;
    });

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const saveManualHomeroomRecord = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.saveManualHomeroomRecord(...args) : undefined;
    };

    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const deleteHomeroomRecord = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.deleteHomeroomRecord(...args) : undefined;
    };

    // 專門用於調課的對調教師選單（過濾條件：必須與請假教師在同一個班級有授課）
    const exchangeTeachersList = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHomeroomApi();
      return a ? a.exchangeTeachersList.value : [];
    });

    // 我的教師資料
    const myTeacherProfile = computed(() => {
      return user.value ? lookupTeacher(user.value.email) : null;
    });

    // 檢查調代課申請的欄位是否填妥
    const isRequestValid = computed(() => {
      if (!_setupReady.value) return false;;
      const a = getHomeroomApi();
      return a ? a.isRequestValid.value : false;
    });



    // 所有歷史紀錄 (掛載虛擬屬性以供前端表格渲染)
    // P3：reqById／peerByRequestId 一次建表，避免 map 內 O(n) find
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const filteredHistoryRecords = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.filteredHistoryRecords.value : [];
    });

    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const getWeekStart = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.getWeekStart(...args) : '';
    };
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const getMonthStart = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.getMonthStart(...args) : '';
    };
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const dateFilteredHistoryRecords = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.dateFilteredHistoryRecords.value : [];
    });

    // 批次申請：以批次為單位分頁，批次標題預設收合；展開後仍保留每筆操作。
    const batchGroupExpanded = ref({});
    const getBatchGroupStateKey = (scope, batchId) =>
      String(scope || '') + '|' + String(batchId || '').trim().toLowerCase();
    const isBatchGroupExpanded = (scope, batchId) =>
      !!batchGroupExpanded.value[getBatchGroupStateKey(scope, batchId)];
    const toggleBatchGroup = (scope, batchId) => {
      const key = getBatchGroupStateKey(scope, batchId);
      const next = Object.assign({}, batchGroupExpanded.value);
      if (next[key]) delete next[key];
      else next[key] = true;
      batchGroupExpanded.value = next;
    };
    // 2A：批次顯示分組已移至 ui-list-helpers.js（flatten 需讀展開 ref，留守；解構見 setup 頂部）
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const flattenBatchDisplayGroups = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.flattenBatchDisplayGroups(...args) : undefined;
    };
    // 2A：批次分組摘要／狀態已移至 ui-list-helpers.js（解構見 setup 頂部）

    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const historyBatchGroups = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.historyBatchGroups.value : [];
    });
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const historyTotalPages = computed(() => {
      if (!_setupReady.value) return 1;;
      const a = getHistoryApi();
      return a ? a.historyTotalPages.value : 1;
    });

    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const paginatedHistoryRecords = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.paginatedHistoryRecords.value : [];
    });

    // 待辦分頁＋搜尋
    const pendingMyPendingPage = ref(1);
    const pendingMySentPage = ref(1);
    const pendingAdminPage = ref(1);
    const pendingSearchQuery = ref('');

    // 2A：待辦分頁簇已移至 ui-history.js（經 getHistoryApi 委派）
    const matchPendingSearch = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHistoryApi();
      return a ? a.matchPendingSearch(...args) : true;
    };
    const filteredMyPendingRequests = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.filteredMyPendingRequests.value : [];
    });
    const filteredMySentRequests = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.filteredMySentRequests.value : [];
    });
    const filteredAdminPendingRequests = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.filteredAdminPendingRequests.value : [];
    });
    const paginatedMyPending = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.paginatedMyPending.value : [];
    });
    const sentBatchGroups = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.sentBatchGroups.value : [];
    });
    const adminPendingBatchGroups = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.adminPendingBatchGroups.value : [];
    });
    const paginatedMySent = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.paginatedMySent.value : [];
    });
    const paginatedAdminPending = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHistoryApi();
      return a ? a.paginatedAdminPending.value : [];
    });
    const pendingMyPendingTotal = computed(() => {
      if (!_setupReady.value) return 1;;
      const a = getHistoryApi();
      return a ? a.pendingMyPendingTotal.value : 1;
    });
    const pendingMySentTotal = computed(() => {
      if (!_setupReady.value) return 1;;
      const a = getHistoryApi();
      return a ? a.pendingMySentTotal.value : 1;
    });
    const pendingAdminTotal = computed(() => {
      if (!_setupReady.value) return 1;;
      const a = getHistoryApi();
      return a ? a.pendingAdminTotal.value : 1;
    });
    // 調課推薦（domain-match）
    // 調課週次以已選定的異動日期為基準，不受目前課表看板週次影響。
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const getExchangeWeekDates = (...args) => {
      const a = getTimetableApi();
      return a ? a.getExchangeWeekDates(...args) : [];
    };
    const recommendedExchangeList = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getHomeroomApi();
      return a ? a.recommendedExchangeList.value : [];
    });

    // 第8節代課：經費鎖定「第8節代課」（計畫經費），不可改公費／自費／互代
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const resolvePendingPeriods = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.resolvePendingPeriods(...args) : undefined;
    };
    const isPeriod8FeeLocked = computed(() => {
      if (!_setupReady.value) return false;
      const a = getSubmitApi();
      return a ? a.isPeriod8FeeLocked.value : false;
    });
    // 舊名相容（曾誤鎖為自費）
    const isSubFeeLockedToSelf = isPeriod8FeeLocked;

    /** 扣額度預覽：目前額度／本次扣幾／扣後剩幾（依代課老師） */
    const quotaDeductPreview = computed(() => {
      if (!_setupReady.value) return null;;
      const a = getHomeroomApi();
      return a ? a.quotaDeductPreview.value : null;
    });
    const quotaDeductInsufficient = computed(() =>
      !!(quotaDeductPreview.value && quotaDeductPreview.value.some(q => q.short))
    );
    /** 額度不足時改經費：活動互代→活動公費；一般→自費 */
    // 2A：已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const switchQuotaDeductToSelfPay = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getHomeroomApi();
      return a ? a.switchQuotaDeductToSelfPay(...args) : undefined;
    };
    /**
     * 選「扣額度」且額度不足：
     * - 活動互代 → 自動改「活動公費」並允許送出
     * - 一般 → 擋送出（請改自費或換人）
     */
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const assertQuotaDeductAllowed = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.assertQuotaDeductAllowed(...args) : undefined;
    };

    // ── 扣額度包預覽＋手動覆寫（送出前顯示將扣哪包，預設 FIFO，可下拉改包）──
    const quotaPackPreview = ref([]);
    const quotaPackLoading = ref(false);
    const quotaPackError = ref('');
    // 背景預熱：還沒切到扣額度就先查，真正切過去時吃快取秒出（不動畫面 loading）
    // 識別只用姓名
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const quotaTeacherNameOf = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.quotaTeacherNameOf(...args) : undefined;
    };
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const warmQuotaPackCache = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.warmQuotaPackCache(...args) : undefined;
    };
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const fetchQuotaPackPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.fetchQuotaPackPreview(...args) : undefined;
    };
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const doFetchQuotaPackPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.doFetchQuotaPackPreview(...args) : undefined;
    };
    const quotaPackOptions = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getMatchApi();
      return a ? a.quotaPackOptions.value : [];
    });
    const quotaFifoPackageId = computed(() => {
      if (!_setupReady.value) return '';;
      const a = getMatchApi();
      return a ? a.quotaFifoPackageId.value : '';
    });
    const quotaSelectedPack = computed(() => {
      if (!_setupReady.value) return null;;
      const a = getMatchApi();
      return a ? a.quotaSelectedPack.value : null;
    });
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const resetQuotaPackOverride = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.resetQuotaPackOverride(...args) : undefined;
    };
    // 管理員才需要包預覽；一般教師不打 API（用 getter 監聽，下拉切換經費也會觸發）
    // 未切到扣額度時先背景預熱，切過去吃快取秒出
    watch(function () {
      const pd = pendingRequestData.value || {};
      return [pd.mode, pd.subFee, pd.subTeacher, showCompareModal.value, isPeriod8FeeLocked.value];
    }, function () {
      if (!isAdmin.value) return;
      if (!showCompareModal.value) return;
      const p = pendingRequestData.value;
      if (!p || p.mode !== 'substitution' || isPeriod8FeeLocked.value) return;
      if (p.subFee === QUOTA_DEDUCT_FEE) {
        fetchQuotaPackPreview();
      } else {
        quotaPackPreview.value = [];
        quotaPackError.value = '';
        if (p.subTeacher) warmQuotaPackCache(p.subTeacher);
      }
    });

    // 個人調代課摘要 (未來排前，過去排後且淡化)
    // 2A：已移至 ui-history.js（經 getHistoryApi 委派）
    const personalChanges = computed(() => {
      const a = getHistoryApi();
      return a ? a.personalChanges.value : [];
    });

    // --- 方法與業務邏輯 ---

    // 智慧代課媒合（ui-timetable.js）
    const scheduleScope = ref('full'); // full | teacher_self_and_class
    const fetchRecommendations = () => {
      const a = getTimetableApi();
      if (!a) return;
      a.fetchRecommendations({
        matchMode, inputRequestDate, activeCell, teachersList, getTeacherSubjectByEmail,
        activityBalanceCtx, recommendationLoading, matchSearchQuery, matchDisplayCount,
        matchShowNoTeacherWarning, matchEmptyReasons, recommendedTeachers,
        scheduleScope,
        fetchMatchCandidates: typeof fetchMatchCandidates === 'function' ? fetchMatchCandidates : null
      });
    };

    // 媒合列表：每次多載 10 人，無總人數上限
    const MATCH_PAGE_SIZE = 10;
    // 2A：已移至 ui-match.js（經 getMatchApi 委派）
    const loadMoreMatches = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getMatchApi();
      return a ? a.loadMoreMatches(...args) : undefined;
    };

    const filteredRecommendedTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getMatchApi();
      return a ? a.filteredRecommendedTeachers.value : [];
    });

    const filteredExchangeList = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getMatchApi();
      return a ? a.filteredExchangeList.value : [];
    });

    const displayedRecommendedTeachers = computed(() =>
      filteredRecommendedTeachers.value.slice(0, matchDisplayCount.value)
    );

    // 調課媒合同樣分頁
    const displayedExchangeList = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getMatchApi();
      return a ? a.displayedExchangeList.value : [];
    });
    watch(matchSearchQuery, () => {
      matchDisplayCount.value = MATCH_PAGE_SIZE;
    });

    // 準備模擬對比 Modal（ui-request.js → UiSubmitHelpers.prepCompare）
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const runComparePreparation = async (...args) => {
      const a = getSubmitApi();
      return a ? a.runComparePreparation(...args) : undefined;
    };
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const prepCompare = async (...args) => {
      const a = getSubmitApi();
      return a ? a.prepCompare(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const previewBatchCandidate = async (...args) => {
      const a = getSubmitApi();
      return a ? a.previewBatchCandidate(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const closeCompareModal = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.closeCompareModal(...args) : undefined;
    };

    // 2A：已移至 ui-approval.js（下方解構取回）

    // 批次：該日該節是否在選定清單
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const isBatchSlotAt = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.isBatchSlotAt(...args) : undefined;
    };

    // 每節不同人：模擬對照右側目前檢視的受邀人
    // 每節不同人：模擬對照右側目前檢視的受邀人（ref 留守，模板 v-model 用）
    const batchCompareViewEmail = ref('');
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const batchCompareSubGroups = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getSubmitApi();
      return a ? a.batchCompareSubGroups.value : [];
    });;
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const resolveCompareBEmail = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.resolveCompareBEmail(...args) : undefined;
    };

    /** B 欄：此格是否為「目前檢視受邀人」要代入的批次節次（須日期＋節次＋受邀人全符合） */
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const getBatchSlotForCompareB = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.getBatchSlotForCompareB(...args) : undefined;
    };

    // 活動模式：外出班釋出不視為衝堂；巡堂可當空堂
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const isSlotConflict = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.isSlotConflict(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    // 2A：已移至 ui-submit.js（computed 保持模板值語義）
    const exchangeIncomingConflict = computed(() => {
      if (!_setupReady.value) return null;;
      const a = getSubmitApi();
      return a ? a.exchangeIncomingConflict.value : null;
    });

    /** 代課／調入落在對方「巡堂」節：提醒但不擋（私下代巡） */
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const confirmIfTargetPatrol = async (...args) => {
      const a = getSubmitApi();
      return a ? a.confirmIfTargetPatrol(...args) : undefined;
    };

    // 模擬對比 Grid（ui-request.js → UiSubmitHelpers）
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const getCompareCellText = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.getCompareCellText(...args) : undefined;
    };
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const getCompareCellClass = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.getCompareCellClass(...args) : undefined;
    };

    // 輔助：檢查 B 師是否與請假節次衝堂（含批次全節／每節不同人）
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    // 2A：已移至 ui-submit.js（computed 保持模板值語義）
    const hasSubTeacherConflict = computed(() => {
      if (!_setupReady.value) return false;;
      const a = getSubmitApi();
      return a ? a.hasSubTeacherConflict.value : false;
    });

    // ── 子函數①②：表單驗證／組裝 payload（ui-request.js → UiSubmitHelpers）──
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const validateSubmitRequest = async (...args) => {
      const a = getSubmitApi();
      return a ? a.validateSubmitRequest(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const buildSubmitPayload = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.buildSubmitPayload(...args) : undefined;
    };

    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const validateBatchExchangeSlot = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getSubmitApi();
      return a ? a.validateBatchExchangeSlot(...args) : undefined;
    };


    // ════════════════════════════════════════
    // §4 提交申請 / 課表渲染 / 簽核
    // ════════════════════════════════════════
    // ── 批次選節／媒合（ui-activity.js → UiBatchPanel）──
    const {
      batchSlotKey, isBatchSlotSelected, clearBatchSlots,
      isBatchMatchFlow, isBatchExchangeFlow, isBatchPerSlotMode, batchAssignedCount, batchAllSlotsAssigned, batchActiveSlot,
      groupBatchSlotsBySub, setBatchAssignMode, toggleBatchSelectMode, toggleBatchSlot,
      setBatchFlowMode,
      fetchSingleSlotRecommendations, fetchBatchRecommendations, selectBatchSlotForMatch,
      openBatchMatch, prepBatchCompare, assignBatchSlotSub, clearBatchSlotSub,
      prepBatchPerSlotCompare, prepBatchExchangeCompare, setBatchCompareViewEmail, executeBatchSubmit
    } = window.UiBatchPanel.create({
      computed: computed,
      showToast: showToast,
      showConfirm: showConfirm,
      // 下列函式定義在後方：一律用 wrapper，避免 const TDZ
      getTeacherNameByEmail: function (em) { return getTeacherNameByEmail(em); },
      getLeaveTimeDefaults: getLeaveTimeDefaults,
      getTeacherSubjectByEmail: function (em) { return getTeacherSubjectByEmail(em); },
      getScheduleForDate: function (a, b, c, d) { return getScheduleForDate(a, b, c, d); },
      formatDateMMDD: function (d) { return formatDateMMDD(d); },
      getTimetableApi: function () { return getTimetableApi(); },
      defaultSubFeeForReason: function (r) { return defaultSubFeeForReason(r); },
      softRefreshInBackground: function (opts) { return softRefreshInBackground(opts || {}); },
      optimisticUpsertRequest: function (r) { return optimisticUpsertRequest(r); },
      sheetRequestToFront: function (r) { return sheetRequestToFront(r); },
      isAdmin: isAdmin,
      isProxySubmitActive: function () { return isProxySubmitActive.value; },
      canStaffProxySubmit: function () { return canStaffProxySubmit.value; },
      shouldProxySubmitForLeave: shouldProxySubmitForLeave,
      getProxyActor: getProxyActor,
      isMutualCover: isMutualCover,
      DAC: DAC,
      mutualAwayClasses: mutualAwayClasses,
      batchSlots: batchSlots,
      batchSelectMode: batchSelectMode,
      batchFlowMode: batchFlowMode,
      exchangeWeekOffset: exchangeWeekOffset,
      exchangeWeekdayFilter: exchangeWeekdayFilter,
      batchAssignMode: batchAssignMode,
      batchActiveSlotKey: batchActiveSlotKey,
      batchSubTeacher: batchSubTeacher,
      batchReason: batchReason,
      batchSubFee: batchSubFee,
      batchNote: batchNote,
      batchCompareViewEmail: batchCompareViewEmail,
      showBatchConfirmModal: showBatchConfirmModal,
      showMatchModal: showMatchModal,
      showCompareModal: showCompareModal,
      activeCell: activeCell,
      inputRequestDate: inputRequestDate,
      matchMode: matchMode,
      matchPreview: matchPreview,
      pendingRequestData: pendingRequestData,
      recommendedTeachers: recommendedTeachers,
      recommendationLoading: recommendationLoading,
      matchSearchQuery: matchSearchQuery,
      matchDisplayCount: matchDisplayCount,
      matchShowNoTeacherWarning: matchShowNoTeacherWarning,
      matchEmptyReasons: matchEmptyReasons,
      consecAlertsA: consecAlertsA,
      consecAlertsB: consecAlertsB,
      directApproveMode: directApproveMode,
      paperMode: paperMode,
      paperFlow: paperFlow,
      notificationsSuppressed: notificationsSuppressed,
      openPaperPrintDraft: function (requests) {
        return requests && requests.length
          ? openPaperPrintDraftForSubmittedRequests(requests)
          : openPaperPrintDraftFromCompare();
      },
      openPaperPrintMutualDrafts: function () { return openPaperPrintMutualDrafts(); },
      teachersList: teachersList,
      activityBalanceCtx: activityBalanceCtx,
      QUOTA_DEDUCT_FEE: QUOTA_DEDUCT_FEE,
      ACTIVITY_PUBLIC_FEE: ACTIVITY_PUBLIC_FEE,
      PERIOD8_FEE: PERIOD8_FEE,
      isSlotConflict: isSlotConflict,
      mutualSkipNotify: mutualSkipNotify,
      isQuotaDeductFee: isQuotaDeductFee,
      assertQuotaDeductAllowed: assertQuotaDeductAllowed,
      loading: loading,
      loadingMessage: loadingMessage,
      isSubmitting: isSubmitting,
      currentSemester: currentSemester,
      buildSubmitPayload: buildSubmitPayload,
      validateBatchExchangeSlot: validateBatchExchangeSlot,
      directApproveSkipNotify: directApproveSkipNotify,
      callGasApi: callGasApi,
      deductMutualQuotaForRows: deductMutualQuotaForRows,
      successModalTitle: successModalTitle,
      successModalMessage: successModalMessage,
      hasLineTemplate: hasLineTemplate,
      lineBatchParts: lineBatchParts,
      lineCopyText: lineCopyText,
      showSuccessModal: showSuccessModal,
      successActionRequests: successActionRequests,
       buildLineBatchInviteText: buildLineBatchInviteText,
       buildLineInviteText: buildLineInviteText,
      successFlowMode: successFlowMode
    });

    // ── 主函數③：執行提交（ui-request.js）──
    // 2A：已移至 ui-submit.js（經 getSubmitApi 委派）
    const executeSubmitRequest = async (...args) => {
      const a = getSubmitApi();
      return a ? a.executeSubmitRequest(...args) : undefined;
    };

    // 調代課 lookup（domain-schedule）
    const substitutionsLookup = computed(() =>
      window.DomainSchedule.buildSubstitutionsLookup(substitutionRecords.value)
    );

    // ── 課表存取層（ui-timetable.js）──
    // 延後建立：isBatchSlotSelected / getMutualDraftAt 定義在後，首次取用時再 create
    let _timetableApi = null;
    const getTimetableApi = () => {
      if (_timetableApi) return _timetableApi;
      if (!window.UiTimetable) {
        console.error('UiTimetable 未載入');
        return null;
      }
      _timetableApi = window.UiTimetable.create({
         computed,
         watch,
         allSchedules, schoolSwaps, substitutionRecords, substitutionsLookup, allPendingRequests,
         requestsList,
         activeCell, inputRequestDate, teachersList, timetablePeriods,
         trianglePickB, trianglePickC, triangleCandidateSearch, triangleCandidateDisplayCount,
         triangleReason, triangleNote,
         getExchangeWeekDates, showTriangleTimetablePreview,
         notificationsSuppressed, paperFlow, openLineMessageEditor,
         isPaperFlowRequest, isProxySubmitRequest, getLineHandledSlot,
         lookupTeacher, isCombinedClass,
        // 只用目前可見頁的教師建 grid，全校模式才真正省算力
         displayTimetableTeachers: visibleTimetableTeachers, currentWeekDates,
         getTeacherNameByEmail, getTeacherSubjectByEmail, callGasApi, formatDateMMDD, isSingleWeek,
        isEmptySlotAssignmentRequest, isCourseAdjustmentOnlyRequest,
        isClassAwayOnDate, getWeekDayText,
         batchSelectMode, batchFlowMode, isBatchSlotSelected, isMutualCover, getMutualDraftAt,
         mutualDrafts, mutualAwayClasses, mutualActivityStart, mutualActivityEnd,
         mutualActivityStartPeriod, mutualActivityEndPeriod, isMutualActivitySlotInRange, DAC,
        getTodayString, getClassAwayEventsForView, semesterEndDate,
      });
      return _timetableApi;
    };
    // ── 簽核送出層（ui-approval.js）：submitTriangleRequest（三角送出；延後建立）──
    let _approvalApi = null;
    const getApprovalApi = () => {
      if (_approvalApi) return _approvalApi;
      if (!window.UiApproval) {
        console.error('UiApproval 未載入');
        return null;
      }
      _approvalApi = window.UiApproval.create({
        ref,
        callGasApi, callGasApiWithProgress, showToast, showConfirm, loading, loadingMessage,
        getStatusText, getTeacherNameByEmail, isAdmin, notificationsSuppressed,
        syncHistorySelectionFromDom, substitutionRecords, requestsList,
        optimisticPatchRequestStatus, isTriangleRequest, restoreMutualQuotaForRows,
        activeCell, pendingRequestData, combinedReturnCandidates, PERIOD8_FEE, isMutualCover,
        consecAlertsA, consecAlertsB, matchPreview, showCompareModal, inputRequestDate,
        currentWeekDates, isCombinedClass, findCombinedReturnCandidates, paperMode, ensureDAC,
        emptySlotForm, emptySlotQuotaZero, isSubmitting, DAC, showEmptySlotModal,
        printSelectedForms, openPrintPreview, mySentRequests, myPendingRequests,
        adminPendingRequests, allPendingRequests, paginatedAdminPending, selectedRecordIds,
        activeTab, showDetailModal, detailRequest, detailSubRecord,
        isExchangeLikeRequest, lookupTeacher, teachersList, ACTIVITY_PUBLIC_FEE,
        formatLeaveClassSlot, formatExchangeClassSlot,
        isLeaveClassRestricted, isExchangeClassRestricted,
        triangleSubmitting, triangleValidation, triangleReason, onlineSubstitutionEnabled,
        triangleParticipants, triangleNote, sheetRequestToFront, currentSemester,
        optimisticUpsertRequest, successActionRequests, showMatchModal, hasLineTemplate,
        lineCopyText, lineBatchParts, showSuccessModal, resetTriangleDraft,
        openPaperPrintDraftForSubmittedRequests, successModalTitle, successModalMessage,
        successFlowMode, softRefreshInBackground,
      });
      return _approvalApi;
    };
    // ── 簽核家族委派（ui-approval.js；選取 state 由模組持有、template 僅讀取）──
    const selectedAdminPendingIds = computed(() => {
      const a = getApprovalApi();
      return a ? a.selectedAdminPendingIds.value : [];
    });
    const lastBatchPrintIds = computed(() => {
      const a = getApprovalApi();
      return a ? a.lastBatchPrintIds.value : [];
    });
    const showBatchPrintPrompt = computed(() => {
      const a = getApprovalApi();
      return a ? a.showBatchPrintPrompt.value : false;
    });
    const isAdminPendingSelected = (...args) => {
      const a = getApprovalApi();
      return a ? a.isAdminPendingSelected(...args) : false;
    };
    const toggleAdminPendingSelect = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleAdminPendingSelect(...args) : undefined;
    };
    const toggleSelectAllAdminPending = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleSelectAllAdminPending(...args) : undefined;
    };
    const isAdminBatchGroupSelected = (...args) => {
      const a = getApprovalApi();
      return a ? a.isAdminBatchGroupSelected(...args) : false;
    };
    const toggleAdminBatchGroupSelection = (...args) => {
      const a = getApprovalApi();
      return a ? a.toggleAdminBatchGroupSelection(...args) : undefined;
    };
    const clearAdminPendingSelection = (...args) => {
      const a = getApprovalApi();
      return a ? a.clearAdminPendingSelection(...args) : undefined;
    };
    const respondToRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.respondToRequest(...args) : undefined;
    };
    const respondToBatch = (...args) => {
      const a = getApprovalApi();
      return a ? a.respondToBatch(...args) : undefined;
    };
    const adminApprove = (...args) => {
      const a = getApprovalApi();
      return a ? a.adminApprove(...args) : undefined;
    };
    const adminReject = (...args) => {
      const a = getApprovalApi();
      return a ? a.adminReject(...args) : undefined;
    };
    const batchAdminApprove = (...args) => {
      const a = getApprovalApi();
      return a ? a.batchAdminApprove(...args) : undefined;
    };
    const batchAdminReject = (...args) => {
      const a = getApprovalApi();
      return a ? a.batchAdminReject(...args) : undefined;
    };
    const printLastBatchNotices = (...args) => {
      const a = getApprovalApi();
      return a ? a.printLastBatchNotices(...args) : undefined;
    };
    const dismissBatchPrintPrompt = (...args) => {
      const a = getApprovalApi();
      return a ? a.dismissBatchPrintPrompt(...args) : undefined;
    };
    const cancelRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.cancelRequest(...args) : undefined;
    };
    const deleteSubstitutionRecord = (...args) => {
      const a = getApprovalApi();
      return a ? a.deleteSubstitutionRecord(...args) : undefined;
    };
    const sendSelectedBatchNotices = (...args) => {
      const a = getApprovalApi();
      return a ? a.sendSelectedBatchNotices(...args) : undefined;
    };
    const startCombinedReturn = (...args) => {
      const a = getApprovalApi();
      return a ? a.startCombinedReturn(...args) : undefined;
    };
    const executeEmptySlotAssign = (...args) => {
      const a = getApprovalApi();
      return a ? a.executeEmptySlotAssign(...args) : undefined;
    };
    const formatRequestSummary = (...args) => {
      const a = getApprovalApi();
      return a ? a.formatRequestSummary(...args) : '';
    };
    const getApproveRiskFlags = (...args) => {
      const a = getApprovalApi();
      return a ? a.getApproveRiskFlags(...args) : [];
    };
    const formatApproveBatchRiskSummary = (...args) => {
      const a = getApprovalApi();
      return a ? a.formatApproveBatchRiskSummary(...args) : '';
    };
    const getRequestProgressSteps = (...args) => {
      const a = getApprovalApi();
      return a ? a.getRequestProgressSteps(...args) : [];
    };
    const isPaperFlowRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.isPaperFlowRequest(...args) : false;
    };
    const isProxySubmitRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.isProxySubmitRequest(...args) : false;
    };
    // ── 後台家族委派（ui-backoffice.js）──
    const logout = (...args) => {
      const b = getBackofficeApi();
      return b ? b.logout(...args) : undefined;
    };
    const toggleSelectAllRecords = (...args) => {
      const b = getBackofficeApi();
      return b ? b.toggleSelectAllRecords(...args) : undefined;
    };
    const isHistoryRecordSelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isHistoryRecordSelected(...args) : false;
    };
    const isHistoryBatchGroupSelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isHistoryBatchGroupSelected(...args) : false;
    };
    const toggleHistoryBatchGroupSelection = (...args) => {
      const b = getBackofficeApi();
      return b ? b.toggleHistoryBatchGroupSelection(...args) : undefined;
    };
    const changeHistoryPage = (...args) => {
      const b = getBackofficeApi();
      return b ? b.changeHistoryPage(...args) : undefined;
    };
    const openBatchPendingPrintPreview = (...args) => {
      const b = getBackofficeApi();
      return b ? b.openBatchPendingPrintPreview(...args) : undefined;
    };
    const isAdminPendingPageFullySelected = (...args) => {
      const b = getBackofficeApi();
      return b ? b.isAdminPendingPageFullySelected(...args) : false;
    };
    const syncHistorySelectionFromDom = (...args) => {
      const b = getBackofficeApi();
      return b ? b.syncHistorySelectionFromDom(...args) : undefined;
    };
    // ── 歷史家族委派（ui-history.js）──
    const dashboardStats = computed(() => {
      const h = getHistoryApi();
      return h ? h.dashboardStats.value : null;
    });
    // ── 歷史篩選層（ui-history.js）：filteredHistoryRecords 等 7 件──
    // ── 匯出 orchestration（ui-export.js）：五件匯出流程──
    // 延後建立：首次匯出操作時再 create（重 deps，只在點擊匯出時求值）
    let _exportApi = null;
    const getExportApi = () => {
      if (_exportApi) return _exportApi;
      if (!window.UiExport) {
        console.error('UiExport 未載入');
        return null;
      }
      _exportApi = window.UiExport.create({
        isAdmin, ensureActivityCoverReady, classAwayEvents, semesterEndDate,
        classList, requestsList, ensureDAC, mutualLeadEmails, teachersList, allSchedules,
        fetchQuotaLedgerHistoryForExport, getTeacherNameByEmail, resolveExchangeTargetCell,
        findBaseScheduleSlot, isCourseAdjustmentOnlyRequest, paperFlow, schoolExportStart,
        schoolExportEnd, buildDefaultInvigilationTitle, invigilationExportTitle,
        ensureInvigilationExportReady, schoolExportSelectedEmails, loading, loadingMessage,
        getScheduleForDate, getApprovedScheduleForDate, accountingExportLoading,
        ensureBillingReady, reportStartDate, reportEndDate, reportWeeksCount, reportMonth,
        calculateMonthlyReport, schoolSwaps, substitutionRecords, homeroomRecords,
         monthlyReportData, isSingleWeek, period8ExportLoading, ensurePeriod8Ready,
        isCombinedReturnRequest, fetchMutualQuotaLedger
      });
      return _exportApi;
    };
    // 延後建立：isProxySubmitRequest 來自 UiApproval（後方定義），首次取用時再 create
    let _historyApi = null;
    const getHistoryApi = () => {
      if (_historyApi) return _historyApi;
      if (!window.UiHistory) {
        console.error('UiHistory 未載入');
        return null;
      }
      _historyApi = window.UiHistory.create({
        computed,
        watch,
        user, allSchedules, schoolSwaps, isSingleWeek, substitutionRecords, isAdmin, isStaff, getTeacherNameByEmail, requestsList,
        isProxySubmitRequest, historyTypeFilter, historySearchQuery, historyFilterMode,
        historyFilterDate, isHistoryExchangeType, historyPageSize, historyPage,
        flattenBatchDisplayGroups,
        pendingSearchQuery, myPendingRequests, mySentRequests, adminPendingRequests,
        pendingMyPendingPage, pendingMySentPage, pendingAdminPage, pendingPageSize,
        dashboardScope, currentWeekDates,
        historyLoadedMonths, historyFullLoaded, historyMonthLoading, fetchHistoryMonth, mergeRequestsFromServer,
        ensureHistoryMonthLoaded, historyLoadingFull, applyInitialPayload, fetchInitialData,
      });
      return _historyApi;
    };
    const scheduleIndex = computed(() => {
      const a = getTimetableApi();
      return a ? a.scheduleIndex.value : window.DomainSchedule.buildScheduleIndex(allSchedules.value);
    });
    const getApprovedScheduleForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getApprovedScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) : null;
    };
    const getScheduleForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) : null;
    };
    const clearScheduleCache = () => { const a = getTimetableApi(); if (a) a.clearScheduleCache(); };

    // 併班上課只能指定同節、同併班課堂中的其他任課教師。
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const findCombinedReturnCandidates = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getTimetableApi();
      return a ? a.findCombinedReturnCandidates(...args) : [];
    };

    const weekScheduleGrid = computed(() => {
      if (!_setupReady.value) return {};;
      const a = getTimetableApi();
      return a ? a.weekScheduleGrid.value : {};
    });

    // 2A：三角候選簇已移至 ui-timetable.js（經 getTimetableApi 委派，呼叫端零修改）
    const triangleTeacherKey = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleTeacherKey(...args) : String(args[0] || '').trim().toLowerCase();
    };
    const triangleSlotKey = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleSlotKey(...args) : '';
    };
    const triangleCellIsUsable = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCellIsUsable(...args) : false;
    };
    const triangleCandidates = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidates.value : [];
    });
    const triangleCandidateB = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateB.value : null;
    });
    const triangleCandidateCList = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateCList.value : [];
    });
    const triangleCandidateC = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateC.value : null;
    });
    const triangleCandidateSearch = ref('');
    const triangleCandidateDisplayCount = ref(18);
    // 2A：三角參與者組已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleSourceParticipant = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleSourceParticipant(...args) : { email: '', teacherName: '', slot: {}, course: {} };
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateParticipant = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateParticipant(...args) : null;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateIsRestricted = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateIsRestricted(...args) : false;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleParticipants = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleParticipants.value : [null, null, null];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const buildTriangleOccupiedByTeacher = (...args) => {
      const a = getTimetableApi();
      return a ? a.buildTriangleOccupiedByTeacher(...args) : {};
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateSearchText = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateSearchText(...args) : '';
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateOptions = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateOptions.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const createTriangleScheduleGetter = (...args) => {
      const a = getTimetableApi();
      return a ? a.createTriangleScheduleGetter(...args) : (() => null);
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const validateTriangleSelection = (...args) => {
      const a = getTimetableApi();
      return a ? a.validateTriangleSelection(...args) : { ok: false, errors: ['三角調模組尚未載入'] };
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateCanMoveTo = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateCanMoveTo(...args) : false;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateSort = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateSort(...args) : 0;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidatePriority = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidatePriority(...args) : 2;
    };
    const triangleCandidateBPriority = (...args) => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateBPriority(...args) : 2;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleDirectExchangeKeys = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleDirectExchangeKeys.value : {};
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateCOptions = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateCOptions.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateCReadyCount = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateCReadyCount.value : 0;
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateBOptions = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateBOptions.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleCandidateBReadyCount = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleCandidateBReadyCount.value : 0;
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const displayedTriangleCOptions = computed(() => {
      const a = getTimetableApi();
      return a ? a.displayedTriangleCOptions.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const displayedTriangleBOptions = computed(() => {
      const a = getTimetableApi();
      return a ? a.displayedTriangleBOptions.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const selectTriangleCandidateB = (...args) => {
      const a = getTimetableApi();
      return a ? a.selectTriangleCandidateB(...args) : undefined;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const selectTriangleCandidateC = (...args) => {
      const a = getTimetableApi();
      return a ? a.selectTriangleCandidateC(...args) : undefined;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const loadMoreTriangleCandidates = (...args) => {
      const a = getTimetableApi();
      return a ? a.loadMoreTriangleCandidates(...args) : undefined;
    };
    // 2A：已移至 ui-timetable.js（watch 隨 create 註冊）
    const triangleLegs = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleLegs.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleValidation = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleValidation.value : { ok: false, errors: ['三角調模組尚未載入'] };
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const trianglePreviewRows = computed(() => {
      const a = getTimetableApi();
      return a ? a.trianglePreviewRows.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const trianglePreviewWeekDates = computed(() => {
      const a = getTimetableApi();
      return a ? a.trianglePreviewWeekDates.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleTimetablePreview = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleTimetablePreview.value : [];
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const openTriangleTimetablePreview = (...args) => {
      const a = getTimetableApi();
      return a ? a.openTriangleTimetablePreview(...args) : false;
    };
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const triangleReady = computed(() => {
      const a = getTimetableApi();
      return a ? a.triangleReady.value : false;
    });
    // 2A：已移至 ui-timetable.js（經 getTimetableApi 委派）
    const resetTriangleDraft = (...args) => {
      const a = getTimetableApi();
      return a ? a.resetTriangleDraft(...args) : undefined;
    };
    // 2A：formatTriangleSlot 已移至 ui-line-template.js（解構見 setup 頂部）
    // 2A：buildTriangleLineText 已移至 ui-line-template.js（解構見 setup 頂部）
    // 2A：submitTriangleRequest 已移至 ui-approval.js（經 getApprovalApi 委派）
    const submitTriangleRequest = (...args) => {
      const a = getApprovalApi();
      return a ? a.submitTriangleRequest(...args) : undefined;
    };

    // ── 班級視圖層（ui-classview.js）──
    // 延後建立：首次取用時再 create（重 deps，只在渲染班級視圖時求值）
    let _classViewApi = null;
    const getClassViewApi = () => {
      if (_classViewApi) return _classViewApi;
      if (!window.UiClassView) {
        console.error('UiClassView 未載入');
        return null;
      }
      _classViewApi = window.UiClassView.create({
        computed,
        isTriangleRequest, isCombinedReturnRequest,
        requestsList, allPendingRequests, isExchangeLikeRequest,
        substitutionRecords, getTeacherNameByEmail, classViewSchedules, selectedClass,
        selectedClassWeekDates, classSubstitutionRows, getWeekDayText, formatDateMMDD,
        isQuotaDeductFee, formatPeriodText, classUsesPublicData, classViewSchoolSwaps,
        schoolSwaps, buildClassSchoolSwapChanges, classScheduleRows, isSingleWeek
      });
      return _classViewApi;
    };
    // ── 送審流程（ui-submit.js）──
    // 延後建立：首次送審操作時再 create（重 deps，只在送審互動時求值）
    let _submitApi = null;
    const getSubmitApi = () => {
      if (_submitApi) return _submitApi;
      if (!window.UiSubmit) {
        console.error('UiSubmit 未載入');
        return null;
      }
      _submitApi = window.UiSubmit.create({
        computed, showToast, showConfirm, callGasApi, loading, loadingMessage,
        activeCell, inputRequestDate, allSchedules, getScheduleForDate, formatDateMMDD,
        getWeekDayText, exchangePeriodId, exchangeWeekOffset, exchangeTargetDate, isSingleWeek,
        consecAlertsA, consecAlertsB, isMutualCover, assignMutualDraftFromMatch, PERIOD8_FEE,
        pendingRequestData, showMatchModal, showCompareModal, getLeaveTimeDefaults,
        batchActiveSlotKey, batchSlots, batchAssignMode, getTeacherNameByEmail, batchSelectMode,
        DAC, isMutualActivitySlotInRange, mutualAwayClasses, substitutionRecords, allPendingRequests,
        currentWeekDates, compareWeekDatesA, compareWeekDatesB, isClassAwayOnDate, mutualDrafts,
        isAdmin, isQuotaDeductFee, isTimetableOnlyFee, successModalTitle, successModalMessage,
        lineCopyText, hasLineTemplate, showSuccessModal, successActionRequests, successFlowMode,
        notificationsSuppressed, openPaperPrintDraft, openPaperPrintDraftFromCompare,
        openPaperPrintDraftForSubmittedRequests, canStaffProxySubmit, shouldProxySubmitForLeave,
        getProxyActor, user, currentSemester, TIMETABLE_ONLY_FEE, ACTIVITY_PUBLIC_FEE,
        defaultSubFeeForReason, directApproveMode, directApproveSkipNotify, mutualSkipNotify,
        isSubmitting, optimisticUpsertRequest, sheetRequestToFront, deductMutualQuotaForRows,
        softRefreshInBackground, paperMode, paperFlow, getWeekDatesForCompare, toLocalDateStr,
        lookupTeacher, getTeacherSubjectByEmail, canStaffProxySubmit, proxyTargetEmail,
        batchCompareViewEmail, canOperateOnTeacherEmail, ensureProxyTargetForTeacher,
        isStaff, isProxySubmitGranted, QUOTA_DEDUCT_FEE, isPeriod8FeeLocked,
        quotaDeductPreview, batchSubFee,
        patchLocalMutualQuota,
        bustQuotaLedgerViewCache,
        getLineHandledSlot, shortTeacherName, buildAskFirstLineText,
        sendLineMessage, lineBatchParts, formatPeriodText,
      });
      return _submitApi;
    };
    // ── 資料層（ui-data.js）──
    // 延後建立：首次資料操作時再 create（重 deps；呼叫皆在 setup 完成後發生）
    let _dataApi = null;
    const getDataApi = () => {
      if (_dataApi) return _dataApi;
      if (!window.UiData) {
        console.error('UiData 未載入');
        return null;
      }
      _dataApi = window.UiData.create({
        computed, activeCell, matchMode, callGasApi, matchSearchQuery, exchangeWeekdayFilter,
        clearMatchPreview, triangleCellIsUsable, resetTriangleDraft, fetchRecommendations,
        teachersList, allSchedules, currentWeekDates, lookupTeacher, devTeacherQuery,
        isTriangleRequest, requestsList, isAdminDirectRequest, getTeacherNameByEmail,
        user, userRole, currentSemester, scheduleScope, semestersList, classDirectory, schoolSwaps,
        homeroomRecords, sortRequestListDesc, substitutionRecords, convertRequestsToSubstitutions,
        approvedConvertSig, bumpRequestsWatermarkFromRows, effectiveUserEmail,
        mySentRequests, myPendingRequests, adminPendingRequests, collapseTriangleRows,
        allPendingRequests, classAwayEvents, applySettings, requestWindowInfo,
        historyFullLoaded, stampIsNewer, clearScheduleCache, softSyncing,
        softSyncRequestsDelta, softSyncRequestsOnly, softSyncPendingOnly, isAdmin,
        loadHomeroomRecords, dataUpdatedAt, gasApiUrl, fetchMetaData,
        classViewSchedules, classViewSchoolSwaps, classViewLoadedClass,
        classViewSubstitutionRecords, mapPublicClassRequests, classViewClassAwayEvents,
        pendingClassView, selectedClass, cancelAll, loading, loadingMessage,
        classReadonlyMode, activeTab, fetchPublicClassData, resolvePendingClassView,
        fetchInitialData, logout, semesterForm, semesterModalMode, showSemesterModal,
        gsiButtonError, SOFT_REFRESH_MIN_GAP_MS,
        _getDataLoadSeq: () => _dataLoadSeq,
        _nextDataLoadSeq: () => { _dataLoadSeq += 1; return _dataLoadSeq; },
        _getRequestsWatermark: () => _requestsWatermark,
        _setRequestsWatermark: (v) => { _requestsWatermark = v; },
        dataRefreshing,
      });
      return _dataApi;
    };
    // ── 後台操作（ui-backoffice.js）──
    let _backofficeApi = null;
    const getBackofficeApi = () => {
      if (_backofficeApi) return _backofficeApi;
      if (!window.UiBackoffice) {
        console.error('UiBackoffice 未載入');
        return null;
      }
      _backofficeApi = window.UiBackoffice.create({
        computed, loading, user, cancelAll, callGasApi, clearSWR, isGsiInitialized, isGoogleGsiReady,
        suppressGsiAutoLogin, gsiLoggingIn, paginatedHistoryRecords, selectedRecordIds,
        historyPage, historyTotalPages, isAdmin, quotaAdjustForm, showQuotaLedgerModal,
        showQuotaAdjustModal, quotaAdjustSaving, teachersList, openQuotaLedger,
        paperMode, isMutualCover, batchSelectMode, ensureDAC, lookupTeacher,
        getTeacherNameByEmail, emptySlotForm, showEmptySlotModal, detailSubRecord,
        detailRequest, showDetailModal, pendingRequestData, toggleCourseAdjustmentOnly,
        isPeriod8FeeLocked, PERIOD8_FEE, batchSubFee, defaultSubFeeForReason,
        activeCell, inputRequestDate, selectedWeekDate, prepCompare, isSubmitting,
        mutualDrafts, mutualNote, mutualSkipNotify, loadingMessage, currentSemester,
        directApproveMode, optimisticUpsertRequest, sheetRequestToFront,
        deductMutualQuotaForRows, softRefreshInBackground, persistMutualPanelDraft,
        activityBalanceCtx, ACTIVITY_PUBLIC_FEE, successModalTitle, successModalMessage,
        hasLineTemplate, lineBatchParts, lineCopyText, showSuccessModal,
        buildLineBatchInviteText, DAC, successFlowMode, notificationsSuppressed,
        openPaperPrintMutualDrafts, getMutualPanelApi, userRole, allSchedules,
        schoolSwaps, classDirectory, classViewSchedules, classViewSchoolSwaps,
        classViewSubstitutionRecords, classViewClassAwayEvents, classViewLoadedClass,
        substitutionRecords, homeroomRecords, homeroomAssignSelections, mySentRequests,
        myPendingRequests, adminPendingRequests, batchGroupExpanded, showMatchModal,
        showPrintPreviewModal, printPreview, printPreviewImageBusy, proxyTargetEmail,
        proxyTargetQuery, showProxyTargetDropdown, classReadonlyMode, activeTab,
        readStoredTab, adminSubTab, readStoredAdminSubTab, _navPersistReady,
        persistNavPosition, isSimulating, originalUser, recomputeRequestBuckets,
        loadWeeklyData, selectedAdminPendingIds, openPaperPrintDraftForSubmittedRequests,
        paginatedAdminPending, isAdminPendingSelected,
        _nextDataLoadSeq: () => { _dataLoadSeq += 1; return _dataLoadSeq; },
        ref, callGasApiWithProgress, showImportTeachersModal, teacherExcelData, teacherExcelHeaders, teacherMappingFields, teacherImportPreview, showScheduleEditModal, scheduleForm, showTeacherModal, teacherModalMode, teacherForm, showOvertimePlanModal, overtimePlanTeacher, overtimePlanRows, overtimePlanPeriodEnd, overtimePlanUsesFixedSlots, showTeacherExpenseAuditModal, teacherExpenseAuditRows, teacherExpenseAuditSummary, accountingPeriod, reportMonth, accountingPlanOptions, excelData, excelHeaders, mappingFields, importPreview, bindFlagModal, showHistoryEditModal, semesterStartDate, semesterEndDate, leaveReasonOptions, getHistoryEditDefaultSubFee, historyEditForm, requestsList, fetchMutualQuotaLedger, _quotaLedgerCache, QUOTA_LEDGER_CACHE_MS, quotaLedgerTeacher, quotaLedgerRows, quotaLedgerLoading,
      });
      return _backofficeApi;
    };
    // ── 媒合面板（ui-match.js）──
    let _matchApi = null;
    const getMatchApi = () => {
      if (_matchApi) return _matchApi;
      if (!window.UiMatch) {
        console.error('UiMatch 未載入');
        return null;
      }
      _matchApi = window.UiMatch.create({
        computed, lookupTeacher, getTeacherNameByEmail, callGasApi, isAdmin, fetchQuotaSpendPreview,
        pendingRequestData, QUOTA_DEDUCT_FEE, isPeriod8FeeLocked, quotaPackPreview,
        quotaPackError, quotaPackLoading, matchMode, matchDisplayCount, MATCH_PAGE_SIZE,
        matchSearchQuery, recommendedTeachers, isMutualCover, recommendedExchangeList,
        getWeekDayText, formatPeriodText, exchangeWeekdayFilter,
        batchExchangePreviewSlotKey, compareWeekSelectionA, compareWeekSelectionB,
        activeCell, matchShowNoTeacherWarning, matchEmptyReasons, showMatchModal,
        getExchangeWeekDates, exchangeWeekOffset, formatDateMMDD, toLocalDateStr,
      });
      return _matchApi;
    };
    // R14：媒合抽屜 DOM 簇已移至 ui-match.js（經 getMatchApi 委派）
    const bindMatchNativeSelect = (...args) => {
      const a = getMatchApi();
      return a ? a.bindMatchNativeSelect(...args) : undefined;
    };
    const unbindMatchNativeSelect = (...args) => {
      const a = getMatchApi();
      return a ? a.unbindMatchNativeSelect(...args) : undefined;
    };
    const selectMatchPreviewSub = (...args) => {
      const a = getMatchApi();
      return a && a.selectMatchPreviewSub ? a.selectMatchPreviewSub(...args) : undefined;
    };
    const selectMatchPreviewExchange = (...args) => {
      const a = getMatchApi();
      return a && a.selectMatchPreviewExchange ? a.selectMatchPreviewExchange(...args) : undefined;
    };
    const clearMatchPreview = (...args) => {
      const a = getMatchApi();
      return a ? a.clearMatchPreview(...args) : undefined;
    };
    const closeMatchModal = (...args) => {
      const a = getMatchApi();
      return a ? a.closeMatchModal(...args) : undefined;
    };
    const getMatchSlotDateMMDD = (...args) => {
      const a = getMatchApi();
      return a ? a.getMatchSlotDateMMDD(...args) : '';
    };
    // ── 新手導覽（ui-tour.js）──
    let _tourApi = null;
    const getTourApi = () => {
      if (_tourApi) return _tourApi;
      if (!window.UiTour) {
        console.error('UiTour 未載入');
        return null;
      }
      _tourApi = window.UiTour.create({
        computed, callGasApi, activeTab, showMatchModal, inputRequestDate, matchMode,
        fetchRecommendations, clearMatchPreview, showCompareModal, matchSearchQuery,
        matchDisplayCount, recommendedTeachers, prepCompare, showSuccessModal,
        currentWeekDates, getTodayString, user, openPaperPrintDraft, paperFlow,
        showPrintPreviewModal, closePrintPreview, paperPrintDraft, paperSignatureByTeacher,
        printPreview, buildLineInviteText, lineCopyText, successModalTitle,
        successModalMessage, notificationsSuppressed, successFlowMode, hasLineTemplate,
        lineBatchParts, tourDemoInvite, getWeekDayText, scrollMainToTop, isAdmin,
        isStaff, classReadonlyMode, getTeacherNameByEmail, getScheduleForDate,
        showOnboarding,
        activeCell, closeMatchModal
      });
      return _tourApi;
    };
    // ── 增量同步（pending／requests／delta）（ui-sync.js）──
    let _syncApi = null;
    const getSyncApi = () => {
      if (_syncApi) return _syncApi;
      if (!window.UiSync) {
        console.error('UiSync 未載入');
        return null;
      }
      _syncApi = window.UiSync.create({
        computed, callGasApi, user, fetchPendingOnly, currentSemester, requestsList,
        sortRequestListDesc, recomputeRequestBuckets, bumpRequestsWatermarkFromRows,
        fetchInitialData, mergeRequestsFromServer, classAwayEvents, requestWindowInfo,
        stampIsNewer, clearScheduleCache, fetchRequestsDelta, watermarkAgeMs,
        _getRequestsWatermark: () => _requestsWatermark,
        _setRequestsWatermark: (v) => { _requestsWatermark = v; },
        serverRequestChangesLocal,
      });
      return _syncApi;
    };
    // ── 全校對調（ modal／存檔／班級異動）（ui-schoolswap.js）──
    let _schoolSwapApi = null;
    const getSchoolSwapApi = () => {
      if (_schoolSwapApi) return _schoolSwapApi;
      if (!window.UiSchoolSwap) {
        console.error('UiSchoolSwap 未載入');
        return null;
      }
      _schoolSwapApi = window.UiSchoolSwap.create({
        computed, callGasApi, currentWeekDates, schoolSwapModalMode, schoolSwapForm,
        showSchoolSwapModal, schoolSwaps, clearScheduleCache, softRefreshInBackground,
        schoolSwapWeekdayNumber, schoolSwapSaving, isSingleWeek
      });
      return _schoolSwapApi;
    };
    // ── 身份代理（ui-proxy.js）──
    let _proxyApi = null;
    const getProxyApi = () => {
      if (_proxyApi) return _proxyApi;
      if (!window.UiProxy) {
        console.error('UiProxy 未載入');
        return null;
      }
      _proxyApi = window.UiProxy.create({
        computed, callGasApi, user, getTeacherNameByEmail, isAdmin, canStaffProxySubmit,
        proxyTargetEmail, showProxyTargetDropdown, proxyTargetQuery, isStaff, teachersList,
        proxySubmitEmails, proxySubmitEnabledBy, proxySubmitEnabledAt,
        PROXY_SUBMIT_EMAILS_LS_KEY, loading, loadingMessage, onlineSubstitutionEnabled,
        proxyGrantQuery, lookupTeacher, parseTeacherSubjects, searchQuery, selectedSubject,
        canViewAllTimetables, isMutualCover, proxySubmitEnabled
      });
      return _proxyApi;
    };
    // ── 排課視圖（ui-schedule.js）──
    let _scheduleApi = null;
    const getScheduleApi = () => {
      if (_scheduleApi) return _scheduleApi;
      if (!window.UiSchedule) {
        console.error('UiSchedule 未載入');
        return null;
      }
      _scheduleApi = window.UiSchedule.create({
        computed, classDirectory, classScheduleRows, classSubstitutionRows,
        period8WeekDates, period8Ready,
        allSchedules, substitutionRecords, classAwayEvents, semesterEndDate,
        getTeacherNameByEmail, getClassAwayEventName, isSingleWeek, parseScheduleClasses,
        selectedClass, selectedClassWeekDates, classReadonlyMode, userRole,
        classViewSchoolSwaps, schoolSwaps, selectedWeekDate, toLocalDateStr, user,
        canViewAllTimetables, teachersList, lookupTeacher, parseTeacherSubjects,
        searchQuery, selectedSubject, isMutualCover,
        selectedClassDate, period8WeekDate,
        showMatchModal, activeCell, ttPageSize, TT_PAGE_SIZE_DEFAULT, ttPage,
      });
      return _scheduleApi;
    };
    // ── 認證導覽（ui-auth.js）──
    let _authApi = null;
    const getAuthApi = () => {
      if (_authApi) return _authApi;
      if (!window.UiAuth) {
        console.error('UiAuth 未載入');
        return null;
      }
      _authApi = window.UiAuth.create({
        googleClientId, gsiButtonError, gsiLoggingIn, classReadonlyMode,
        gsiButtonReady, selectedMobileDay, activeTab, adminSubTab, TAB_LS_KEY,
        ADMIN_SUBTAB_LS_KEY, VALID_TABS, VALID_ADMIN_SUBTABS, allowedHdList,
        parseAllowedHd, proxySubmitEmails, PROXY_SUBMIT_EMAILS_LS_KEY,
        proxySubmitEnabledBy, proxySubmitEnabledAt, onlineSubstitutionEnabled,
        isEmailDomainAllowed, resetAppState, loading, loadingMessage, isTokenExpired
      });
      return _authApi;
    };
    // ── 代導空堂（ui-homeroom.js）──
    let _homeroomApi = null;
    const getHomeroomApi = () => {
      if (_homeroomApi) return _homeroomApi;
      if (!window.UiHomeroom) {
        console.error('UiHomeroom 未載入');
        return null;
      }
      _homeroomApi = window.UiHomeroom.create({
        computed, callGasApi, isAdmin, user, homeroomRecordsLoading, currentSemester,
        homeroomRecords, loadWeeklyData, homeroomAssignSelections, teachersList,
        extractNameFromFormatted, getHomeroomCoverCandidates, teachersListDetails,
        manualHomeroomForm, getTodayYmdStr, showManualHomeroomModal,
        getLeaveTimeDefaults,
        reportStartDate, reportEndDate, isBillableHomeroomRecord, activeCell,
        inputRequestDate, allSchedules, pendingRequestData, matchMode,
        isBatchGroupExpanded, makeBatchItemRow, exchangeWeekOffset, getExchangeWeekDates,
        toLocalDateStr, isSingleWeek, getScheduleForDate, getTeacherNameByEmail,
        isMutualCover, mutualAwayClasses, batchSlots, QUOTA_DEDUCT_FEE, lookupTeacher,
        isPeriod8FeeLocked, ACTIVITY_PUBLIC_FEE, batchSubFee,
        isCourseAdjustmentOnlyRequest, isEmptySlotAssignmentRequest,
      });
      return _homeroomApi;
    };
    // R16：代導判定 7 件已移至 ui-homeroom.js（經 getHomeroomApi 委派）
    const homeroomTimeRangeBounds = (...args) => {
      const a = getHomeroomApi();
      return a ? a.homeroomTimeRangeBounds(...args) : null;
    };
    const homeroomFullDayEndMinutes = (...args) => {
      const a = getHomeroomApi();
      return a ? a.homeroomFullDayEndMinutes(...args) : 16 * 60;
    };
    const isFullDayHomeroomLeave = (...args) => {
      const a = getHomeroomApi();
      return a ? a.isFullDayHomeroomLeave(...args) : false;
    };
    const getTeacherJobTitleByEmail = (...args) => {
      const a = getHomeroomApi();
      return a ? a.getTeacherJobTitleByEmail(...args) : '';
    };
    const chineseClassNumber = (...args) => {
      const a = getHomeroomApi();
      return a ? a.chineseClassNumber(...args) : 0;
    };
    const getHomeroomClassCodes = (...args) => {
      const a = getHomeroomApi();
      return a ? a.getHomeroomClassCodes(...args) : [];
    };
    const isHomeroomTeacher = (...args) => {
      const a = getHomeroomApi();
      return a ? a.isHomeroomTeacher(...args) : false;
    };
    // ── 經費報表（ui-report.js）──
    let _reportApi = null;
    const getReportApi = () => {
      if (_reportApi) return _reportApi;
      if (!window.UiReport) {
        console.error('UiReport 未載入');
        return null;
      }
      _reportApi = window.UiReport.create({
        computed, isValidReportPeriod, reportStartDate, reportEndDate, user, isAdmin,
        currentSemester, fetchInitialData, applyInitialPayload, period8Ready, period8Loading,
        requestWindowInfo,
        ensureBillingReady, cancelScheduledMonthlyReport, monthlyReportKey, monthlyReportLoading,
        monthlyReportData, reportWeeksCount, teachersList, allSchedules, schoolSwaps,
        substitutionRecords, reportMonth, getTeacherNameByEmail, classAwayEvents,
        semesterEndDate, isSingleWeek, schoolExportTeacherFilter, schoolExportSelectedEmails,
        schoolExportStart, schoolExportEnd, schoolExportIncludeWeekend,
        schoolExportOnlyChanged, getApprovedScheduleForDate, isClassAwayOnDate, ensureDAC,
        semestersList, ensureExportReady,
        _getMonthlyReportCalculationId: () => monthlyReportCalculationId,
        _nextMonthlyReportCalculationId: () => { monthlyReportCalculationId += 1; return monthlyReportCalculationId; },
        _getMonthlyReportLastCalculationKey: () => monthlyReportLastCalculationKey,
        _setMonthlyReportLastCalculationKey: (v) => { monthlyReportLastCalculationKey = v; },
        activeTab, adminSubTab,
        accountingPeriodMonth, nextTick,
        _isNav: () => accountingPeriodNavigation,
        _setNav: (v) => { accountingPeriodNavigation = v; },
      });
      return _reportApi;
    };
    // ── 列印紙本（ui-print.js）──
    let _printApi = null;
    const getPrintApi = () => {
      if (_printApi) return _printApi;
      if (!window.UiPrint) {
        console.error('UiPrint 未載入');
        return null;
      }
      _printApi = window.UiPrint.create({
        getTeacherNameByEmail, getTeacherSubjectByEmail, getTeacherJobTitleByEmail,
        getWeekDayText, allSchedules, isAdmin, getScheduleForDate, selectedRecordIds,
        substitutionRecords, requestsList, markLocalPrinted, loading, loadingMessage,
        printPreview, showPrintPreviewModal, printPreviewImageBusy, showDetailModal,
        showCompareModal, syncHistorySelectionFromDom, buildPaperRecordsForSubmittedRequests,
        isCombinedReturnRequest, isCourseAdjustmentOnlyRequest, pendingRequestData,
        defaultSubFeeForReason, batchSlots, decodePaperTimeKey, paperPrintDraft,
        paperSignatureByTeacher, successActionRequests, openPaperPrintDraftForSubmittedRequests,
        showSuccessModal, showTriangleTimetablePreview, triangleParticipants, triangleLegs,
        triangleReason, triangleNote, paperFlow, addEventToCalendar,
        triangleReady, mutualDrafts, mutualNote, ensurePrintReady,
        detailRequest, detailSubRecord, isTriangleRequest, isExchangeLikeRequest,
      });
      return _printApi;
    };
    // ── 互動（ui-interaction.js）──
    let _interactApi = null;
    const getInteractApi = () => {
      if (_interactApi) return _interactApi;
      if (!window.UiInteraction) {
        console.error('UiInteraction 未載入');
        return null;
      }
      _interactApi = window.UiInteraction.create({
        showMatchModal, activeCell, matchMode, pendingClassView, activeTab, selectedClass,
        classReadonlyMode, getTimetableApi, classSchedules, selectedClassWeekDates,
        classSubstitutionMap, detailSubRecord, detailRequest, showDetailModal,
        resolveDetailRequest, classViewerReadonly, getTeacherNameByEmail, inputRequestDate,
        exchangeTargetDate, exchangeWeekOffset, exchangePeriodId, exchangeTeacherEmail,
        matchPreview, recommendedTeachers, matchSearchQuery, matchDisplayCount,
        fetchRecommendations, isClassAwayOnDate, canOperateOnTeacherEmail,
        ensureProxyTargetForTeacher, user, isAdmin, isScheduleEditMode, openScheduleEditModal,
        isMutualLead, getMutualDraftAt, removeMutualDraft, isMutualActivitySlotInRange,
        showCompareModal, batchSelectMode, batchFlowMode, toggleBatchSlot,
        canStartSecondSubFromDetail, exchangeTeacherClasses, allSchedules, openEmptySlotAssign,
        displayTimetableTeachers, ttPageSize, TT_PAGE_SIZE_DEFAULT, ttPage, formatDateMMDD,
        teachersList,
        classList,
      });
      return _interactApi;
    };

    // R14：媒合抽屜 DOM 簇已移至 ui-match.js（wrapper 見 getMatchApi 後方；watch 續留 setup 註冊）
    watch(showMatchModal, (open) => {
      if (open) {
        bindMatchNativeSelect();
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(paintMatchSourceDom);
        }
      } else {
        clearMatchPreview();
        unbindMatchNativeSelect();
        try {
          document.querySelectorAll('.grid-cell-class.is-match-source')
            .forEach((el) => {
              el.classList.remove('is-match-source', 'is-match-exchange-source');
            });
        } catch (e) { /* ignore */ }
      }
    });

    // ── 各 Modal：Esc 關閉 + 焦點陷阱 + aria-modal ──
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const bindVueModalA11y = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.bindVueModalA11y(...args) : undefined;
    };
    // setup 執行期不直接呼叫（factory 依賴後方宣告；掛載後 DOM 就緒才綁定，語義等價）
    onMounted(() => {
      bindVueModalA11y(showMatchModal, () => { closeMatchModal(); }, '.match-drawer-overlay', '智慧媒合');
      bindVueModalA11y(showCompareModal, () => { closeCompareModal(); }, '[data-tour="compare-modal"]', '模擬對照');
      bindVueModalA11y(showLineMessageModal, () => { showLineMessageModal.value = false; }, '[data-tour="line-message-modal"]', 'LINE 訊息');
      bindVueModalA11y(showSuccessModal, () => { showSuccessModal.value = false; }, '[data-tour="success-modal"]', '送出成功');
    });
    // 其餘後台 modal：開啟時抓目前顯示的 .modal-overlay
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const bindFlagModal = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.bindFlagModal(...args) : undefined;
    };
    onMounted(() => {
      bindFlagModal(showDetailModal, () => { showDetailModal.value = false; }, '異動詳情');
      bindFlagModal(showPrintPreviewModal, () => { closePrintPreview(true); }, '調代課單列印預覽');
      bindFlagModal(showSemesterModal, () => { showSemesterModal.value = false; }, '學期設定');
    });
    const isMatchPreviewSelected = () => false;
    // 媒合來源格：開抽屜時 DOM 標一次（不在模板每格呼叫 isMatchSourceCell）
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const paintMatchSourceDom = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.paintMatchSourceDom(...args) : undefined;
    };
    const isMatchSourceCell = () => false;
    const isMatchSourceEntry = () => false;
    const isMatchHoverCell = () => false;
    const isMatchHoverEntry = () => false;
    watch([showMatchModal, matchMode, activeCell], () => {
      if (showMatchModal.value) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(paintMatchSourceDom);
        } else {
          paintMatchSourceDom();
        }
      }
    });

    const isAwayClassCell = (className, dateStr, period) => {
      const a = getTimetableApi();
      return a ? a.isAwayClassCell(className, dateStr, period) : false;
    };
    const getClassCellClassForDate = (teacherEmail, dateStr, period, dayOfWeek) => {
      const a = getTimetableApi();
      return a ? a.getClassCellClassForDate(teacherEmail, dateStr, period, dayOfWeek) : 'is-empty';
    };

    const getClassCellClassForClass = (className, day, period) => {
      const a = getTimetableApi();
       return a
         ? a.getClassCellClassForClass({ classSchedules, selectedClassWeekDates, classSubstitutionMap, isClassAwayOnDate }, className, day, period)
        : 'is-empty';
    };

    // 點擊課表格子的處理邏輯
    const changeClassWeek = (offset) => {
      const d = new Date(selectedClassDate.value + 'T00:00:00');
      d.setDate(d.getDate() + offset * 7);
      selectedClassDate.value = toLocalDateStr(d);
    };

    const changePeriod8Week = (offset) => {
      const d = new Date(period8WeekDate.value + 'T00:00:00');
      d.setDate(d.getDate() + offset * 7);
      period8WeekDate.value = toLocalDateStr(d);
    };

    const goToPeriod8ThisWeek = () => {
      period8WeekDate.value = toLocalDateStr(new Date());
    };

    const goToClassThisWeek = () => {
      selectedClassDate.value = toLocalDateStr(new Date());
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const applyClassViewFromUrl = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.applyClassViewFromUrl(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const resolvePendingClassView = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.resolvePendingClassView(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const getClassReadonlyLink = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.getClassReadonlyLink(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const copyClassReadonlyLink = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.copyClassReadonlyLink(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const handleClassCellClick = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.handleClassCellClick(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const handlePeriod8CellClick = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.handlePeriod8CellClick(...args) : undefined;
    };

    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const handleCellClick = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.handleCellClick(...args) : undefined;
    };

    // 當前異動需再次轉移（二次調代課）— ui-timetable
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const startSecondSub = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.startSecondSub(...args) : undefined;
    };

    // 載入欲對調教師的所有排課節次 (僅限同班有課)
    // 2A：已移至 ui-interaction.js（經 getInteractApi 委派）
    const loadTeacherClassesForExchange = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getInteractApi();
      return a ? a.loadTeacherClassesForExchange(...args) : undefined;
    };


    /** 批次一次全部同意／全部拒絕 */
    // 月底大鐘點統計（domain-billing 延後載入）
    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const ensureBillingReady = (...args) => {
      const a = getExportApi();
      return a ? a.ensureBillingReady(...args) : Promise.reject(new Error('匯出模組未載入'));
    };
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const getBillingRequestWindow = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.getBillingRequestWindow(...args) : undefined;
    };
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const billingRequestWindowIsLoaded = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.billingRequestWindowIsLoaded(...args) : undefined;
    };
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const ensureBillingRequestsForPeriod = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.ensureBillingRequestsForPeriod(...args) : undefined;
    };
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const ensurePeriod8Ready = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.ensurePeriod8Ready(...args) : undefined;
    };
    watch([activeTab, adminSubTab], ([tab, subTab]) => {
      if (tab === 'admin' && subTab === 'period8') {
        ensurePeriod8Ready().catch((error) => console.error('第八節模組載入失敗：', error));
      }
    }, { immediate: true });
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const calculateMonthlyReport = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.calculateMonthlyReport(...args) : undefined;
    };

    // 匯出 Excel：1～7 一表＋第8節明細一表（誰上誰拿）
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const exportReportToExcel = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.exportReportToExcel(...args) : undefined;
    };

    // 匯出會計版六類 Excel（套用上方日期區間；扣勞健保／實際金額留白）
    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const exportSubFeeToExcel = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportSubFeeToExcel(...args) : undefined;
    };

    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const exportPeriod8Accounting = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportPeriod8Accounting(...args) : undefined;
    };
    // 全校課表彙整 Word 匯出（後台）：.docx、試算表順序、可選教師
    // export 腳本延後載入：預設區間空，進後台或點「本週」再填
    const schoolExportStart = ref('');
    const schoolExportEnd = ref('');
    const schoolExportIncludeWeekend = ref(false);
    const schoolExportOnlyChanged = ref(false);
    const schoolExportSelectedEmails = ref([]); // 小寫 email，預設全選（見 watch）
    const schoolExportTeacherFilter = ref('');
    let _schoolExportKnownEmails = {};

    watch(teachersList, (list) => {
      if (!list || !list.length) return;
      const all = list.map(t => String(t.email || '').toLowerCase()).filter(Boolean);
      const selected = {};
      schoolExportSelectedEmails.value.forEach(e => { selected[e] = 1; });
      const known = _schoolExportKnownEmails;
      const isFirst = Object.keys(known).length === 0;
      const next = [];
      all.forEach(em => {
        if (isFirst || selected[em] || !known[em]) next.push(em);
      });
      schoolExportSelectedEmails.value = next;
      const nextKnown = {};
      all.forEach(em => { nextKnown[em] = 1; });
      _schoolExportKnownEmails = nextKnown;
    }, { immediate: true });

    const filteredSchoolExportTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getReportApi();
      return a ? a.filteredSchoolExportTeachers.value : [];
    });

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const isSchoolExportTeacherSelected = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.isSchoolExportTeacherSelected(...args) : undefined;
    };

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const toggleSchoolExportTeacher = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.toggleSchoolExportTeacher(...args) : undefined;
    };

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const selectAllSchoolExportTeachers = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.selectAllSchoolExportTeachers(...args) : undefined;
    };

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const clearSchoolExportTeachers = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.clearSchoolExportTeachers(...args) : undefined;
    };

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const setSchoolExportThisWeek = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.setSchoolExportThisWeek(...args) : undefined;
    };

    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const exportSchoolTimetableWord = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.exportSchoolTimetableWord(...args) : undefined;
    };

    // 活動輪值通知單（套版 Word）：從空堂事件列一鍵匯出
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const ensureActivityCoverReady = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.ensureActivityCoverReady(...args) : undefined;
    };
    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const fetchQuotaLedgerHistoryForExport = (...args) => {
      const a = getExportApi();
      return a ? a.fetchQuotaLedgerHistoryForExport(...args) : Promise.reject(new Error('匯出模組未載入'));
    };
    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const exportActivityCoverWord = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportActivityCoverWord(...args) : undefined;
    };

    // 段考監考表：與全校課表共用 schoolExportStart/End；標題在點匯出後再輸入
    // 預設標題依學期代號：114-1 → 114學年度第一學期；114-2 → 第二學期
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const buildDefaultInvigilationTitle = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.buildDefaultInvigilationTitle(...args) : undefined;
    };
    const invigilationExportTitle = ref('');
    // 2A：已移至 ui-report.js（經 getReportApi 委派）
    const ensureInvigilationExportReady = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getReportApi();
      return a ? a.ensureInvigilationExportReady(...args) : undefined;
    };
    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const exportInvigilationWorkbook = async (...args) => {
      const a = getExportApi();
      return a ? await a.exportInvigilationWorkbook(...args) : undefined;
    };

    // 將日期字串轉為該週週一 YYYY-MM-DD
    // 2A：getMonday 已刪除（零呼叫死碼；週一計算請用 DateUtils.mondayOfWeek）

    // 產生學校原版代（調、補）課請示單 HTML
    // ── 橋接外部印表模組 (已抽離至 print-helper.js) ─────────────────────
    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const generateFormHtml = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.generateFormHtml(...args) : undefined;
    };

    /** P1：列印／匯出前確保延後腳本已載入 */
    const ensurePrintReady = async () => {
      if (typeof window.ensurePrintHelper === 'function') {
        await window.ensurePrintHelper();
      }
      if (typeof window.generateFormHtml !== 'function') {
        throw new Error('列印模組尚未載入');
      }
    };
    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const createPrintContext = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.createPrintContext(...args) : undefined;
    };
    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const ensureExportReady = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.ensureExportReady(...args) : undefined;
    };

    /** 歷史紀錄：批次後發通知信（依受邀人合併；寄前同步 DOM 勾選） */
    // 2A：sendSelectedBatchNotices 已移至 ui-approval.js（下方解構取回）

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const printSelectedForms = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.printSelectedForms(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openPrintPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openPrintPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openHistoryPrintPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openHistoryPrintPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const closePrintPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.closePrintPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const confirmPrintPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.confirmPrintPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const getPrintPreviewPngBlob = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.getPrintPreviewPngBlob(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const getPrintPreviewFileName = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.getPrintPreviewFileName(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const downloadPrintPreviewImage = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.downloadPrintPreviewImage(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const copyPrintPreviewImage = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.copyPrintPreviewImage(...args) : undefined;
    };

    // 2A：decodePaperTimeKey 已移至 date-utils.js（解構見 setup 頂部）
    const decodePaperTimeKey = window.DateUtils.decodePaperTimeKey;

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const buildPaperDraftRecords = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.buildPaperDraftRecords(...args) : undefined;
    };

    // 2A：已移至 ui-export.js（經 getExportApi 委派）
    const buildPaperRecordsForSubmittedRequests = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getExportApi();
      return a ? a.buildPaperRecordsForSubmittedRequests(...args) : [];
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const buildTrianglePaperDraftRecords = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.buildTrianglePaperDraftRecords(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openPaperPrintDraft = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openPaperPrintDraft(...args) : undefined;
    };

    const openPaperPrintDraftForSubmittedRequests = (requests) =>
      openPaperPrintDraft(buildPaperRecordsForSubmittedRequests(requests), { canPrint: true });

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openPaperPrintForRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openPaperPrintForRequest(...args) : undefined;
    };

    const openPaperPrintDraftFromCompare = () => openPaperPrintDraft(null, { returnTo: 'compare', canPrint: false });

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openTrianglePaperPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openTrianglePaperPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openPaperPrintMutualDrafts = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openPaperPrintMutualDrafts(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const printPaperDraft = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.printPaperDraft(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openPaperDraftPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openPaperDraftPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const openSuccessPrintPreview = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.openSuccessPrintPreview(...args) : undefined;
    };

    // 2A：已移至 ui-print.js（經 getPrintApi 委派）
    const addSuccessToCalendar = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getPrintApi();
      return a ? a.addSuccessToCalendar(...args) : undefined;
    };


    // ════════════════════════════════════════
    // §5 輔助函式 / 載入資料 / 生命週期
    // ════════════════════════════════════════
// --- 輔助與生命週期函數 ---

    // 2A：getStatusText 已移至 ui-list-helpers.js（解構見 setup 頂部）

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const changeMatchMode = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.changeMatchMode(...args) : undefined;
    };

    const changeWeek = (direction) => {
      const current = new Date(selectedWeekDate.value);
      current.setDate(current.getDate() + (direction * 7));
      selectedWeekDate.value = toLocalDateStr(current);
      // 不需要重新拉資料，課表格子由 currentWeekDates computed 自動更新
    };

    const getPeriodTimeSpan = (p) => window.DateUtils.getPeriodTimeSpan(p);
    const getWeekDayText = (d) => window.DateUtils.getWeekDayText(d);
    const formatDateMMDD = (dateStr) => window.DateUtils.formatDateMMDD(dateStr);
    const formatMoney = (value) => {
      const number = Number(String(value == null ? '' : value).replace(/,/g, '').trim());
      return Number.isFinite(number) ? number.toLocaleString('zh-TW') : '0';
    };
    const getTodayString = () => window.DateUtils.getTodayString();

    // P4：name/loginEmail → teacher O(1) lookup.
    const teachersByEmail = computed(() => {
      if (!_setupReady.value) return {};
      const a = getDataApi();
      return a ? a.teachersByEmail.value : {};
    });
    const lookupTeacher = (email) => {
      if (!email) return null;
      const m = teachersByEmail.value;
      const key = String(email).trim();
      return m[key] || m[key.toLowerCase()] || null;
    };

    const getTeacherNameByEmail = (email) => {
      if (!email) return '';
      const t = lookupTeacher(email);
      return t ? t.name : String(email).split('@')[0];
    };

    const getTeacherSubjectByEmail = (email) => {
      if (!email) return '';
      const t = lookupTeacher(email);
      return t ? (t.subject || t['授課科目'] || t['任課科目'] || '') : '';
    };

    // 基本鐘點取教師設定；固定超鐘點已設定時優先顯示學期快照。
    const teacherTimetableHours = computed(() => {
      if (!_setupReady.value) return {};;
      const a = getDataApi();
      return a ? a.teacherTimetableHours.value : {};
    });
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const getTeacherTimetableHours = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.getTeacherTimetableHours(...args) : undefined;
    };

    // R16：代導判定已移至 ui-homeroom.js（wrapper 見 getHomeroomApi 後方）
    const getTeacherIdentityTooltip = (email) => {
      const jobTitle = String(getTeacherJobTitleByEmail(email) || '').trim();
      const subject = String(getTeacherSubjectByEmail(email) || '').trim();
      return `職務：${jobTitle || '未填寫'}\n科目：${subject || '未填寫'}`;
    };
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const getRealTeacherName = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.getRealTeacherName(...args) : undefined;
    };

    // 2A：科目色票＋配色已移至 ui-style.js（解構見 setup 頂部）

    const normalizeSubjectColorName = window.UiStyle.normalizeSubjectColorName;
    const getSubjectStyle = window.UiStyle.getSubjectStyle;
    const getClassBadgeStyle = window.UiStyle.getClassBadgeStyle;

    // 模擬身份：搜尋過濾（避免一次渲染 60+ li）
    const devTeacherQuery = ref('');
    const filteredDevTeachers = computed(() => {
      if (!_setupReady.value) return [];;
      const a = getDataApi();
      return a ? a.filteredDevTeachers.value : [];
    });


    // ── 資料載入（SWR + FieldMap）──────────────────────────
    /** 教學組直接申請／直接核准：進歷史與課表，不進「送出的申請」 */
    // 2A：已移至 ui-list-helpers.js（UiListHelpers 直取，無需委派）
    const isAdminDirectRequest = window.UiListHelpers.isAdminDirectRequest;

    // 2A：紙本判定已移至 ui-approval.js（UiApproval.create 內聚；此處由下方解構取回）
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const getTriangleGroupRequests = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.getTriangleGroupRequests(...args) : undefined;
    };

    // （isPaperFlowValue／isPaperFlowRequest 見上方案例，UiApproval.create 內聚）

    /** 目前 UI 身分 Email（含模擬身份；列表／權限一律用此，不用 JWT 原帳） */
    const effectiveUserEmail = computed(() => {
      if (!user.value || !user.value.email) return '';
      return String(user.value.email).toLowerCase().trim();
    });

    /**
     * 是否為「我送出的申請」（email＝effectiveUserEmail，模擬時用被模擬者）
     * - 代申請：只有代申請人是我才算（請假人本人不進此列表）
     * - 一般：申請人是我，且不是別人代送
     */
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const isMySentRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.isMySentRequest(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const applyInitialPayload = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.applyInitialPayload(...args) : undefined;
    };

    // ── 樂觀更新：本地改 state，背景再 soft refresh ──
    /**
     * 列表排序：申請時間倒序；同批次／同單號根（SUB1234-1、-2）聚攏
     * 組內再依異動日期、節次正序（同批節次依序看）
     */
    // 2A：申請清單排序／分組已移至 ui-list-helpers.js（解構見 setup 頂部）
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const recomputeRequestBuckets = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.recomputeRequestBuckets(...args) : undefined;
    };

    const sheetRequestToFront = (nr) => window.FieldMap.mapRequest(nr);

    const optimisticUpsertRequest = (frontReq) => {
      const list = requestsList.value.slice();
      const idx = list.findIndex(r => r.id === frontReq.id);
      if (idx >= 0) list[idx] = Object.assign({}, list[idx], frontReq);
      else list.unshift(frontReq);
      requestsList.value = list;
      recomputeRequestBuckets();
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const optimisticPatchRequestStatuses = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.optimisticPatchRequestStatuses(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const optimisticPatchRequestStatus = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.optimisticPatchRequestStatus(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const optimisticPatchTriangleGroup = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.optimisticPatchTriangleGroup(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const optimisticRemoveRequest = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.optimisticRemoveRequest(...args) : undefined;
    };

    /**
     * 寫入後背景同步（局部優先）
     * - 預設：pendingOnly → 失敗再 requestsOnly → 再全量
     * - requestsOnly:true：跳過 pending，直接申請窗對齊（核准後課表異動）
     * - force:true：課表／教師結構有變，全量重抓
     * - skip:true 略過（批次內層用）
     * - 最短間隔 3.5s，避免同意→核准連打兩次整包
     */
    const SOFT_REFRESH_MIN_GAP_MS = 3500;
    let _dataLoadSeq = 0;
    /** 畫面「更新於 HH:mm」；手動刷新／softRefresh／全量載入成功時寫入 */
    const dataUpdatedAt = ref(null);
    const dataRefreshing = ref(false);
    /** 背景 softRefresh 進行中（不擋全螢幕，只顯示 nav 小標） */
    const softSyncing = ref(false);
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const markDataUpdated = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.markDataUpdated(...args) : undefined;
    };
    const dataUpdatedLabel = computed(() => {
      if (!_setupReady.value) return '';
      const a = getDataApi();
      return a ? a.dataUpdatedLabel.value : '';
    });
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const manualRefreshData = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.manualRefreshData(...args) : undefined;
    };
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const softRefreshInBackground = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.softRefreshInBackground(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const resolveUserRoleFromTeachers = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.resolveUserRoleFromTeachers(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const loadSemesters = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.loadSemesters(...args) : undefined;
    };

    // 2A：已移至 ui-classview.js（經 getClassViewApi 委派）
    const mapPublicClassRequests = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getClassViewApi();
      return a ? a.mapPublicClassRequests(...args) : [];
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const applyClassPayload = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.applyClassPayload(...args) : undefined;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const preflightGoogleLogin = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.preflightGoogleLogin(...args) : undefined;
    };

    // 非管理員監聽預設學期變動
    watch([semestersList, isAdmin], ([list, admin]) => {
      if (admin) return;
      const def = list.find(s => s.isDefault);
      if (def && def.id !== currentSemester.value) {
        currentSemester.value = def.id;
        localStorage.setItem('jcjh_semester', def.id);
      }
    });

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const loadPublicClassData = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.loadPublicClassData(...args) : undefined;
    };

    const selectClassForView = (className) => {
      const cls = String(className || '').trim();
      if (!cls) return;
      selectedClass.value = cls;
      if (user.value && classUsesPublicData.value) {
        loadPublicClassData(cls).catch(function () {});
      }
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const loadWeeklyData = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.loadWeeklyData(...args) : undefined;
    };

    const cellFromGrid = (email, day, period) => {
      const a = getTimetableApi();
      return a ? a.cellFromGrid(email, day, period) : null;
    };

    // 連線設定固定內建，不寫入／不讀取 localStorage
    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const saveClientSettings = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.saveClientSettings(...args) : undefined;
    };


    // 切換學期
    watch(currentSemester, (newSem, oldSem) => {
      if (newSem && newSem !== oldSem) {
        localStorage.setItem('jcjh_semester', newSem);
        if (typeof cancelAll === 'function') cancelAll();
        loadWeeklyData().catch(function () {});
      }
    });

    // 學期管理函數
    const openAddSemesterModal = () => {
      semesterModalMode.value = 'add';
      semesterForm.value = { id: '', name: '', startDate: '', endDate: '' };
      showSemesterModal.value = true;
    };

    const openEditSemesterModal = (sem) => {
      semesterModalMode.value = 'edit';
      semesterForm.value = { id: sem.id, name: sem.name, startDate: sem.startDate, endDate: sem.endDate };
      showSemesterModal.value = true;
    };

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const saveSemester = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.saveSemester(...args) : undefined;
    };
    

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const deleteSemester = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.deleteSemester(...args) : undefined;
    };
    

    // 2A：已移至 ui-data.js（經 getDataApi 委派）
    const setDefaultSemester = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getDataApi();
      return a ? a.setDefaultSemester(...args) : undefined;
    };

    // ── 空堂事件管理（ui-activity.js → UiClassAwayAdmin）──
    const {
      showClassAwayModal, classAwayModalMode, classAwayPeriodOptions, classAwayForm,
      openAddClassAwayModal, openEditClassAwayModal, toggleClassAwayFormClass,
      isClassAwayFormClassSelected, selectClassAwayGrade,
      toggleClassAwayPeriod, isClassAwayPeriodSelected, selectClassAwayPeriodRange,
      setClassAwayPeriodBoundary, setClassAwayPeriodMode,
      clearClassAwayPeriods, isClassAwayFullDaySelected, classAwayPeriodLabel,
      classAwayDailyPeriodLabel, classAwayBoundaryPeriodLabel, isClassAwayRangeEvent,
      saveClassAwayEvent, deleteClassAwayEvent
    } = window.UiClassAwayAdmin.create({
      ref,
      callGasApi,
      showToast,
      showConfirm,
      classAwayEvents,
      classList,
      currentSemester,
      loading,
      clearScheduleCache,
      softRefreshInBackground
    });

    // ── 活動互代 ↔ 空堂橋接（ui-activity.js → UiMutualBridge）──
    const {
      mutualImportableEvents, mutualImportEventId,
      applyClassAwayEventById, applyClassAwayToMutualPanel, mutualCoverStats
    } = window.UiMutualBridge.create({
      ref,
      computed,
      showToast,
      classAwayEvents,
      classList,
      semesterEndDate,
       mutualActivityStart,
       mutualActivityEnd,
       mutualActivityStartPeriod,
       mutualActivityEndPeriod,
       mutualActivityPeriodMode,
       mutualActivityPeriods,
      mutualAwayClasses,
      mutualNote,
      mutualLeadEmails,
      mutualDrafts,
      isMutualCover,
      batchSlots,
      allSchedules,
      requestsList,
      teachersList,
      currentWeekDates,
      getScheduleForDate,
      isSingleWeek,
      persistMutualPanelDraft,
      clearScheduleCache,
      ensureMutualActivityRange,
      DAC
    });
    _getMutualImportEventId = () => (mutualImportEventId && mutualImportEventId.value) || '';

    // ════════════════════════════════════════
    // §6 後台：核准 / 匯入 / 教師 / 課表編輯
    // ════════════════════════════════════════

    // ── 待辦摘要 / 格子白話 / 行政批次 ──
    // 請假課堂：07/23(四) 第3節 804走讀
    /** 類型旁標籤：經費／第8節（不進「狀態」欄） */
    // 2A：申請類型／課程顯示／_fmtSlot 已移至 ui-line-template.js（解構見 setup 頂部）
    /** 同節先前義務（此人為 actual 的代課／調入），可排除本筆及本申請單 */
    // 2A：findPriorDutyAtSlot 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const findPriorDutyAtSlot = (...args) => {
      const a = getTimetableApi();
      return a ? a.findPriorDutyAtSlot(...args) : null;
    };

    // 2A：再異動判定簇已移至 ui-timetable.js（經 getTimetableApi 委派）
    const normalizeRechangeRequestId = (...args) => {
      const a = getTimetableApi();
      return a ? a.normalizeRechangeRequestId(...args) : String(args[0] || '').trim();
    };
    const isEffectiveChangedDuty = (...args) => {
      const a = getTimetableApi();
      return a ? a.isEffectiveChangedDuty(...args) : false;
    };
    const hasOtherChangedDutyAtSlot = (...args) => {
      const a = getTimetableApi();
      return a ? a.hasOtherChangedDutyAtSlot(...args) : false;
    };

    // 2A：resolveHistoryLeaveClassSubject 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const resolveHistoryLeaveClassSubject = (...args) => {
      const a = getTimetableApi();
      return a ? a.resolveHistoryLeaveClassSubject(...args) : { className: '', subject: '', priorDuty: null };
    };

    // 2A：歷史綁課三件已移至 ui-timetable.js（經 getTimetableApi 委派）
    const resolveRestrictionForHistoryRec = (...args) => {
      const a = getTimetableApi();
      return a ? a.resolveRestrictionForHistoryRec(...args) : false;
    };

    // 2A：再異動標籤四件已移至 ui-timetable.js（經 getTimetableApi 委派）
    const isHistoryLeaveRechanged = (...args) => {
      const a = getTimetableApi();
      return a ? a.isHistoryLeaveRechanged(...args) : false;
    };
    const isHistoryExchangeRechanged = (...args) => {
      const a = getTimetableApi();
      return a ? a.isHistoryExchangeRechanged(...args) : false;
    };
    const isRequestLeaveRechanged = (...args) => {
      const a = getTimetableApi();
      return a ? a.isRequestLeaveRechanged(...args) : false;
    };
    const isRequestExchangeRechanged = (...args) => {
      const a = getTimetableApi();
      return a ? a.isRequestExchangeRechanged(...args) : false;
    };

    // 2A：formatHistoryLeaveSlot 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const formatHistoryLeaveSlot = (...args) => {
      const a = getTimetableApi();
      return a ? a.formatHistoryLeaveSlot(...args) : '—';
    };
    /**
     * 對調目標節：受邀人在該日該節的「有效課」
     * 含已核准調入／代課；不可只查基礎課表（調入格無基礎列會查空）
     */
    // 2A：resolveExchangeTargetCell 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const resolveExchangeTargetCell = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.resolveExchangeTargetCell(...args) : null;
    };

    // 2A：formatHistoryExchangeSlot 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const formatHistoryExchangeSlot = (...args) => {
      const a = getTimetableApi();
      return a ? a.formatHistoryExchangeSlot(...args) : '—';
    };

    /**
     * 基礎課表格（未疊代課）
     * @param {string} [dateStr] 有日期時依單／雙週挑選
     */
    // 2A：findBaseScheduleSlot 已移至 ui-timetable.js（經 getTimetableApi 委派，呼叫端零修改）
    const findBaseScheduleSlot = (...args) => {
      const a = getTimetableApi();
      return a ? a.findBaseScheduleSlot(...args) : null;
    };
    // 2A：cellIsRestricted／綁課判定已移至 ui-timetable.js（經 getTimetableApi 委派）
    const cellIsRestricted = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.cellIsRestricted(...args) : false;
    };
    const isLeaveClassRestricted = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.isLeaveClassRestricted(...args) : false;
    };
    const isExchangeClassRestricted = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.isExchangeClassRestricted(...args) : false;
    };
    // 2A：歷史綁課顯示已移至 ui-timetable.js（經 getTimetableApi 委派）
    const isHistoryLeaveRestricted = (...args) => {
      const a = getTimetableApi();
      return a ? a.isHistoryLeaveRestricted(...args) : false;
    };
    const isHistoryExchangeRestricted = (...args) => {
      const a = getTimetableApi();
      return a ? a.isHistoryExchangeRestricted(...args) : false;
    };

    // 2A：formatLeaveClassSlot 已移至 ui-line-template.js（解構見 setup 頂部）
    // 對調課堂：受邀人在目標節的有效班／科（含調入／代課）；勿回退申請人班科
    // 2A：formatExchangeClassSlot 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const formatExchangeClassSlot = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.formatExchangeClassSlot(...args) : '—';
    };

    // 2A：formatQuickSlotCompact 已移至 ui-line-template.js（解構見 setup 頂部）

    /**
     * 快速待辦標題（調／代課用上方小 tag）
     * 調課：7/24五7國文（我）⇄ 7/20一6數學（對方）
     * @param {'incoming'|'sent'} role
     */
    // 2A：formatQuickTodoTitle 已移至 ui-timetable.js（經 getTimetableApi 委派）
    const formatQuickTodoTitle = (...args) => {
      const a = timetableApiOrNull();
      return a ? a.formatQuickTodoTitle(...args) : '—';
    };

    // 2A：getApproveRiskFlags 已移至 ui-approval.js（下方解構取回）

    // 2A：formatRequestSummary 已移至 ui-approval.js（下方解構取回）

    // 2A：formatApproveBatchRiskSummary 已移至 ui-approval.js（下方解構取回）

    // 2A：空堂排班 modal state 前移（UiApproval.create deps，獨立宣告）
    const showEmptySlotModal = ref(false);
    const emptySlotForm = ref({
      teacherEmail: '',
      teacherName: '',
      dateStr: '',
      dayOfWeek: 1,
      period: 1,
      taskName: '',
      className: '',
      note: '',
      quota: 0
    });

    // ── 後台匯入／教師／課表編輯 state（UiBackoffice／UiAdmin.create deps；首屏不進模組）──
    // 申請／編輯共用假別（順序即下拉顯示序；公費組在前）
    const leaveReasonOptions = [
      '公假', '婚假', '喪假', '產前假/分娩假', '身心調適假',
      '休假', '病假', '事假', '補休',
      '其他'
    ];
    const showImportTeachersModal = ref(false);
    const teacherExcelData = ref([]);
    const teacherExcelHeaders = ref([]);
    const teacherMappingFields = ref({
      name: '', email: '', subject: '', jobTitle: '', baseHours: '', role: '', fixedOvertimeHours: '', fixedOvertimeSlots: ''
    });
    const teacherImportPreview = ref(null);
    const showScheduleEditModal = ref(false);
    const scheduleForm = ref({
      id: null, teacherEmail: '', teacherName: '', dayOfWeek: 1, period: 1,
      className: '', subject: '', attr: '一般', overtime: false, restriction: '', specialTags: '', activeFrom: '', activeTo: '',
      _newVersion: false, _previousId: ''
    });
    const showTeacherModal = ref(false);
    const teacherModalMode = ref('add');
    const teacherForm = ref({
      email: '', name: '', subject: '', jobTitle: '', expensePlan: '', role: 'teacher', baseHours: 16, mutualQuota: 0,
      fixedOvertimeHours: '', fixedOvertimeSlots: ''
    });
    const showOvertimePlanModal = ref(false);
    const overtimePlanTeacher = ref(null);
    const overtimePlanRows = ref([]);
    const overtimePlanPeriodEnd = ref('');
    const overtimePlanUsesFixedSlots = ref(false);
    const showTeacherExpenseAuditModal = ref(false);
    const teacherExpenseAuditRows = ref([]);
    const teacherExpenseAuditSummary = ref({ total: 0, ok: 0, normalizable: 0, review: 0, blocked: 0 });
    const excelData = ref([]);
    const excelHeaders = ref([]);
    const mappingFields = ref({
      teacherName: '', subject: '', dayOfWeek: '',
      period: '', className: '', attr: '', restriction: '', specialTags: '', activeFrom: '', activeTo: ''
    });
    const importPreview = ref(null);
    const dashboardScope = ref('today'); // today | week（UiHistory.create deps 共用）
    const emptySlotQuotaZero = computed(() => {
      const DAC0 = DAC();
      if (DAC0 && DAC0.quotaZeroNeedsRepay) {
        return DAC0.quotaZeroNeedsRepay(emptySlotForm.value.quota);
      }
      return (parseInt(emptySlotForm.value.quota, 10) || 0) <= 0;
    });

    let _uiAdminApi = null;
    let _uiAdminModalsBound = false;
    const ensureUiAdminApi = async () => {
      if (_uiAdminApi) return _uiAdminApi;
      if (typeof window.ensureUiAdmin === 'function') {
        await window.ensureUiAdmin();
      }
      if (!window.UiAdmin || !window.UiAdmin.create) {
        throw new Error('後台模組未載入');
      }
      _uiAdminApi = window.UiAdmin.create({
        ref,
        callGasApi,
        callGasApiWithProgress,
        showToast,
        showConfirm,
        loading,
        loadingMessage,
        softRefreshInBackground,
        clearScheduleCache,
        loadWeeklyData,
         getTeacherNameByEmail,
         currentSemester,
         showQuotaLedgerModal, quotaLedgerTeacher, quotaLedgerRows, quotaLedgerLoading,
         _quotaLedgerCache, QUOTA_LEDGER_CACHE_MS, fetchMutualQuotaLedger, isAdmin,
         semesterStartDate,
         semesterEndDate,
           teachersList,
        allSchedules,
        leaveReasonOptions,
        getHistoryEditDefaultSubFee: function (reason, period) {
          return getHistoryEditDefaultSubFee(reason, period);
        },
        historyEditForm,
        showHistoryEditModal,
        requestsList,
        // 注入既有 ref，模板持續綁定同一物件
        showImportTeachersModal,
        teacherExcelData,
        teacherExcelHeaders,
        teacherMappingFields,
        teacherImportPreview,
        showScheduleEditModal,
        scheduleForm,
        showTeacherModal,
         teacherModalMode,
         teacherForm,
         showOvertimePlanModal,
         overtimePlanTeacher,
          overtimePlanRows,
          overtimePlanPeriodEnd,
          overtimePlanUsesFixedSlots,
          showTeacherExpenseAuditModal,
          teacherExpenseAuditRows,
          teacherExpenseAuditSummary,
          accountingPeriod,
         reportMonth,
         accountingPlanOptions,
         excelData,
        excelHeaders,
        mappingFields,
        importPreview
      });
      if (!_uiAdminModalsBound) {
        _uiAdminModalsBound = true;
        bindFlagModal(showImportTeachersModal, () => { showImportTeachersModal.value = false; }, '匯入教師');
        bindFlagModal(showTeacherModal, () => { showTeacherModal.value = false; }, '教師資料');
        bindFlagModal(showOvertimePlanModal, () => { showOvertimePlanModal.value = false; }, '超鐘點經費來源');
        bindFlagModal(showTeacherExpenseAuditModal, () => { showTeacherExpenseAuditModal.value = false; }, '教師經費來源檢查');
        bindFlagModal(showScheduleEditModal, () => { showScheduleEditModal.value = false; }, '編輯課表');
        bindFlagModal(showHistoryEditModal, () => { showHistoryEditModal.value = false; }, '編輯歷史');
      }
      return _uiAdminApi;
    };
    const needUiAdmin = async (fnName, ...args) => {
      try {
        const api = await ensureUiAdminApi();
        if (!api || typeof api[fnName] !== 'function') {
          showToast('後台功能未就緒', 'error');
          return;
        }
        return await api[fnName](...args);
      } catch (e) {
        showToast((e && e.message) || '後台模組載入失敗', 'error');
      }
    };
    const runTeacherImportPreview = (...a) => needUiAdmin('runTeacherImportPreview', ...a);
    const importSchedules = (...a) => needUiAdmin('importSchedules', ...a);
    const migrateNameKeySchema = (...a) => needUiAdmin('migrateNameKeySchema', ...a);
    const runImportPreview = (...a) => needUiAdmin('runImportPreview', ...a);
    const downloadScheduleTemplate = (...a) => needUiAdmin('downloadScheduleTemplate', ...a);
    const downloadCurrentSchedules = (...a) => needUiAdmin('downloadCurrentSchedules', ...a);
    const openScheduleEditModal = (...a) => needUiAdmin('openScheduleEditModal', ...a);
    const pickScheduleAttr = (...a) => needUiAdmin('pickScheduleAttr', ...a);
    const normalizeScheduleFormFlags = (...a) => needUiAdmin('normalizeScheduleFormFlags', ...a);
    const getScheduleAttrLabel = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getScheduleAttrLabel === 'function') return _uiAdminApi.getScheduleAttrLabel(...a);
      return String(a[0] && a[0].attr || '一般');
    };
    const getSchedule = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getSchedule === 'function') return _uiAdminApi.getSchedule(...a);
      return null;
    };
     const saveScheduleCell = (...a) => needUiAdmin('saveScheduleCell', ...a);
     const clearScheduleCell = (...a) => needUiAdmin('clearScheduleCell', ...a);
      const updateTeacherBaseHours = (...a) => needUiAdmin('updateTeacherBaseHours', ...a);
      const fillFixedOvertimeFromCurrentSchedule = (...a) => needUiAdmin('fillFixedOvertimeFromCurrentSchedule', ...a);
      const fillFixedOvertimeForAllTeachers = (...a) => needUiAdmin('fillFixedOvertimeForAllTeachers', ...a);
    const openAddTeacherModal = (...a) => needUiAdmin('openAddTeacherModal', ...a);
    const openEditTeacherModal = (...a) => needUiAdmin('openEditTeacherModal', ...a);
    const saveTeacher = (...a) => needUiAdmin('saveTeacher', ...a);
    const getOvertimeExpenseSourceOptions = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getOvertimeExpenseSourceOptions === 'function') return _uiAdminApi.getOvertimeExpenseSourceOptions(...a);
      return accountingPlanOptions.value || [];
    };
    const openOvertimePlanModal = (...a) => needUiAdmin('openOvertimePlanModal', ...a);
    const saveOvertimePlan = (...a) => needUiAdmin('saveOvertimePlan', ...a);
    const openTeacherExpenseAuditModal = (...a) => needUiAdmin('openTeacherExpenseAuditModal', ...a);
    const normalizeTeacherExpenseData = (...a) => needUiAdmin('normalizeTeacherExpenseData', ...a);
    const deleteTeacher = (...a) => needUiAdmin('deleteTeacher', ...a);
    const handleTeacherExcelChange = (...a) => needUiAdmin('handleTeacherExcelChange', ...a);
    const importTeachersBatch = (...a) => needUiAdmin('importTeachersBatch', ...a);
    const handleFileChange = (...a) => needUiAdmin('handleFileChange', ...a);
    const getMappingLabel = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getMappingLabel === 'function') return _uiAdminApi.getMappingLabel(...a);
      return String(a[0] || '');
    };
    const openHistoryEditModal = (...a) => needUiAdmin('openHistoryEditModal', ...a);
    const saveHistoryEdit = (...a) => needUiAdmin('saveHistoryEdit', ...a);
    const onHistoryEditReasonChange = (...a) => needUiAdmin('onHistoryEditReasonChange', ...a);
    const onHistoryEditTypeChange = (...a) => needUiAdmin('onHistoryEditTypeChange', ...a);
    const onHistoryEditPeriodChange = (...a) => needUiAdmin('onHistoryEditPeriodChange', ...a);
    const onHistoryEditDateChange = (...a) => needUiAdmin('onHistoryEditDateChange', ...a);

    onMounted(() => {
      bindFlagModal(showClassAwayModal, () => { showClassAwayModal.value = false; }, '空堂事件');
      bindFlagModal(showBatchPrintPrompt, () => { dismissBatchPrintPrompt(); }, '批次列印');
    });

    // ui-admin 不在切頁同步載入；畫面完成後閒置預載，實際操作時可直接取用。
    let uiAdminWarmupHandle = null;
    watch([paperMode, isAdmin, activeTab], ([paper, admin, tab]) => {
      if (paper && !admin && tab === 'pending' && isMutualCover.value && !paperFlow.value) {
        setActiveTab('timetable');
      }
    });
    watch([isAdmin, activeTab], ([admin, tab]) => {
      if (!admin || tab !== 'admin' || _uiAdminApi || uiAdminWarmupHandle !== null) return;
      const warmup = () => {
        uiAdminWarmupHandle = null;
        if (isAdmin.value && activeTab.value === 'admin') {
          ensureUiAdminApi().catch(function () {});
        }
      };
      uiAdminWarmupHandle = typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(warmup, { timeout: 1200 })
        : setTimeout(warmup, 300);
    });

    // ── 後台：折抵額度歷程（額度帳本）──
    const showQuotaLedgerModal = ref(false);
    const quotaLedgerLoading = ref(false);
    const quotaLedgerTeacher = ref(null); // { email, name, balance, sheetQuota }
    const quotaLedgerRows = ref([]);
    /** 前端快取：同師 3 分鐘內再開不重打 GAS */
    const _quotaLedgerCache = Object.create(null);
    const QUOTA_LEDGER_CACHE_MS = 180000;
    try {
      window.__quotaLedgerCacheBust = function () {
        Object.keys(_quotaLedgerCache).forEach(function (k) { delete _quotaLedgerCache[k]; });
      };
    } catch (eQ) { /* ignore */ }
    // 2A：已移至 ui-admin.js（經 needUiAdmin 委派，懶載）
    const openQuotaLedger = (...a) => needUiAdmin('openQuotaLedger', ...a);
    const closeQuotaLedger = () => {
      showQuotaLedgerModal.value = false;
    };
    const quotaTypeClass = (type) => {
      const k = String(type || '').toLowerCase();
      if (k === 'earn') return 'quota-type-earn';
      if (k === 'spend') return 'quota-type-spend';
      if (k === 'restore') return 'quota-type-restore';
      if (k === 'adjust') return 'quota-type-adjust';
      return '';
    };
    const showQuotaAdjustModal = ref(false);
    const quotaAdjustSaving = ref(false);
    const quotaAdjustForm = ref({ email: '', name: '', balance: 0, direction: 'add', amount: 1, note: '' });
    const quotaAdjustPreview = computed(() => {
      const balance = Math.max(0, parseFloat(quotaAdjustForm.value.balance) || 0);
      const amount = parseFloat(quotaAdjustForm.value.amount) || 0;
      return Math.round((balance + (quotaAdjustForm.value.direction === 'subtract' ? -amount : amount)) * 1000) / 1000;
    });
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const openManualQuotaAdjust = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.openManualQuotaAdjust(...args) : undefined;
    };
    const closeManualQuotaAdjust = () => {
      if (!quotaAdjustSaving.value) showQuotaAdjustModal.value = false;
    };
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const saveManualQuotaAdjust = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.saveManualQuotaAdjust(...args) : undefined;
    };
    onMounted(() => { bindFlagModal(showQuotaLedgerModal, () => { showQuotaLedgerModal.value = false; }, '額度歷程'); });

    // ── 空堂排班（扣額度；預設不寄信；班級可選）──
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const openEmptySlotAssign = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.openEmptySlotAssign(...args) : undefined;
    };
    /** 詳情框：原授課老師該節已調開／被代 → 開空堂排班 */
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const openEmptySlotFromDetail = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.openEmptySlotFromDetail(...args) : undefined;
    };
    const closeEmptySlotModal = () => {
      showEmptySlotModal.value = false;
    };
    // 2A：已移至 ui-approval.js（下方解構取回）
    onMounted(() => { bindFlagModal(showEmptySlotModal, () => { showEmptySlotModal.value = false; }, '空堂排班'); });

    // 預設公費：公假／婚假／喪假／產假／產前假／分娩假／身心調適假
    const PUBLIC_FEE_REASONS = ['公假', '婚假', '喪假', '產假', '產前假/分娩假', '身心調適假'];
    const isPublicFeeReason = (reason) => {
      const r = String(reason || '').trim();
      if (!r) return false;
      if (PUBLIC_FEE_REASONS.includes(r)) return true;
      // 相容舊資料：公差、分娩假
      if (r.includes('公假') || r.includes('公差') || r.includes('婚假') || r.includes('喪假')) return true;
      if (r.includes('產假') || r.includes('分娩') || r.includes('產前') || r.includes('身心調適')) return true;
      return false;
    };
    const defaultSubFeeForReason = (reason) => {
      if (isPeriod8FeeLocked.value) return PERIOD8_FEE;
      if (isMutualCover.value) return ACTIVITY_PUBLIC_FEE;
      return isPublicFeeReason(reason) ? '公費代課' : '自費代課';
    };
    const getHistoryEditDefaultSubFee = (reason, period) => {
      if (parseInt(period, 10) === 8) return PERIOD8_FEE;
      return isPublicFeeReason(reason) ? '公費代課' : '自費代課';
    };
    /** 假別變更時自動帶入預設經費（第8節／活動模式不覆寫） */
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const onLeaveReasonChange = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.onLeaveReasonChange(...args) : undefined;
    };
    // 第8節：表單一開就鎖經費
    watch(
      () => [
        isPeriod8FeeLocked.value,
        pendingRequestData.value && pendingRequestData.value.mode,
        pendingRequestData.value && pendingRequestData.value.timeKey,
        pendingRequestData.value && pendingRequestData.value.isBatch
      ],
      () => {
        if (!isPeriod8FeeLocked.value) return;
        const pending = pendingRequestData.value;
        if (!pending || pending.mode !== 'substitution') return;
        pending.subFee = PERIOD8_FEE;
        batchSubFee.value = PERIOD8_FEE;
      }
    );
    const setMutualCover = async (on) => {
      if (on) await ensureDAC();
      const a = getMutualPanelApi();
      if (a) a.setMutualCover(on);
    };
    const mutualDraftKey = (leaveEmail, dateStr, period) =>
      (window.UiMutualPanelState && window.UiMutualPanelState.mutualDraftKey)
        ? window.UiMutualPanelState.mutualDraftKey(leaveEmail, dateStr, period)
        : (String(leaveEmail || '').toLowerCase() + '|' + dateStr + '|' + period);
    const getMutualDraftAt = (leaveEmail, dateStr, period) => {
      const a = getMutualPanelApi();
      return a ? a.getMutualDraftAt(leaveEmail, dateStr, period) : null;
    };
    const removeMutualDraft = (key) => { const a = getMutualPanelApi(); if (a) a.removeMutualDraft(key); };
    const clearMutualDrafts = () => { const a = getMutualPanelApi(); if (a) a.clearMutualDrafts(); };
    const assignMutualDraftFromMatch = (subEmail) => { const a = getMutualPanelApi(); if (a) a.assignMutualDraftFromMatch(subEmail); };
    /** 從暫定列再開模擬對照（不重寫暫定） */
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const previewMutualDraft = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.previewMutualDraft(...args) : undefined;
    };

    /** 全部暫定一次送出（ui-mutual.js → UiMutualSubmit，懶載） */
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const submitAllMutualDrafts = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.submitAllMutualDrafts(...args) : undefined;
    };
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const toggleMutualCover = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.toggleMutualCover(...args) : undefined;
    };

    // 面板勾選變更時自動暫存
    watch(mutualSkipNotify, () => { persistMutualPanelDraft(); });
    watch(mutualNote, () => { persistMutualPanelDraft(); });
     watch([mutualActivityStart, mutualActivityEnd, mutualActivityStartPeriod, mutualActivityEndPeriod], () => {
       if (mutualActivityStart.value && mutualActivityStart.value === mutualActivityEnd.value) {
         const order = [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
         const startIndex = order.indexOf(parseInt(mutualActivityStartPeriod.value, 10));
         const endIndex = order.indexOf(parseInt(mutualActivityEndPeriod.value, 10));
         if (startIndex > endIndex) mutualActivityEndPeriod.value = mutualActivityStartPeriod.value;
       }
       persistMutualPanelDraft();
     });

    const toggleMutualAwayClass = (cls) => { const a = getMutualPanelApi(); if (a) a.toggleMutualAwayClass(cls); };
    const selectAwayGrade = (grade) => { const a = getMutualPanelApi(); if (a) a.selectAwayGrade(grade); };
    // mutualCoverStats 已由 UiMutualBridge 提供

    // 待辦分頁
    const changePendingPage = (section, n) => {
      const maxPages = { pending: pendingMyPendingTotal, sent: pendingMySentTotal, admin: pendingAdminTotal };
      const refs = { pending: pendingMyPendingPage, sent: pendingMySentPage, admin: pendingAdminPage };
      const max = maxPages[section].value;
      refs[section].value = Math.max(1, Math.min(n, max));
    };

    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const resetAppState = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.resetAppState(...args) : undefined;
    };

    /** 登入後還原分頁；公開班級連結與非管理員進 admin 時校正 */
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const restoreNavAfterLogin = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.restoreNavAfterLogin(...args) : undefined;
    };

    // 模擬切換使用者身分 (僅限管理員 Dev 工具)
    // 注意：列表／權限用被模擬者 Email；後端 API 仍用 JWT（真正送出仍是原管理員帳號）
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const devSwitchUser = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.devSwitchUser(...args) : undefined;
    };

    // 回到管理員身分
    // 2A：已移至 ui-backoffice.js（經 getBackofficeApi 委派）
    const restoreAdmin = (...args) => {
      if (!_setupReady.value) return undefined;
      const a = getBackofficeApi();
      return a ? a.restoreAdmin(...args) : undefined;
    };

    onMounted(async () => {
      checkMobile();
      initMobileDay();
      window.addEventListener('resize', checkMobile);

      // 連線設定固定內建（setup 開頭已清除舊 localStorage 鍵，不在此覆寫）

      // 還原活動互代面板暫存（期間／外出班／帶隊／暫定）
      // 2B 懶載：先等互代模組就緒，否則還原會被靜默跳過
      try {
        if (!window.UiMutualPanelState && typeof window.ensureUiMutual === 'function') {
          await window.ensureUiMutual();
        }
        const saved = restoreMutualPanelDraft();
        if (saved) applyMutualPanelDraft(saved);
      } catch (e) { /* ignore */ }

      // 先解析班級唯讀深連結
      const hasClassLink = applyClassViewFromUrl();

      // OAuth 回傳 #id_token=…（prompt=select_account，每次強制選帳）
      const redirectToken = consumeOAuthRedirectToken();
      if (redirectToken) {
        try { sessionStorage.setItem('jcjh_google_id_token', redirectToken); } catch (eR) { /* ignore */ }
      }

      // 檢查是否已有登入之 Google ID Token 快取
      const idToken = sessionStorage.getItem('jcjh_google_id_token');
      if (idToken && !isTokenExpired(idToken)) {
         const payload = decodeJwt(idToken);
         if (payload) {
            if (!assertSchoolDomain(payload)) return;
            const loginMeta = await preflightGoogleLogin(payload);
            if (!loginMeta) {
              if (hasClassLink) await loadPublicClassData(pendingClassView.value || selectedClass.value);
              return;
            }
           user.value = {
            email: payload.email,
            displayName: payload.name,
            photoURL: payload.picture
          };
          loading.value = true;
          loadingMessage.value = '同步系統中...';

           try {
             await loadWeeklyData();
             if (hasClassLink) await loadPublicClassData(pendingClassView.value || selectedClass.value);
             await checkUrlCallback(user.value);
            // 資料載入與簽核 callback 後再還原分頁，避免被中間流程蓋掉
            if (!hasClassLink && !classReadonlyMode.value) restoreNavAfterLogin();
            else _navPersistReady = true;

             if (shouldAutoStartOnboarding()) {
               setTimeout(() => startOnboarding(), 800);
             }
          } catch (eRest) {
            console.error('還原登入同步失敗', eRest);
            loading.value = false;
            showToast('登入後同步失敗：' + (eRest && eRest.message ? eRest.message : eRest), 'error', 5000);
          }
        } else {
          sessionStorage.removeItem('jcjh_google_id_token');
          // 勿呼叫 resetAppState：會清掉 classReadonlyMode
          user.value = null;
          if (hasClassLink) {
            await loadPublicClassData(pendingClassView.value || selectedClass.value);
          } else {
            loading.value = false;
            restoreNavAfterLogin();
          }
        }
      } else {
        sessionStorage.removeItem('jcjh_google_id_token');
        user.value = null;
        // 免登入：?class=701 直接載入公開班級課表
        if (hasClassLink) {
          await loadPublicClassData(pendingClassView.value || selectedClass.value);
        } else {
          loading.value = false;
          restoreNavAfterLogin();
        }
      }

      // 初始化 Google Sign-in（等 GSI 腳本就緒再 init／render，避免 async 競態）
      if (googleClientId.value && !classReadonlyMode.value) {
        const onCredential = async (response) => {
          const token = response && response.credential;
          if (!token) {
            console.warn('[GSI] credential 空白', response);
            showToast('Google 未回傳登入憑證，請確認 OAuth 來源含目前網址', 'warning', 5000);
            return;
          }
          // 成功拿到票：取消「彈窗被擋」延遲提示（選帳常超過數秒，不可誤報）
          _gsiClickGen += 1;
          try { if (_gsiPopupHintTimer) { clearTimeout(_gsiPopupHintTimer); _gsiPopupHintTimer = null; } } catch (eTm) { /* ignore */ }
          try { gsiButtonError.value = ''; } catch (eClr) { /* ignore */ }
          sessionStorage.setItem('jcjh_google_id_token', token);
          const payload = decodeJwt(token);
          if (!payload) {
            showToast('無法解析 Google 登入憑證', 'error');
            return;
          }
           if (!assertSchoolDomain(payload)) return;
           const loginMeta = await preflightGoogleLogin(payload);
           if (!loginMeta) return;
           user.value = {
            email: payload.email,
            displayName: payload.name,
            photoURL: payload.picture
          };
          loading.value = true;
          loadingMessage.value = '登入成功，同步系統中...';

           try {
             await loadWeeklyData();
             if (hasClassLink) await loadPublicClassData(pendingClassView.value || selectedClass.value);
             await checkUrlCallback(user.value);
            if (!classReadonlyMode.value) restoreNavAfterLogin();
            else _navPersistReady = true;

             if (shouldAutoStartOnboarding()) {
               setTimeout(() => startOnboarding(), 800);
             }
          } catch (eLogin) {
            console.error('登入後同步失敗', eLogin);
            loading.value = false;
            showToast('登入後同步失敗：' + (eLogin && eLogin.message ? eLogin.message : eLogin), 'error', 5000);
          }
        };
        window.handleCredentialResponse = onCredential;
        window.__gsiCredentialHandler = onCredential;

        // A：定時檢查 Token，快過期就靜默換票（約每 4 分鐘）
        const tokenKeepAlive = () => {
          try {
            const tok = sessionStorage.getItem('jcjh_google_id_token');
            if (!tok || !user.value) return;
            if (typeof isTokenExpiringSoon === 'function' && isTokenExpiringSoon(tok, 6 * 60 * 1000)) {
              refreshGoogleIdToken().catch(() => {});
            }
          } catch (e) { /* ignore */ }
        };
        setInterval(tokenKeepAlive, 4 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            tokenKeepAlive();
            // 回到登入頁且按鈕不見時補渲染
            if (!user.value && !classReadonlyMode.value && !gsiButtonReady.value) {
              setupGoogleSignInUi();
            }
          }
        });

        // 未登入：一定要等到 GSI + 登入 DOM 就緒再畫按鈕
        if (!user.value) {
          setupGoogleSignInUi();
        } else {
          // 已登入仍 init，供 refresh token
          waitForGoogleGsi(10000).then((ok) => {
            if (ok) ensureGsiInitialized();
          });
        }
      }
    });

    // 登出回到登入畫面時重畫按鈕
    watch(user, (u, prev) => {
      if (!u && prev && !classReadonlyMode.value) {
        _gsiButtonRendered = false;
        gsiButtonReady.value = false;
        nextTick(() => setupGoogleSignInUi());
      }
    });
    


    const closeSuccessGoPending = () => {
      showSuccessModal.value = false;
      activeTab.value = 'pending';
    };
    const closeSuccessGoRecords = () => {
      showSuccessModal.value = false;
      activeTab.value = 'records';
      showMatchModal.value = false;
      showCompareModal.value = false;
    };
    const closeSuccessStayTimetable = () => {
      showSuccessModal.value = false;
      activeTab.value = 'timetable';
      showMatchModal.value = false;
      showCompareModal.value = false;
    };
    const closeSuccessCopyLine = async () => {
      if (hasLineTemplate.value && lineCopyText.value) {
        await copyLineMessage();
      }
      // 保持 Modal 開啟或關閉皆可；複製後仍可選其他按鈕
    };

    // R14：getMatchSlotDateMMDD 已移至 ui-match.js（wrapper 見 getMatchApi 後方）
    const samePeriodSwapUI = window.UiSamePeriodSwap.create({
      ref, computed, isAdmin, activeCell, inputRequestDate, teachersList,
      getTeacherNameByEmail: (email) => getTeacherNameByEmail(email),
      getScheduleForDate: (email, date, period, day) => getScheduleForDate(email, date, period, day),
      formatPeriodText: (period) => formatPeriodText(period),
      callGasApi, showConfirm, showToast, showMatchModal,
      clearScheduleCache,
      softRefreshInBackground: (options) => softRefreshInBackground(options || {})
    });

    // 返回 Vue 拋出變數
    _setupReady.value = true;
    return {
      getMatchSlotDateMMDD,
      user, userRole, loading, loadingMessage, activeTab, setActiveTab, isSimulating, originalUser, avatarSrc, handleAvatarError,
      dataUpdatedLabel, dataRefreshing, softSyncing, manualRefreshData,
      visibleTimetableTeachers, ttPage, ttPageSize, ttTotalPages, ttNeedPager, changeTtPage,
      requestWindowInfo, historyFullLoaded, historyLoadingFull, historyLoadedMonths, historyMonthLoading,
      loadHistoryMonth, setHistoryFilterMode, setHistoryTypeFilter, ensureHistoryMonthLoaded, loadFullSemesterHistory, reloadWindowedHistory,
      selectedMobileDay, isMobile, checkMobile, initMobileDay,
      currentSemester, availableSemesters, currentSemesterName, semestersList, showSemesterModal, semesterModalMode, semesterForm,
        currentWeekDates, compareWeekDatesA, compareWeekDatesB, compareWeekSelectionA, compareWeekSelectionB, compareDisplayDatesA, compareDisplayDatesB, setCompareWeekSelection, batchCompareWeekIndex, batchCompareWeekTotal, batchCompareWeekSlotCount, shiftBatchCompareWeek, batchExchangePreviewSlotKey, setBatchExchangePreviewSlot, isCrossWeekExchange, getExchangeEndpointText, selectedWeekDate, currentWeekNumber,
       classList, classSchedules, selectedClass, classReadonlyMode, classViewerReadonly, selectClassForView, getClassReadonlyLink, copyClassReadonlyLink,
       searchQuery, selectedSubject, timetableDisplayMode, teachersList, allSchedules, schoolSwaps, substitutionRecords, homeroomRecords, requestsList,
      mySentRequests, myPendingRequests, adminPendingRequests, allPendingRequests,
        matchMode, activeCell, inputRequestDate, recommendedTeachers, recommendationLoading,
        showSamePeriodSwapModal: samePeriodSwapUI.showSamePeriodSwapModal,
        samePeriodSwapSource: samePeriodSwapUI.samePeriodSwapSource,
        samePeriodSwapCandidates: samePeriodSwapUI.samePeriodSwapCandidates,
        samePeriodSwapFilteredCandidates: samePeriodSwapUI.samePeriodSwapFilteredCandidates,
        samePeriodSwapTargetKey: samePeriodSwapUI.samePeriodSwapTargetKey,
        samePeriodSwapSearchQuery: samePeriodSwapUI.samePeriodSwapSearchQuery,
        samePeriodSwapSelectedCandidate: samePeriodSwapUI.samePeriodSwapSelectedCandidate,
        samePeriodSwapSaving: samePeriodSwapUI.samePeriodSwapSaving,
        openSamePeriodSwapModal: samePeriodSwapUI.openSamePeriodSwapModal,
        closeSamePeriodSwapModal: samePeriodSwapUI.closeSamePeriodSwapModal,
        saveSamePeriodSwap: samePeriodSwapUI.saveSamePeriodSwap,
        trianglePickB, trianglePickC, triangleNote, triangleReason, triangleSubmitting, triangleCandidates, triangleCandidateB, triangleCandidateCList, triangleCandidateC,
        triangleParticipants, triangleLegs, trianglePreviewRows, trianglePreviewWeekDates, triangleTimetablePreview, triangleValidation, triangleReady, formatTriangleSlot, openTriangleTimetablePreview, submitTriangleRequest,
       batchSelectMode, batchFlowMode, batchSlots, showBatchConfirmModal, batchSubTeacher, batchReason, batchSubFee, batchNote,
       isMutualCover, toggleMutualCover, setMutualCover, MUTUAL_COVER_FEE, ACTIVITY_PUBLIC_FEE, QUOTA_DEDUCT_FEE, PERIOD8_FEE, TIMETABLE_ONLY_FEE,
        mutualAwayClasses, mutualActivityStart, mutualActivityEnd, mutualActivityStartPeriod, mutualActivityEndPeriod,
        mutualActivityPeriodMode, mutualActivityPeriods,
        setMutualActivityPeriodBoundary, setMutualActivityThisWeek, setMutualActivityPeriodMode,
        toggleMutualActivityPeriod, isMutualActivityPeriodSelected,
      toggleMutualAwayClass, selectAwayGrade, mutualCoverStats,
      mutualLeadEmails, toggleMutualLead, isMutualLead, onMutualLeadChipClick, jumpToTeacherTimetable,
      mutualSkipNotify, directApproveSkipNotify, mutualNote, mutualDrafts, getMutualDraftAt, removeMutualDraft, clearMutualDrafts,
      clearMutualPanel, assignMutualDraftFromMatch, previewMutualDraft, submitAllMutualDrafts, recalculateMutualQuotasFromActivity,
      persistMutualPanelDraft, isAwayClassCell,
       batchAssignMode, batchActiveSlotKey, isBatchMatchFlow, isBatchExchangeFlow, isBatchPerSlotMode, batchAssignedCount, batchAllSlotsAssigned, batchActiveSlot,
      batchCompareViewEmail, batchCompareSubGroups, setBatchCompareViewEmail, resolveCompareBEmail,
       setBatchAssignMode, setBatchFlowMode, selectBatchSlotForMatch, assignBatchSlotSub, clearBatchSlotSub, prepBatchPerSlotCompare, prepBatchExchangeCompare,
      toggleBatchSelectMode, clearBatchSlots, isBatchSlotSelected,
      openBatchMatch, prepBatchCompare, executeBatchSubmit,
      matchSearchQuery, matchDisplayCount, matchShowNoTeacherWarning, matchEmptyReasons,
      filteredRecommendedTeachers, displayedRecommendedTeachers,
       exchangeTeacherEmail, exchangeTeacherClasses, exchangePeriodId, exchangeTargetDate, exchangeWeekOffset,
       exchangeWeekdayFilter, exchangeWeekdayOptions, setExchangeWeekdayFilter, filteredExchangeList,
       showCompareModal, showTriangleTimetablePreview, showMatchModal, pendingRequestData, combinedReturnCandidates, askFirstLineText, askFirstLineDraft, selectedRecordIds, showDevDropdown, devTeacherQuery, filteredDevTeachers,
             paperPrintDraft, paperSignatureByTeacher, openPaperPrintDraftFromCompare, openPaperPrintForRequest, openPaperPrintMutualDrafts, openTrianglePaperPreview, printPaperDraft, openPaperDraftPreview,
            showPrintPreviewModal, printPreview, printPreviewImageBusy, openPrintPreview, openHistoryPrintPreview, closePrintPreview, confirmPrintPreview, copyPrintPreviewImage, downloadPrintPreviewImage,
      showDetailModal, consecAlertsA, consecAlertsB, detailRequest, detailSubRecord,
       showLineMessageModal, lineMessageTitle, lineMessageText, openLineMessageEditor, copyEditedLineMessage, sendEditedLineMessage,
       showSuccessModal,
       successModalTitle, successModalMessage, successFlowMode, successActionRequests, lineCopyText, hasLineTemplate, lineBatchParts,
       openSuccessPrintPreview, addSuccessToCalendar,
       copyLineMessage, sendLineMessage, copyLineBatchPart, sendLineBatchPart, copyLineMessageForRequest, addToGoogleCalendar, downloadIcsCalendar, addEventToCalendar, printSingleRequest, showDetailForRecord, getTargetSubject, getTargetClassAndSubject, getOriginalRequestSubject, getOriginalRequestClass, getOriginalTargetSubject, getOriginalTargetClass, getTriangleGroupRequests,
      adminSubTab,
      showImportTeachersModal, teacherExcelData, teacherExcelHeaders, teacherMappingFields, teacherImportPreview, runTeacherImportPreview, handleTeacherExcelChange, importTeachersBatch,
      isScheduleEditMode, showScheduleEditModal, scheduleForm,
          showTeacherModal, teacherModalMode, teacherForm, showOvertimePlanModal, overtimePlanTeacher, overtimePlanRows, overtimePlanPeriodEnd, overtimePlanUsesFixedSlots,
          showTeacherExpenseAuditModal, teacherExpenseAuditRows, teacherExpenseAuditSummary, openTeacherExpenseAuditModal, normalizeTeacherExpenseData,
       showQuotaLedgerModal, quotaLedgerLoading, quotaLedgerTeacher, quotaLedgerRows, openQuotaLedger, closeQuotaLedger, quotaTypeClass,
       showQuotaAdjustModal, quotaAdjustSaving, quotaAdjustForm, quotaAdjustPreview,
       openManualQuotaAdjust, closeManualQuotaAdjust, saveManualQuotaAdjust,
      showEmptySlotModal, emptySlotForm, emptySlotQuotaZero, openEmptySlotAssign, openEmptySlotFromDetail, closeEmptySlotModal, executeEmptySlotAssign,
       reportMonth, reportStartDate, reportEndDate, reportWeeksCount, monthlyReportData, monthlyReportLoading, monthlyReportTotals, shiftReportPeriod,
       accountingPeriod, accountingExportLoading, period8Loading, period8ExportLoading,
      excelData, excelHeaders, mappingFields, importPreview, runImportPreview, downloadScheduleTemplate, downloadCurrentSchedules,
         directApproveMode, onlineSubstitutionEnabled, paperMode, paperFlow, notificationsSuppressed, setOnlineSubstitutionEnabled, googleClientId, gasApiUrl, saveClientSettings,
       isSubFeeLockedToSelf, isPeriod8FeeLocked, quotaDeductPreview, quotaDeductInsufficient, switchQuotaDeductToSelfPay, hasSubTeacherConflict,
      quotaPackPreview, quotaPackLoading, quotaPackError, quotaPackOptions, quotaFifoPackageId, quotaSelectedPack, fetchQuotaPackPreview, resetQuotaPackOverride,
       isAdmin, isStaff, canViewAllTimetables, canStaffProxySubmit, canStartSecondSubFromDetail, isProxySubmitActive, isProxySubmitGranted,
      proxySubmitEnabled, proxySubmitEnabledBy, proxySubmitEnabledAt, setProxySubmitEnabled,
      proxySubmitEmails, proxyGrantQuery, proxyGrantCandidateTeachers, proxyGrantedTeachers,
      isProxySubmitEmailGranted, toggleProxySubmitEmail, clearAllProxySubmitEmails, persistProxySubmitEmails,
      proxyTargetEmail, proxyTargetName, proxyTargetQuery, showProxyTargetDropdown, filteredProxyTeachers,
      setProxyTarget, clearProxyTarget, canOperateOnTeacherEmail, ensureProxyTargetForTeacher,
        userRoleText, subjectsList, filteredTeachers, displayTimetableTeachers, pendingCount, myInviteCount, adminTodoCount, hasQuickTodo, quickTodoSentOpen, allTeachersList, teachersListDetails, accountingPlanOptions, getExpensePlanSummary, isExpensePlanSlotConfig,
      pendingHomeroomRecords, homeroomAssignSelections, homeroomRecordsLoading, getHomeroomCoverCandidates, loadHomeroomRecords, assignHomeroomTeacher, homeroomTeachersList, onHomeroomInputSelect, onManualCoverTeacherInput,
      showManualHomeroomModal, homeroomStatusFilter, manualHomeroomForm, openManualHomeroomModal, onManualHomeroomLeaveTeacherChange, currentMonthHomeroomRecords, currentMonthHomeroomFeeTotal, currentMonthHomeroomAssignedCount, currentMonthHomeroomPendingCount, saveManualHomeroomRecord, deleteHomeroomRecord,
      matchPreview,
       exchangeTeachersList, myTeacherProfile, isRequestValid, isHistoryExchangeType, filteredHistoryRecords, formatRequestApplicationDate,
       dateFilteredHistoryRecords, paginatedHistoryRecords, historyTotalPages,
       historyFilterMode, historyTypeFilter, historyFilterDate, historySearchQuery, historyPage, historyPageSize,
        pendingSearchQuery, getLeaveTimeDefaults, getLeaveTimePresetRange, setLeaveTimePreset, updatePendingLeaveTime, toggleCourseAdjustmentOnly,
      showHistoryEditModal, historyEditForm, leaveReasonOptions, onLeaveReasonChange, defaultSubFeeForReason,
       pendingMyPendingPage, pendingMySentPage, pendingAdminPage,
       paginatedMyPending, paginatedMySent, paginatedAdminPending,
       pendingMyPendingTotal, pendingMySentTotal, pendingAdminTotal, filteredAdminPendingRequests,
         isBatchGroupExpanded, toggleBatchGroup, getBatchGroupSlotSummary, getBatchGroupTeacherSummary, getBatchGroupStatusText, getBatchGroupStatusClass, isAdminPendingPageFullySelected,
       personalChanges, recommendedExchangeList, displayedExchangeList,
      loginWithGoogle, logout, gsiButtonReady, gsiButtonError, gsiLoggingIn, reloadGsiLoginButton,
      changeWeek,       getPeriodTimeSpan, getWeekDayText, formatDateMMDD,
        timetablePeriods, getPeriodLabel, formatPeriodText, isLunchPeriod, getPeriodClass, formatClassName, isCombinedClass, getScheduleSpecialTags, hasScheduleSpecialTag, isTimetablePullout, isTimetableRestricted,
       getClassCellClassForDate, getClassCellClassForClass, getScheduleForDate, weekScheduleGrid, cellFromGrid, handleCellClick, handleClassCellClick, handlePeriod8CellClick,
      isMatchSourceCell, isMatchSourceEntry, isMatchHoverCell, isMatchHoverEntry,
      selectMatchPreviewSub, selectMatchPreviewExchange, clearMatchPreview, closeMatchModal, isMatchPreviewSelected,
        selectedClassDate, selectedClassWeekDates, classWeekNumber, classSubstitutionMap, classChangeSummary, getClassChangeTypeLabel, changeClassWeek, goToClassThisWeek,
        period8WeekDate, period8WeekDates, period8WeekNumber, changePeriod8Week, goToPeriod8ThisWeek, period8RosterRows, period8CellsFor, period8StatusLabel,
       prepCompare, previewBatchCandidate, closeCompareModal, startCombinedReturn, getCompareCellText, getCompareCellClass, executeSubmitRequest, isSubmitting,
       getStatusText, changeMatchMode, respondToRequest, respondToBatch, adminApprove, adminReject, cancelRequest, deleteSubstitutionRecord, loadMoreMatches,
       isTriangleRequest, isExchangeLikeRequest,
        triangleCandidateSearch, triangleCandidateDisplayCount, triangleCandidateOptions, triangleCandidateCOptions, triangleCandidateCReadyCount, triangleCandidateBOptions, triangleCandidateBReadyCount, displayedTriangleBOptions, displayedTriangleCOptions, triangleCandidateIsRestricted, selectTriangleCandidateB, selectTriangleCandidateC, loadMoreTriangleCandidates,
        formatRequestSummary, formatLeaveClassSlot, formatExchangeClassSlot, formatQuickTodoTitle, formatHistoryLeaveSlot, formatHistoryExchangeSlot, getRequestRiskTags, getRequestTypeTags, getApproveRiskFlags, formatApproveBatchRiskSummary, isHistoryLeaveRechanged, isHistoryExchangeRechanged, isRequestLeaveRechanged, isRequestExchangeRechanged, getCellPlainStatus, getRequestProgressSteps, isPaperFlowRequest, isLeaveClassRestricted, isExchangeClassRestricted, isHistoryLeaveRestricted, isHistoryExchangeRestricted,
      dashboardScope, dashboardStats,
       selectedAdminPendingIds, isAdminPendingSelected, toggleAdminPendingSelect, toggleSelectAllAdminPending, clearAdminPendingSelection,
       isAdminBatchGroupSelected, toggleAdminBatchGroupSelection,
        batchAdminApprove, batchAdminReject, openBatchPendingPrintPreview, lastBatchPrintIds, showBatchPrintPrompt, printLastBatchNotices, dismissBatchPrintPrompt,
       closeSuccessGoPending, closeSuccessGoRecords, closeSuccessStayTimetable, closeSuccessCopyLine,
        openScheduleEditModal, saveScheduleCell, clearScheduleCell, updateTeacherBaseHours, fillFixedOvertimeFromCurrentSchedule, fillFixedOvertimeForAllTeachers, pickScheduleAttr, normalizeScheduleFormFlags, getScheduleAttrLabel, getOvertimeExpenseSourceOptions, openOvertimePlanModal, saveOvertimePlan,
      openAddTeacherModal, openEditTeacherModal, saveTeacher, deleteTeacher,
        handleFileChange, getMappingLabel, importSchedules, migrateNameKeySchema, toggleSelectAllRecords, isHistoryRecordSelected, isHistoryBatchGroupSelected, toggleHistoryBatchGroupSelection, loadTeacherClassesForExchange,
       printSelectedForms, sendSelectedBatchNotices, calculateMonthlyReport, exportReportToExcel, exportSubFeeToExcel, exportPeriod8Accounting,
      schoolExportStart, schoolExportEnd, schoolExportIncludeWeekend, schoolExportOnlyChanged,
      schoolExportSelectedEmails, schoolExportTeacherFilter, filteredSchoolExportTeachers,
      isSchoolExportTeacherSelected, toggleSchoolExportTeacher, selectAllSchoolExportTeachers, clearSchoolExportTeachers,
      setSchoolExportThisWeek, exportSchoolTimetableWord,
      exportActivityCoverWord,
      invigilationExportTitle, exportInvigilationWorkbook,
      devSwitchUser, restoreAdmin,
       getTeacherNameByEmail, getTeacherSubjectByEmail, getTeacherIdentityTooltip, getTeacherTimetableHours, getRealTeacherName, startSecondSub,
        getTeacherJobTitleByEmail, isHomeroomTeacher,
       getSubjectStyle, getClassBadgeStyle, formatMoney,
       changeHistoryPage, openHistoryEditModal, saveHistoryEdit, onHistoryEditReasonChange, onHistoryEditTypeChange, onHistoryEditPeriodChange, onHistoryEditDateChange, changePendingPage,
      openAddSemesterModal, openEditSemesterModal, saveSemester, deleteSemester, setDefaultSemester,
      // 工具函數
      toLocalDateStr,
      // 單/雙週課輔課
      isSingleWeek, semesterStartDate,
       // 空堂事件
        classAwayEvents, semesterEndDate, activeAwayBanner, isClassAwayOnDate, getClassAwayEventName,
        showClassAwayModal, classAwayModalMode, classAwayPeriodOptions, classAwayForm,
        openAddClassAwayModal, openEditClassAwayModal, toggleClassAwayFormClass,
        isClassAwayFormClassSelected, selectClassAwayGrade,
        toggleClassAwayPeriod, isClassAwayPeriodSelected, selectClassAwayPeriodRange,
        setClassAwayPeriodBoundary, setClassAwayPeriodMode,
        clearClassAwayPeriods, isClassAwayFullDaySelected, classAwayPeriodLabel,
        classAwayDailyPeriodLabel, classAwayBoundaryPeriodLabel, isClassAwayRangeEvent,
        saveClassAwayEvent, deleteClassAwayEvent,
       // 全校日期節次對調
       schoolSwapRows, showSchoolSwapModal, schoolSwapModalMode, schoolSwapSaving, schoolSwapForm,
       schoolSwapWeekdayText, openAddSchoolSwapModal, openEditSchoolSwapModal, saveSchoolSwap, deleteSchoolSwap,
      mutualImportableEvents, mutualImportEventId, applyClassAwayEventById, applyClassAwayToMutualPanel,
      // 新手引導
      showOnboarding, onboardingStep, onboardingSteps,
      startOnboarding, nextOnboardingStep, prevOnboardingStep, skipOnboarding,
      tourDemoInvite, tourDemoInviteRespond
    };
  }
});

app.directive('autofit', {
  mounted: function (el) {
    var raf = function () { fitSingleLineText(el); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(raf);
    else raf();
    try {
      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(function () { fitSingleLineText(el); });
        ro.observe(el);
        el.__autofitRo = ro;
      }
    } catch (e) { /* ignore */ }
  },
  updated: function (el) { fitSingleLineText(el); },
  unmounted: function (el) {
    try { if (el.__autofitRo) el.__autofitRo.disconnect(); } catch (e) { /* ignore */ }
  }
});

app.mount('#app');
