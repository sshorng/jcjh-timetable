import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import DomainSchedule from '../src/domain/domain-schedule.js';
import FieldMap from '../src/domain/field-map.js';
import { UiTimetable } from '../src/modules/ui-timetable.js';
import { UiSubmitHelpers } from '../src/modules/ui-request.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ref = (value) => ({ value });
const computed = (getter) => ({ get value() { return getter(); } });

function makeConverter() {
  return UiTimetable.create({
    computed,
    allSchedules: ref([]),
    schoolSwaps: ref([]),
    substitutionRecords: ref([]),
    substitutionsLookup: ref({}),
    allPendingRequests: ref([]),
    displayTimetableTeachers: ref([]),
    currentWeekDates: ref([]),
    getTeacherNameByEmail: (e) => String(e || '').split('@')[0],
    getTeacherSubjectByEmail: () => '',
    formatDateMMDD: (s) => s,
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
    resolveCellFromBaseAndSubs: () => null,
    findBaseScheduleSlot: () => null,
    isCourseAdjustmentOnlyRequest: () => false,
    isEmptySlotAssignmentRequest: () => false
  }).convertRequestsToSubstitutions;
}

function swapRequest(flow) {
  return {
    id: 'swap-1',
    status: 'approved',
    createdAt: '2026-10-01T00:00:00',
    type: 'exchange',
    requesterEmail: '洪筱仙',
    requesterName: '洪筱仙',
    targetTeacherEmail: '蘇育男',
    targetTeacherName: '蘇育男',
    requestDate: '2026-10-12',
    requestPeriod: 6,
    requestPeriodDay: 1,
    targetDate: '2026-10-12',
    targetPeriod: 2,
    targetDayOfWeek: 1,
    className: '906',
    subject: '國文',
    targetClassName: '907',
    targetSubject: '公民',
    reason: '課務調整',
    subFee: '無',
    note: '',
    specialFlow: flow || ''
  };
}

function helpers() {
  return {
    getTeacherNameByEmail(v) {
      return String(v || '');
    },
    getTeacherSubjectByEmail() { return ''; },
    formatDateMMDD(v) { return v; },
    isSingleWeek() { return true; },
    isClassAway() { return false; },
    getWeekDayText(d) { return [' ', '一', '二', '三', '四', '五'][d] || ''; }
  };
}

test('teacher_swap：特殊流程正規化（值與中文標籤）', () => {
  assert.equal(FieldMap.normalizeSpecialFlow('teacher_swap'), 'teacher_swap');
  assert.equal(FieldMap.normalizeSpecialFlow('特殊對調（人走班留）'), 'teacher_swap');
  assert.equal(FieldMap.SPECIAL_FLOW_TEACHER_SWAP, 'teacher_swap');
});

test('teacher_swap：送單保留特殊流程，一般對調留空', () => {
  const build = (flow) => UiSubmitHelpers.buildSubmitPayload({
    pendingRequestData: ref({
      mode: 'exchange',
      leaveTeacher: 'hung@test',
      subTeacher: 'su@test',
      date: '2026-10-12',
      timeKey: '1-6',
      cls: '906',
      subject: '國文',
      dateB: '2026-10-12',
      timeB: '1-2',
      subBClass: '907',
      subB: '公民',
      reason: '課務調整',
      subFee: '無',
      specialFlow: flow || ''
    }),
    currentSemester: ref('115-1'),
    getTeacherNameByEmail: (e) => e,
    isAdmin: ref(true),
    directApproveMode: ref(false),
    paperFlow: ref(false),
    isMutualCover: ref(false),
    PERIOD8_FEE: '第8節代課',
    activeCell: ref(null)
  }, 'req-teacher-swap', 'SWP1001');
  assert.equal(build('teacher_swap').newRequest['特殊流程'], 'teacher_swap', '特殊對調應寫入特殊流程');
  assert.equal(build('').newRequest['特殊流程'], '', '一般對調特殊流程應留空');
});

