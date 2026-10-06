import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createPinia, setActivePinia } from 'pinia';
import FieldMap from '../src/domain/field-map.js';
import { UiAdmin } from '../src/modules/ui-admin.js';
import { UiSubmitHelpers } from '../src/modules/ui-request.js';
import { UiApproval } from '../src/modules/ui-approval.js';
import { UiBatchPanel, UiBatchSubmit } from '../src/modules/ui-activity.js';
import { UiExport } from '../src/modules/ui-export.js';
import { UiPrint } from '../src/modules/ui-print.js';
import { UiTimetable } from '../src/modules/ui-timetable.js';
import { UiClassView } from '../src/modules/ui-classview.js';
import { UiLineTemplate } from '../src/modules/ui-line-template.js';
import { UiListHelpers } from '../src/modules/ui-list-helpers.js';
import { UiHomeroom } from '../src/modules/ui-homeroom.js';
import { UiHistory } from '../src/modules/ui-history.js';
import { UiSubmit } from '../src/modules/ui-submit.js';
import { UiCalendar } from '../src/modules/ui-calendar.js';
import { useBackofficeStore } from '../src/stores/backoffice.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const shellSource = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
if (!globalThis.location) globalThis.location = { origin: 'https://school.example', pathname: '/index.html' };

function ref(value) {
  return { value };
}

function teacherName(email) {
  return {
    'owner@school.example': '申請人',
    'invitee@school.example': '受邀人'
  }[String(email || '').toLowerCase()] || String(email || '');
}

function isCourseAdjustmentOnlyForTest(request) {
  const raw = request && (request.courseAdjustmentOnly !== undefined
    ? request.courseAdjustmentOnly : request['僅課務調整']);
  const normalized = String(raw == null ? '' : raw).trim().toLowerCase();
  return raw === true || raw === 1
    || normalized === 'true' || normalized === '1' || normalized === '是' || normalized === 'yes'
    || String(request && (request.reason || request['請假事由']) || '').trim() === '課務調整';
}

function loadPaperDraftRecordBuilder(pendingRequestData) {
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
}
function loadSubmittedPaperRecordBuilder() {
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
}
function loadApproveRiskFlags() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function getApproveRiskFlags\(req\) \{/,
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
}
function runQuotaRiskFlagTargetTest() {
  const { get, roster } = loadApproveRiskFlags();
  const request = {
    type: 'substitution',
    subFee: '扣額度',
    requesterName: '被代教師',
    targetTeacherName: '代課教師'
  };
  const flags = get(request);
  assert.ok(flags.some(flag => flag.key === 'quota'), '扣額度申請應顯示扣額度標籤');
  assert.equal(flags.some(flag => flag.key === 'quota0'), false, '被代教師額度不足不應影響代課教師判定');

  roster[1].mutualQuota = 0;
  const shortageFlags = get(request);
  assert.equal(shortageFlags.some(flag => flag.key === 'quota0'), true, '代課教師額度不足才應顯示額度不足');
}

