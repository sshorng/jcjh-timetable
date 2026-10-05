#!/usr/bin/env node
'use strict';
/**
 * port-paperflow.cjs — paper-flow-contract（2571行）→ v2 vitest，一次性機械移植。
 * 規則：
 * - load('f').NS → ESM import 直引（5 檔）
 * - loader helpers（vm 整檔＋stub context）→ 對應 create(stubs)，stub 去 window／全域鍵
 * - 源碼讀檔 → v2 路徑表；index.html→App.vue；app.js→逐條映射；?v=→v2 等價
 * - 尾部 promise 鏈 → 單一 async test 依序 await
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'tests');
let s = fs.readFileSync(path.join(ROOT, 'tests', 'paper-flow-contract-tests.js'), 'utf8').replace(/\r\n/g, '\n');
const fail = (m) => { throw new Error(m); };
const must = (re, what) => { if (!re.test(s)) fail('缺期望片段：' + what); };

// ---------- 0. 檔頭 ----------
s = s.replace(/^#!.*\n/, '').replace(/^'use strict';\n/, '');
s = s.replace(/const assert = require\('node:assert\/strict'\);\n/, "import assert from 'node:assert/strict';\n");
s = s.replace(/const fs = require\('node:fs'\);\n/, "import fs from 'node:fs';\n");
s = s.replace(/const path = require\('node:path'\);\n/, "import path from 'node:path';\n");
s = s.replace(/const vm = require\('node:vm'\);\n/, "import { test } from 'vitest';\nimport { fileURLToPath } from 'node:url';\nimport { createPinia, setActivePinia } from 'pinia';\n");
s = s.replace(/const root = path\.resolve\(__dirname, '\.\.'\);\n/, "const here = path.dirname(fileURLToPath(import.meta.url));\nconst root = path.join(here, '..', '..');\n");

// ---------- 1. load(sourceName) 整函式刪除 ----------
{
  const i = s.indexOf('function load(sourceName) {');
  if (i < 0) fail('找不到 load()');
  let k = s.indexOf('\nfunction ', i + 10);
  k = k < 0 ? s.length : k + 1;
  s = s.slice(0, i) + s.slice(k);
}
// load('f').NS → NS
const LOAD_NS = {
  'field-map.js': 'FieldMap', 'ui-admin.js': 'UiAdmin', 'ui-request.js': 'UiSubmitHelpers',
  'ui-approval.js': 'UiApproval', 'ui-activity.js': null // .UiBatchPanel／.UiBatchSubmit 各自處理
};
s = s.replace(/load\('ui-activity\.js'\)\.(UiBatchPanel|UiBatchSubmit)/g, '$1');
s = s.replace(/load\('([^']+)'\)\.([A-Za-z_][A-Za-z0-9_]*)/g, (m0, f, ns) => {
  if (!(f in LOAD_NS)) fail('未知 load 目標：' + f);
  if (LOAD_NS[f] === null) fail('不應到此：' + m0);
  if (LOAD_NS[f] !== ns) fail('命名空間不符：' + m0);
  return ns;
});

// ---------- 2. loader helpers → ESM ----------
function swapFn(name, replacement) {
  // 頂層函式以 col 0 的下一個 function／EOF 為界（內有正則量詞大括號，不可數 brace）
  const i = s.indexOf('function ' + name + '(');
  if (i < 0) fail('找不到函式：' + name);
  let k = s.indexOf('\nfunction ', i + 10);
  k = k < 0 ? s.length : k + 1;
  s = s.slice(0, i) + replacement + '\n' + s.slice(k);
}

swapFn('loadPaperDraftRecordBuilder', `function loadPaperDraftRecordBuilder(pendingRequestData) {
  // v2：UiPrint.create 直驗（body 與 v1 一致；v1 另有源碼切片斷言，見下）
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-print.js'), 'utf8');
  assert.match(libSource, /const buildPaperDraftRecords = /,
    'paper draft record builder must remain discoverable');
  return UiPrint.create({
    pendingRequestData,
    batchSlots: ref([]),
    getTeacherNameByEmail: value => ({
      'month@example.com': '洪筱仙',
      'sheng@example.com': '吳冠萱'
    })[String(value || '').toLowerCase()] || String(value || ''),
    isCombinedReturnRequest: () => false,
    isCourseAdjustmentOnlyRequest: isCourseAdjustmentOnlyForTest,
    decodePaperTimeKey: value => {
      const parts = String(value || '').split('-');
      return { day: parseInt(parts[0], 10), period: parseInt(parts[1], 10) };
    }
  }).buildPaperDraftRecords;
}`);

swapFn('loadSubmittedPaperRecordBuilder', `function loadSubmittedPaperRecordBuilder() {
  // v2：UiExport.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-export.js'), 'utf8');
  assert.match(libSource, /const buildPaperRecordsForSubmittedRequests =/,
    'submitted paper record builder must remain discoverable');
  return UiExport.create({
    teachersList: ref([
      { loginEmail: 'owner@example.com', email: '申請人', teacherName: '申請人', name: '申請人' },
      { loginEmail: 'invitee@example.com', email: '受邀人', teacherName: '受邀人', name: '受邀人' }
    ]),
    isCourseAdjustmentOnlyRequest: isCourseAdjustmentOnlyForTest,
    isCombinedReturnRequest: () => false,
    resolveExchangeTargetCell: () => ({ className: '704', subject: '國文' }),
    findBaseScheduleSlot: () => null,
    getTeacherNameByEmail: value => ({
      'owner@example.com': '申請人',
      'invitee@example.com': '受邀人'
    })[String(value || '').toLowerCase()] || String(value || '')
  }).buildPaperRecordsForSubmittedRequests;
}`);

swapFn('loadApproveRiskFlags', `function loadApproveRiskFlags() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function getApproveRiskFlags\\(req\\) \\{/,
    'approve risk flag helper must remain discoverable');
  const roster = [
    { loginEmail: 'leave@example.com', email: '被代教師', teacherName: '被代教師', name: '被代教師', mutualQuota: 0 },
    { loginEmail: 'cover@example.com', email: '代課教師', teacherName: '代課教師', name: '代課教師', mutualQuota: 1 }
  ];
  const lookupTeacher = value => {
    const key = String(value || '').trim().toLowerCase();
    return roster.find(t => [t.loginEmail, t.email, t.teacherName, t.name]
      .filter(Boolean).some(candidate => String(candidate).toLowerCase() === key)) || null;
  };
  const get = UiApproval.create({
    ref: value => ({ value }),
    teachersList: ref(roster),
    lookupTeacher,
    isExchangeLikeRequest: () => false,
    isQuotaDeductFee: fee => String(fee || '') === '扣額度' || String(fee || '') === '互代不結',
    isTimetableOnlyFee: fee => String(fee || '') === '僅課表呈現（不結算）' || String(fee || '') === '僅課表呈現',
    isLeaveClassRestricted: () => false,
    isExchangeClassRestricted: () => false,
    isRequestExchangeRechanged: () => false,
    ACTIVITY_PUBLIC_FEE: '活動公費'
  }).getApproveRiskFlags;
  return { get, roster };
}`);

// loadApprovedExchangeConverter：整檔 vm → UiTimetable.create（stub 逐字保留，僅去 window／全域鍵）
{
  const i = s.indexOf('function loadApprovedExchangeConverter(');
  if (i < 0) fail('找不到 loadApprovedExchangeConverter');
  let k = s.indexOf('\nfunction ', i + 10);
  k = k < 0 ? s.length : k + 1;
  const body = s.slice(i, k);
  if (!/return context\.window\.UiTimetable\.create\(\{/.test(body)) fail('converter 結構不符');
  // 抽 stub context 內的 deps（去掉 window 與 JS 全域鍵）
  const ctxm = body.match(/const context = \{([\s\S]*?)\n  \};/);
  if (!ctxm) fail('converter stub context 未找到');
  let stub = ctxm[1];
  stub = stub.replace(/\n {4}window: \{[^}]*\},\n/, '\n');
  stub = stub.replace(/\n {4}(Date|Error|Math|Object|Promise|String|Number|Array|RegExp|Set|Map|parseInt|isNaN)(,)?\n/g, '\n');
  const retm = body.match(/return context\.window\.UiTimetable\.create\(\{([\s\S]*?)\n  \}\)\.convertRequestsToSubstitutions;/);
  if (!retm) fail('converter create 未找到');
  let fields = retm[1].replace(/context\./g, 'stub.');
  const replacement = `function loadApprovedExchangeConverter(resolveCell) {
  // v2：UiTimetable.create 直驗（body 與 v1 一致）
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-timetable.js'), 'utf8');
  assert.match(libSource, /const convertRequestsToSubstitutions = \\(requests\\) => \\{/,
    'approved exchange converter must remain discoverable');
  const stub = {${stub}
  };
  return UiTimetable.create({${fields}
  }).convertRequestsToSubstitutions;
}`;
  s = s.slice(0, i) + replacement + '\n' + s.slice(k);
}

swapFn('loadPublicClassRequestMapper', `function loadPublicClassRequestMapper() {
  // v2：UiClassView.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-classview.js'), 'utf8');
  assert.match(libSource, /const mapPublicClassRequests = \\(/,
    'public class request mapper must remain discoverable');
  return UiClassView.create({
    computed: fn => ({ get value() { return fn(); } }),
    classViewSchedules: ref([
      { teacherName: '吳冠萱', dayOfWeek: 3, period: 5, className: '904', subject: '輔導' }
    ])
  }).mapPublicClassRequests;
}`);

swapFn('loadProgressSteps', `function loadProgressSteps() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function getRequestProgressSteps\\(req\\) \\{/,
    'progress step function must remain discoverable');
  return UiApproval.create({
    ref: value => ({ value }),
    notificationsSuppressed: { value: false }
  }).getRequestProgressSteps;
}`);

swapFn('loadListHelpers', `function loadListHelpers() {
  // v2：UiListHelpers 為 ESM 命名空間，直引（body 與 v1 一致）
  const source = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-list-helpers.js'), 'utf8');
  assert.match(source, /const UiListHelpers = \\(\\(\\) =>/, 'request list helper module must remain discoverable');
  return UiListHelpers;
}`);

swapFn('loadLineTemplates', `function loadLineTemplates() {
  // v2：UiLineTemplate 為 ESM 命名空間，直引（body 與 v1 一致；
  // v1 以 window.DateUtils 測試樁格式化，v2 用靜態真 DateUtils，輸出格式相同）
  const source = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-line-template.js'), 'utf8');
  assert.match(source, /const UiLineTemplate = \\(\\(\\) =>/, 'LINE template module must remain discoverable');
  return UiLineTemplate;
}`);

swapFn('loadPaperFlowClassifier', `function loadPaperFlowClassifier() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function isPaperFlowRequest\\(request\\) \\{/,
    'paper flow classifier must remain discoverable');
  const api = UiApproval.create({
    ref: value => ({ value }),
    notificationsSuppressed: { value: true }
  });
  return { isPaperFlowRequest: api.isPaperFlowRequest };
}`);

// ---------- 3. 源碼讀檔 → v2 路徑 ＋ 模組級殼層讀取 ----------
const HEAD_EXTRA = "const shellSource = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');\n";
const READMAP = {
  'ui-print.js': '../src/modules/ui-print.js', 'ui-export.js': '../src/modules/ui-export.js',
  'ui-approval.js': '../src/modules/ui-approval.js', 'ui-timetable.js': '../src/modules/ui-timetable.js',
  'ui-classview.js': '../src/modules/ui-classview.js', 'ui-homeroom.js': '../src/modules/ui-homeroom.js',
  'ui-list-helpers.js': '../src/modules/ui-list-helpers.js', 'ui-line-template.js': '../src/modules/ui-line-template.js',
  'ui-sync.js': '../src/modules/ui-sync.js', 'ui-calendar.js': '../src/modules/ui-calendar.js',
  'ui-activity.js': '../src/modules/ui-activity.js', 'ui-mutual.js': '../src/modules/ui-mutual.js',
  'ui-backoffice.js': '../src/modules/ui-backoffice.js', 'ui-tour.js': '../src/modules/ui-tour.js',
  'onboarding-tour.js': '../src/modules/onboarding-tour.js', 'ui-history.js': '../src/modules/ui-history.js',
  'ui-proxy.js': '../src/modules/ui-proxy.js', 'ui-interaction.js': '../src/modules/ui-interaction.js',
  'ui-submit.js': '../src/modules/ui-submit.js', 'ui-report.js': '../src/modules/ui-report.js',
  'field-map.js': '../src/domain/field-map.js', 'index.html': '../src/App.vue'
};
s = s.replace(/path\.join\(root, '([^']+)'\)/g, (m0, file) => {
  if (file === 'app.js') return m0; // 留給 PART4 逐站改寫
  if (!(file in READMAP)) fail('未知讀檔：' + file);
  return "path.join(here, '" + READMAP[file] + "')";
});
  // ---------- 4. app.js 讀檔逐站改寫 ----------
  // 4a. L957 站的 appSource 讀取是死變數（該函式內無使用），直接刪除
  {
    const dead = "function runRequestListSortTest() {\n  const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');\n";
    if (!s.includes(dead)) fail('L957 死讀取未找到');
    s = s.replace(dead, 'function runRequestListSortTest() {\n');
  }
  // 4b. feeHelpers 切片 eval → Pinia 實測（v2 邏輯在 backoffice store，需跨 store 狀態）
  {
    const i = s.indexOf('const feeHelperStart = appSource.indexOf(');
    if (i < 0) fail('找不到 feeHelper 切片');
    const endMark = '      });\n';
    // 切片塊尾：第二個 forEach 結束（['休假'...] 段）
    const j = s.indexOf("'].forEach(reason => {", s.indexOf("['休假'", i));
    if (j < 0) fail('找不到休假 forEach');
    const k = s.indexOf('\n      });', j) + '\n      });'.length;
    const replacement = `assert.match(backofficeStoreSource, /const PUBLIC_FEE_REASONS =/, '經費預設 helper 必須存在');
      assert.match(backofficeStoreSource, /const getHistoryEditDefaultSubFee/, '歷史編輯預設經費 helper 必須存在');
      // v2：以 Pinia 實測取代源碼切片（默認非第8節、非互代，與 v1 樁條件一致）
      setActivePinia(createPinia());
      const defaultSubFeeForReason = useBackofficeStore().defaultSubFeeForReason;
      ['公假', '婚假', '喪假', '產假', '產前假/分娩假', '身心調適假'].forEach(reason => {
        assert.equal(defaultSubFeeForReason(reason), '公費代課', \`\${reason}應預設公費代課\`);
      });
      ['休假', '病假', '事假', '補休', '其他'].forEach(reason => {
        assert.equal(defaultSubFeeForReason(reason), '自費代課', \`\${reason}應預設自費代課\`);
      });`;
    s = s.slice(0, i) + replacement + s.slice(k);
  }
  // 4c. L1085 站：依斷言目標拆四個源碼讀取（經費→backoffice store，其餘→submit／output／mutual）
  s = s.replace(
    /const appSource = fs\.readFileSync\(path\.join\(root, 'app\.js'\), 'utf8'\);\n/,
    "const backofficeStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'backoffice.js'), 'utf8');\nconst submitStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'submit.js'), 'utf8');\nconst outputStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'output.js'), 'utf8');\nconst mutualStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'mutual.js'), 'utf8');\n"
  );
  // 4c2. 1096 經費斷言 → backoffice store（子串錨點，避開跳脫）
  {
    const li = s.split('\n').findIndex((l) => l.includes('assert.match(appSource,') && l.includes('PUBLIC_FEE_REASONS') && l.includes('產假應列入公費預設假別'));
    if (li < 0) fail('1096 斷言未找到');
    const arr = s.split('\n');
    arr[li] = arr[li].slice(0, arr[li].indexOf('assert.match')) + "assert.match(backofficeStoreSource, /PUBLIC_FEE_REASONS = \\['公假', '婚假', '喪假', '產假'/, '產假應列入公費預設假別');";
    s = arr.join('\n');
  }
  // 整行錨點替換（錨點只用無反斜線子串，避免跳脫地獄）
  const appRewrites = [
    [['assert.match(appSource, /const paperFlow = computed'],
      "assert.match(submitStoreSource, /const paperFlow = computed\\(\\(\\) =>\\s*!storeToRefs\\(useTourStore\\(\\)\\)\\.isMutualCover\\.value\\s*&&\\s*notificationsSuppressed\\.value\\s*&&\\s*!isProxySubmitActive\\.value/, '關閉線上申請時應優先走紙本流程');"],
    [['assert.match(appSource, /successActionRequests: successActionRequests/);'],
      "assert.match(outputStoreSource, /successActionRequests/, 'output store 應暴露 successActionRequests');"],
    [['assert.match(appSource, /const getClassChangeTypeLabel =/);'],
      "assert.match(mutualStoreSource, /const getClassChangeTypeLabel =/, '班級異動標籤函式應存在');"],
    [['assert.match(appSource,', 'openPaperPrintDraft', "returnTo: 'compare'"],
      "assert.match(outputStoreSource, /openPaperPrintDraft\\(null, \\{ returnTo: 'compare', canPrint: false \\}\\)/, 'compare 預覽入口應存在');"],
    [['assert.match(appSource,', 'openPaperPrintDraft', 'buildPaperRecordsForSubmittedRequests'],
      "assert.match(outputStoreSource, /openPaperPrintDraft\\(buildPaperRecordsForSubmittedRequests\\(requests\\), \\{ canPrint: true \\}\\)/, '送出預覽入口應存在');"],
    [['assert.match(appSource, /successActionRequests/);'],
      "assert.match(outputStoreSource, /successActionRequests/, '成功流程應引用 successActionRequests');"]
  ];
  for (const [subs, to] of appRewrites) {
    const li = s.split('\n').findIndex((l) => subs.every((x) => l.includes(x)));
    if (li < 0) fail('appSource 斷言未找到：' + subs.join('＋'));
    const arr = s.split('\n');
    arr[li] = arr[li].slice(0, arr[li].indexOf('assert.match')) + to;
    s = arr.join('\n');
  }
  // 4d. printSingle slice（v1 app.js wrapper）→ output store wrapper 同等檢查
  s = s.replace(
    /const printSingleStart = appSource\.indexOf\('const printSingleRequest ='\);\n( *)const printSingleEnd = appSource\.indexOf\('const showDetailForRecord =', printSingleStart\);\n( *)assert\.ok\(printSingleStart >= 0 && printSingleEnd > printSingleStart, '單筆列印函式必須存在'\);\n( *)assert\.doesNotMatch\(appSource\.slice\(printSingleStart, printSingleEnd\), \/batchId && seedRecord\/, '單筆列印不得依批次擴展資料'\);/,
    "const printSingleStart = outputStoreSource.indexOf('const printSingleRequest =');\n$1assert.ok(printSingleStart >= 0, '單筆列印函式必須存在（output store）');\n$1assert.doesNotMatch(outputStoreSource.slice(printSingleStart, printSingleStart + 2000), /batchId && seedRecord/, '單筆列印不得依批次擴展資料');"
  );
  // 4e. homeroomHelpers 切片 → UiHomeroom.create 直驗
  {
    const i = s.indexOf('const helperStart = hmSource.indexOf(');
    if (i < 0) fail('找不到 homeroom slice');
    const j = s.indexOf('assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: \'導師\' }, \'904\'), false);');
    if (j < 0) fail('找不到 homeroom asserts 尾');
    const k = s.indexOf('\n', j) + 1;
    const replacement = `// v2：UiHomeroom.create 直驗（body 與 v1 一致；v1 另有源碼切片，見上）
    const homeroomHelpers = UiHomeroom.create({
      computed: fn => ({ get value() { return fn(); } }),
      activeCell: { value: { classData: { className: '904' } } },
      lookupTeacher: () => null
    });
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '904導師' }, '904'), true);
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '901導師' }, '904'), false);
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '導師' }, '904'), false);
`;
    s = s.slice(0, i) + replacement + s.slice(k);
  }
  // 4f. makeConflict 切片 → UiSubmit.create 直驗
  {
    const i = s.indexOf('  const makeConflict = (substitutions, pendingRequests) => {');
    if (i < 0) fail('找不到 makeConflict');
    const j = s.indexOf('return exchangeIncomingConflict;', i);
    const k = s.indexOf('};', s.indexOf('})()', j)) + 3;
    const replacement = `  const makeConflict = (substitutions, pendingRequests) => {
    // v2：UiSubmit.create 直驗（body 與 v1 一致；v1 另有源碼切片斷言，見上）
    return UiSubmit.create({
      computed: fn => ({ get value() { return fn(); } }),
      pendingRequestData: ref({
        mode: 'exchange', leaveTeacher: 'alice@example.edu', subTeacher: 'bob@example.edu',
        date: '2026-10-12', timeKey: '1-1', dateB: '2026-10-12', timeB: '1-4',
        submitRequestId: 'new-exchange'
      }),
      substitutionRecords: ref(substitutions),
      allPendingRequests: ref(pendingRequests),
      getTeacherNameByEmail(value) {
        return ({
          'alice@example.edu': 'Alice',
          'bob@example.edu': 'Bob',
          'carol@example.edu': 'Carol',
          alice: 'Alice'
        })[String(value || '').trim().toLowerCase()] || String(value || '');
      }
    }).exchangeIncomingConflict.value;
  };`;
    s = s.slice(0, i) + replacement + s.slice(k);
  }
  // 4g. 1876 站讀 ui-submit：PART3 已轉 v2 路徑（變數名維持 appSource，僅此一處聲明）；
  // 起訖標記在 v2 皆存在（已驗），不斷言外無需改動。
  // ---------- 5. ?v= 與舊掛載斷言 → v2 等價 ----------
  // 子串錨點（無反斜線）
  const vbin = [
    [['ONBOARDING_SCRIPT =', 'onboarding-tour', '20260831-combined3'],
      "// v2 ESM 無 ?v 手工版號（Vite content-hash 取代）；改斷言 onboarding 引用仍在\n      assert.match(tourSource, /onboarding/i, 'tour 應引用 onboarding 模組');"],
    [['assert.match(html,', 'ui-activity', '?v='],
      "// v2 無 ?v script 標籤（ESM bundle＋hash 檔名取代）。"],
    [['assert.match(html,', '/app', '?v='],
      "assert.match(shellSource, /src=\"\\/src\\/main.js\"/, 'v2 殼層載入 Vite entry');"]
  ];
  for (const [subs, to] of vbin) {
    const li = s.split('\n').findIndex((l) => subs.every((x) => l.includes(x)));
    if (li < 0) fail('?v 斷言未找到：' + subs.join('＋'));
    const arr = s.split('\n');
    arr[li] = arr[li].slice(0, arr[li].indexOf('assert.match')) + to;
    s = arr.join('\n');
  }
  // batchPanel discoverability（window.UiBatchPanel → ESM）
  s = s.replace(
    /const batchPanelStart = activitySource\.indexOf\('window\.UiBatchPanel ='\)\;\n( *)assert\.ok\(batchPanelStart >= 0, 'batch panel module must remain discoverable'\);\n( *)const batchPanelSource = activitySource\.slice\(batchPanelStart\);\n( *)assert\.match\(batchPanelSource, \/var successActionRequests = deps\\.successActionRequests\/\);\n( *)assert\.match\(batchPanelSource, \/showSuccessModal, successActionRequests, showCompareModal\/\);/,
    "assert.equal(typeof UiBatchPanel.create, 'function', 'batch panel module must remain discoverable');\n$1assert.match(activitySource, /var successActionRequests = deps\\.successActionRequests/);\n$2assert.match(activitySource, /showSuccessModal, successActionRequests, showCompareModal/);"
  );
  // ---------- 6. 日曆測試：vm context 全域 → 臨時 globalThis 替換 ----------
  {
    const i = s.indexOf('function runCalendarFallbackContractTest() {');
    if (i < 0) fail('找不到 runCalendarFallbackContractTest');
    let k = s.indexOf('\nfunction ', i + 10);
    k = k < 0 ? s.length : k + 1;
    const replacement = `function runCalendarFallbackContractTest() {
  const html = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
  const clickMarker = '@click="addEventToCalendar(detailRequest)"';
  const clickIndex = html.indexOf(clickMarker);
  assert.ok(clickIndex >= 0, 'detail calendar button must remain wired');
  const buttonStart = html.lastIndexOf('<button', clickIndex);
  const buttonEnd = html.indexOf('</button>', clickIndex);
  assert.ok(buttonStart >= 0 && buttonEnd > buttonStart, 'detail calendar button markup must remain valid');
  assert.match(html.slice(buttonStart, buttonEnd), /type="button"/, 'detail calendar button must not submit a form');

  const calSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-calendar.js'), 'utf8');
  assert.ok(calSource.indexOf('const UiCalendar = (() =>') >= 0, 'Google calendar helper must remain discoverable');

  const toasts = [];
  let clickedFallbackLink = 0;
  const fallbackLink = {
    style: {},
    click: () => { clickedFallbackLink += 1; }
  };
  // v2：ui-calendar 用裸 window／document（與 v1 同）；測試期暫代全域，測完還原
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  const fakeDocument = {
    getElementById: () => null,
    createElement: tagName => {
      assert.equal(tagName, 'a', 'calendar fallback must use a link');
      return fallbackLink;
    },
    body: {
      appendChild: () => {},
      removeChild: () => {}
    }
  };
  const getCalendarDetails = () => ({
    title: '【代課】801 國文',
    startIso: '20260904T080000',
    endIso: '20260904T085000',
    details: '測試事件'
  });
  const showToastStub = (...args) => toasts.push(args);
  globalThis.window = {
    open: () => null,
    location: { href: 'https://school.example/index.html' },
    alert: (...args) => toasts.push(args)
  };
  globalThis.document = fakeDocument;
  try {
    const addToGoogleCalendar = UiCalendar.create({
      getCalendarDetails
    }).addToGoogleCalendar;

    addToGoogleCalendar({ id: 'calendar-fallback' });
    assert.equal(clickedFallbackLink, 1, 'blocked popup must trigger the new-tab link fallback');
    assert.equal(fallbackLink.target, '_blank');
    assert.equal(fallbackLink.rel, 'noopener noreferrer');
    assert.match(fallbackLink.href, /^https:\\/\\/calendar\\.google\\.com\\/calendar\\/render\\?/);
    assert.equal(globalThis.window.location.href, 'https://school.example/index.html', 'calendar fallback must not navigate the current tab');
    assert.match(toasts[0][0], /新分頁/);

    const openedWindow = {};
    globalThis.window = {
      open: () => openedWindow,
      location: { href: 'https://school.example/index.html' },
      alert: (...args) => toasts.push(args)
    };
    const popupOpener = UiCalendar.create({
      getCalendarDetails
    }).addToGoogleCalendar;
    popupOpener({ id: 'calendar-popup' });
    assert.equal(openedWindow.opener, null, 'opened calendar window must not retain the app as opener');
    assert.equal(globalThis.window.location.href, 'https://school.example/index.html');
  } finally {
    globalThis.window = realWindow;
    if (realDocument === undefined) delete globalThis.document;
    else globalThis.document = realDocument;
  }
}`;
    s = s.slice(0, i) + replacement + '\n' + s.slice(k);
  }
  // ---------- 7. runRechangeLabelTest 的整檔 vm 塊 → ESM ----------
  // （其餘 loader helpers 已逐個改寫；僅剩此一處 const context）
  {
    if (!s.includes('  const context = {\n    window: { UiListHelpers: { isTriangleRequest: () => false } },')) fail('找不到 rechange context');
    // window 鍵行刪除（v2 用靜態真 UiListHelpers；測資無 triangle，行為一致）
    s = s.replace('    window: { UiListHelpers: { isTriangleRequest: () => false } },\n', '');
    // 全域鍵行刪除
    s = s.replace(/^( *)\b(String|Number|Array|Object|Map|Math|parseInt|isNaN)\b,\n/gm, '');
    s = s.replace(/vm\.createContext\(context\);\n/, '');
    s = s.replace(/vm\.runInContext\(libSource, context, \{ filename: 'ui-timetable\.js' \}\);\n/, '');
    s = s.replace('  const context = {', '  const rechDeps = {');
    s = s.replace(/const api = context\.window\.UiTimetable\.create\(\{/, 'const api = UiTimetable.create({');
    s = s.replace(/(?<![A-Za-z0-9_$])context\./g, 'rechDeps.');
  }
  // ---------- 8. histCtx（isMutualRec）→ ESM ----------
  {
    if (!s.includes('const histCtx = {')) fail('找不到 histCtx');
    s = s.replace(/window: \{\n\s*FeeUtils: \{\n\s*isQuotaDeductFee: fee => String\(fee \|\| ''\) === '扣額度' \|\| String\(fee \|\| ''\) === '互代不結'\n\s*\}\n\s*\},\n/, '');
    s = s.replace(/vm\.createContext\(histCtx\);\n/, '');
    s = s.replace(/vm\.runInContext\(histSource, histCtx, \{ filename: 'ui-history\.js' \}\);\n/, '');
    s = s.replace('const isMutualRec = histCtx.window.UiHistory.create({', 'const isMutualRec = UiHistory.create({');
    s = s.replace('isQuotaDeductFee: histCtx.window.FeeUtils.isQuotaDeductFee', "isQuotaDeductFee: fee => String(fee || '') === '扣額度' || String(fee || '') === '互代不結'");
    s = s.replace('const histCtx = {', 'const histDeps = {');
    s = s.replace(/(?<![A-Za-z0-9_$])histCtx\./g, 'histDeps.');
    if (/histCtx/.test(s)) fail('histCtx 殘留');
  }
  // ---------- 9. 檔頭組裝 ----------
  const NEED_IMPORTS = [
    "import FieldMap from '../src/domain/field-map.js';",
    "import { UiAdmin } from '../src/modules/ui-admin.js';",
    "import { UiSubmitHelpers } from '../src/modules/ui-request.js';",
    "import { UiApproval } from '../src/modules/ui-approval.js';",
    "import { UiBatchPanel, UiBatchSubmit } from '../src/modules/ui-activity.js';",
    "import { UiExport } from '../src/modules/ui-export.js';",
    "import { UiPrint } from '../src/modules/ui-print.js';",
    "import { UiTimetable } from '../src/modules/ui-timetable.js';",
    "import { UiClassView } from '../src/modules/ui-classview.js';",
    "import { UiLineTemplate } from '../src/modules/ui-line-template.js';",
    "import { UiListHelpers } from '../src/modules/ui-list-helpers.js';",
    "import { UiHomeroom } from '../src/modules/ui-homeroom.js';",
    "import { UiHistory } from '../src/modules/ui-history.js';",
    "import { UiSubmit } from '../src/modules/ui-submit.js';",
    "import { UiCalendar } from '../src/modules/ui-calendar.js';",
    "import { useBackofficeStore } from '../src/stores/backoffice.js';"
  ];
  // part0 已轉 require→import；抽出既有 import 行，合併去重
  let body = s;
  const preImports = [];
  body = body.replace(/^import .*;\n/gm, (m0) => { preImports.push(m0.trim()); return ''; });
  body = body.replace(/^\n+/, '');
  // 去重 here／root／shellSource（part0／part4 可能已引入）
  body = body.replace(/^const here = path\.dirname\(fileURLToPath\(import\.meta\.url\)\);\n/gm, '');
  body = body.replace(/^const root = path\.join\(here, '\.\.', '\.\.'\);\n/gm, '');
  body = body.replace(/^const shellSource = fs\.readFileSync\(path\.join\(here, '\.\.', 'index\.html'\), 'utf8'\);\n/gm, '');
  const head = [...new Set(preImports.concat(NEED_IMPORTS))];
  if (!head.some((l) => l.includes("from 'node:url'"))) head.unshift("import { fileURLToPath } from 'node:url';");
  head.push("const here = path.dirname(fileURLToPath(import.meta.url));");
  head.push("const root = path.join(here, '..', '..');");
  head.push("const shellSource = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');");
  // ui-line-template 讀 window.location（瀏覽器本來就有；node 測試樁補上，與 v1 load() 樁同值）
  head.push("if (!globalThis.location) globalThis.location = { origin: 'https://school.example', pathname: '/index.html' };");
  s = head.join('\n') + '\n' + body;
  // ---------- 10. 尾部 promise 鏈 → async test ----------
  {
    const ti = s.indexOf('\nPromise.resolve()');
    if (ti < 0) fail('找不到尾部 promise 鏈');
    const tail = s.slice(ti);
    const calls = [];
    for (const m of tail.matchAll(/\.then\(\(\) => ([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\)/g)) {
      calls.push({ fn: m[1], args: m[2] });
    }
    for (const m of tail.matchAll(/\.then\(([A-Za-z_][A-Za-z0-9_]+)\)/g)) {
      if (m[1] === 'console') continue;
      calls.push({ fn: m[1], args: null });
    }
    if (!tail.includes("console.log('paper flow contract tests PASS')")) fail('尾部 PASS 行遺失');
    if (!calls.length) fail('尾部呼叫解析為空');
    const seq = calls.map((c) => '  await ' + c.fn + '(' + (c.args === null ? '' : c.args) + ');').join('\n');
    s = s.slice(0, ti) + "\ntest('paper flow contract tests（v1 移植）', async () => {\n" + seq + "\n});\n";
  }
  // ---------- 11. 頂層 function／const 包入主 test？ ----------
  // run*／loader helpers 為頂層 function 宣告：保留在模組層（vitest 收集期不執行），
  // 主 test 僅做序列化呼叫。fixtures（ref／teacherName／isCourseAdjustmentOnlyForTest）亦留模組層。
  // ---------- 12. 殘留檢查 ----------
  for (const bad of ['require(', '__dirname', 'path.join(root,', 'vm.', 'function load(sourceName)', "load('"]) {
    if (s.includes(bad)) fail('殘留未處理：' + bad);
  }
  fs.writeFileSync(path.join(OUT, 'paper-flow-contract-tests.test.js'), s);
  console.log('PART9-OK, 輸出位元組：' + s.length);
