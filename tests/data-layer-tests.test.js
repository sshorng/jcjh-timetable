import assert from 'node:assert/strict';
import { test } from 'vitest';
import path from 'node:path';
import { UiData } from '../src/modules/ui-data.js';

test('data layer tests（v1 移植）', () => {
  /**
   * UiData 資料層測試（2A：app.js §5 搬移的安全網）
   *
   * 驗證重點：
   * - create 回傳 25 件 API（含 2 computed）
   * - optimisticPatch → recompute 桶重算（含 _approvedConvertSig 去重）
   * - applyInitialPayload：排序／水位 accessor／substitution 轉換
   * - 共享 lets 已遷入（_softRefresh*／_approvedConvertSig 不再依賴 app 作用域）
   */

  const ref = (v) => ({ value: v });
  const computed = (fn) => ({ get value() { return fn(); } });

  window = window || {};

  assert.ok(UiData, 'UiData 應掛載');

  let seq = 0;
  let watermark = '';
  const deps = {
    computed,
    activeCell: ref(null), matchMode: ref('substitution'), matchSearchQuery: ref(''),
    exchangeWeekdayFilter: ref(0), clearMatchPreview: () => {}, triangleCellIsUsable: () => true,
    resetTriangleDraft: () => {}, fetchRecommendations: () => {},
    teachersList: ref([{ loginEmail: 'a@school.example', email: 'a@school.example', name: '陳小華' }]),
    allSchedules: ref([]), currentWeekDates: ref([]),
    lookupTeacher: () => null, devTeacherQuery: ref(''),
    isTriangleRequest: () => false,
    requestsList: ref([]), isAdminDirectRequest: () => false,
    getTeacherNameByEmail: (email) => String(email || '').toLowerCase() === 'a@school.example' ? '陳小華' : String(email || ''), user: ref(null), userRole: ref('teacher'),
    scheduleScope: ref(''), semestersList: ref([]), classDirectory: ref([]),
    schoolSwaps: ref([]), homeroomRecords: ref([]),
    sortRequestListDesc: (rows) => rows.slice(),
    substitutionRecords: ref([]), convertRequestsToSubstitutions: () => [{ id: 'sub1' }],
    approvedConvertSig: (rows) => 'sig-' + rows.length,
    bumpRequestsWatermarkFromRows: () => {},
    effectiveUserEmail: ref(''), mySentRequests: ref([]), myPendingRequests: ref([]),
    currentSemester: ref(''), scheduleScope: ref(''),
    adminPendingRequests: ref([]), collapseTriangleRows: (rows) => rows,
    allPendingRequests: ref([]), classAwayEvents: ref([]), applySettings: () => {},
    requestWindowInfo: ref(null), historyFullLoaded: ref(false),
    stampIsNewer: (a, b) => String(a) > String(b), clearScheduleCache: () => {},
    softSyncing: ref(false), softSyncRequestsDelta: async () => 'empty',
    softSyncRequestsOnly: async () => true, softSyncPendingOnly: async () => true,
    isAdmin: ref(false), loadHomeroomRecords: async () => {}, dataUpdatedAt: ref(null),
    gasApiUrl: ref('https://example.invalid/exec'), fetchMetaData: async () => ({ success: true }),
    classViewSchedules: ref([]), classViewSchoolSwaps: ref([]), classViewLoadedClass: ref(''),
    classViewSubstitutionRecords: ref([]), mapPublicClassRequests: () => [],
    classViewClassAwayEvents: ref([]), pendingClassView: ref(''), selectedClass: ref(''),
    cancelAll: () => {}, loading: ref(false), loadingMessage: ref(''),
    classReadonlyMode: ref(false), activeTab: ref('timetable'),
    fetchPublicClassData: async () => ({}), resolvePendingClassView: () => {},
    fetchInitialData: async () => ({}), logout: () => {}, semesterForm: ref({ id: '', name: '' }),
    semesterModalMode: ref('add'), showSemesterModal: ref(false), gsiButtonError: ref(''),
    SOFT_REFRESH_MIN_GAP_MS: 3500,
    _getDataLoadSeq: () => seq,
    _nextDataLoadSeq: () => { seq += 1; return seq; },
    _getRequestsWatermark: () => watermark,
    _setRequestsWatermark: (v) => { watermark = v; },
  };
  const api = UiData.create(deps);

  const EXPECTED = ['changeMatchMode', 'teacherTimetableHours', 'getTeacherTimetableHours', 'getRealTeacherName', 'filteredDevTeachers', 'getTriangleGroupRequests', 'isMySentRequest', 'applyInitialPayload', 'recomputeRequestBuckets', 'optimisticPatchRequestStatuses', 'optimisticPatchRequestStatus', 'optimisticPatchTriangleGroup', 'optimisticRemoveRequest', 'markDataUpdated', 'softRefreshInBackground', 'resolveUserRoleFromTeachers', 'loadSemesters', 'applyClassPayload', 'preflightGoogleLogin', 'loadPublicClassData', 'loadWeeklyData', 'saveClientSettings', 'saveSemester', 'deleteSemester', 'setDefaultSemester'];
  for (const k of EXPECTED) assert.ok(api[k], '缺少 ' + k);

  // optimistic 更新＋桶重算（recompute 需已登入）
  deps.user.value = { email: 'A@school.example', displayName: '陳小華' };
  deps.effectiveUserEmail.value = 'a@school.example';
  deps.requestsList.value = [{ id: 'r1', status: 'pending_teacher' }, { id: 'r2', status: 'approved' }];
  assert.equal(api.optimisticPatchRequestStatuses([{ id: 'r1', status: 'approved' }]), true);
  assert.equal(deps.requestsList.value.find(r => r.id === 'r1').status, 'approved');
  assert.equal(deps.substitutionRecords.value.length, 1, 'recompute 應觸發 convert（sig 變更）');
  assert.equal(api.optimisticPatchRequestStatus('r2', 'approved'), true, '狀態相同仍回 true');
  api.optimisticRemoveRequest('r1');
  assert.equal(deps.requestsList.value.length, 1);

  // applyInitialPayload：排序／水位／轉換
  api.applyInitialPayload({
    userRole: 'teacher',
    semesters: [{ id: '114-1', name: 't', startDate: '', endDate: '', isDefault: true }],
    requests: [{ id: 'r9', status: 'pending_teacher', targetTeacherName: '陳小華' }],
    serverTime: '2026-10-04T00:00:00.000Z',
  });
  assert.equal(deps.userRole.value, 'teacher');
  assert.equal(watermark, '2026-10-04T00:00:00.000Z', '水位應經 setter 推進');
  assert.equal(deps.myPendingRequests.value.length, 1);

  // 共享 lets 已遷入：連打兩次 recompute 不重複 convert（H5 去重在模組內生效）
  deps.substitutionRecords.value = [];
  api.recomputeRequestBuckets();
  assert.equal(deps.substitutionRecords.value.length, 0, 'sig 未變應略過 convert');

  // saveClientSettings 純提示
  let toasted = '';
  const ctx2 = Object.assign({}, deps);
  const api2 = UiData.create(Object.assign({}, deps, {}));
  assert.equal(typeof api2.saveClientSettings, 'function');

  console.log('ui-data tests PASS（25 API＋樂觀更新＋水位＋H5 去重）');

});