function loadApprovedExchangeConverter(resolveCell) {
  // v2：UiTimetable.create 直驗（body 與 v1 一致）
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-timetable.js'), 'utf8');
  assert.match(libSource, /const convertRequestsToSubstitutions = \(requests\) => \{/,
    'approved exchange converter must remain discoverable');
  const stub = {
    computed: fn => ({ get value() { return fn(); } }),
    allSchedules: { value: [] },
    schoolSwaps: { value: [] },
    substitutionRecords: { value: [] },
    substitutionsLookup: { value: {} },
    allPendingRequests: { value: [] },
    displayTimetableTeachers: { value: [] },
    currentWeekDates: { value: [] },
    getTeacherNameByEmail: () => '',
    getTeacherSubjectByEmail: () => '',
    formatDateMMDD: s => s,
    isSingleWeek: () => true,
    isClassAwayOnDate: () => false,
    getWeekDayText: () => '',
    batchSelectMode: { value: false },
    isBatchSlotSelected: () => false,
    isMutualCover: { value: false },
    getMutualDraftAt: () => null,
    mutualAwayClasses: { value: [] },
    mutualActivityStart: { value: '' },
    mutualActivityEnd: { value: '' },
    mutualActivityStartPeriod: { value: '' },
    mutualActivityEndPeriod: { value: '' },
    isMutualActivitySlotInRange: () => false,
    resolveCellFromBaseAndSubs: resolveCell || (() => null),
    findBaseScheduleSlot: () => null,
    isCourseAdjustmentOnlyRequest: isCourseAdjustmentOnlyForTest,
    isEmptySlotAssignmentRequest: record => {
      if (!record) return false;
      if (record.isEmptySlotAssign === true) return true;
      const reason = String(record.reason || record['請假事由'] || '').trim();
      const note = String(record.note || record['備註'] || '');
      return reason === '空堂排班' || note.indexOf('[空堂排班]') >= 0;
    },
    Date, Number, String, Object, Array, Set, Map, Math, parseInt, isNaN
  };
  return UiTimetable.create({
    computed: stub.computed,
    allSchedules: stub.allSchedules,
    schoolSwaps: stub.schoolSwaps,
    substitutionRecords: stub.substitutionRecords,
    substitutionsLookup: stub.substitutionsLookup,
    allPendingRequests: stub.allPendingRequests,
    displayTimetableTeachers: stub.displayTimetableTeachers,
    currentWeekDates: stub.currentWeekDates,
    getTeacherNameByEmail: stub.getTeacherNameByEmail,
    getTeacherSubjectByEmail: stub.getTeacherSubjectByEmail,
    formatDateMMDD: stub.formatDateMMDD,
    isSingleWeek: stub.isSingleWeek,
    isClassAwayOnDate: stub.isClassAwayOnDate,
    getWeekDayText: stub.getWeekDayText,
    batchSelectMode: stub.batchSelectMode,
    isBatchSlotSelected: stub.isBatchSlotSelected,
    isMutualCover: stub.isMutualCover,
    getMutualDraftAt: stub.getMutualDraftAt,
    mutualAwayClasses: stub.mutualAwayClasses,
    mutualActivityStart: stub.mutualActivityStart,
    mutualActivityEnd: stub.mutualActivityEnd,
    mutualActivityStartPeriod: stub.mutualActivityStartPeriod,
    mutualActivityEndPeriod: stub.mutualActivityEndPeriod,
    isMutualActivitySlotInRange: stub.isMutualActivitySlotInRange,
    resolveCellFromBaseAndSubs: stub.resolveCellFromBaseAndSubs,
    findBaseScheduleSlot: stub.findBaseScheduleSlot,
    isCourseAdjustmentOnlyRequest: stub.isCourseAdjustmentOnlyRequest,
    isEmptySlotAssignmentRequest: stub.isEmptySlotAssignmentRequest
  }).convertRequestsToSubstitutions;
}
function loadPublicClassRequestMapper() {
  // v2：UiClassView.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-classview.js'), 'utf8');
  assert.match(libSource, /const mapPublicClassRequests = \(/,
    'public class request mapper must remain discoverable');
  return UiClassView.create({
    computed: fn => ({ get value() { return fn(); } }),
    classViewSchedules: ref([
      { teacherName: '吳冠萱', dayOfWeek: 3, period: 5, className: '904', subject: '輔導' }
    ])
  }).mapPublicClassRequests;
}
function runExchangePaperRecordMappingTest() {
  const pendingRequestData = ref({
    mode: 'exchange',
    leaveTeacher: 'month@example.com',
    subTeacher: 'sheng@example.com',
    date: '2026-09-01',
    timeKey: '2-6',
    cls: '703',
    subject: '數學',
    dateB: '2026-09-03',
    timeB: '4-2',
    subBClass: '704',
    subB: '國文',
    reason: '課務調整',
    subFee: '無'
  });
  const records = loadPaperDraftRecordBuilder(pendingRequestData)();
  const targetDateRecord = records.find(record => record.id.endsWith('_1'));
  const sourceDateRecord = records.find(record => record.id.endsWith('_2'));
  assert.equal(targetDateRecord.date, '2026-09-03');
   assert.equal(targetDateRecord.className, '704');
   assert.equal(targetDateRecord.subject, '國文');
   assert.equal(targetDateRecord.originalTeacherEmail, 'sheng@example.com');
   assert.equal(targetDateRecord.actualTeacherEmail, 'month@example.com');
   assert.equal(targetDateRecord.originalTeacherName, '吳冠萱');
   assert.equal(targetDateRecord.actualTeacherName, '洪筱仙');
   assert.equal(sourceDateRecord.date, '2026-09-01');
  assert.equal(sourceDateRecord.className, '703');
  assert.equal(sourceDateRecord.subject, '數學');
   assert.equal(sourceDateRecord.originalTeacherEmail, 'month@example.com');
   assert.equal(sourceDateRecord.actualTeacherEmail, 'sheng@example.com');
   assert.equal(sourceDateRecord.originalTeacherName, '洪筱仙');
   assert.equal(sourceDateRecord.actualTeacherName, '吳冠萱');
}

function runSubmittedExchangePaperRecordMappingTest() {
  const records = loadSubmittedPaperRecordBuilder()([{
    id: 'submitted-1',
    type: 'exchange',
    batchId: 'paper-batch-1',
    requesterName: '申請人',
    targetTeacherName: '受邀人',
    requestDate: '2026-09-01',
    requestPeriod: 6,
    className: '703',
    subject: '數學',
    targetDate: '2026-09-03',
    targetPeriod: 2
  }]);
  const targetDateRecord = records.find(record => record.id.endsWith('_1'));
  const sourceDateRecord = records.find(record => record.id.endsWith('_2'));
   assert.equal(targetDateRecord.className, '704');
   assert.equal(targetDateRecord.subject, '國文');
   assert.equal(targetDateRecord.batchId, 'paper-batch-1');
   assert.equal(targetDateRecord.actualTeacherName, '申請人');
   assert.equal(sourceDateRecord.className, '703');
   assert.equal(sourceDateRecord.subject, '數學');
   assert.equal(sourceDateRecord.batchId, 'paper-batch-1');
   assert.equal(sourceDateRecord.actualTeacherName, '受邀人');
}

function runApprovedExchangeRecordMappingTest() {
  const convert = loadApprovedExchangeConverter();
  const records = convert([{
    id: 'approved-1',
    status: 'approved',
     type: 'exchange',
     serial: 'SWP7759',
     requesterEmail: 'owner@example.com',
    requesterName: '申請人',
    targetTeacherEmail: 'invitee@example.com',
    targetTeacherName: '受邀人',
    requestDate: '2026-09-01',
    requestPeriod: 6,
    className: '703',
    subject: '數學',
    targetDate: '2026-09-03',
    targetPeriod: 2,
    targetClassName: '704',
    targetSubject: '國文'
  }]);
   const targetDateRecord = records.find(record => record.id.endsWith('_1'));
   const sourceDateRecord = records.find(record => record.id.endsWith('_2'));
   assert.equal(targetDateRecord.serial, 'SWP7759');
   assert.equal(sourceDateRecord.serial, 'SWP7759');
   assert.equal(targetDateRecord.className, '703');
   assert.equal(targetDateRecord.subject, '數學');
   assert.equal(targetDateRecord.formClassName, '704');
   assert.equal(targetDateRecord.formSubject, '國文');
   assert.equal(sourceDateRecord.className, '704');
   assert.equal(sourceDateRecord.subject, '國文');
   assert.equal(sourceDateRecord.formClassName, '703');
   assert.equal(sourceDateRecord.formSubject, '數學');
}

function runApprovedCombinedReturnMappingTest() {
  const convert = loadApprovedExchangeConverter();
  const records = convert([{
    id: 'approved-combined-1',
    status: 'approved',
    type: 'substitution',
    requesterEmail: 'owner@example.com',
    requesterName: '申請人',
    targetTeacherEmail: 'invitee@example.com',
    targetTeacherName: '受邀人',
    requestDate: '2026-09-01',
    requestPeriod: 1,
    className: '701、702',
    subject: '國文',
    specialFlow: 'combined_return'
  }]);
  assert.equal(records.length, 1);
  assert.equal(records[0].originalTeacherName, '申請人');
  assert.equal(records[0].actualTeacherName, '受邀人');
  assert.equal(records[0].actualTeacherEmail, '受邀人');
}

function runApprovedExchangeAttributeMappingTest() {
  const convert = loadApprovedExchangeConverter((email, date, period) => {
    if (email === 'owner@example.com' && date === '2026-09-01' && period === 6) {
      return { className: '703', subject: '數學', attr: '代課', isSubstitute: true };
    }
    if (email === 'invitee@example.com' && date === '2026-09-03' && period === 2) {
      return { className: '704', subject: '國文', attr: '一般', specialTags: '超鐘點', isOvertime: true };
    }
    return null;
  });
  const records = convert([{
    id: 'approved-attribute-1',
    status: 'approved',
    type: 'exchange',
    requesterEmail: 'owner@example.com',
    requesterName: '申請人',
    targetTeacherEmail: 'invitee@example.com',
    targetTeacherName: '受邀人',
    requestDate: '2026-09-01',
    requestPeriod: 6,
    className: '703',
    subject: '數學',
    targetDate: '2026-09-03',
    targetPeriod: 2,
    targetClassName: '704',
    targetSubject: '國文'
  }]);
  const targetDateRecord = records.find(record => record.id.endsWith('_1'));
  const sourceDateRecord = records.find(record => record.id.endsWith('_2'));
  assert.equal(targetDateRecord.courseAttr, '代課', '調入 edge 應攜帶來源課堂屬性');
  assert.equal(targetDateRecord.courseIsSubstitute, true, '調入 edge 應攜帶代課旗標');
  assert.equal(sourceDateRecord.courseSpecialTags, '超鐘點', '另一側 edge 應攜帶來源特殊標記');
  assert.equal(sourceDateRecord.courseIsOvertime, true, '另一側 edge 應攜帶超鐘點旗標');
}

function runApprovedBatchRecordMappingTest() {
  const convert = loadApprovedExchangeConverter();
  const records = convert([
    {
      id: 'approved-batch-1', status: 'approved', type: 'substitution', batchId: 'batch-7',
      requesterEmail: 'owner@example.com', requesterName: '申請人',
      targetTeacherEmail: 'invitee@example.com', targetTeacherName: '受邀人',
      requestDate: '2026-09-01', requestPeriod: 1, className: '701', subject: '國文'
    },
    {
      id: 'approved-batch-2', status: 'approved', type: 'substitution', batchId: 'batch-7',
      requesterEmail: 'owner@example.com', requesterName: '申請人',
      targetTeacherEmail: 'invitee@example.com', targetTeacherName: '受邀人',
      requestDate: '2026-09-02', requestPeriod: 2, className: '702', subject: '國文'
    }
  ]);
  assert.equal(records[0].batchId, 'batch-7');
  assert.equal(records[1].batchId, 'batch-7');
}

function runPublicClassExchangeMappingTest() {
  const map = loadPublicClassRequestMapper();
  const records = map([{
    id: 'public-exchange-1',
    status: 'approved',
    type: 'exchange',
    requesterName: '洪筱仙',
    targetTeacherName: '吳冠萱',
    requestDate: '2026-09-04',
    requestPeriod: 2,
    className: '904',
    subject: '國文',
    targetDate: '2026-09-02',
    targetPeriod: 5
  }], '904');
  const targetDateRecord = records.find(record => record.id.endsWith('_class_1'));
  const sourceDateRecord = records.find(record => record.id.endsWith('_class_2'));
  assert.equal(targetDateRecord.subject, '國文');
  assert.equal(targetDateRecord.actualTeacherName, '洪筱仙');
  assert.equal(sourceDateRecord.subject, '輔導');
  assert.equal(sourceDateRecord.actualTeacherName, '吳冠萱');
}

function runPublicClassCourseFollowsTeacherTest() {
  const map = loadPublicClassRequestMapper();
  const convert = loadApprovedExchangeConverter();
  const examples = [
    ['2026-09-01', 6, '視覺藝術', '黃奕慈', '2026-09-04', 2, '國文'],
    ['2026-09-07', 5, '音樂', '林衣穎', '2026-09-07', 4, '國文'],
    ['2026-09-16', 6, '輔導', '吳冠萱', '2026-09-14', 6, '閱思'],
    ['2026-09-16', 4, '數學', '陳海新', '2026-09-21', 6, '閱思']
  ];
  examples.forEach(([date, period, subject, teacher, targetDate, targetPeriod, targetSubject], i) => {
    const req = {
      id: 'course-follows-' + i, status: 'approved', type: 'exchange',
      requesterName: teacher, targetTeacherName: '洪筱仙',
      requestDate: date, requestPeriod: period, className: '904', subject,
      targetDate, targetPeriod, targetClassName: '904', targetSubject
    };
    const records = map([req], '904');
    assert.equal(records[0].date, targetDate);
    assert.equal(records[0].period, targetPeriod);
    assert.equal(records[0].actualTeacherName, teacher);
    assert.equal(records[0].subject, subject, '原科目跟著授課教師調入');
    assert.equal(records[1].date, date);
    assert.equal(records[1].period, period);
    assert.equal(records[1].actualTeacherName, '洪筱仙');
    assert.equal(records[1].subject, targetSubject, '洪老師帶著該堂原課調入');
    const arrangement = rows => JSON.stringify(rows.map(r => [
      r.date, r.period, r.className, r.subject, r.actualTeacherName, r.type
    ]));
    assert.equal(arrangement(records), arrangement(convert([req])),
      '唯讀班級課表與登入後核准課表應呈現相同安排');
  });

  const crossClass = map([{
    '申請單ID': 'cross-class', '狀態': 'approved', '異動類型': '對調',
    '申請人姓名': '洪筱仙', '受邀人姓名': '吳冠萱',
    '異動日期': '2026-09-14', '異動節次': 6, '班級': '903', '科目': '閱思',
    '對調目標日期': '2026-09-16', '對調目標節次': 6,
    '對調目標班級': '904', '對調目標科目': '輔導'
  }], '904');
  assert.equal(crossClass[0].className, '903', '選取班級不可覆蓋教師原課班級');
  assert.equal(crossClass[0].subject, '閱思');
  assert.equal(crossClass[1].className, '904');
  assert.equal(crossClass[1].subject, '輔導');

  const triangle = map([{
    id: 'triangle-leg', status: 'approved', type: 'triangle',
    requesterName: '洪筱仙', targetTeacherName: '陳海新',
    requestDate: '2026-09-14', requestPeriod: 6, className: '904', subject: '閱思',
    targetDate: '2026-09-16', targetPeriod: 4, targetClassName: '904', targetSubject: '數學'
  }], '904');
  assert.equal(triangle.length, 1);
  assert.equal(triangle[0].type, 'triangle');
  assert.equal(triangle[0].date, '2026-09-16');
  assert.equal(triangle[0].period, 4);
  assert.equal(triangle[0].actualTeacherName, '洪筱仙');
  assert.equal(triangle[0].subject, '閱思');

  const substitution = map([{
    id: 'sub', status: 'approved', type: 'substitution',
    requesterName: '洪筱仙', targetTeacherName: '吳冠萱',
    requestDate: '2026-09-14', requestPeriod: 6, className: '904', subject: '閱思'
  }], '904');
  assert.equal(substitution[0].subject, '閱思', '代課仍保留被代課的科目');
  assert.equal(substitution[0].actualTeacherName, '吳冠萱');
}

function runNoSyntheticStudySubjectTest() {
  // 2A：原班科解析已移至 ui-timetable.js；教師查詢留守 app.js
  // R16：getTeacherJobTitleByEmail 已移至 ui-homeroom.js；改讀模組源碼
  const source = fs.readFileSync(path.join(here, '../src/modules/ui-timetable.js'), 'utf8');
  const hmSource = fs.readFileSync(path.join(here, '../src/modules/ui-homeroom.js'), 'utf8');
  const subjectStart = source.indexOf('const getOriginalRequestSubject =');
  const subjectEnd = source.indexOf('const getOriginalRequestClass =', subjectStart);
  const teacherStart = hmSource.indexOf('const getTeacherJobTitleByEmail =');
  const teacherEnd = hmSource.indexOf('const chineseClassNumber =', teacherStart);
  assert.ok(subjectStart >= 0 && subjectEnd > subjectStart);
  assert.ok(teacherStart >= 0 && teacherEnd > teacherStart);
  assert.doesNotMatch(source.slice(subjectStart, subjectEnd), /自習/);
  assert.doesNotMatch(hmSource.slice(teacherStart, teacherEnd), /自習/);
}

runSubmittedExchangePaperRecordMappingTest();
runApprovedExchangeRecordMappingTest();
runApprovedExchangeAttributeMappingTest();
runApprovedCombinedReturnMappingTest();
runApprovedBatchRecordMappingTest();
runPublicClassExchangeMappingTest();
runPublicClassCourseFollowsTeacherTest();
runNoSyntheticStudySubjectTest();

function loadProgressSteps() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function getRequestProgressSteps\(req\) \{/,
    'progress step function must remain discoverable');
  return UiApproval.create({
    ref: value => ({ value }),
    notificationsSuppressed: { value: false }
  }).getRequestProgressSteps;
}
function loadListHelpers() {
  // v2：UiListHelpers 為 ESM 命名空間，直引（body 與 v1 一致）
  const source = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-list-helpers.js'), 'utf8');
  assert.match(source, /const UiListHelpers = \(\(\) =>/, 'request list helper module must remain discoverable');
  return UiListHelpers;
}
function loadRequestListSorter() {
  const helpers = loadListHelpers();
  assert.equal(typeof helpers.sortRequestListDesc, 'function', 'request list sorter must remain discoverable');
  assert.equal(typeof helpers.formatRequestApplicationDate, 'function', 'request date formatter must remain discoverable');
  return {
    sortRequestListDesc: helpers.sortRequestListDesc,
    formatRequestApplicationDate: helpers.formatRequestApplicationDate
  };
}

function loadLineTemplates() {
  // v2：UiLineTemplate 為 ESM 命名空間，直引（body 與 v1 一致；
  // v1 以 window.DateUtils 測試樁格式化，v2 用靜態真 DateUtils，輸出格式相同）
  const source = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-line-template.js'), 'utf8');
  assert.match(source, /const UiLineTemplate = \(\(\) =>/, 'LINE template module must remain discoverable');
  return UiLineTemplate;
}
function loadCourseDisplayFormatter() {
  // 2A：課程顯示格式已移至 ui-line-template.js（與 LINE 模板同模組）
  const templates = loadLineTemplates();
  assert.equal(typeof templates.formatCourseDisplayText, 'function', 'course display formatter must remain discoverable');
  assert.equal(typeof templates._fmtSlot, 'function', 'slot formatter must remain discoverable');
  return {
    formatCourseDisplayText: templates.formatCourseDisplayText,
    _fmtSlot: templates._fmtSlot
  };
}

function loadTriangleLineTemplates() {
  // 2A：三角顯示已移至 ui-line-template.js；直接取模組函式
  const templates = loadLineTemplates();
  assert.equal(typeof templates.formatTriangleSlot, 'function', 'triangle LINE formatter must remain discoverable');
  assert.equal(typeof templates.buildTriangleLineText, 'function', 'triangle LINE text must remain discoverable');
  return {
    buildTriangleLineText: templates.buildTriangleLineText,
    formatTriangleSlot: templates.formatTriangleSlot
  };
}

function runLineTemplateTest() {
  const templates = loadLineTemplates();
  const single = templates.buildLineInviteText({
    targetName: '王小明老師',
    requesterName: '陳小華老師',
    dateA: '2026-09-04', dayA: 5, periodA: 1, classA: '904', subjectA: '國文',
    agreeLink: 'https://school.example/?agree',
    declineLink: 'https://school.example/?decline'
  });
  assert.match(single, /小明老師，想問您是否可以協助代課：/);
  assert.match(single, /09\/04\(五\) 第1節 904國文（陳小華老師）/);
  assert.match(single, /✅ 可以/);
  assert.doesNotMatch(single, /詳細如下|非常感謝/);

  const paperSingle = templates.buildLineInviteText({
    targetName: '王小明老師', requesterName: '陳小華老師', paperFlow: true,
    dateA: '2026-09-04', dayA: 5, periodA: 1, classA: '904', subjectA: '國文',
    agreeLink: 'https://school.example/?action=respond&id=paper-1&status=agree',
    declineLink: 'https://school.example/?action=respond&id=paper-1&status=decline'
  });
  assert.match(paperSingle, /如果可以，我再拿代課單給您，感謝/);
  assert.doesNotMatch(paperSingle, /請回覆：|https?:\/\/|action=/);

  const ask = templates.buildAskFirstLineText({
    targetName: '王小明老師', requesterName: '陳小華老師',
    dateA: '2026-09-04', dayA: 5, periodA: 1,
     classA: '904', subjectA: '國文'
  });
  assert.match(ask, /小明老師，想問您是否可以協助代課：/);
  assert.match(ask, /09\/04\(五\) 第1節 904國文（陳小華老師）/);
  assert.match(ask, /如果可以，我再拿代課單給您，感謝/);
  assert.doesNotMatch(ask, /再麻煩您確認一下喔/);

  const askSelf = templates.buildAskFirstLineText({
    targetName: '王小明老師',
    dateA: '2026-09-04', dayA: 5, periodA: 1, classA: '904', subjectA: '國文'
  });
  assert.doesNotMatch(askSelf, /（陳小華老師）/);

  const askExchange = templates.buildAskFirstLineText({
    targetName: '王小明老師',
    dateA: '2026-09-01', dayA: 2, periodA: 2, classA: '707', subjectA: '數學',
    courseTeacherA: '陳小華老師', courseTeacherB: '王小明老師',
    isExchange: true,
    dateB: '2026-09-04', dayB: 5, periodB: 5, classB: '707', subjectB: '健康教育'
  });
  assert.equal(askExchange, [
    '小明老師，想問您是否方便和我調課，',
    '',
    '09/01(二) 第2節 707數學（陳小華老師）<->',
    '09/04(五) 第5節 707健康教育（王小明老師）',
    '',
    '如果可以，我再拿調課單給您，感謝🙏🏻'
  ].join('\n'));
  const askProxyExchange = templates.buildAskFirstLineText({
    targetName: '王小明老師', requesterName: '余月亭老師',
    dateA: '2026-09-01', dayA: 2, periodA: 2, classA: '707', subjectA: '數學',
    courseTeacherA: '余月亭老師', courseTeacherB: '王小明老師',
    isExchange: true,
    dateB: '2026-09-04', dayB: 5, periodB: 5, classB: '707', subjectB: '健康教育'
  });
  assert.match(askProxyExchange, /小明老師，想問您是否方便和月亭老師調課，/);
  assert.doesNotMatch(askProxyExchange, /和我調課/);
  assert.doesNotMatch(askProxyExchange, /和余月亭老師調課/);
  assert.match(askExchange, /如果可以，我再拿調課單給您，感謝/);
  assert.doesNotMatch(askExchange, /簽名/);

  const onlineExchange = templates.buildLineInviteText({
    targetName: '王小明老師', requesterName: '余月亭老師', isExchange: true,
    courseTeacherA: '余月亭老師', courseTeacherB: '王小明老師',
    dateA: '2026-09-01', dayA: 2, periodA: 2, classA: '707', subjectA: '數學',
    dateB: '2026-09-04', dayB: 5, periodB: 5, classB: '707', subjectB: '健康教育'
  });
  assert.equal(onlineExchange, [
    '小明老師，想問您是否方便和月亭老師調課，',
    '',
    '09/01(二) 第2節 707數學（余月亭老師）<->',
    '09/04(五) 第5節 707健康教育（王小明老師）',
    '',
    '感謝🙏🏻'
  ].join('\n'));
  assert.doesNotMatch(onlineExchange, /我的課|您的課/);

  const batch = templates.buildLineBatchInviteText({
    targetName: '王小明老師', requesterName: '陳小華老師', batchId: 'B1', systemUrl: 'https://school.example/',
    slots: [
      { id: '1', date: '2026-09-04', day: 5, period: 1, className: '904', subject: '國文', teacherName: '陳小華老師' },
      { id: '2', date: '2026-09-04', day: 5, period: 2, className: '905', subject: '國文', teacherName: '陳小華老師' }
    ]
  });
  assert.match(batch, /小明老師，想問您是否可以幫忙協助以下代課：/);
  assert.match(batch, /904國文（陳小華老師）/);
  assert.match(batch, /全部可以/);
  assert.match(batch, /感謝/);
  assert.doesNotMatch(batch, /經費來源|調代課系統訊息/);

  const paperBatchInvite = templates.buildLineBatchInviteText({
    targetName: '王小明老師', requesterName: '陳小華老師', batchId: 'B1',
    systemUrl: 'https://school.example/', paperFlow: true,
    slots: [
      { id: '1', date: '2026-09-04', day: 5, period: 1, className: '904', subject: '國文', teacherName: '陳小華老師' },
      { id: '2', date: '2026-09-04', day: 5, period: 2, className: '905', subject: '國文', teacherName: '陳小華老師' }
    ]
  });
  assert.match(paperBatchInvite, /如果可以，我再拿代課單給您，感謝/);
  assert.doesNotMatch(paperBatchInvite, /請回覆：|全部可以|全部不便|https?:\/\/|action=/);

  const paper = templates.buildAskFirstLineText({
    targetName: '王小明老師', requesterName: '陳小華老師',
    dateA: '2026-09-04', dayA: 5, periodA: 1, classA: '904', subjectA: '國文', reason: '事假'
  });
  assert.match(paper, /小明老師，想問您是否可以協助代課：/);
  assert.match(paper, /09\/04\(五\) 第1節 904國文（陳小華老師）/);
  assert.match(paper, /如果可以，我再拿代課單給您，感謝/);
  assert.doesNotMatch(paper, /假別：|紙本調代課通知|簽名後交回教學組|https?:\/\/|action=/);

  const paperBatch = templates.buildAskFirstLineText({
    targetName: '王小明老師', requesterName: '陳小華老師',
    slots: [
      { date: '2026-09-04', day: 5, period: 1, className: '904', subject: '國文', teacherName: '陳小華老師' },
      { date: '2026-09-04', day: 5, period: 2, className: '905', subject: '國文', teacherName: '陳小華老師' }
    ]
  });
  assert.match(paperBatch, /1\. 09\/04\(五\) 第1節 904國文（陳小華老師）/);
  assert.match(paperBatch, /2\. 09\/04\(五\) 第2節 905國文（陳小華老師）/);
  assert.match(paperBatch, /如果可以，我再拿代課單給您，感謝/);

  const pendingSlot = templates.getLineHandledSlot({
    date: '2026-09-07', dayOfWeek: 1, period: 2, cls: '906', subject: '自然'
  });
  assert.equal(pendingSlot.className, '906', '送出前草稿應讀取 cls 班級欄位');
  const pendingAsk = templates.buildAskFirstLineText({
    targetName: '王小明老師', requesterName: '陳小華老師',
    dateA: pendingSlot.date, dayA: pendingSlot.day, periodA: pendingSlot.period,
    classA: pendingSlot.className, subjectA: pendingSlot.subject
  });
  assert.match(pendingAsk, /09\/07\(一\) 第2節 906自然（陳小華老師）/);
}

function runCourseDisplayFormatTest() {
  const formatter = loadCourseDisplayFormatter();
  const notificationCourse = formatter.formatCourseDisplayText('802', '體育', 'OOO老師');
  assert.equal(notificationCourse, '802體育（OOO老師）');
  const tableCourse = formatter.formatCourseDisplayText('802', '體育');
  assert.equal(tableCourse, '802體育');
  assert.equal(formatter._fmtSlot('2026-09-08', '二', 3, tableCourse), '09/08(二) 第3節 802體育');
}

function runTriangleLineFormatTest() {
  const templates = loadTriangleLineTemplates();
  assert.equal(
    templates.formatTriangleSlot(
      { date: '2026-09-08', day: 2, period: 3 },
      { className: '802', subject: '體育' },
      'OOO老師'
    ),
    '09/08(二) 第3節 802體育（OOO老師）'
  );
  const text = templates.buildTriangleLineText({
    targetTeacherName: '王小明',
    reason: '課務調整'
  }, [{
    id: 'triangle-1',
    requesterName: '余明錦',
    targetTeacherName: '王小明',
    requestDate: '2026-09-08',
    requestPeriodDay: 2,
    requestPeriod: 3,
    targetDate: '2026-09-10',
    targetDayOfWeek: 4,
    targetPeriod: 5,
    className: '802',
    subject: '體育'
  }]);
  assert.match(text, /09\/08\(二\) 第3節 802體育（余明錦老師）/);
  assert.match(text, /09\/10\(四\) 第5節 802體育（余明錦老師）/);

  const paperText = templates.buildTriangleLineText({
    targetTeacherName: '王小明',
    reason: '課務調整',
    paperFlow: true
  }, [{
    requesterName: '余明錦',
    targetTeacherName: '王小明',
    requestDate: '2026-09-08',
    requestPeriodDay: 2,
    requestPeriod: 3,
    className: '802',
    subject: '體育'
  }]);
  assert.match(paperText, /如果可以，我再拿代課單給您，感謝/);
  assert.doesNotMatch(paperText, /請回覆：|https?:\/\/|action=/);
}

function loadPaperFlowClassifier() {
  // v2：UiApproval.create 直驗
  const libSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-approval.js'), 'utf8');
  assert.match(libSource, /function isPaperFlowRequest\(request\) \{/,
    'paper flow classifier must remain discoverable');
  const api = UiApproval.create({
    ref: value => ({ value }),
    notificationsSuppressed: { value: true }
  });
  return { isPaperFlowRequest: api.isPaperFlowRequest };
}
function runProgressTest() {
  const getProgress = loadProgressSteps();
  const paper = getProgress({
    paperFlow: true,
    status: 'pending_admin',
    targetTeacherName: '黃老師',
    createdAt: '2026-08-27'
  });
  assert.equal(paper.steps.length, 2);
  assert.equal(paper.steps[0].key, 'admin');
  assert.equal(paper.steps[0].label, '等教學組核准');
  assert.equal(paper.summary, '目前：紙本通知已送出，等待教學組核准出單');

  const online = getProgress({
    paperFlow: false,
    status: 'pending_admin',
    targetTeacherName: '黃老師',
    createdAt: '2026-08-27'
  });
  assert.equal(online.steps.length, 3);
  assert.equal(online.steps[0].label, '等 黃老師 同意');
  assert.equal(online.summary, '目前：對方已同意，等待教學組核准出單');

  const proxy = getProgress({
    isProxySubmit: true,
    status: 'pending_admin',
    targetTeacherName: '黃老師',
    createdAt: '2026-08-27'
  });
  assert.equal(proxy.steps.length, 2);
  assert.equal(proxy.summary, '目前：已代送申請，等待教學組核准出單');
}

function runFieldMapTest() {
  const fieldMap = FieldMap;
  const teacher = fieldMap.mapTeacher({
    '教師Email': ' New.Teacher@School.Example ',
    '教師姓名': '新教師'
  });
  assert.equal(teacher.loginEmail, 'new.teacher@school.example');

  const paper = fieldMap.mapRequest({
    '申請單ID': 'paper-1', '狀態': 'pending_admin', '紙本流程': ' TRUE '
  });
  assert.equal(paper.paperFlow, true);
  assert.equal(paper.paperFlowSpecified, true);

  const online = fieldMap.mapRequest({
    '申請單ID': 'online-1', '狀態': 'pending_admin', '紙本流程': ' FALSE '
  });
  assert.equal(online.paperFlow, false);
  assert.equal(online.paperFlowSpecified, true);

  const direct = fieldMap.mapRequest({
    '申請單ID': 'direct-1', '直接核准': '是', '備註': '使用者原因'
  });
  assert.equal(direct.directApprove, true);
  assert.equal(direct.note, '使用者原因');

  const legacyTimestamp = fieldMap.mapRequest({
    '申請單ID': 'legacy-1',
    '申請時間': '2026-08-28 11:23:45',
    '更新時間': '2026-08-28 11:25:00'
  });
  assert.equal(legacyTimestamp.createdAt, '2026-08-28 11:23:45');
  assert.equal(legacyTimestamp.updatedAt, '2026-08-28 11:25:00');

  const exchangeFields = fieldMap.mapRequest({
    '異動類型': 'exchange',
    '對調目標班級': '704',
    '對調目標科目': '國文'
  });
  assert.equal(exchangeFields.targetClassName, '704');
  assert.equal(exchangeFields.targetSubject, '國文');

  const classifier = loadPaperFlowClassifier();
  assert.equal(classifier.isPaperFlowRequest({
    status: 'pending_admin', paperFlow: false, paperFlowSpecified: true
  }), true, '紙本模式的非代申請待核准單應使用紙本訊息');
  assert.equal(classifier.isPaperFlowRequest({
    status: 'pending_admin', paperFlow: false, paperFlowSpecified: true, isProxySubmit: true
  }), false, '代申請仍保留線上待行政流程');
  assert.equal(classifier.isPaperFlowRequest({
    status: 'pending_teacher', paperFlow: false, paperFlowSpecified: true
  }), true, '紙本模式的舊待受邀單也應使用紙本訊息');
  assert.equal(classifier.isPaperFlowRequest({
    status: 'pending_teacher', paperFlow: false, paperFlowSpecified: true, isProxySubmit: true
  }), false, '代申請仍保留線上待受邀流程');
}

function runRequestListSortTest() {
  assert.match(
    fs.readFileSync(path.join(here, '../src/modules/ui-list-helpers.js'), 'utf8'),
    /function serverRequestChangesLocal\(localRow, serverRow\)/,
    '背景同步應共用伺服器列變更檢查');
  // 2A：同步合併已移至 ui-sync.js
  const syncSource = fs.readFileSync(path.join(here, '../src/modules/ui-sync.js'), 'utf8');
  assert.match(syncSource, /if \(changed\) \{\s*requestsList\.value = sortRequestListDesc\(Object\.keys\(byId\)/,
    '一般申請合併無變更時應跳過整表排序與 bucket 重算');
  assert.match(syncSource, /if \(changed\) \{\s*requestsList\.value = sortRequestListDesc\(next\);\s*recomputeRequestBuckets\(\);/,
    'pendingOnly 無變更時應跳過整表排序與 bucket 重算');
  const sorter = loadRequestListSorter();
  const rows = [
    { id: 'old', serial: 'SWP5814', createdAt: '2026-08-28 11:20:09', updatedAt: '2026-08-28 11:59:59', requestDate: '2026-09-01' },
    { id: 'late', serial: 'SWP7604', createdAt: '2026-08-28 11:20:10', requestDate: '2026-09-01' },
    { id: 'legacy', serial: 'SUB1365', createdAt: '', updatedAt: '2026-08-28 11:19:59', requestDate: '2026-09-01' }
  ];
  assert.deepEqual(sorter.sortRequestListDesc(rows).map(row => row.id), ['late', 'old', 'legacy']);
  assert.equal(sorter.formatRequestApplicationDate(rows[2]), '2026-08-28');
  assert.equal(sorter.formatRequestApplicationDate({ requestDate: '2026-09-04' }), '2026-09-04');
}

function runCalendarFallbackContractTest() {
  // 詳情按鈕已隨 modal 抽至 components/DetailModal.vue
  const html = fs.readFileSync(path.join(here, '..', 'src', 'components', 'DetailModal.vue'), 'utf8');
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
    assert.match(fallbackLink.href, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
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
}
function runApplicationFormContractTest() {
  const html = fs.readFileSync(path.join(here, '../src/App.vue'), 'utf8');
  assert.match(html, /data-tour="compare-fee"/, '管理員申請表應保留經費選單');
  assert.match(html, /v-if="isAdmin && pendingRequestData\.mode === 'substitution' && pendingRequestData\.specialFlow !== 'combined_return'"/, '經費選單應僅管理員可見且課務調整仍可選');
   assert.match(html, /<option value="扣額度">扣額度（不結鐘點＋扣折抵額度）<\/option>/, '管理員應可選扣額度');
   assert.match(html, /<option v-if="!isMutualCover" :value="TIMETABLE_ONLY_FEE">僅課表呈現（不結算）<\/option>/, '管理員應可選僅課表呈現');
   assert.match(html, /僅建立課表異動，不發代課費、不扣鐘點、不扣額度，也不列入經費匯出。/, '畫面應說明僅課表不進結算');
  assert.match(html, /扣額度規則：扣代課者 1 節額度；被代教師不扣鐘點、不扣額度。/, '畫面應說明扣款對象與被代者零扣除');
  assert.match(html, /quotaDeductPreview/, '扣額度選取後應顯示額度預覽');
  assert.match(html, /id="course-adjustment-only"/);
  assert.match(html, /@change="toggleCourseAdjustmentOnly"/);
  assert.match(html, /<th class="billing-sticky-name">姓名<\/th>\s*<th class="billing-th-job">職務<\/th>\s*<th class="billing-th-subject">科目<\/th>/, '月報應在科目前顯示職務');
  assert.match(html, /課代節[\s\S]*?課代費/, '月報「我去代課」區應獨立顯示課表代課節數與費用');
  assert.match(html, /monthlyReportTotals\.substitutePaidCount[\s\S]*?monthlyReportTotals\.substitutePaidFee/, '月報合計列應統計課表代課節數與費用');
  assert.match(html, /<td class="billing-job" :title="row\.jobTitle \|\| '教師'">\{\{ row\.jobTitle \|\| '教師' \}\}<\/td>/, '月報未填職務應預設為教師');
  assert.match(html, /<td class="billing-subj" :title="row\.subject \|\| ''">\{\{ row\.subject \}\}<\/td>/, '月報科目應可移入查看完整文字');
   assert.match(html, /\(pendingRequestData\.mode === 'substitution' \|\| pendingRequestData\.mode === 'exchange'\) && pendingRequestData\.specialFlow !== 'combined_return'/);
  assert.ok((html.match(/預覽調代課單/g) || []).length >= 3, 'compare modal must expose preview in every footer branch');
  assert.ok((html.match(/@click="openPaperPrintDraftFromCompare"/g) || []).length >= 3, 'preview buttons must use the shared preview flow');
  assert.doesNotMatch(html, /🖨️ 列印紙本通知/, 'compare modal must not expose the standalone paper notice button');
   assert.doesNotMatch(html, /送出並列印紙本通知|確認送出，通知相關人員/, 'submit button must not use the retired paper notice label');
   assert.match(html, /paperFlow \? '送出申請並列印調代課單' : '確認送出'/, 'paper flow submit button must send then print');
   assert.doesNotMatch(html, /送出前不可列印/, 'preview button should not expose the lock note in its label');
   assert.match(html, /v-if="printPreview && printPreview\.canPrint !== false" class="print-preview-image-actions"/, 'pre-submit image actions should be hidden');
    assert.match(html, /v-if="printPreview && printPreview\.canPrint !== false" type="button" class="btn btn-primary"(?: data-tour="print-confirm")? @click="confirmPrintPreview"/, 'pre-submit print action should be hidden');
  assert.match(html, /data-tour="success-followup-actions"/);
  assert.match(html, /@click="openSuccessPrintPreview"/);
  assert.match(html, /@click="addSuccessToCalendar"/);
  assert.match(html, /@click="closeSuccessGoRecords"/);
      const backofficeStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'backoffice.js'), 'utf8');
const submitStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'submit.js'), 'utf8');
const outputStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'output.js'), 'utf8');
const mutualStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'mutual.js'), 'utf8');
      const activitySource = fs.readFileSync(path.join(here, '../src/modules/ui-activity.js'), 'utf8');
      // 2B 拆分：互代面板／一次送出已移至 ui-mutual.js（懶載），相關斷言改讀該檔
      const mutualSource = fs.readFileSync(path.join(here, '../src/modules/ui-mutual.js'), 'utf8');
      // 2A：假別變更處理已移至 ui-backoffice.js
      const backofficeSource = fs.readFileSync(path.join(here, '../src/modules/ui-backoffice.js'), 'utf8');
      // 2A：列印紙本已移至 ui-print.js
      const printSource = fs.readFileSync(path.join(here, '../src/modules/ui-print.js'), 'utf8');
      // 2A：導覽已移至 ui-tour.js
      const tourSource = fs.readFileSync(path.join(here, '../src/modules/ui-tour.js'), 'utf8');
      const onboardingSource = fs.readFileSync(path.join(here, '../src/modules/onboarding-tour.js'), 'utf8');
      assert.match(backofficeStoreSource, /PUBLIC_FEE_REASONS = \['公假', '婚假', '喪假', '產假'/, '產假應列入公費預設假別');
      assert.match(backofficeSource, /pendingRequestData\.value\.subFee = defaultSubFeeForReason\(reason\)/, '假別變更應重新帶入預設經費');
      assert.match(backofficeStoreSource, /const PUBLIC_FEE_REASONS =/, '經費預設 helper 必須存在');
      assert.match(backofficeStoreSource, /const getHistoryEditDefaultSubFee/, '歷史編輯預設經費 helper 必須存在');
      // v2：以 Pinia 實測取代源碼切片（默認非第8節、非互代，與 v1 樁條件一致）
      setActivePinia(createPinia());
      const defaultSubFeeForReason = useBackofficeStore().defaultSubFeeForReason;
      ['公假', '婚假', '喪假', '產假', '產前假/分娩假', '身心調適假'].forEach(reason => {
        assert.equal(defaultSubFeeForReason(reason), '公費代課', `${reason}應預設公費代課`);
      });
      ['休假', '病假', '事假', '補休', '其他'].forEach(reason => {
        assert.equal(defaultSubFeeForReason(reason), '自費代課', `${reason}應預設自費代課`);
      });
     // 2A：isMutualRec 已隨 personalChanges 移至 ui-history.js（具名匯出供測）
     const histSource = fs.readFileSync(path.join(here, '../src/modules/ui-history.js'), 'utf8');
     assert.match(histSource, /const isMutualRec = \(r\) => \{/, '個人異動互代判斷函式必須存在');
               const isMutualRec = UiHistory.create({
       computed: () => ({}),
       isQuotaDeductFee: fee => String(fee || '') === '扣額度' || String(fee || '') === '互代不結'
     }).isMutualRec;
     assert.equal(isMutualRec({ subFee: '第8節代課' }), false, '第8節代課經費不可顯示為互代');
     assert.equal(isMutualRec({ subFee: '活動公費' }), true, '活動公費仍應顯示為互代');
     assert.match(submitStoreSource, /const paperFlow = computed\(\(\) =>\s*!storeToRefs\(useTourStore\(\)\)\.isMutualCover\.value\s*&&\s*notificationsSuppressed\.value\s*&&\s*!isProxySubmitActive\.value/, '關閉線上申請時應優先走紙本流程');
     assert.match(html, /v-if="isAdmin && !notificationsSuppressed && pendingRequestData\.specialFlow !== 'combined_return'/, '紙本模式不應顯示直接核准選項');
    // 2A：代申請驗證已移至 ui-proxy.js
    const proxySource = fs.readFileSync(path.join(here, '../src/modules/ui-proxy.js'), 'utf8');
    assert.match(proxySource, /if \(isAdmin\.value\) return true;/, '管理員應可協助他人再辦');
    // 2A：點格與本人判定已移至 ui-interaction.js
    const interactSource = fs.readFileSync(path.join(here, '../src/modules/ui-interaction.js'), 'utf8');
    assert.match(interactSource, /const ownerKeys = \[record\.actualTeacherEmail, record\.actualTeacherName\]/, '本人判定應以實際授課教師為準');
    // 2A：startSecondSub 已移至 ui-interaction.js
    assert.match(interactSource, /if \(!canStartSecondSubFromDetail\.value\) \{/, '再辦操作入口應再次驗證本人權限');
    assert.equal((html.match(/getBatchGroupTeacherSummary\(row\)/g) || []).length, 3, '三個批次主列都應顯示全部代課教師');
    // 2A：批次教師摘要已移至 ui-list-helpers.js
    const getBatchGroupTeacherSummary = loadListHelpers().getBatchGroupTeacherSummary;
    assert.equal(typeof getBatchGroupTeacherSummary, 'function', '批次教師摘要函式必須存在');
    assert.equal(getBatchGroupTeacherSummary({ items: [
      { targetTeacherName: '黃健忠' },
      { targetTeacherName: '余明錦' },
      { targetTeacherName: '黃健忠' }
    ] }), '黃健忠、余明錦', '批次主列應去重顯示全部教師');
    // 2A：toggleCourseAdjustmentOnly 已移至 ui-submit.js
    const appSubmitSource = fs.readFileSync(path.join(here, '../src/modules/ui-submit.js'), 'utf8');
    assert.match(appSubmitSource, /if \(p\.mode !== 'substitution' && p\.mode !== 'exchange'\) return;/, '課務調整切換應支援調課模式');
    assert.match(appSubmitSource, /const d = p\.mode === 'substitution'\s*\? getLeaveTimeDefaults\(p\.leaveTeacher\)\s*:\s*\{ type: '', start: '', end: '', range: '' \};/, '調課取消課務調整時不應套用請假時間');
     assert.match(backofficeSource, /reason \|\| ''\)\.trim\(\) === '課務調整'[\s\S]*toggleCourseAdjustmentOnly/, '直接選擇課務調整時應清空請假時間');
    assert.match(html, /課務調整（無請假）/, '申請表應可直接選擇課務調整');
   assert.equal(typeof UiBatchPanel.create, 'function', 'batch panel module must remain discoverable');
  assert.match(activitySource, /var successActionRequests = deps\.successActionRequests/);
  assert.match(activitySource, /showSuccessModal, successActionRequests, showCompareModal/);
  assert.match(outputStoreSource, /successActionRequests/, 'output store 應暴露 successActionRequests');
   assert.match(printSource, /returnTo === 'compare'\) showCompareModal\.value = true/);
   assert.match(html, /getClassChangeTypeLabel\(item\.type\)/, 'class change badges should use compact labels');
   assert.match(html, /isHomeroomTeacher\(t, activeCell\.classData && activeCell\.classData\.className\)/, 'substitution candidates should show class-specific homeroom status');
    assert.match(mutualStoreSource, /const getClassChangeTypeLabel =/, '班級異動標籤函式應存在');
    // R16：代導判定已移至 ui-homeroom.js；改讀模組源碼
    const hmSource = fs.readFileSync(path.join(here, '../src/modules/ui-homeroom.js'), 'utf8');
    assert.match(hmSource, /const isHomeroomTeacher =/);
    assert.match(hmSource, /const getHomeroomClassCodes =/);
    // v2：UiHomeroom.create 直驗（body 與 v1 一致；v1 另有源碼切片，見上）
    const homeroomHelpers = UiHomeroom.create({
      computed: fn => ({ get value() { return fn(); } }),
      activeCell: { value: { classData: { className: '904' } } },
      lookupTeacher: () => null
    });
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '904導師' }, '904'), true);
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '901導師' }, '904'), false);
    assert.equal(homeroomHelpers.isHomeroomTeacher({ jobTitle: '導師' }, '904'), false);
   assert.match(outputStoreSource, /openPaperPrintDraft\(null, \{ returnTo: 'compare', canPrint: false \}\)/, 'compare 預覽入口應存在');
   assert.match(printSource, /canPrint: options\.canPrint === true/);
  assert.match(outputStoreSource, /openPaperPrintDraft\(buildPaperRecordsForSubmittedRequests\(requests\), \{ canPrint: true \}\)/, '送出預覽入口應存在');
   assert.match(printSource, /snapshot\.canPrint === false/);
   assert.match(printSource, /returnTo: draft\.returnTo \|\| ''/);
  assert.match(outputStoreSource, /successActionRequests/, '成功流程應引用 successActionRequests');
   assert.match(tourSource, /mode: notificationsSuppressed\.value \? 'paper' : 'online'/, 'onboarding should follow the global paper mode');
   assert.match(tourSource, /openExchangeModeDemo: \(\) => openExchangeModeDemoForTour\(\)/, 'tour should demonstrate exchange mode');
    // v2 ESM 無 ?v 手工版號（Vite content-hash 取代）；改斷言 onboarding 引用仍在
      assert.match(tourSource, /onboarding/i, 'tour 應引用 onboarding 模組');
       // v2 無 ?v script 標籤（ESM bundle＋hash 檔名取代）。
           assert.match(shellSource, /src="\/src\/main.js"/, 'v2 殼層載入 Vite entry');
      assert.match(mutualSource, /email: r\.loginEmail \|\| r\.email/,
        '活動額度發放應傳送登入 Email，不得把姓名鍵 email 當作登入 Email');
        assert.match(tourSource, /paperFlow: notificationsSuppressed\.value/);
        // 2A：copyLineMessageForRequest 已移至 ui-timetable.js
        const timetableSource = fs.readFileSync(path.join(here, '../src/modules/ui-timetable.js'), 'utf8');
          assert.match(timetableSource, /const paperFlowRequest = req\.status === 'pending_admin'\s*\|\|\s*\(!isProxySubmitRequest\(req\) && \(isPaperFlowRequest\(req\) \|\| notificationsSuppressed\.value\)\);/, '紙本與待行政核准傳訊不得帶線上簽核連結');
         assert.match(timetableSource, /const rows = \[req\];/, 'LINE 單筆操作不得展開整個批次');
        const lineRequestStart = timetableSource.indexOf('const copyLineMessageForRequest =');
        const lineRequestEnd = timetableSource.indexOf('const convertRequestsToSubstitutions =', lineRequestStart);
        assert.ok(lineRequestStart >= 0 && lineRequestEnd > lineRequestStart, 'LINE 單筆訊息函式必須存在');
        assert.doesNotMatch(timetableSource.slice(lineRequestStart, lineRequestEnd), /requestsList\.value/, 'LINE 單筆操作不得讀取整批申請');
        const printSingleStart = outputStoreSource.indexOf('const printSingleRequest =');
        assert.ok(printSingleStart >= 0, '單筆列印函式必須存在（output store）');
        assert.doesNotMatch(outputStoreSource.slice(printSingleStart, printSingleStart + 2000), /batchId && seedRecord/, '單筆列印不得依批次擴展資料');
         assert.match(html, /printSingleRequest\(\{ recordId: row\.id \}, 'Notice'\)/, '批次歷史列印應傳入該列明細 ID');
         const printRequestStart = printSource.indexOf('const openPaperPrintForRequest =');
         const printRequestEnd = printSource.indexOf('const openTrianglePaperPreview =', printRequestStart);
         assert.ok(printRequestStart >= 0 && printRequestEnd > printRequestStart, '單筆紙本列印入口必須存在');
         assert.match(printSource.slice(printRequestStart, printRequestEnd), /isTriangleRequest\(request\) && triangleId/, '只有三角調列印可保留整組');
         assert.doesNotMatch(printSource.slice(printRequestStart, printRequestEnd), /const rows = batchId/, '一般批次列印不得展開整批');
        // 2A：月報合計已移至 ui-report.js
        const reportSource = fs.readFileSync(path.join(here, '../src/modules/ui-report.js'), 'utf8');
        assert.match(reportSource, /const monthlyReportTotals = computed\(\(\) =>/);
        assert.match(reportSource, /sumMonthlyReportRows\(monthlyReportData\.value\)/);
        assert.match(html, /<tr v-if="monthlyReportData\.length > 0" class="billing-total-row">/, '鐘點結算應顯示合計列');
        assert.match(html, /monthlyReportTotals\.period8Fee/, '合計列應包含第 8 節金額');
  assert.match(tourSource, /openPaperPrintDemo: \(\) => openPaperPrintDemoForTour\(\)/, 'paper tour should open a print preview demo');
     assert.match(tourSource, /openExchangeModeDemo: \(\) => openExchangeModeDemoForTour\(\)/, 'tour should demonstrate exchange mode');
    assert.match(tourSource, /source: 'paperTour'/, 'paper tour preview must use an isolated source');
   assert.match(tourSource, /const shouldAutoStartOnboarding =/);
  assert.match(tourSource, /ONBOARDING_PAPER_STORAGE_KEY/);
  assert.match(onboardingSource, /var PAPER_STORAGE_KEY = 'jcjh_onboarding_paper_v1'/);
   assert.match(onboardingSource, /var PAPER_STEP_OVERRIDES =/);
   assert.match(onboardingSource, /step\.id !== 'line-success' && step\.id !== 'pending-invite'/);
   assert.doesNotMatch(onboardingSource, /鐘點費/, 'onboarding must not mention the retired hourly-fee field');
   assert.match(onboardingSource, /id: 'match-mode'/, 'tour should include the exchange mode step');
   assert.match(onboardingSource, /id: 'exchange-controls'/, 'tour should include exchange controls');
   assert.match(onboardingSource, /_storageKey = opts\.mode === 'paper' \? PAPER_STORAGE_KEY : STORAGE_KEY/);
   assert.match(html, /notificationsSuppressed \? '紙本流程操作教學' : '線上簽核操作教學'/, 'help button label should follow the global mode');
   assert.match(html, /data-tour="exchange-mode-btn"/, 'exchange mode button should be a tour target');
   assert.match(html, /data-tour="exchange-controls"/, 'exchange controls should be a tour target');
     assert.match(onboardingSource, /paper-print-preview/, 'paper tour should include the print preview step');
     assert.match(onboardingSource, /paper-print-button/, 'paper tour should include the confirm-print step');
     assert.match(onboardingSource, /compare-submit-paper/, 'paper tour should target the paper submit button');
     assert.match(html, /paperMode \? '紙本申請進度' : '待辦簽核'/, 'pending navigation should follow the active mode');
   assert.match(html, /data-tour="print-preview-modal"/, 'print preview should be a tour target');
   assert.match(html, /data-tour="print-confirm"/, 'confirm print button should be a tour target');
}

