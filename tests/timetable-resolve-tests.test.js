import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiTimetable } from '../src/modules/ui-timetable.js';

test('timetable resolve tests（v1 移植）', () => {
  /**
   * timetable resolve 行為測試（2A 差分守門）
   *
   * findBaseScheduleSlot／resolveCellFromBaseAndSubs 自 app.js 搬入 UiTimetable
   * 後，以固定 fixtures 鎖定行為：基礎課表命中、空值、代課鏈回推。
   */


  const ref = value => ({ value });
  const computed = getter => ({ get value() { return getter(); } });

  const schedules = [
    { teacherEmail: 'a@example.test', teacherName: '甲老師', dayOfWeek: 1, period: 1, className: '901', subject: '國文', attr: '一般' },
    { teacherEmail: 'a@example.test', teacherName: '甲老師', dayOfWeek: 2, period: 2, className: '902', subject: '數學', attr: '一般' }
  ];

  const api = UiTimetable.create({
    computed,
    allSchedules: ref(schedules),
    schoolSwaps: ref([]),
    substitutionRecords: ref([]),
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
    isMutualActivitySlotInRange: () => false
  });

  assert.equal(typeof api.findBaseScheduleSlot, 'function', '必須暴露 findBaseScheduleSlot');
  assert.equal(typeof api.resolveCellFromBaseAndSubs, 'function', '必須暴露 resolveCellFromBaseAndSubs');

  // 基礎課表命中
  const base = api.findBaseScheduleSlot('a@example.test', 1, 1, '2026-09-07');
  assert.ok(base, '週一第1節應命中基礎課表');
  assert.equal(base.className, '901');
  assert.equal(base.subject, '國文');

  // 空值路徑
  assert.equal(api.findBaseScheduleSlot('', 1, 1, '2026-09-07'), null, '無 email 回 null');
  assert.equal(api.findBaseScheduleSlot('nobody@example.test', 1, 1, '2026-09-07'), null, '無此師回 null');
  assert.equal(api.findBaseScheduleSlot('a@example.test', 3, 1, '2026-09-07'), null, '無此節回 null');

  // 無異動時回退基礎課表
  const plain = api.resolveCellFromBaseAndSubs('a@example.test', '2026-09-07', 1, 1, [], []);
  assert.ok(plain, '無異動應回退基礎課表');
  assert.equal(plain.className, '901');

  // 代課鏈：實際授課者回推班科
  const subs = [{
    date: '2026-09-07', period: 1,
    originalTeacherEmail: 'a@example.test', actualTeacherEmail: 'b@example.test',
    className: '901', subject: '國文', type: 'substitution'
  }];
  const cover = api.resolveCellFromBaseAndSubs('b@example.test', '2026-09-07', 1, 1, subs, subs);
  assert.ok(cover, '代課者應解析出班科');
  assert.equal(cover.className, '901');
  assert.equal(cover.fromSub, true);

  // 被代原師：無有效課
  const left = api.resolveCellFromBaseAndSubs('a@example.test', '2026-09-07', 1, 1, subs, subs);
  assert.equal(left, null, '已調出原師應回 null');

  // 綁課判定：基礎課有限制 → true；無限制 → false
  assert.equal(typeof api.isLeaveClassRestricted, 'function', '必須暴露 isLeaveClassRestricted');
  assert.equal(typeof api.isExchangeClassRestricted, 'function', '必須暴露 isExchangeClassRestricted');
  assert.equal(api.cellIsRestricted({ restriction: '限制' }), true, '限制課應判 true');
  assert.equal(api.cellIsRestricted({ restriction: 'restricted' }), true, 'restricted 應判 true');
  assert.equal(api.cellIsRestricted({}), false, '無限制應判 false');

  // 歷史 slot：空值＋直接班科路徑（不碰課表）
  assert.equal(api.formatHistoryLeaveSlot(null), '—', '空列回 —');
  assert.equal(typeof api.formatHistoryLeaveSlot, 'function', '必須暴露 formatHistoryLeaveSlot');
  assert.equal(typeof api.formatHistoryExchangeSlot, 'function', '必須暴露 formatHistoryExchangeSlot');
  assert.equal(api.formatHistoryExchangeSlot(null), '—', '空列回 —');
  assert.equal(
    api.formatHistoryExchangeSlot({ type: 'substitution' }),
    '—',
    '非調課回 —'
  );
  const leaveSlot = api.formatHistoryLeaveSlot({
    requestDate: '2026-09-07', requestPeriod: 1,
    className: '901', subject: '國文'
  });
  assert.match(leaveSlot, /09\/07/, '請假 slot 應含日期');
  assert.match(leaveSlot, /901/, '請假 slot 應含班級');
  const exchangeSlot = api.formatHistoryExchangeSlot({
    type: 'exchange',
    targetDate: '2026-09-08', targetPeriod: 2,
    targetClassName: '902', targetSubject: '數學'
  });
  assert.match(exchangeSlot, /09\/08/, '目標 slot 應含日期');
  assert.match(exchangeSlot, /902/, '目標 slot 應含班級');
  assert.equal(typeof api.isHistoryLeaveRestricted, 'function', '必須暴露 isHistoryLeaveRestricted');
  assert.equal(typeof api.isHistoryExchangeRestricted, 'function', '必須暴露 isHistoryExchangeRestricted');
  assert.equal(api.isLeaveClassRestricted(null), false, '空申請回 false');
  assert.equal(api.isLeaveClassRestricted({}), false, '缺欄回 false');
  assert.equal(
    api.isLeaveClassRestricted({
      requesterEmail: 'a@example.test', requestDate: '2026-09-07',
      requestPeriod: 1, requestPeriodDay: 1, id: 'req-1'
    }),
    false,
    '無限制基礎課應回 false'
  );
  assert.equal(
    api.resolveRestrictionForHistoryRec({
      requestDate: '2026-09-07', requestPeriod: 1,
      originalTeacherEmail: 'a@example.test', id: 'req-1'
    }, 'leave'),
    false,
    '無限制歷史列應回 false'
  );

  console.log('timetable resolve tests PASS');

});
