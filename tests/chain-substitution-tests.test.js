import assert from 'node:assert/strict';
import { test } from 'vitest';
import DomainSchedule from '../src/domain/domain-schedule.js';

function helpers() {
  return {
    getTeacherNameByEmail(v) {
      const m = { 'zhang@test': '張', 'li@test': '李', 'huang@test': '黃美蘭', 't@test': 'T', 'su@test': '蘇育男', 'w@test': 'W' };
      return m[String(v || '').toLowerCase()] || v;
    },
    getTeacherSubjectByEmail() { return ''; },
    formatDateMMDD(v) { return v; },
    isSingleWeek() { return true; },
    isClassAway() { return false; },
    getWeekDayText(d) { return [' ', '一', '二', '三', '四', '五', '六', '日'][d] || ''; }
  };
}

test('chain substitution：代回同班不同經費應顯示代回而非調出', () => {
  const schedules = [
    { teacherEmail: 'zhang@test', teacherName: '張', dayOfWeek: 1, period: 2, className: '901', subject: '國文' }
  ];
  const R1 = { id: 'r1', requestId: 'r1', date: '2026-10-12', period: 2, originalTeacherEmail: 'zhang@test', actualTeacherEmail: 'li@test', className: '901', subject: '國文', type: 'substitution', subFee: '扣額度', reason: '事假' };
  const R2 = { id: 'r2', requestId: 'r2', date: '2026-10-12', period: 2, originalTeacherEmail: 'li@test', actualTeacherEmail: 'zhang@test', className: '901', subject: '國文', type: 'substitution', subFee: '公費代課', reason: '公假' };
  const periodSubs = [R1, R2];
  const index = DomainSchedule.buildScheduleIndex(schedules);
  const ctx = (email) => ({ teacherEmail: email, dateStr: '2026-10-12', period: 2, dayOfWeek: 1, allSchedules: schedules, scheduleIndex: index, periodSubs, allSubs: periodSubs, helpers: helpers() });
  const zhang = DomainSchedule.resolveApprovedSchedule(ctx('zhang@test'));
  assert.equal(zhang.isReturnDuty, true, '張應為代回本人原課');
  assert.equal(zhang.isSubstituted, false, '代回不應再顯示調出');
  assert.equal(zhang.className, '901');
  assert.match(zhang.subText, /代回/, '代回文字應含代回');
  assert.match(zhang.subText, /公費代課/, '代回應保留不同經費');
  assert.equal(zhang.subRecord.id, 'r2', '代回应指向第二筆不同經費');
  const li = DomainSchedule.resolveApprovedSchedule(ctx('li@test'));
  assert.equal(li.isSubstituted, true, '李請公假應顯示調出');
  assert.equal(li.subRecord.id, 'r2');
});

test('chain substitution：調入再調出應顯示多重調出且無調入', () => {
  const schedules = [
    { teacherEmail: 't@test', teacherName: 'T', dayOfWeek: 1, period: 2, className: '904', subject: '閱思' },
    { teacherEmail: 'huang@test', teacherName: '黃美蘭', dayOfWeek: 1, period: 6, className: '906', subject: '國文' }
  ];
  const RA = { id: 'ra', requestId: 'ra', date: '2026-10-13', period: 2, originalTeacherEmail: 't@test', actualTeacherEmail: 'su@test', className: '904', subject: '閱思', type: 'exchange' };
  const RB = { id: 'rb', requestId: 'rb', date: '2026-10-13', period: 2, originalTeacherEmail: 'huang@test', actualTeacherEmail: 't@test', className: '906', subject: '國文', type: 'exchange' };
  const index = DomainSchedule.buildScheduleIndex(schedules);
  const beforeSubs = [RA, RB];
  const before = DomainSchedule.resolveApprovedSchedule({ teacherEmail: 't@test', dateStr: '2026-10-13', period: 2, dayOfWeek: 1, allSchedules: schedules, scheduleIndex: index, periodSubs: beforeSubs, allSubs: beforeSubs, helpers: helpers() });
  assert.equal(before.hasConcurrentDuty, true, '轉代前應為調入906＋調出904');
  assert.equal(before.className, '906');
  assert.equal(before.outgoingDuty.className, '904');

  const RC = { id: 'rc', requestId: 'rc', date: '2026-10-13', period: 2, originalTeacherEmail: 't@test', actualTeacherEmail: 'w@test', className: '906', subject: '國文', type: 'exchange' };
  const afterSubs = [RA, RB, RC];
  const after = DomainSchedule.resolveApprovedSchedule({ teacherEmail: 't@test', dateStr: '2026-10-13', period: 2, dayOfWeek: 1, allSchedules: schedules, scheduleIndex: index, periodSubs: afterSubs, allSubs: afterSubs, helpers: helpers() });
  assert.equal(after.isSubstitutionDuty, false, '906轉出後本人應無調入');
  assert.equal(after.hasMultipleOutgoing, true, '應標示多重調出');
  assert.equal(after.outgoingDuties.length, 2, '應保留904與906兩筆調出');
  assert.deepEqual(after.outgoingDuties.map((d) => d.className).sort(), ['904', '906']);
  // 每筆課名必須與自身紀錄一致，不可錯位
  after.outgoingDuties.forEach((d) => {
    assert.equal(d.className, d.subRecord.className, '調出課名必須與紀錄一致');
  });
});