function runHistoryEditTeacherValueTest() {
  const historyEditForm = ref({});
  const showHistoryEditModal = ref(false);
  const teachersList = ref([
    { email: '申請人', loginEmail: 'owner@school.example', name: '申請人', teacherName: '申請人' },
    { email: '受邀人', loginEmail: 'invitee@school.example', name: '受邀人', teacherName: '受邀人' }
  ]);
  const requestsList = ref([{
    id: 'request-edit-1',
    requesterEmail: 'owner@school.example',
    targetTeacherEmail: 'invitee@school.example',
    requesterName: '申請人',
    targetTeacherName: '受邀人',
    requestDate: '2026-08-28',
    requestPeriod: 1,
    reason: '公假',
    subFee: '自費代課'
  }, {
    id: 'request-course-only',
    requesterEmail: 'owner@school.example',
    targetTeacherEmail: 'invitee@school.example',
    requesterName: '申請人',
    targetTeacherName: '受邀人',
    requestDate: '2026-08-29',
    requestPeriod: 1,
    reason: '課務調整',
    leaveTimeType: '全天',
    leaveTime: '08:00~16:00',
    subFee: '自費代課'
  }]);
  const api = UiAdmin.create({
    ref,
    callGasApi: async () => ({ success: true }),
    showToast: () => {},
    showConfirm: async () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    currentSemester: ref('115-1'),
    getTeacherNameByEmail: teacherName,
    teachersList,
    allSchedules: ref([]),
    leaveReasonOptions: ['公假', '事假', '其他'],
    getHistoryEditDefaultSubFee: (reason, period) => Number(period) === 8
      ? '第8節代課'
      : reason === '公假' ? '公費代課' : '自費代課',
    historyEditForm,
    showHistoryEditModal,
    requestsList
  });
  api.openHistoryEditModal({
    id: 'sub-edit-1',
    requestId: 'request-edit-1',
    originalTeacherName: '申請人',
    actualTeacherName: '受邀人',
    date: '2026-08-28',
    period: 1,
    className: '701',
    subject: '國文'
  });
  assert.equal(historyEditForm.value.requesterEmail, '申請人');
  assert.equal(historyEditForm.value.targetTeacherEmail, '受邀人');
  assert.equal(historyEditForm.value.subFee, '公費代課');
  assert.equal(showHistoryEditModal.value, true);
  historyEditForm.value.reason = '事假';
  api.onHistoryEditReasonChange();
  assert.equal(historyEditForm.value.subFee, '自費代課');
  historyEditForm.value.requestPeriod = 8;
  api.onHistoryEditPeriodChange();
  assert.equal(historyEditForm.value.subFee, '第8節代課');
  historyEditForm.value.type = 'exchange';
  api.onHistoryEditTypeChange();
  assert.equal(historyEditForm.value.subFee, '無');
  api.openHistoryEditModal({
    id: 'sub-course-only',
    requestId: 'request-course-only',
    originalTeacherName: '申請人',
    actualTeacherName: '受邀人',
    date: '2026-08-29',
    period: 1,
    className: '701',
    subject: '國文'
  });
  assert.equal(historyEditForm.value.courseAdjustmentOnly, true);
  assert.equal(historyEditForm.value.reason, '課務調整');
  assert.equal(historyEditForm.value.leaveTimeType, '');
  assert.equal(historyEditForm.value.leaveTime, '');
}