test('teacher_swap：轉換後班級留在原時段（人走班留）', () => {
  const convert = makeConverter();
  const subs = convert([swapRequest('teacher_swap')]);
  assert.equal(subs.length, 2);
  const atTarget = subs.find((s) => s.date === '2026-10-12' && Number(s.period) === 2);
  const atLeave = subs.find((s) => s.date === '2026-10-12' && Number(s.period) === 6);
  assert.ok(atTarget && atLeave, '目標日與請假日各應有一筆');
  assert.equal(atTarget.className, '907', '目標日班級應留原班907');
  assert.equal(atTarget.subject, '公民');
  assert.equal(String(atTarget.actualTeacherEmail), '洪筱仙', '目標日由洪上課');
  assert.equal(atLeave.className, '906', '請假日班級應留原班906');
  assert.equal(atLeave.subject, '國文');
  assert.equal(String(atLeave.actualTeacherEmail), '蘇育男', '請假日由蘇上課');
});

test('admin_exception：特例舊單維持人帶班走（不被當班留）', () => {
  const convert = makeConverter();
  const req = swapRequest('');
  req.specialFlow = 'admin_exception';
  req['特殊流程'] = 'admin_exception';
  const subs = convert([req]);
  const atTarget = subs.find((s) => s.date === '2026-10-12' && Number(s.period) === 2);
  assert.equal(atTarget.className, '906', 'admin_exception 仍走一般對調（人帶班走）');
});

test('一般對調：轉換維持人帶班走（不受 teacher_swap 影響）', () => {
  const convert = makeConverter();
  const subs = convert([swapRequest('')]);
  const atTarget = subs.find((s) => s.date === '2026-10-12' && Number(s.period) === 2);
  const atLeave = subs.find((s) => s.date === '2026-10-12' && Number(s.period) === 6);
  assert.equal(atTarget.className, '906', '一般對調目標日應為請假人原課906');
  assert.equal(atLeave.className, '907', '一般對調請假日應為受邀人原課907');
});

test('teacher_swap：洪在 P2 顯示 907 調入', () => {
  const schedules = [
    { teacherEmail: '蘇育男', teacherName: '蘇育男', dayOfWeek: 1, period: 2, className: '907', subject: '公民' },
    { teacherEmail: '洪筱仙', teacherName: '洪筱仙', dayOfWeek: 1, period: 6, className: '906', subject: '國文' }
  ];
  const convert = makeConverter();
  const subs = convert([swapRequest('teacher_swap')]);
  const slotSubs = subs.filter((s) => s.date === '2026-10-12' && Number(s.period) === 2);
  const index = DomainSchedule.buildScheduleIndex(schedules);
  const cell = DomainSchedule.resolveApprovedSchedule({
    teacherEmail: '洪筱仙',
    dateStr: '2026-10-12',
    period: 2,
    dayOfWeek: 1,
    allSchedules: schedules,
    scheduleIndex: index,
    periodSubs: slotSubs,
    allSubs: subs,
    helpers: helpers()
  });
  assert.ok(cell, '洪 P2 應有調入格');
  assert.equal(cell.className, '907', '洪 P2 應上 907（人走班留）');
  assert.equal(cell.subject, '公民');
  assert.equal(cell.isSubstitutionDuty, true);
});

