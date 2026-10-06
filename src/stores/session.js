/** v2 stores/session.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';
import DateUtils from '../domain/date-utils.js';
import DomainClassAway from '../domain/domain-class-away.js';
import DomainMatch from '../domain/domain-match.js';
import DomainSchoolSwap from '../domain/domain-school-swap.js';
import FieldMap from '../domain/field-map.js';
import { UiAuth } from '../modules/ui-auth.js';
import { UiMutualPanelState } from '../modules/ui-mutual.js';
import { UiProxy } from '../modules/ui-proxy.js';
import { fallbackAvatarDataUri, showToast } from '../ui/toast.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
import { useMatchStore } from './match.js';
import { useMutualStore } from './mutual.js';
import { useOutputStore } from './output.js';
import { useRequestsStore } from './requests.js';
import { useSubmitStore } from './submit.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useSessionStore = defineStore('session', () => {
    const user = ref(null);
    const userRole = ref('teacher'); // 'admin' | 'staff' | 'teacher'
    const originalUser = ref(null); // 模擬前的原始管理員身分
    const proxyTargetEmail = ref('');
    const PROXY_SUBMIT_EMAILS_LS_KEY = 'jcjh_proxy_submit_emails';
    const proxySubmitEmails = ref((() => {
      try {
        const raw = localStorage.getItem('jcjh_proxy_submit_emails') || '';
        return raw.split(/[,，;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
      } catch (e) { return []; }
    })());
    const proxySubmitEnabledBy = ref('');
    const proxySubmitEnabledAt = ref('');
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
    const googleClientId = ref(atob('MTA4MTQ5MTA4NTI3OC12ZWZqY3BrdW0xM3Iydm0zbnVuZ3ZuNnZiMjU5bzJhdC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ=='));
    const gasApiUrl = ref(atob('aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J3Q0UwZm5JVWlyd2x3QWQ2WXJoZFJDWnNBX0tYczMxQW16Y2RZY2EwU05DY0dTWVdnTGUxYXpFY3l4MlA3bmlkb01NZy9leGVj'));
    let _gsiButtonRendered = false;
    let _gsiWaitTimer = null;
    let _gsiPopupHintTimer = null;
    let _gsiClickGen = 0;
    const gsiButtonReady = ref(true);
    const gsiButtonError = ref('');
    const gsiLoggingIn = ref(false);
    function renderGsiLoginButton() {
      gsiButtonReady.value = true;
      return true;
    }
    const callGasApiWithProgress = (action, data, label) =>
      useGasStore().callGasApi(action, data, { onProgress: gasProgressHandler(label || action), longOp: true });
    const allowedHdList = ref(useGasStore().DEFAULT_ALLOWED_HD.slice());
    const selectedMobileDay = ref(1);
    const isMobile = ref(false);
    const showMatchModal = ref(false);
    const checkMobile = () => {
      isMobile.value = window.innerWidth <= 768;
    };
    const loading = ref(true);
    const loadingMessage = ref('初始化系統中...');
    const TAB_LS_KEY = 'jcjh_active_tab';
    const ADMIN_SUBTAB_LS_KEY = 'jcjh_admin_sub_tab';
    const VALID_TABS = ['timetable', 'pending', 'records', 'class', 'admin'];
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
    const currentSemester = ref(localStorage.getItem('jcjh_semester') || '114-1');
    const semestersList = ref([]);
    const availableSemesters = computed(() => semestersList.value.map(s => s.id));
    const currentSemesterName = computed(() => {
      const sem = semestersList.value.find(s => s.id === currentSemester.value);
      return sem ? sem.name : currentSemester.value;
    });
    const showSemesterModal = ref(false);
    const semesterModalMode = ref('add');
    const semesterForm = ref({ id: '', name: '', startDate: '', endDate: '' });
    const toLocalDateStr = (date) => DateUtils.toLocalDateStr(date);
    const selectedWeekDate = ref(toLocalDateStr(new Date())); 
    const searchQuery = ref('');
    const selectedSubject = ref('mine');
    const timetableDisplayMode = ref('clean');
    let _allSchoolTipOnce = false;
    const teachersList = ref([]); // roster [{loginEmail, teacherName, subject, role, baseHours}]
    const allSchedules = ref([]); // name-keyed base schedule
    const schoolSwaps = ref([]); // 全校指定日期節次對調
    const substitutionRecords = ref([]);
    const homeroomRecords = ref([]);
    const homeroomAssignSelections = ref({});
    const homeroomRecordsLoading = ref(false);
    const isCourseAdjustmentOnlyRequest = (record) => {
      if (FieldMap && typeof FieldMap.isCourseAdjustmentOnly === 'function') {
        return FieldMap.isCourseAdjustmentOnly(record || {});
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
    const requestsList = ref([]); // Approved substitutions keyed by teacher names.
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
      if (!storeToRefs(useTimetableStore()).currentWeekDates.value.length) return '';
      const wn = getWeekNumber(storeToRefs(useTimetableStore()).currentWeekDates.value[0]);
      return wn > 0 ? `第 ${wn} 週` : '';
    });
    const isSingleWeek = (dateStr) => {
      const wn = getWeekNumber(dateStr);
      return wn === 0 || wn % 2 === 1;
    };
    const classAwayEvents = ref([]);
    const semesterEndDate = computed(() => {
      const sem = semestersList.value.find(s => s.id === currentSemester.value);
      return sem ? (sem.endDate || '') : '';
    });
    const isClassAwayOnDate = (className, dateStr, period) => {
      if (!className || !DomainClassAway) return false;
      const d = dateStr || DateUtils.getTodayString();
      const events = getClassAwayEventsForView();
      return DomainClassAway.isClassAwayOnDate(
        className, d, events, semesterEndDate.value, period
      );
    };
    const getClassAwayEventsForView = () => {
      const useClassViewEvents = storeToRefs(useMutualStore()).classReadonlyMode.value
        || (activeTab.value === 'class' && userRole.value === 'teacher');
      return useClassViewEvents ? storeToRefs(useMutualStore()).classViewClassAwayEvents.value : classAwayEvents.value;
    };
    const activeAwayBanner = computed(() => {
      const a = useTimetableStore().getTimetableApi();
      return a ? a.activeAwayBanner.value : null;
    });
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
      const rows = DomainSchoolSwap
        ? DomainSchoolSwap.normalizeRows(schoolSwaps.value)
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
      return day >= 1 && day <= 5 ? DateUtils.getWeekDayText(day) : '非上課日';
    };
    const isAdmin = computed(() => userRole.value === 'admin');
    const isStaff = computed(() => userRole.value === 'staff');
    const canViewAllTimetables = computed(() => isAdmin.value || isStaff.value);
    const proxySubmitEnabled = computed(() => (proxySubmitEmails.value || []).length > 0);
    const parseTeacherSubjects = (raw) => {
      if (DomainMatch && typeof DomainMatch.parseSubjects === 'function') {
        return DomainMatch.parseSubjects(raw);
      }
      return String(raw || '')
        .split(/[、,，/／|｜\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
    };
    let _proxyApi = null;
    let _authApi = null;
const getProxyApi = () => {
      if (_proxyApi) return _proxyApi;
      if (!UiProxy) {
        console.error('UiProxy 未載入');
        return null;
      }
      _proxyApi = UiProxy.create({
        computed, callGasApi: useGasStore().callGasApi, user, getTeacherNameByEmail: useDataStore().getTeacherNameByEmail, isAdmin, canStaffProxySubmit: storeToRefs(useSubmitStore()).canStaffProxySubmit,
        proxyTargetEmail, showProxyTargetDropdown, proxyTargetQuery, isStaff, teachersList,
        proxySubmitEmails, proxySubmitEnabledBy, proxySubmitEnabledAt,
        PROXY_SUBMIT_EMAILS_LS_KEY, loading, loadingMessage, onlineSubstitutionEnabled,
        proxyGrantQuery, lookupTeacher: useDataStore().lookupTeacher, parseTeacherSubjects, searchQuery, selectedSubject,
        canViewAllTimetables, isMutualCover: storeToRefs(useTourStore()).isMutualCover, proxySubmitEnabled
      });
      return _proxyApi;
    };

const getAuthApi = () => {
      if (_authApi) return _authApi;
      if (!UiAuth) {
        console.error('UiAuth 未載入');
        return null;
      }
      _authApi = UiAuth.create({
        googleClientId, gsiButtonError, gsiLoggingIn, classReadonlyMode: storeToRefs(useMutualStore()).classReadonlyMode,
        gsiButtonReady, selectedMobileDay, activeTab, adminSubTab, TAB_LS_KEY,
        ADMIN_SUBTAB_LS_KEY, VALID_TABS, VALID_ADMIN_SUBTABS, allowedHdList,
        parseAllowedHd: useGasStore().parseAllowedHd, proxySubmitEmails, PROXY_SUBMIT_EMAILS_LS_KEY,
        proxySubmitEnabledBy, proxySubmitEnabledAt, onlineSubstitutionEnabled,
        isEmailDomainAllowed: useGasStore().isEmailDomainAllowed, resetAppState: useBackofficeStore().resetAppState, loading, loadingMessage, isTokenExpired: useGasStore().isTokenExpired
      });
      return _authApi;
    };

    const isGoogleGsiReady = (...args) => {
      const a = getAuthApi();
      return a ? a.isGoogleGsiReady(...args) : undefined;
    };
    const waitForGoogleGsi = (...args) => {
      const a = getAuthApi();
      return a ? a.waitForGoogleGsi(...args) : undefined;
    };
    const gsiCredentialBridge = (...args) => {
      const a = getAuthApi();
      return a ? a.gsiCredentialBridge(...args) : undefined;
    };
    const isSecureHttpsOrigin = (...args) => {
      const a = getAuthApi();
      return a ? a.isSecureHttpsOrigin(...args) : undefined;
    };
    const isGsiInitialized = (...args) => {
      const a = getAuthApi();
      return a ? a.isGsiInitialized(...args) : undefined;
    };
    const suppressGsiAutoLogin = (...args) => {
      const a = getAuthApi();
      return a ? a.suppressGsiAutoLogin(...args) : undefined;
    };
    const ensureGsiInitialized = (...args) => {
      const a = getAuthApi();
      return a ? a.ensureGsiInitialized(...args) : undefined;
    };
    const setupGoogleSignInUi = (...args) => {
      const a = getAuthApi();
      return a ? a.setupGoogleSignInUi(...args) : undefined;
    };
    const reloadGsiLoginButton = (...args) => {
      const a = getAuthApi();
      return a ? a.reloadGsiLoginButton(...args) : undefined;
    };
    const getOAuthRedirectUri = (...args) => {
      const a = getAuthApi();
      return a ? a.getOAuthRedirectUri(...args) : undefined;
    };
    const makeOAuthNonce = (...args) => {
      const a = getAuthApi();
      return a ? a.makeOAuthNonce(...args) : undefined;
    };
    const clearOAuthUrlResidue = (...args) => {
      const a = getAuthApi();
      return a ? a.clearOAuthUrlResidue(...args) : undefined;
    };
    const parseOAuthReturnParams = (...args) => {
      const a = getAuthApi();
      return a ? a.parseOAuthReturnParams(...args) : undefined;
    };
    const consumeOAuthRedirectToken = (...args) => {
      const a = getAuthApi();
      return a ? a.consumeOAuthRedirectToken(...args) : undefined;
    };
    const loginWithGoogle = (...args) => {
      const a = getAuthApi();
      return a ? a.loginWithGoogle(...args) : undefined;
    };
    const refreshGoogleIdToken = (...args) => {
      const a = getAuthApi();
      return a ? a.refreshGoogleIdToken(...args) : undefined;
    };
    const gasProgressHandler = (...args) => {
      const a = getAuthApi();
      return a ? a.gasProgressHandler(...args) : undefined;
    };
    const applySettings = (...args) => {
      const a = getAuthApi();
      return a ? a.applySettings(...args) : undefined;
    };
    const assertSchoolDomain = (...args) => {
      const a = getAuthApi();
      return a ? a.assertSchoolDomain(...args) : undefined;
    };
    const initMobileDay = (...args) => {
      const a = getAuthApi();
      return a ? a.initMobileDay(...args) : undefined;
    };
    const persistNavPosition = (...args) => {
      const a = getAuthApi();
      return a ? a.persistNavPosition(...args) : undefined;
    };
    const setActiveTab = (...args) => {
      const a = getAuthApi();
      return a ? a.setActiveTab(...args) : undefined;
    };
    const canOperateOnTeacherEmail = (...args) => {
      const a = getProxyApi();
      return a ? a.canOperateOnTeacherEmail(...args) : undefined;
    };
    const ensureProxyTargetForTeacher = (...args) => {
      const a = getProxyApi();
      return a ? a.ensureProxyTargetForTeacher(...args) : undefined;
    };
    const setProxyTarget = (...args) => {
      const a = getProxyApi();
      return a ? a.setProxyTarget(...args) : undefined;
    };
    const filterStaffEmailsOnly = (...args) => {
      const a = getProxyApi();
      return a ? a.filterStaffEmailsOnly(...args) : undefined;
    };
    const persistProxySubmitEmails = (...args) => {
      const a = getProxyApi();
      return a ? a.persistProxySubmitEmails(...args) : undefined;
    };
    const toggleProxySubmitEmail = (...args) => {
      const a = getProxyApi();
      return a ? a.toggleProxySubmitEmail(...args) : undefined;
    };
    const setOnlineSubstitutionEnabled = (...args) => {
      const a = getProxyApi();
      return a ? a.setOnlineSubstitutionEnabled(...args) : undefined;
    };
    function initImmediateSession1() {
    watch(user, () => {
      avatarLoadFailed.value = false;
    });
    }
    function initImmediateSession2() {
    watch(activeTab, () => { if (_navPersistReady) persistNavPosition(); });
    }
    function initImmediateSession3() {
    watch(adminSubTab, () => { if (_navPersistReady) persistNavPosition(); });
    }
    function initImmediateSession4() {
    watch(selectedSubject, (v) => {
      if (v === 'all' && !_allSchoolTipOnce) {
        _allSchoolTipOnce = true;
        showToast('全校課表已分頁；可用上方搜尋姓名快速定位', 'info', 2800);
      }
    });
    }
    function initImmediateSession5() {
    watch([searchQuery, selectedSubject, () => (storeToRefs(useTimetableStore()).displayTimetableTeachers.value || []).length], () => {
      storeToRefs(useTimetableStore()).ttPage.value = 1;
    });
    }
    function initImmediateSession6() {
    watch(showMatchModal, (open) => {
      if (open) {
        useMatchStore().bindMatchNativeSelect();
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(useInteractionStore().paintMatchSourceDom);
        }
      } else {
        useMatchStore().clearMatchPreview();
        useMatchStore().unbindMatchNativeSelect();
        try {
          document.querySelectorAll('.grid-cell-class.is-match-source')
            .forEach((el) => {
              el.classList.remove('is-match-source', 'is-match-exchange-source');
            });
        } catch (e) { /* ignore */ }
      }
    });
    }
    function initImmediateSession7() {
    watch([showMatchModal, storeToRefs(useTourStore()).matchMode, storeToRefs(useTourStore()).activeCell], () => {
      if (showMatchModal.value) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(useInteractionStore().paintMatchSourceDom);
        } else {
          useInteractionStore().paintMatchSourceDom();
        }
      }
    });
    }
    function initImmediateSession8() {
    watch([activeTab, adminSubTab], ([tab, subTab]) => {
      if (tab === 'admin' && subTab === 'period8') {
        useOutputStore().ensurePeriod8Ready().catch((error) => console.error('第八節模組載入失敗：', error));
      }
    }, { immediate: true });
    }
    function initImmediateSession9() {
    watch([semestersList, isAdmin], ([list, admin]) => {
      if (admin) return;
      const def = list.find(s => s.isDefault);
      if (def && def.id !== currentSemester.value) {
        currentSemester.value = def.id;
        localStorage.setItem('jcjh_semester', def.id);
      }
    });
    }
    function initImmediateSession10() {
    watch(currentSemester, (newSem, oldSem) => {
      if (newSem && newSem !== oldSem) {
        localStorage.setItem('jcjh_semester', newSem);
        if (typeof useGasStore().cancelAll === 'function') useGasStore().cancelAll();
        useDataStore().loadWeeklyData().catch(function () {});
      }
    });
    }
    async function initSession1() {
      checkMobile();
      initMobileDay();
      window.addEventListener('resize', checkMobile);

      // 連線設定固定內建（setup 開頭已清除舊 localStorage 鍵，不在此覆寫）

      // 還原活動互代面板暫存（期間／外出班／帶隊／暫定）
      // 2B 懶載：先等互代模組就緒，否則還原會被靜默跳過
      try {
        if (!UiMutualPanelState && typeof window.ensureUiMutual === 'function') {
          await window.ensureUiMutual();
        }
        const saved = useMutualStore().restoreMutualPanelDraft();
        if (saved) useMutualStore().applyMutualPanelDraft(saved);
      } catch (e) { /* ignore */ }

      // 先解析班級唯讀深連結
      const hasClassLink = useInteractionStore().applyClassViewFromUrl();

      // OAuth 回傳 #id_token=…（prompt=select_account，每次強制選帳）
      const redirectToken = consumeOAuthRedirectToken();
      if (redirectToken) {
        try { sessionStorage.setItem('jcjh_google_id_token', redirectToken); } catch (eR) { /* ignore */ }
      }

      // 檢查是否已有登入之 Google ID Token 快取
      const idToken = sessionStorage.getItem('jcjh_google_id_token');
      if (idToken && !useGasStore().isTokenExpired(idToken)) {
         const payload = useGasStore().decodeJwt(idToken);
         if (payload) {
            if (!assertSchoolDomain(payload)) return;
            const loginMeta = await useDataStore().preflightGoogleLogin(payload);
            if (!loginMeta) {
              if (hasClassLink) await useDataStore().loadPublicClassData(storeToRefs(useMutualStore()).pendingClassView.value || storeToRefs(useMutualStore()).selectedClass.value);
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
             await useDataStore().loadWeeklyData();
             if (hasClassLink) await useDataStore().loadPublicClassData(storeToRefs(useMutualStore()).pendingClassView.value || storeToRefs(useMutualStore()).selectedClass.value);
             await useRequestsStore().checkUrlCallback(user.value);
            // 資料載入與簽核 callback 後再還原分頁，避免被中間流程蓋掉
            if (!hasClassLink && !storeToRefs(useMutualStore()).classReadonlyMode.value) useBackofficeStore().restoreNavAfterLogin();
            else _navPersistReady = true;

             if (useTourStore().shouldAutoStartOnboarding()) {
               setTimeout(() => useTourStore().startOnboarding(), 800);
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
            await useDataStore().loadPublicClassData(storeToRefs(useMutualStore()).pendingClassView.value || storeToRefs(useMutualStore()).selectedClass.value);
          } else {
            loading.value = false;
            useBackofficeStore().restoreNavAfterLogin();
          }
        }
      } else {
        sessionStorage.removeItem('jcjh_google_id_token');
        user.value = null;
        // 免登入：?class=701 直接載入公開班級課表
        if (hasClassLink) {
          await useDataStore().loadPublicClassData(storeToRefs(useMutualStore()).pendingClassView.value || storeToRefs(useMutualStore()).selectedClass.value);
        } else {
          loading.value = false;
          useBackofficeStore().restoreNavAfterLogin();
        }
      }

      // 初始化 Google Sign-in（等 GSI 腳本就緒再 init／render，避免 async 競態）
      if (googleClientId.value && !storeToRefs(useMutualStore()).classReadonlyMode.value) {
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
          const payload = useGasStore().decodeJwt(token);
          if (!payload) {
            showToast('無法解析 Google 登入憑證', 'error');
            return;
          }
           if (!assertSchoolDomain(payload)) return;
           const loginMeta = await useDataStore().preflightGoogleLogin(payload);
           if (!loginMeta) return;
           user.value = {
            email: payload.email,
            displayName: payload.name,
            photoURL: payload.picture
          };
          loading.value = true;
          loadingMessage.value = '登入成功，同步系統中...';

           try {
             await useDataStore().loadWeeklyData();
             if (hasClassLink) await useDataStore().loadPublicClassData(storeToRefs(useMutualStore()).pendingClassView.value || storeToRefs(useMutualStore()).selectedClass.value);
             await useRequestsStore().checkUrlCallback(user.value);
            if (!storeToRefs(useMutualStore()).classReadonlyMode.value) useBackofficeStore().restoreNavAfterLogin();
            else _navPersistReady = true;

             if (useTourStore().shouldAutoStartOnboarding()) {
               setTimeout(() => useTourStore().startOnboarding(), 800);
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
            if (typeof useGasStore().isTokenExpiringSoon === 'function' && useGasStore().isTokenExpiringSoon(tok, 6 * 60 * 1000)) {
              refreshGoogleIdToken().catch(() => {});
            }
          } catch (e) { /* ignore */ }
        };
        setInterval(tokenKeepAlive, 4 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            tokenKeepAlive();
            // 回到登入頁且按鈕不見時補渲染
            if (!user.value && !storeToRefs(useMutualStore()).classReadonlyMode.value && !gsiButtonReady.value) {
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
    }
    function initImmediateSession11() {
    watch(user, (u, prev) => {
      if (!u && prev && !storeToRefs(useMutualStore()).classReadonlyMode.value) {
        _gsiButtonRendered = false;
        gsiButtonReady.value = false;
        nextTick(() => setupGoogleSignInUi());
      }
    });
    }
    const VALID_ADMIN_SUBTABS = ['billing', 'period8', 'teachers', 'classAway', 'schoolSwap', 'settings', 'schoolExport'];
  return { user, userRole, originalUser, proxyTargetEmail, PROXY_SUBMIT_EMAILS_LS_KEY, proxySubmitEmails, proxySubmitEnabledBy, proxySubmitEnabledAt, onlineSubstitutionEnabled, showProxyTargetDropdown, proxyTargetQuery, proxyGrantQuery, avatarLoadFailed, avatarSrc, handleAvatarError, googleClientId, gasApiUrl, gsiButtonReady, gsiButtonError, gsiLoggingIn, renderGsiLoginButton, callGasApiWithProgress, allowedHdList, selectedMobileDay, isMobile, showMatchModal, checkMobile, loading, loadingMessage, TAB_LS_KEY, ADMIN_SUBTAB_LS_KEY, VALID_TABS, readHashTab, readHashAdminSub, readStoredTab, readStoredAdminSubTab, activeTab, adminSubTab, _navPersistReady, currentSemester, semestersList, availableSemesters, currentSemesterName, showSemesterModal, semesterModalMode, semesterForm, toLocalDateStr, selectedWeekDate, searchQuery, selectedSubject, timetableDisplayMode, teachersList, allSchedules, schoolSwaps, substitutionRecords, homeroomRecords, homeroomAssignSelections, homeroomRecordsLoading, isCourseAdjustmentOnlyRequest, isEmptySlotAssignmentRequest, requestsList, semesterStartDate, getWeekNumber, currentWeekNumber, isSingleWeek, classAwayEvents, semesterEndDate, isClassAwayOnDate, getClassAwayEventsForView, activeAwayBanner, showSchoolSwapModal, schoolSwapModalMode, schoolSwapSaving, schoolSwapForm, schoolSwapRows, schoolSwapWeekdayNumber, schoolSwapWeekdayText, isAdmin, isStaff, canViewAllTimetables, proxySubmitEnabled, parseTeacherSubjects, getProxyApi, getAuthApi, isGoogleGsiReady, waitForGoogleGsi, gsiCredentialBridge, isSecureHttpsOrigin, isGsiInitialized, suppressGsiAutoLogin, ensureGsiInitialized, setupGoogleSignInUi, reloadGsiLoginButton, getOAuthRedirectUri, makeOAuthNonce, clearOAuthUrlResidue, parseOAuthReturnParams, consumeOAuthRedirectToken, loginWithGoogle, refreshGoogleIdToken, gasProgressHandler, applySettings, assertSchoolDomain, initMobileDay, persistNavPosition, setActiveTab, canOperateOnTeacherEmail, ensureProxyTargetForTeacher, setProxyTarget, filterStaffEmailsOnly, persistProxySubmitEmails, toggleProxySubmitEmail, setOnlineSubstitutionEnabled, initImmediateSession1, initImmediateSession2, initImmediateSession3, initImmediateSession4, initImmediateSession5, initImmediateSession6, initImmediateSession7, initImmediateSession8, initImmediateSession9, initImmediateSession10, initSession1, initImmediateSession11 };
});