async function runCombinedHistoryEditContractTest() {
  const historyEditForm = ref({});
  const showHistoryEditModal = ref(false);
  const teachersList = ref([
    { email: '申請人', loginEmail: 'owner@school.example', name: '申請人', teacherName: '申請人' },
    { email: '受邀人', loginEmail: 'invitee@school.example', name: '受邀人', teacherName: '受邀人' }
  ]);
  let sent = null;
  const api = UiAdmin.create({
    ref,
    callGasApi: async (action, payload) => { sent = { action, payload }; return { success: true }; },
    showToast: () => {},
    showConfirm: async () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    loadWeeklyData: async () => {},
    currentSemester: ref('115-1'),
    getTeacherNameByEmail: teacherName,
    teachersList,
    allSchedules: ref([]),
    leaveReasonOptions: ['公假', '事假', '其他'],
   getHistoryEditDefaultSubFee: (reason, period) => Number(period) === 8
     ? '第8節代課'
     : (reason === '公假' ? '公費代課' : '自費代課'),
    historyEditForm,
    showHistoryEditModal,
    requestsList: ref([{
      id: 'combined-req-1',
      requesterEmail: 'owner@school.example',
      requesterName: '申請人',
       targetTeacherEmail: '受邀人',
       targetTeacherName: '受邀人',
      specialFlow: 'combined_return',
      requestDate: '2026-08-28',
      requestPeriod: 1,
      className: '701、702',
      subject: '國文',
       reason: '公假',
      subFee: '公費代課'
    }])
  });

  api.openHistoryEditModal({
    id: 'sub-combined-1',
    requestId: 'combined-req-1',
    originalTeacherName: '申請人',
     actualTeacherName: '受邀人',
    specialFlow: 'combined_return',
    date: '2026-08-28',
    period: 1,
    className: '701、702',
    subject: '國文'
  });
  assert.equal(historyEditForm.value.specialFlow, 'combined_return');
   assert.equal(historyEditForm.value.targetTeacherEmail, '受邀人');
   assert.equal(historyEditForm.value.reason, '公假');
  historyEditForm.value.requestPeriod = 8;
  api.onHistoryEditPeriodChange();
   assert.equal(historyEditForm.value.subFee, '第8節代課');
  await api.saveHistoryEdit();
  assert.equal(sent.action, 'saveHistoryEdit');
   assert.equal(sent.payload.targetTeacherEmail, '受邀人');
   assert.equal(sent.payload.targetTeacherName, '受邀人');
  assert.equal(sent.payload.specialFlow, 'combined_return');
  assert.equal(sent.payload.requestPeriod, 8);
   assert.equal(sent.payload.reason, '公假');
}

