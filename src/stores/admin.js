/** v2 stores/admin.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { UiAdmin } from '../modules/ui-admin.js';
import { showConfirm, showToast } from '../ui/toast.js';
import { useBackofficeStore } from './backoffice.js';
import { useDataStore } from './data.js';
import { useGasStore } from './gas.js';
import { useInteractionStore } from './interaction.js';
import { useSessionStore } from './session.js';
import { useTimetableStore } from './timetable.js';
import { useTourStore } from './tour.js';
import { storeToRefs } from 'pinia';
export const useAdminStore = defineStore('admin', () => {
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
      const DAC0 = useTourStore().DAC();
      if (DAC0 && DAC0.quotaZeroNeedsRepay) {
        return DAC0.quotaZeroNeedsRepay(storeToRefs(useDataStore()).emptySlotForm.value.quota);
      }
      return (parseInt(storeToRefs(useDataStore()).emptySlotForm.value.quota, 10) || 0) <= 0;
    });
    let _uiAdminApi = null;
    let _uiAdminModalsBound = false;
    const getScheduleAttrLabel = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getScheduleAttrLabel === 'function') return _uiAdminApi.getScheduleAttrLabel(...a);
      return String(a[0] && a[0].attr || '一般');
    };
    const getSchedule = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getSchedule === 'function') return _uiAdminApi.getSchedule(...a);
      return null;
    };
    const getOvertimeExpenseSourceOptions = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getOvertimeExpenseSourceOptions === 'function') return _uiAdminApi.getOvertimeExpenseSourceOptions(...a);
      return storeToRefs(useTimetableStore()).accountingPlanOptions.value || [];
    };
    const getMappingLabel = (...a) => {
      if (_uiAdminApi && typeof _uiAdminApi.getMappingLabel === 'function') return _uiAdminApi.getMappingLabel(...a);
      return String(a[0] || '');
    };
    let uiAdminWarmupHandle = null;
    const showQuotaLedgerModal = ref(false);
    const quotaLedgerLoading = ref(false);
    const quotaLedgerTeacher = ref(null); // { email, name, balance, sheetQuota }
    const quotaLedgerRows = ref([]);
    const _quotaLedgerCache = Object.create(null);
    const QUOTA_LEDGER_CACHE_MS = 180000;
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
    const closeManualQuotaAdjust = () => {
      if (!quotaAdjustSaving.value) showQuotaAdjustModal.value = false;
    };
const ensureUiAdminApi = async () => {
      if (_uiAdminApi) return _uiAdminApi;
      _uiAdminApi = UiAdmin.create({
        ref,
        callGasApi: useGasStore().callGasApi,
        callGasApiWithProgress: useSessionStore().callGasApiWithProgress,
        showToast,
        showConfirm,
        loading: storeToRefs(useSessionStore()).loading,
        loadingMessage: storeToRefs(useSessionStore()).loadingMessage,
        softRefreshInBackground: useDataStore().softRefreshInBackground,
        clearScheduleCache: useTimetableStore().clearScheduleCache,
        loadWeeklyData: useDataStore().loadWeeklyData,
         getTeacherNameByEmail: useDataStore().getTeacherNameByEmail,
         currentSemester: storeToRefs(useSessionStore()).currentSemester,
         showQuotaLedgerModal, quotaLedgerTeacher, quotaLedgerRows, quotaLedgerLoading,
         _quotaLedgerCache, QUOTA_LEDGER_CACHE_MS, fetchMutualQuotaLedger: useGasStore().fetchMutualQuotaLedger, isAdmin: storeToRefs(useSessionStore()).isAdmin,
         semesterStartDate: storeToRefs(useSessionStore()).semesterStartDate,
         semesterEndDate: storeToRefs(useSessionStore()).semesterEndDate,
           teachersList: storeToRefs(useSessionStore()).teachersList,
        allSchedules: storeToRefs(useSessionStore()).allSchedules,
        leaveReasonOptions,
        getHistoryEditDefaultSubFee: function (reason, period) {
          return useBackofficeStore().getHistoryEditDefaultSubFee(reason, period);
        },
        historyEditForm: storeToRefs(useDataStore()).historyEditForm,
        showHistoryEditModal: storeToRefs(useDataStore()).showHistoryEditModal,
        requestsList: storeToRefs(useSessionStore()).requestsList,
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
          accountingPeriod: storeToRefs(useDataStore()).accountingPeriod,
         reportMonth: storeToRefs(useDataStore()).reportMonth,
         accountingPlanOptions: storeToRefs(useTimetableStore()).accountingPlanOptions,
         excelData,
        excelHeaders,
        mappingFields,
        importPreview
      });
      if (!_uiAdminModalsBound) {
        _uiAdminModalsBound = true;
        useInteractionStore().bindFlagModal(showImportTeachersModal, () => { showImportTeachersModal.value = false; }, '匯入教師');
        useInteractionStore().bindFlagModal(showTeacherModal, () => { showTeacherModal.value = false; }, '教師資料');
        useInteractionStore().bindFlagModal(showOvertimePlanModal, () => { showOvertimePlanModal.value = false; }, '超鐘點經費來源');
        useInteractionStore().bindFlagModal(showTeacherExpenseAuditModal, () => { showTeacherExpenseAuditModal.value = false; }, '教師經費來源檢查');
        useInteractionStore().bindFlagModal(showScheduleEditModal, () => { showScheduleEditModal.value = false; }, '編輯課表');
        useInteractionStore().bindFlagModal(storeToRefs(useDataStore()).showHistoryEditModal, () => { storeToRefs(useDataStore()).showHistoryEditModal.value = false; }, '編輯歷史');
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
    const openAddTeacherModal = (...a) => needUiAdmin('openAddTeacherModal', ...a);
    const openEditTeacherModal = (...a) => needUiAdmin('openEditTeacherModal', ...a);
    const saveTeacher = (...a) => needUiAdmin('saveTeacher', ...a);
    const openOvertimePlanModal = (...a) => needUiAdmin('openOvertimePlanModal', ...a);
    const saveOvertimePlan = (...a) => needUiAdmin('saveOvertimePlan', ...a);
    const openTeacherExpenseAuditModal = (...a) => needUiAdmin('openTeacherExpenseAuditModal', ...a);
    const normalizeTeacherExpenseData = (...a) => needUiAdmin('normalizeTeacherExpenseData', ...a);
    const deleteTeacher = (...a) => needUiAdmin('deleteTeacher', ...a);
    const handleTeacherExcelChange = (...a) => needUiAdmin('handleTeacherExcelChange', ...a);
    const importTeachersBatch = (...a) => needUiAdmin('importTeachersBatch', ...a);
    const handleFileChange = (...a) => needUiAdmin('handleFileChange', ...a);
    const openHistoryEditModal = (...a) => needUiAdmin('openHistoryEditModal', ...a);
    const saveHistoryEdit = (...a) => needUiAdmin('saveHistoryEdit', ...a);
    const onHistoryEditReasonChange = (...a) => needUiAdmin('onHistoryEditReasonChange', ...a);
    const onHistoryEditTypeChange = (...a) => needUiAdmin('onHistoryEditTypeChange', ...a);
    const onHistoryEditPeriodChange = (...a) => needUiAdmin('onHistoryEditPeriodChange', ...a);
    const onHistoryEditDateChange = (...a) => needUiAdmin('onHistoryEditDateChange', ...a);
    const openQuotaLedger = (...a) => needUiAdmin('openQuotaLedger', ...a);
    function initImmediateAdmin1() {
    watch([storeToRefs(useSessionStore()).isAdmin, storeToRefs(useSessionStore()).activeTab], ([admin, tab]) => {
      if (!admin || tab !== 'admin' || _uiAdminApi || uiAdminWarmupHandle !== null) return;
      const warmup = () => {
        uiAdminWarmupHandle = null;
        if (storeToRefs(useSessionStore()).isAdmin.value && storeToRefs(useSessionStore()).activeTab.value === 'admin') {
          ensureUiAdminApi().catch(function () {});
        }
      };
      uiAdminWarmupHandle = typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(warmup, { timeout: 1200 })
        : setTimeout(warmup, 300);
    });
    }
    function initAdmin1() { useInteractionStore().bindFlagModal(showQuotaLedgerModal, () => { showQuotaLedgerModal.value = false; }, '額度歷程'); }
    const saveScheduleCell = (...a) => needUiAdmin('saveScheduleCell', ...a);
    const clearScheduleCell = (...a) => needUiAdmin('clearScheduleCell', ...a);
    const updateTeacherBaseHours = (...a) => needUiAdmin('updateTeacherBaseHours', ...a);
    const fillFixedOvertimeFromCurrentSchedule = (...a) => needUiAdmin('fillFixedOvertimeFromCurrentSchedule', ...a);
    const fillFixedOvertimeForAllTeachers = (...a) => needUiAdmin('fillFixedOvertimeForAllTeachers', ...a);
  return { leaveReasonOptions, showImportTeachersModal, teacherExcelData, teacherExcelHeaders, teacherMappingFields, teacherImportPreview, showScheduleEditModal, scheduleForm, showTeacherModal, teacherModalMode, teacherForm, showOvertimePlanModal, overtimePlanTeacher, overtimePlanRows, overtimePlanPeriodEnd, overtimePlanUsesFixedSlots, showTeacherExpenseAuditModal, teacherExpenseAuditRows, teacherExpenseAuditSummary, excelData, excelHeaders, mappingFields, importPreview, dashboardScope, emptySlotQuotaZero, getScheduleAttrLabel, getSchedule, getOvertimeExpenseSourceOptions, getMappingLabel, showQuotaLedgerModal, quotaLedgerLoading, quotaLedgerTeacher, quotaLedgerRows, _quotaLedgerCache, QUOTA_LEDGER_CACHE_MS, closeQuotaLedger, quotaTypeClass, showQuotaAdjustModal, quotaAdjustSaving, quotaAdjustForm, quotaAdjustPreview, closeManualQuotaAdjust, ensureUiAdminApi, needUiAdmin, runTeacherImportPreview, importSchedules, migrateNameKeySchema, runImportPreview, downloadScheduleTemplate, downloadCurrentSchedules, openScheduleEditModal, pickScheduleAttr, normalizeScheduleFormFlags, openAddTeacherModal, openEditTeacherModal, saveTeacher, openOvertimePlanModal, saveOvertimePlan, openTeacherExpenseAuditModal, normalizeTeacherExpenseData, deleteTeacher, handleTeacherExcelChange, importTeachersBatch, handleFileChange, openHistoryEditModal, saveHistoryEdit, onHistoryEditReasonChange, onHistoryEditTypeChange, onHistoryEditPeriodChange, onHistoryEditDateChange, openQuotaLedger, initImmediateAdmin1, initAdmin1, saveScheduleCell, clearScheduleCell, updateTeacherBaseHours, fillFixedOvertimeFromCurrentSchedule, fillFixedOvertimeForAllTeachers };
});