test('teacher_swap：同節互換兩邊皆顯示調入＋調出', () => {
  const schedules = [
    { teacherEmail: '賴美玲', teacherName: '賴美玲', dayOfWeek: 2, period: 1, className: '908', subject: '英語' },
    { teacherEmail: '馮品正', teacherName: '馮品正', dayOfWeek: 2, period: 1, className: '902', subject: '數學' }
  ];
  const convert = makeConverter();
  const req = swapRequest('teacher_swap');
  req.requesterEmail = '賴美玲';
  req.requesterName = '賴美玲';
  req.targetTeacherEmail = '馮品正';
  req.targetTeacherName = '馮品正';
  req.requestDate = '2026-10-13';
  req.requestPeriod = 1;
  req.requestPeriodDay = 2;
  req.targetDate = '2026-10-13';
  req.targetPeriod = 1;
  req.targetDayOfWeek = 2;
  req.className = '908';
  req.subject = '英語';
  req.targetClassName = '902';
  req.targetSubject = '數學';
  const subs = convert([req]);
  assert.equal(subs.length, 2);
  const slotSubs = subs.filter((s) => s.date === '2026-10-13' && Number(s.period) === 1);
  assert.equal(slotSubs.length, 2, '同節兩筆應落同格');
  const index = DomainSchedule.buildScheduleIndex(schedules);
  for (const email of ['賴美玲', '馮品正']) {
    const cell = DomainSchedule.resolveApprovedSchedule({
      teacherEmail: email,
      dateStr: '2026-10-13',
      period: 1,
      dayOfWeek: 2,
      allSchedules: schedules,
      scheduleIndex: index,
      periodSubs: slotSubs,
      allSubs: subs,
      helpers: helpers()
    });
    assert.ok(cell, email + '應有格子');
    assert.equal(cell.hasConcurrentDuty, true, email + '應同時顯示調入與調出');
    assert.ok(cell.outgoingDuty, email + '應保留原課調出');
  }
  const lai = DomainSchedule.resolveApprovedSchedule({
    teacherEmail: '賴美玲', dateStr: '2026-10-13', period: 1, dayOfWeek: 2,
    allSchedules: schedules, scheduleIndex: index, periodSubs: slotSubs, allSubs: subs, helpers: helpers()
  });
  assert.equal(lai.className, '902', '賴應上馮的 902（人走班留）');
  assert.equal(lai.outgoingDuty.className, '908', '賴原課 908 應列調出');
  const feng = DomainSchedule.resolveApprovedSchedule({
    teacherEmail: '馮品正', dateStr: '2026-10-13', period: 1, dayOfWeek: 2,
    allSchedules: schedules, scheduleIndex: index, periodSubs: slotSubs, allSubs: subs, helpers: helpers()
  });
  assert.equal(feng.className, '908', '馮應上賴的 908（人走班留）');
  assert.equal(feng.outgoingDuty.className, '902', '馮原課 902 應列調出');
});

test('日期格式混雜（斜線／短月日）仍併同格顯示', () => {
  const schedules = [
    { teacherEmail: '賴美玲', teacherName: '賴美玲', dayOfWeek: 2, period: 1, className: '908', subject: '英語' },
    { teacherEmail: '馮品正', teacherName: '馮品正', dayOfWeek: 2, period: 1, className: '902', subject: '數學' }
  ];
  // 手建列常見混寫：請假日破折、目標日斜線，實為同格
  const e1 = { id: 'm_1', requestId: 'm', date: '2026-10-13', period: 1, originalTeacherEmail: '賴美玲', actualTeacherEmail: '馮品正', className: '908', subject: '英語', type: 'exchange', subFee: '無' };
  const e2 = { id: 'm_2', requestId: 'm', date: '2026/10/13', period: 1, originalTeacherEmail: '馮品正', actualTeacherEmail: '賴美玲', className: '902', subject: '數學', type: 'exchange', subFee: '無' };
  const lookup = DomainSchedule.buildSubstitutionsLookup([e1, e2]);
  assert.equal((lookup['2026-10-13_1'] || []).length, 2, '混寫日期應併入同格鍵');
  const index = DomainSchedule.buildScheduleIndex(schedules);
  const periodSubs = lookup['2026-10-13_1'];
  for (const email of ['賴美玲', '馮品正']) {
    const cell = DomainSchedule.resolveApprovedSchedule({
      teacherEmail: email,
      dateStr: '2026-10-13',
      period: 1,
      dayOfWeek: 2,
      allSchedules: schedules,
      scheduleIndex: index,
      periodSubs,
      allSubs: periodSubs,
      helpers: helpers()
    });
    assert.equal(cell && cell.hasConcurrentDuty, true, email + '混寫日期仍應同時顯示調入與調出');
  }
  const classMap = DomainSchedule.buildClassSubstitutionMap([e1, e2]);
  assert.ok(classMap['902|2026-10-13|1'], '班級鍵日期亦應正規化');
});

test('teacher_swap：後端媒合佔位沿用班留原班', () => {
  const source = fs.readFileSync(path.join(here, '..', 'code.gs'), 'utf8');
  assert.match(source, /stayFlow === "teacher_swap"|"teacher_swap" === stayFlow|teacher_swap/, '後端應辨識 teacher_swap 班留流程');
});