function singleDeps() {
  const pendingRequestData = ref({
    mode: 'substitution',
    leaveTeacher: 'owner@school.example',
    subTeacher: 'invitee@school.example',
    cls: '701',
    subject: '國文',
    date: '2026-08-17',
    timeKey: '1-1',
    reason: '事假',
    subFee: '自費代課',
    leaveTimeType: '全天',
    leaveTimeStart: '08:00',
    leaveTimeEnd: '16:00',
    leaveTime: '08:00~16:00',
    submitRequestId: '',
    submitSerial: ''
  });
  return {
    pendingRequestData,
    currentSemester: ref('115-1'),
    getTeacherNameByEmail: teacherName,
    isAdmin: ref(false),
    directApproveMode: ref(false),
    paperFlow: ref(true),
    isMutualCover: ref(false),
    PERIOD8_FEE: '第8節代課',
    ACTIVITY_PUBLIC_FEE: '活動公費',
    defaultSubFeeForReason: () => '自費代課',
    activeCell: ref(null),
    inputRequestDate: ref('2026-08-17'),
    DAC: () => null,
    isProxySubmitActive: () => false,
    canStaffProxySubmit: () => false,
    shouldProxySubmitForLeave: () => false,
    getProxyActor: () => ({ email: 'owner@school.example', name: '申請人' }),
    userEmail: () => 'owner@school.example'
  };
}

function runConsecutiveWarningTest() {
  const api = UiSubmitHelpers;
  const date = '2026-08-17';
  let existingPeriods = [1, 2];
  const getScheduleForDate = (email, dateStr, period) => {
    if (email !== '受邀人' || dateStr !== date) return null;
    return existingPeriods.includes(Number(period))
      ? { teacherName: email }
      : null;
  };

  const reachesThree = api.getConsecutiveStatus(
    getScheduleForDate, '受邀人', date, 3, null
  );
  assert.equal(reachesThree.beforeMaxConsec, 2);
  assert.equal(reachesThree.maxConsec, 3);
  assert.equal(reachesThree.shouldWarn, true, '變成連三須警示');

  existingPeriods = [1, 2, 3];
  const extendsExistingRun = api.getConsecutiveStatus(
    getScheduleForDate, '受邀人', date, 4, null
  );
  assert.equal(extendsExistingRun.maxConsec, 4);
  assert.equal(extendsExistingRun.shouldWarn, false, '已連三不因變成連四重複警示');

  const addsOutsideRun = api.getConsecutiveStatus(
    getScheduleForDate, '受邀人', date, 6, null
  );
  assert.equal(addsOutsideRun.maxConsec, 3);
  assert.equal(addsOutsideRun.shouldWarn, false, '非連堂新增不應重複警示');
}

async function runSingleTest() {
  const api = UiSubmitHelpers;
  const deps = singleDeps();
  const built = api.buildSubmitPayload(deps, 'req-paper-single', 'SUB1234');
  assert.equal(built.newRequest['狀態'], 'pending_admin');
  assert.equal(built.newRequest['紙本流程'], 'TRUE');
  assert.equal(built.newRequest.paperFlow, true);
  assert.equal(built.newRequest['申請人Email'], 'owner@school.example');
  assert.equal(built.newRequest['受邀人Email'], 'invitee@school.example');

  const quotaDeps = singleDeps();
  quotaDeps.isAdmin.value = true;
  quotaDeps.pendingRequestData.value.subFee = '扣額度';
  const quotaBuilt = api.buildSubmitPayload(quotaDeps, 'req-quota-single', 'SUB2468');
  assert.equal(quotaBuilt.newRequest['經費來源'], '扣額度', '手動選取扣額度應保留在送出 payload');

  const exchangeDeps = singleDeps();
  exchangeDeps.pendingRequestData.value = {
    mode: 'exchange',
    leaveTeacher: 'owner@school.example',
    subTeacher: 'invitee@school.example',
    cls: '703',
    subject: '數學',
    date: '2026-09-01',
    timeKey: '2-6',
    dateB: '2026-09-03',
    timeB: '4-2',
    subBClass: '704',
    subB: '國文',
    reason: '課務調整',
    subFee: '無'
  };
  const exchangeBuilt = api.buildSubmitPayload(exchangeDeps, 'req-exchange', 'SWP1234');
  assert.equal(exchangeBuilt.newRequest['對調目標班級'], '704');
  assert.equal(exchangeBuilt.newRequest['對調目標科目'], '國文');

  const combinedDeps = singleDeps();
  combinedDeps.isAdmin.value = true;
  combinedDeps.pendingRequestData.value = Object.assign({}, combinedDeps.pendingRequestData.value, {
    specialFlow: 'combined_return',
    subTeacher: 'invitee@school.example',
    subFee: '公費代課',
    courseAdjustmentOnly: false,
     reason: '事假'
  });
  const combinedBuilt = api.buildSubmitPayload(combinedDeps, 'req-combined', 'SUB5679');
  assert.equal(combinedBuilt.newRequest['狀態'], 'pending_admin');
  assert.equal(combinedBuilt.newRequest['特殊流程'], 'combined_return');
  assert.equal(combinedBuilt.newRequest['受邀人Email'], 'invitee@school.example');
  assert.equal(combinedBuilt.newRequest['紙本流程'], 'FALSE');
  assert.equal(combinedBuilt.newRequest.directApprove, false);
  assert.equal(combinedBuilt.newRequest.courseAdjustmentOnly, false);
   assert.equal(combinedBuilt.newRequest['經費來源'], '自費代課');
  Object.assign(combinedDeps, {
    showToast: () => {},
    showConfirm: async () => true,
    hasSubTeacherConflict: ref(false),
    assertQuotaDeductAllowed: () => true
  });
  assert.equal(await api.validateSubmitRequest(combinedDeps), true);
  combinedDeps.pendingRequestData.value.courseAdjustmentOnly = true;
  assert.equal(await api.validateSubmitRequest(combinedDeps), false);

  const sentPayloads = [];
  let attempts = 0;
  let printedRows = null;
  Object.assign(deps, {
    validate: async () => true,
    validateSubmitRequest: async () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    isSubmitting: ref(false),
    mutualSkipNotify: ref(false),
    directApproveSkipNotify: ref(false),
    notificationsSuppressed: ref(true),
    callGasApi: async (action, payload) => {
      assert.equal(action, 'submitRequest');
      sentPayloads.push(payload);
      attempts += 1;
      if (attempts === 1) throw new Error('simulated timeout after request write');
      return { success: true };
    },
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    optimisticUpsertRequest: () => {},
    sheetRequestToFront: row => row,
    deductMutualQuotaForRows: async () => {},
    softRefreshInBackground: () => {},
    isQuotaDeductFee: () => false,
    buildLineInviteText: () => '',
    successModalTitle: ref(''),
    successModalMessage: ref(''),
     lineCopyText: ref('舊的線上訊息'),
     hasLineTemplate: ref(true),
      showSuccessModal: ref(true),
     successActionRequests: ref([]),
     showToast: () => {},
    openPaperPrintDraft: rows => { printedRows = rows; },
    buildSubmitPayload: (requestId, serial) => api.buildSubmitPayload(deps, requestId, serial),
    getProxyActor: deps.getProxyActor,
    getTeacherNameByEmail: teacherName,
    userEmail: deps.userEmail
  });

  await api.executeSubmitRequest(deps);
  await api.executeSubmitRequest(deps);
  assert.equal(attempts, 2);
  assert.equal(sentPayloads[0].request['申請單ID'], sentPayloads[1].request['申請單ID']);
  assert.equal(sentPayloads[0].paperFlow, true);
  assert.equal(sentPayloads[1].request['狀態'], 'pending_admin');
    assert.equal(printedRows.length, 1);
    assert.equal(printedRows[0]['紙本流程'], 'TRUE');
    assert.equal(deps.successActionRequests.value.length, 1);
    assert.equal(deps.hasLineTemplate.value, false);
    assert.equal(deps.lineCopyText.value, '');
    assert.equal(deps.showSuccessModal.value, false);
}

async function runApprovalLedgerCacheBustTest() {
  const api = UiApproval;
  let apiCalls = 0;
  let busts = 0;
  const request = {
    id: 'quota-approval-1',
    requestId: 'quota-approval-1',
    type: 'substitution',
    status: 'pending_admin',
    subFee: '扣額度'
  };
  const approval = api.create({
    ref,
    callGasApi: async action => {
      assert.equal(action, 'adminApprove');
      apiCalls += 1;
      return { success: true };
    },
    callGasApiWithProgress: async () => ({ success: true }),
    showToast: () => {},
    showConfirm: async () => ({ ok: true, note: '' }),
    loading: ref(false),
    loadingMessage: ref(''),
    getStatusText: () => '',
    getTeacherNameByEmail: value => value,
    isTriangleRequest: () => false,
    restoreMutualQuotaForRows: () => {},
    bustQuotaLedgerCache: () => { busts += 1; },
    optimisticPatchRequestStatus: () => {},
    optimisticPatchRequestStatuses: () => {},
    optimisticPatchTriangleGroup: () => {},
    softRefreshInBackground: () => {},
    formatRequestSummary: () => '',
    formatApproveBatchRiskSummary: () => '',
    getApproveRiskFlags: () => [],
    requestsList: ref([request]),
    mySentRequests: ref([]),
    myPendingRequests: ref([]),
    adminPendingRequests: ref([]),
    allPendingRequests: ref([]),
    paginatedAdminPending: ref([]),
    selectedRecordIds: ref([]),
    activeTab: ref('pending'),
    showDetailModal: ref(false),
    detailRequest: ref(null),
    detailSubRecord: ref(null)
  });

  await approval.adminApprove(request.id, { skipConfirm: true, skipSoftRefresh: true });
  assert.equal(apiCalls, 1);
  assert.equal(busts, 1, '核准成功後應清除額度帳本畫面快取');
}

async function runTriangleAdminBatchSelectionTest() {
  const source = fs.readFileSync(path.join(here, '../src/App.vue'), 'utf8');
  assert.doesNotMatch(
    source,
    /class="admin-select-cb[^"]*"[^>]*:disabled="row\.type === 'triangle'/,
    '三角調待核准列不可再被 disabled'
  );

  const api = UiApproval;
  const requests = [
    { id: 'tri_20260929_ab12_1', triangleId: 'tri_20260929_ab12', type: 'triangle', status: 'pending_admin' },
    { id: 'request-1', type: 'substitution', status: 'pending_admin' }
  ];
  const calls = [];
  const approval = api.create({
    ref,
    callGasApi: async (action, payload) => {
      calls.push({ action, payload });
      return { success: true };
    },
    callGasApiWithProgress: async (action, payload) => {
      calls.push({ action, payload });
      return { success: true, count: 1, ids: payload.requestIds };
    },
    showToast: () => {},
    showConfirm: async () => ({ ok: true, note: '' }),
    loading: ref(false),
    loadingMessage: ref(''),
    getStatusText: () => '',
    getTeacherNameByEmail: value => value,
    isTriangleRequest: request => !!(request && (request.type === 'triangle' || request.triangleId)),
    restoreMutualQuotaForRows: () => {},
    bustQuotaLedgerCache: () => {},
    optimisticPatchRequestStatus: () => {},
    optimisticPatchRequestStatuses: () => {},
    optimisticPatchTriangleGroup: () => {},
    softRefreshInBackground: () => {},
    formatRequestSummary: () => '',
    formatApproveBatchRiskSummary: () => '',
    getApproveRiskFlags: () => [],
    requestsList: ref(requests),
    mySentRequests: ref([]),
    myPendingRequests: ref([]),
    adminPendingRequests: ref(requests),
    allPendingRequests: ref(requests),
    paginatedAdminPending: ref(requests.map(request => Object.assign({ displayKind: 'item' }, request))),
    selectedRecordIds: ref([]),
    activeTab: ref('pending'),
    showDetailModal: ref(false),
    detailRequest: ref(null),
    detailSubRecord: ref(null)
  });

  approval.toggleSelectAllAdminPending();
  assert.deepEqual(
    new Set(approval.selectedAdminPendingIds.value),
    new Set(['tri_20260929_ab12_1', 'request-1']),
    '本頁全選應包含三角調列'
  );
  await approval.batchAdminApprove();
  assert.deepEqual(calls.map(call => call.action), ['adminApproveBatch', 'adminApprove']);
  assert.equal(Array.from(calls[0].payload.requestIds).join(','), 'request-1');
  assert.equal(calls[1].payload.requestId, 'tri_20260929_ab12_1');

  calls.length = 0;
  approval.selectedAdminPendingIds.value = ['tri_20260929_ab12_1', 'request-1'];
  await approval.batchAdminReject();
  assert.deepEqual(calls.map(call => call.action), ['adminRejectBatch', 'adminReject']);
  assert.equal(Array.from(calls[0].payload.requestIds).join(','), 'request-1');
  assert.equal(calls[1].payload.requestId, 'tri_20260929_ab12_1');
}

async function runLineHandledSlotTest() {
  const api = UiSubmitHelpers;
  const linePayloads = [];
  const deps = singleDeps();
  deps.paperFlow.value = false;
  deps.inputRequestDate.value = '2026-08-25';
  deps.activeCell.value = {
    dayOfWeek: 2,
    period: 4,
    classData: { className: '803', subject: '體育' }
  };
  Object.assign(deps, {
    validateSubmitRequest: async () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    isSubmitting: ref(false),
    mutualSkipNotify: ref(false),
    directApproveSkipNotify: ref(false),
    notificationsSuppressed: ref(false),
    callGasApi: async () => ({ success: true }),
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    optimisticUpsertRequest: () => {},
    sheetRequestToFront: row => row,
    deductMutualQuotaForRows: async () => {},
    softRefreshInBackground: () => {},
    isQuotaDeductFee: () => false,
    buildLineInviteText: payload => { linePayloads.push(payload); return ''; },
    successModalTitle: ref(''),
    successModalMessage: ref(''),
    lineCopyText: ref(''),
    hasLineTemplate: ref(false),
    showSuccessModal: ref(false),
    successActionRequests: ref([]),
    showToast: () => {},
    buildSubmitPayload: () => ({
      payload: { request: {} },
      isExchange: false,
      newRequest: {
        '狀態': 'pending_teacher',
        '申請人姓名': '黃俊升',
        '受邀人姓名': '健忠',
        '異動日期': '2026-08-01',
        '異動星期': 6,
        '異動節次': 1,
        '班級': '錯誤班級',
        '科目': '錯誤科目',
        isProxySubmit: true
      }
    })
  });

  await api.executeSubmitRequest(deps);
  assert.equal(linePayloads.length, 1);
  assert.equal(linePayloads[0].dateA, '2026-08-25');
  assert.equal(linePayloads[0].dayA, 2);
  assert.equal(linePayloads[0].periodA, 4);
  assert.equal(linePayloads[0].classA, '803');
  assert.equal(linePayloads[0].subjectA, '體育');
}

async function runCourseAdjustmentTest() {
  const api = UiSubmitHelpers;
  const deps = singleDeps();
  deps.pendingRequestData.value = Object.assign({}, deps.pendingRequestData.value, {
    reason: '課務調整',
    courseAdjustmentOnly: true,
    leaveTimeType: '',
    leaveTimeStart: '',
    leaveTimeEnd: '',
    leaveTime: ''
  });
  const built = api.buildSubmitPayload(deps, 'req-course-only', 'SUB5678');
  assert.equal(built.newRequest['請假事由'], '課務調整');
  assert.equal(built.newRequest['請假時間類型'], '');
  assert.equal(built.newRequest['請假時間'], '');
  assert.equal(built.newRequest['僅課務調整'], '是');
  assert.equal(built.newRequest.courseAdjustmentOnly, true);

  Object.assign(deps, {
    showToast: () => {},
    showConfirm: async () => true,
    hasSubTeacherConflict: ref(false),
    assertQuotaDeductAllowed: () => true,
    allSchedules: ref([])
  });
  assert.equal(await api.validateSubmitRequest(deps), true);

  const reasonOnlyDeps = singleDeps();
  reasonOnlyDeps.pendingRequestData.value = Object.assign({}, reasonOnlyDeps.pendingRequestData.value, {
    reason: '課務調整',
    courseAdjustmentOnly: false,
    leaveTimeType: '全天',
    leaveTimeStart: '08:00',
    leaveTimeEnd: '16:00',
    leaveTime: '08:00~16:00'
  });
  const reasonOnly = api.buildSubmitPayload(reasonOnlyDeps, 'req-course-reason-only', 'SUB5679');
  assert.equal(reasonOnly.newRequest.courseAdjustmentOnly, true, '選到課務調整時應自動視為僅課務調整');
  assert.equal(reasonOnly.newRequest['僅課務調整'], '是');
  assert.equal(reasonOnly.newRequest['請假時間類型'], '');
  assert.equal(reasonOnly.newRequest['請假時間'], '');

  const exchangeDeps = singleDeps();
  exchangeDeps.pendingRequestData.value = Object.assign({}, exchangeDeps.pendingRequestData.value, {
    mode: 'exchange',
    date: '2026-09-01',
    timeKey: '2-6',
    dateB: '2026-09-03',
    timeB: '4-2',
    subBClass: '704',
    subB: '國文',
    reason: '課務調整',
    courseAdjustmentOnly: true,
    leaveTimeType: '',
    leaveTimeStart: '',
    leaveTimeEnd: '',
    leaveTime: ''
  });
  const exchangeCourseOnly = api.buildSubmitPayload(exchangeDeps, 'req-exchange-course-only', 'SWP5678');
  assert.equal(exchangeCourseOnly.newRequest.courseAdjustmentOnly, true);
  assert.equal(exchangeCourseOnly.newRequest['僅課務調整'], '是');
  assert.equal(exchangeCourseOnly.newRequest['請假時間類型'], '');
  assert.equal(exchangeCourseOnly.newRequest['請假時間'], '');
  assert.equal(exchangeCourseOnly.newRequest['對調目標班級'], '704');
  assert.equal(exchangeCourseOnly.newRequest['對調目標科目'], '國文');

  Object.assign(exchangeDeps, {
    showToast: () => {},
    showConfirm: async () => true,
    hasSubTeacherConflict: ref(false),
    assertQuotaDeductAllowed: () => true,
    allSchedules: ref([])
  });
  assert.equal(await api.validateSubmitRequest(exchangeDeps), true, '調課課務調整不需填請假時間');
  let exchangeConflictWarning = '';
  exchangeDeps.exchangeIncomingConflict = ref({
    teacher: 'sheng@example.com', date: '2026-09-03', period: 2
  });
  exchangeDeps.showToast = message => { exchangeConflictWarning = String(message || ''); };
  assert.equal(await api.validateSubmitRequest(exchangeDeps), false, '同教師同日同節已有另一堂調課時應阻擋送出');
  assert.match(exchangeConflictWarning, /調課衝堂.*2026-09-03.*第2節/);

  const directDeps = singleDeps();
  directDeps.isAdmin.value = true;
  directDeps.directApproveMode.value = true;
  directDeps.paperFlow.value = false;
  directDeps.pendingRequestData.value.note = '使用者原因';
  const direct = api.buildSubmitPayload(directDeps, 'req-direct', 'SUB9012');
  assert.equal(direct.newRequest['備註'], '', '自費代課不寫入請假備註（隱私；此夾具為自費）');
  assert.equal(direct.newRequest['直接核准'], '是');
  assert.equal(direct.newRequest.directApprove, true);
  assert.doesNotMatch(direct.newRequest['備註'], /直接核准/);
}

function runExchangeIncomingConflictDetectionTest() {
  const appSource = fs.readFileSync(path.join(here, '../src/modules/ui-submit.js'), 'utf8');
  const start = appSource.indexOf('const exchangeIncomingConflict = computed(() =>');
  const end = appSource.indexOf('const confirmIfTargetPatrol', start);
  assert.ok(start >= 0 && end > start, 'exchange incoming conflict detector must remain discoverable');
  const makeConflict = (substitutions, pendingRequests) => {
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
  };
  const approvedConflict = makeConflict([{
    requestId: 'old-approved', type: 'exchange', actualTeacherEmail: 'Alice',
    date: '2026-10-12', period: 4
  }], []);
  assert.deepEqual(
    { teacher: approvedConflict.teacher, date: approvedConflict.date, period: approvedConflict.period },
    { teacher: 'Alice', date: '2026-10-12', period: 4 },
    '前端應辨識已核准調課以教師姓名或 Email 指向同一人的調入衝堂'
  );

  const pendingConflict = makeConflict([], [{
    id: 'old-pending', type: 'exchange', status: 'pending_admin',
    requesterEmail: 'alice@example.edu', targetTeacherEmail: 'carol@example.edu',
    requestDate: '2026-10-09', requestPeriod: 2,
    targetDate: '2026-10-12', targetPeriod: 4
  }]);
  assert.equal(pendingConflict.date, '2026-10-12', '尚待簽核的調課也應保留時段避免重複調入');
  assert.equal(makeConflict([], []), null, '沒有既有調入的節次不可誤報衝堂');
}

async function runBatchTest(courseAdjustmentOnly = false, adminPaperMode = false, reasonOnly = false) {
  const api = UiBatchSubmit;
  const batchSlots = ref([
    { teacherEmail: 'owner@school.example', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人', dateStr: '2026-08-17', dayOfWeek: 1, period: 1, className: '701', subject: '國文' },
    { teacherEmail: 'owner@school.example', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人', dateStr: '2026-08-17', dayOfWeek: 1, period: 2, className: '702', subject: '國文' }
  ]);
  const pendingRequestData = ref({
    isBatch: true,
    isPerSlot: false,
    reason: courseAdjustmentOnly || reasonOnly ? '課務調整' : '事假',
    courseAdjustmentOnly,
    note: '',
    subTeacher: 'invitee@school.example',
    subFee: '自費代課',
    leaveTimeType: '全天',
    leaveTimeStart: '08:00',
    leaveTimeEnd: '16:00',
    leaveTime: '08:00~16:00',
    submitBatchId: 'bat-paper-contract',
    submitSerial: 'SUB4321'
  });
  const sent = [];
  let printedRows = null;
  const deps = {
    batchSlots,
    pendingRequestData,
    batchAssignMode: ref('same'),
    batchReason: ref(courseAdjustmentOnly || reasonOnly ? '課務調整' : '事假'),
    batchNote: ref(''),
    batchSubTeacher: ref('invitee@school.example'),
    batchSubFee: ref('自費代課'),
    showToast: () => {},
    showConfirm: async () => true,
    getScheduleForDate: () => null,
    getTeacherNameByEmail: teacherName,
    getLeaveTimeDefaults: () => ({ type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' }),
    isMutualCover: ref(false),
    mutualAwayClasses: ref([]),
    mutualSkipNotify: ref(false),
     isAdmin: ref(adminPaperMode),
    isQuotaDeductFee: () => false,
    QUOTA_DEDUCT_FEE: '扣額度',
    ACTIVITY_PUBLIC_FEE: '活動公費',
    PERIOD8_FEE: '第8節代課',
    defaultSubFeeForReason: () => '自費代課',
    assertQuotaDeductAllowed: () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    currentSemester: ref('115-1'),
     directApproveMode: ref(adminPaperMode),
    directApproveSkipNotify: ref(false),
    paperFlow: ref(true),
    paperMode: ref(true),
    notificationsSuppressed: ref(true),
    callGasApi: async (action, payload) => {
      assert.equal(action, 'submitRequestBatch');
      sent.push(payload);
      return { success: true };
    },
    optimisticUpsertRequest: () => {},
    sheetRequestToFront: row => row,
    deductMutualQuotaForRows: async () => {},
    softRefreshInBackground: () => {},
    activityBalanceCtx: () => ({}),
    successModalTitle: ref(''),
    successModalMessage: ref(''),
   hasLineTemplate: ref(true),
   lineBatchParts: ref([{ text: '舊的線上分卡' }]),
   lineCopyText: ref('舊的線上訊息'),
   showSuccessModal: ref(true),
    successActionRequests: ref([]),
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    batchSelectMode: ref(true),
    clearBatchSlots: () => { batchSlots.value = []; },
    buildLineBatchInviteText: () => '',
    DAC: () => null,
    openPaperPrintDraft: rows => { printedRows = rows; },
    isSubmitting: ref(false)
  };

  await api.executeBatchSubmit(deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].paperFlow, true);
  assert.equal(sent[0].directApprove, false);
  assert.equal(sent[0].skipNotify, true);
  assert.ok(sent[0].requests.every(row => row['狀態'] === 'pending_admin' && row['紙本流程'] === 'TRUE'));
  assert.equal(printedRows.length, 2, 'paper records must be built before batch slots are cleared');
  assert.equal(deps.successActionRequests.value.length, 2);
  assert.equal(deps.hasLineTemplate.value, false, '紙本批次不應產生 LINE 範本');
  assert.equal(deps.lineBatchParts.value.length, 0, '紙本批次不應產生 LINE 分卡');
  assert.equal(deps.showSuccessModal.value, false, '紙本批次不應顯示線上成功 Modal');
  if (courseAdjustmentOnly || reasonOnly) {
    assert.ok(sent[0].requests.every(row => row['請假時間類型'] === '' && row['請假時間'] === ''));
  }
  assert.equal(batchSlots.value.length, 0);
}

async function runBatchExchangeTest() {
  const api = UiBatchSubmit;
  const batchSlots = ref([{
    key: 'owner@school.example|2026-08-17|1', batchId: 'bat-exchange-test',
    exchangeRequestId: 'req-exchange-1', exchangeSerial: 'SWP-1',
    teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-17', dayOfWeek: 1,
    period: 1, className: '701', subject: '國文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人',
    targetDate: '2026-08-18', targetDayOfWeek: 2, targetPeriod: 2, targetClassName: '701', targetSubject: '國文'
  }, {
    key: 'owner@school.example|2026-08-17|2', batchId: 'bat-exchange-test',
    exchangeRequestId: 'req-exchange-2', exchangeSerial: 'SWP-2',
    teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-17', dayOfWeek: 1,
    period: 2, className: '702', subject: '英文', subTeacherEmail: 'third@school.example', subTeacherName: '另一受邀人',
    targetDate: '2026-08-18', targetDayOfWeek: 2, targetPeriod: 3, targetClassName: '702', targetSubject: '英文'
  }]);
  const pendingRequestData = ref({
    mode: 'exchange', isBatch: true, isExchangeBatch: true, batchCount: 2,
    submitBatchId: 'bat-exchange-test', reason: '課務調整', courseAdjustmentOnly: true, note: ''
  });
  const sent = [];
  const optimistic = [];
  let cleared = 0;
  const deps = {
    batchSlots,
    pendingRequestData,
    batchFlowMode: ref('exchange'),
    batchAssignMode: ref('perSlot'),
    isSubmitting: ref(false),
    loading: ref(false),
    loadingMessage: ref(''),
    showToast: () => {},
    buildSubmitPayload: (requestId, serial) => {
      const pending = pendingRequestData.value;
      const request = {
        '申請單ID': requestId,
        '單號': serial,
        '異動類型': pending.mode,
        '申請人Email': pending.leaveTeacher,
        '申請人姓名': teacherName(pending.leaveTeacher),
        '受邀人Email': pending.subTeacher,
        '受邀人姓名': teacherName(pending.subTeacher),
        '異動日期': pending.date,
        '異動節次': parseInt(String(pending.timeKey).split('-')[1], 10),
        '異動星期': parseInt(String(pending.timeKey).split('-')[0], 10),
        '班級': pending.cls,
        '科目': pending.subject,
        '對調目標日期': pending.dateB,
        '對調目標節次': parseInt(String(pending.timeB).split('-')[1], 10),
        '對調目標星期': parseInt(String(pending.timeB).split('-')[0], 10),
        '對調目標班級': pending.subBClass,
        '對調目標科目': pending.subB,
        '請假事由': pending.reason,
        '經費來源': '無',
        '紙本流程': 'FALSE',
        '狀態': 'pending_teacher',
        paperFlow: false
      };
      return { newRequest: request, payload: { request, directApprove: false, paperFlow: false } };
    },
    callGasApi: async (action, payload) => {
      assert.equal(action, 'submitExchangeBatch');
      sent.push(payload);
      return {
        success: true,
        count: 1,
        successes: [{ requestId: 'req-exchange-1', status: 'pending_teacher' }],
        failures: [{ requestId: 'req-exchange-2', error: '調課衝堂測試' }]
      };
    },
    sheetRequestToFront: row => row,
    optimisticUpsertRequest: row => optimistic.push(row),
    softRefreshInBackground: () => {},
    successActionRequests: ref([]),
    successModalTitle: ref(''),
    successModalMessage: ref(''),
    successFlowMode: ref(''),
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    showSuccessModal: ref(false),
    batchSelectMode: ref(true),
    clearBatchSlots: () => { cleared++; batchSlots.value = []; },
    directApproveMode: ref(false),
    directApproveSkipNotify: ref(false),
    isAdmin: ref(false),
    notificationsSuppressed: ref(false),
    buildLineInviteText: () => 'LINE-INVITE',
    hasLineTemplate: ref(false),
    lineBatchParts: ref([]),
    lineCopyText: ref('')
  };

  await api.executeBatchSubmit(deps);
  assert.equal(sent.length, 1, '批次調課以單一 API 逐組回傳結果');
  assert.equal(sent[0].batchId, 'bat-exchange-test');
  assert.equal(sent[0].directApprove, false, '非管理員不應直接核准');
  assert.equal(sent[0].paperFlow, false, '非紙本模式不應標記紙本流程');
  assert.equal(sent[0].requests.length, 2, '每組互調都應建立獨立申請列');
  assert.ok(sent[0].requests.every(row => row['異動類型'] === 'exchange'));
  assert.deepEqual(Array.from(optimistic, row => row['申請單ID']), ['req-exchange-1'], '只有成功組應更新本地資料');
  assert.equal(batchSlots.value[0].exchangeSubmitted, true, '成功組需標記已送出');
  assert.equal(batchSlots.value[1].exchangeSubmitError, '調課衝堂測試', '失敗組需保留逐組錯誤');
  assert.equal(cleared, 0, '部分成功時保留批次草稿，讓使用者可以修正失敗組');
  assert.match(deps.successModalTitle.value, /部分送出/);
  assert.equal(deps.lineBatchParts.value.length, 1, '批次調課成功即產生 LINE 範本（與批次代課一致）');
  assert.equal(deps.hasLineTemplate.value, true);

  // 管理員勾選直接核准：與批次代課一致，整批直接生效
  const directSlots = ref([{
    key: 'owner@school.example|2026-08-17|1', batchId: 'bat-exchange-direct',
    teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-17', dayOfWeek: 1,
    period: 1, className: '701', subject: '國文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人',
    targetDate: '2026-08-18', targetDayOfWeek: 2, targetPeriod: 2, targetClassName: '701', targetSubject: '國文'
  }, {
    key: 'owner@school.example|2026-08-17|2', batchId: 'bat-exchange-direct',
    teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-17', dayOfWeek: 1,
    period: 2, className: '702', subject: '英文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人',
    targetDate: '2026-08-18', targetDayOfWeek: 2, targetPeriod: 3, targetClassName: '702', targetSubject: '英文'
  }]);
  const directPending = ref({
    mode: 'exchange', isBatch: true, isExchangeBatch: true, batchCount: 2,
    submitBatchId: 'bat-exchange-direct', reason: '課務調整', courseAdjustmentOnly: true, note: ''
  });
  const directSent = [];
  let directCleared = 0;
  const directDeps = {
    batchSlots: directSlots,
    pendingRequestData: directPending,
    batchFlowMode: ref('exchange'),
    batchAssignMode: ref('perSlot'),
    isSubmitting: ref(false),
    loading: ref(false),
    loadingMessage: ref(''),
    showToast: () => {},
    buildSubmitPayload: requestId => ({
      newRequest: {
        '申請單ID': requestId,
        '申請人姓名': '申請人',
        '受邀人姓名': '受邀人',
        '異動日期': '2026-08-17',
        '狀態': 'pending_teacher',
        '紙本流程': 'FALSE'
      }
    }),
    callGasApi: async (action, payload) => {
      directSent.push(payload);
      return {
        success: true,
        successes: [
          { requestId: directSlots.value[0].exchangeRequestId, status: 'approved' },
          { requestId: directSlots.value[1].exchangeRequestId, status: 'approved' }
        ],
        failures: []
      };
    },
    sheetRequestToFront: row => row,
    optimisticUpsertRequest: () => {},
    softRefreshInBackground: () => {},
    successActionRequests: ref([]),
    successModalTitle: ref(''),
    successModalMessage: ref(''),
    successFlowMode: ref(''),
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    showSuccessModal: ref(false),
    batchSelectMode: ref(true),
    clearBatchSlots: () => { directCleared++; directSlots.value = []; },
    directApproveMode: ref(true),
    directApproveSkipNotify: ref(true),
    isAdmin: ref(true),
    notificationsSuppressed: ref(false),
    buildLineInviteText: () => 'LINE-INVITE',
    hasLineTemplate: ref(false),
    lineBatchParts: ref([]),
    lineCopyText: ref('')
  };

  await api.executeBatchSubmit(directDeps);
  assert.equal(directSent.length, 1);
  assert.equal(directSent[0].directApprove, true, '管理員勾選直接核准時與批次代課一致可直核');
  assert.equal(directSent[0].skipNotify, true, '直核不寄通知信時以後續 LINE 範本手動通知');
  assert.equal(directDeps.successFlowMode.value, 'direct');
  assert.equal(directCleared, 1, '全數成功即清空批次');
  assert.equal(directDeps.batchSelectMode.value, false);

  const retrySlots = ref([{
    key: 'retry-slot', exchangeRequestId: 'req-failed-original', exchangeSerial: 'SWP-failed-original',
    exchangeSubmitError: '調課衝堂測試', exchangeSubmitted: false,
    subTeacherEmail: 'invitee@school.example', targetDate: '2026-08-18', targetPeriod: 2
  }]);
  const retryPanel = UiBatchPanel.create({
    computed: getter => ({ get value() { return getter(); } }),
    showToast: () => {},
    batchSlots: retrySlots,
    batchActiveSlotKey: ref(''),
    batchFlowMode: ref('exchange'),
    batchAssignMode: ref('same'),
    batchSubTeacher: ref(''),
    showMatchModal: ref(false)
  });
  retryPanel.clearBatchSlotSub('retry-slot');
  assert.notEqual(retrySlots.value[0].exchangeRequestId, 'req-failed-original', '重配失敗組需換新的申請 ID');
  assert.notEqual(retrySlots.value[0].exchangeSerial, 'SWP-failed-original', '重配失敗組需換新的單號');

  const unknownSlots = ref([{
    key: 'unknown-slot', exchangeRequestId: 'req-unknown', exchangeSerial: 'SWP-unknown',
    exchangeSubmitError: '連線逾時', exchangeSubmissionUnknown: true, exchangeSubmitted: false
  }]);
  const unknownPanel = UiBatchPanel.create({
    computed: getter => ({ get value() { return getter(); } }),
    showToast: () => {},
    batchSlots: unknownSlots,
    batchActiveSlotKey: ref(''),
    batchFlowMode: ref('exchange'),
    batchAssignMode: ref('same'),
    batchSubTeacher: ref(''),
    showMatchModal: ref(false)
  });
  unknownPanel.clearBatchSlotSub('unknown-slot');
  assert.equal(unknownSlots.value[0].exchangeRequestId, 'req-unknown', '送出結果不明時不可更新申請 ID');
}

async function runBatchPartialTest() {
  const api = UiBatchSubmit;
  const batchSlots = ref([
    { key: 'owner@school.example|2026-08-17|1', teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-17', dayOfWeek: 1, period: 1, className: '701', subject: '國文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人' },
    { key: 'owner@school.example|2026-08-18|2', teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-18', dayOfWeek: 1, period: 2, className: '701', subject: '國文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人' },
    { key: 'owner@school.example|2026-08-19|3', teacherEmail: 'owner@school.example', teacherName: '申請人', dateStr: '2026-08-19', dayOfWeek: 1, period: 3, className: '701', subject: '國文', subTeacherEmail: 'invitee@school.example', subTeacherName: '受邀人' }
  ]);
  const pendingRequestData = ref({
    isBatch: true,
    isPerSlot: false,
    reason: '事假',
    courseAdjustmentOnly: false,
    note: '',
    subTeacher: 'invitee@school.example',
    subFee: '自費代課',
    leaveTimeType: '全天',
    leaveTimeStart: '08:00',
    leaveTimeEnd: '16:00',
    leaveTime: '08:00~16:00',
    submitBatchId: 'bat-partial',
    submitSerial: 'SUB0001'
  });
  const sent = [];
  const optimistic = [];
  let cleared = 0;
  let deducted = null;
  const deps = {
    batchSlots,
    pendingRequestData,
    batchAssignMode: ref('same'),
    batchReason: ref('事假'),
    batchNote: ref(''),
    batchSubTeacher: ref('invitee@school.example'),
    batchSubFee: ref('自費代課'),
    showToast: () => {},
    showConfirm: async () => true,
    getScheduleForDate: () => null,
    getTeacherNameByEmail: teacherName,
    getLeaveTimeDefaults: () => ({ type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' }),
    isMutualCover: ref(false),
    mutualAwayClasses: ref([]),
    mutualSkipNotify: ref(false),
    isAdmin: ref(false),
    isQuotaDeductFee: () => false,
    QUOTA_DEDUCT_FEE: '扣額度',
    ACTIVITY_PUBLIC_FEE: '活動公費',
    PERIOD8_FEE: '第8節代課',
    defaultSubFeeForReason: () => '自費代課',
    assertQuotaDeductAllowed: () => true,
    loading: ref(false),
    loadingMessage: ref(''),
    currentSemester: ref('115-1'),
    directApproveMode: ref(false),
    directApproveSkipNotify: ref(false),
    paperFlow: ref(false),
    paperMode: ref(false),
    notificationsSuppressed: ref(false),
    callGasApi: async (action, payload) => {
      assert.equal(action, 'submitRequestBatch');
      sent.push(payload);
      return {
        success: true,
        successes: [
          { requestId: 'req_bat-partial-0', status: 'pending_teacher' },
          { requestId: 'req_bat-partial-1', status: 'pending_teacher' }
        ],
        failures: [{ requestId: 'req_bat-partial-2', error: '測試失敗：該節已有代課' }]
      };
    },
    optimisticUpsertRequest: row => optimistic.push(row),
    sheetRequestToFront: row => row,
    deductMutualQuotaForRows: async rows => { deducted = rows; },
    softRefreshInBackground: () => {},
    activityBalanceCtx: () => ({}),
    successModalTitle: ref(''),
    successModalMessage: ref(''),
    hasLineTemplate: ref(false),
    lineBatchParts: ref([]),
    lineCopyText: ref(''),
    showSuccessModal: ref(false),
    successActionRequests: ref([]),
    showCompareModal: ref(true),
    showMatchModal: ref(false),
    batchSelectMode: ref(true),
    clearBatchSlots: () => { cleared++; batchSlots.value = []; },
    buildLineBatchInviteText: () => 'LINE-BATCH',
    DAC: () => null,
    openPaperPrintDraft: () => { throw new Error('非紙本不應開啟列印'); },
    isSubmitting: ref(false),
    successFlowMode: ref('')
  };

  await api.executeBatchSubmit(deps);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].requests.length, 3);
  assert.deepEqual(Array.from(optimistic, row => row['申請單ID']), ['req_bat-partial-0', 'req_bat-partial-1'], '只有成功節次應更新本地資料');
  assert.equal(deducted, null, '無扣額度節次不應觸發額度扣款');
  assert.equal(cleared, 0, '部分成功時不可清空批次');
  assert.equal(batchSlots.value.length, 1, '部分成功時只保留未送出節次');
  assert.equal(batchSlots.value[0].dateStr, '2026-08-19');
  assert.equal(batchSlots.value[0].submitError, '測試失敗：該節已有代課', '失敗節次需保留錯誤供修正');
  assert.equal(deps.successActionRequests.value.length, 2);
  assert.match(deps.successModalTitle.value, /部分送出/);
  assert.match(deps.successModalMessage.value, /2 節已送出/);
  assert.match(deps.successModalMessage.value, /1 節未送出/);
  assert.equal(deps.showSuccessModal.value, true);
  assert.equal(deps.showCompareModal.value, false);
  assert.equal(deps.batchSelectMode.value, true, '部分成功時維持批次模式以便重送');
  assert.equal(deps.hasLineTemplate.value, true);
  assert.equal(deps.lineBatchParts.value.length, 1, 'LINE 範本只含成功節次');
}

function runRechangeLabelTest() {
  // 2A：再異動判定簇已移至 ui-timetable.js；以 UiTimetable.create 注入同等測試樁
  const libSource = fs.readFileSync(path.join(here, '../src/modules/ui-timetable.js'), 'utf8');
  for (const name of ['normalizeRechangeRequestId', 'isEffectiveChangedDuty',
    'hasOtherChangedDutyAtSlot', 'isHistoryLeaveRechanged']) {
    assert.ok(libSource.indexOf('const ' + name + ' =') >= 0,
      'rechange detector ' + name + ' must remain discoverable');
  }
  const rechDeps = {
    computed: fn => ({ get value() { return fn(); } }),
    allSchedules: ref([]),
    schoolSwaps: ref([]),
    substitutionRecords: ref([{
       id: 'exchange-1_2',
       requestId: 'exchange-1',
      date: '2026-09-04',
      period: 2,
      originalTeacherEmail: '申請人',
      actualTeacherEmail: '受邀人',
      className: '904'
    }, {
      id: 'exchange-1_1',
      requestId: 'exchange-1',
      date: '2026-09-02',
      period: 5,
      originalTeacherEmail: '受邀人',
       actualTeacherEmail: '申請人',
      className: '904'
    }]),
    substitutionsLookup: ref({}),
    allPendingRequests: ref([]),
    displayTimetableTeachers: ref([]),
    currentWeekDates: ref([]),
    getTeacherNameByEmail: () => '',
    getTeacherSubjectByEmail: () => '',
    formatDateMMDD: s => s,
    isSingleWeek: () => true,
    isClassAwayOnDate: () => false,
    getWeekDayText: () => '',
    batchSelectMode: ref(false),
    isBatchSlotSelected: () => false,
    isMutualCover: ref(false),
    getMutualDraftAt: () => null,
    mutualAwayClasses: ref([]),
    mutualActivityStart: ref(''),
    mutualActivityEnd: ref(''),
    mutualActivityStartPeriod: ref(''),
    mutualActivityEndPeriod: ref(''),
    isMutualActivitySlotInRange: () => false,
    requestsList: ref([{
      id: 'admin-rejected-prior',
      status: 'admin_rejected'
    }]),
    isExchangeLikeRequest: req => {
      const type = String(req && req.type || '').trim().toLowerCase();
      return type === 'exchange' || type === '對調' || type === 'triangle'
        || type === '三角調' || !!(req && req.triangleId);
    }
  };
      const api = UiTimetable.create({
    computed: rechDeps.computed,
    allSchedules: rechDeps.allSchedules,
    schoolSwaps: rechDeps.schoolSwaps,
    substitutionRecords: rechDeps.substitutionRecords,
    substitutionsLookup: rechDeps.substitutionsLookup,
    allPendingRequests: rechDeps.allPendingRequests,
    displayTimetableTeachers: rechDeps.displayTimetableTeachers,
    currentWeekDates: rechDeps.currentWeekDates,
    getTeacherNameByEmail: rechDeps.getTeacherNameByEmail,
    getTeacherSubjectByEmail: rechDeps.getTeacherSubjectByEmail,
    formatDateMMDD: rechDeps.formatDateMMDD,
    isSingleWeek: rechDeps.isSingleWeek,
    isClassAwayOnDate: rechDeps.isClassAwayOnDate,
    getWeekDayText: rechDeps.getWeekDayText,
    batchSelectMode: rechDeps.batchSelectMode,
    isBatchSlotSelected: rechDeps.isBatchSlotSelected,
    isMutualCover: rechDeps.isMutualCover,
    getMutualDraftAt: rechDeps.getMutualDraftAt,
    mutualAwayClasses: rechDeps.mutualAwayClasses,
    mutualActivityStart: rechDeps.mutualActivityStart,
    mutualActivityEnd: rechDeps.mutualActivityEnd,
    mutualActivityStartPeriod: rechDeps.mutualActivityStartPeriod,
    mutualActivityEndPeriod: rechDeps.mutualActivityEndPeriod,
    isMutualActivitySlotInRange: rechDeps.isMutualActivitySlotInRange,
    requestsList: rechDeps.requestsList
  });
  const detector = {
    isHistoryLeaveRechanged: api.isHistoryLeaveRechanged,
    isHistoryExchangeRechanged: api.isHistoryExchangeRechanged,
    isRequestLeaveRechanged: api.isRequestLeaveRechanged,
    isRequestExchangeRechanged: api.isRequestExchangeRechanged
  };
  const request = {
    id: 'exchange-1',
    type: 'exchange',
    requesterEmail: '申請人',
    requestDate: '2026-09-04',
    requestPeriod: 2,
    targetTeacherEmail: '受邀人',
    targetDate: '2026-09-02',
    targetPeriod: 5
  };
  const history = {
    id: 'exchange-1_2',
    requestId: 'exchange-1',
    type: 'exchange',
    originalTeacherEmail: '申請人',
    actualTeacherEmail: '受邀人',
    date: '2026-09-04',
    period: 2,
    targetDate: '2026-09-02',
    targetPeriod: 5
  };
  assert.equal(detector.isRequestLeaveRechanged(request), false, 'current source edge must not be marked rechanged');
  assert.equal(detector.isRequestExchangeRechanged(request), false, 'current target edge must not be marked rechanged');
   assert.equal(detector.isHistoryLeaveRechanged(history), false, 'current history source edge must not be marked rechanged');
   assert.equal(detector.isHistoryExchangeRechanged(history), false, 'current history target edge must not be marked rechanged');
   rechDeps.substitutionRecords.value.push({
     requestId: 'admin-rejected-prior',
     status: 'approved',
     date: '2026-09-04',
     period: 2,
     originalTeacherEmail: '申請人',
     actualTeacherEmail: '其他教師',
     className: '701'
   }, {
     requestId: 'withdrawn-prior',
     status: 'withdrawn',
     date: '2026-09-02',
     period: 5,
     originalTeacherEmail: '受邀人',
     actualTeacherEmail: '其他教師',
     className: '702'
   });
   assert.equal(detector.isRequestLeaveRechanged(request), false, 'an admin-rejected prior change must not mark the source endpoint');
   assert.equal(detector.isRequestExchangeRechanged(request), false, 'a withdrawn prior change must not mark the target endpoint');
   rechDeps.substitutionRecords.value.push({
     requestId: 'exchange-0',
    date: '2026-09-04',
    period: 2,
    originalTeacherEmail: '申請人',
    actualTeacherEmail: '其他教師',
    className: '701'
  });
  assert.equal(detector.isRequestLeaveRechanged(request), true, 'a prior source change must mark the original endpoint');
  assert.equal(detector.isRequestExchangeRechanged(request), false, 'a prior source change must not mark the target endpoint');
  assert.equal(detector.isHistoryLeaveRechanged(history), true, 'history must mark a prior source change on the original endpoint');
  assert.equal(detector.isHistoryExchangeRechanged(history), false, 'history must not mark the untouched target endpoint');
  rechDeps.substitutionRecords.value.push({
    requestId: 'exchange-2',
    date: '2026-09-02',
    period: 5,
    originalTeacherEmail: '受邀人',
    actualTeacherEmail: '其他教師',
    className: '702'
  });
  assert.equal(detector.isRequestLeaveRechanged(request), true, 'both endpoints must remain independently marked');
  assert.equal(detector.isRequestExchangeRechanged(request), true, 'a prior target change must mark the target endpoint');
  assert.equal(detector.isHistoryLeaveRechanged(history), true, 'history must keep the source marker when both endpoints changed');
  assert.equal(detector.isHistoryExchangeRechanged(history), true, 'history must mark the target endpoint when both endpoints changed');
}

test('paper flow contract tests（v1 移植）', async () => {
  await runLineTemplateTest();
  await runCourseDisplayFormatTest();
  await runTriangleLineFormatTest();
  await runProgressTest();
  await runFieldMapTest();
  await runRequestListSortTest();
  await runCalendarFallbackContractTest();
  await runExchangePaperRecordMappingTest();
  await runApplicationFormContractTest();
  await runQuotaRiskFlagTargetTest();
  await runHistoryEditTeacherValueTest();
  await runCombinedHistoryEditContractTest();
  await runBatchTest(true);
  await runBatchTest(false, true);
  await runBatchTest(false, false, true);
  await runBatchExchangeTest();
  await runBatchPartialTest();
  await runConsecutiveWarningTest();
  await runSingleTest();
  await runApprovalLedgerCacheBustTest();
  await runTriangleAdminBatchSelectionTest();
  await runLineHandledSlotTest();
  await runCourseAdjustmentTest();
  await runExchangeIncomingConflictDetectionTest();
  await runRechangeLabelTest();
  await runBatchTest();
});
