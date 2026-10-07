import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  buildExceptionWarnings,
  buildExceptionLegWarnings,
  buildExceptionCrossWarnings,
  periodBucket
} from '../src/modules/exception-warnings.js';

const A = {
  teacherEmail: 'a@school.example', teacherName: 'A師',
  className: '701', subject: '國文',
  dateStr: '2026-09-01', dayOfWeek: 2, period: 8
};
const B = {
  teacherEmail: 'b@school.example', teacherName: 'B師',
  className: '701', subject: '國文',
  dateStr: '2026-09-03', dayOfWeek: 4, period: 8
};
const EX = { kind: 'exchange', aSlot: A, bSlot: B };

test('exception warnings：節次桶分類', () => {
  assert.equal(periodBucket(0), '早自習');
  assert.equal(periodBucket(45), '午休');
  assert.equal(periodBucket(8), '第8節');
  assert.equal(periodBucket(3), '一般');
});

test('exception warnings：未選齊回提示（非警告）', () => {
  assert.deepEqual(
    buildExceptionLegWarnings({ kind: 'exchange', aSlot: {}, bSlot: {} }, {}),
    ['請先選定雙方教師與課堂']
  );
});

test('exception warnings：同班同科同節無警告', () => {
  assert.deepEqual(buildExceptionWarnings({ legs: [EX], checks: {} }), []);
});

test('exception warnings：跨班／不同科／節次類型不同各一條', () => {
  const b2 = { ...B, className: '702', subject: '數學', period: 3 };
  const warnings = buildExceptionWarnings({ legs: [{ kind: 'exchange', aSlot: A, bSlot: b2 }], checks: {} });
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.includes('跨班')));
  assert.ok(warnings.some((w) => w.includes('科目不同')));
  assert.ok(warnings.some((w) => w.includes('節次類型不同')));
});

test('exception warnings：對方進行中申請與換入疊堂', () => {
  const getScheduleForDate = (email, _dateStr, _period) => {
    if (email === 'b@school.example') {
      return { className: '701', subject: '國文', isPending: true, pendingText: '⇄ 調至 09/03 第8節' };
    }
    if (email === 'a@school.example') {
      return { className: '701', subject: '英文' };
    }
    return null;
  };
  const warnings = buildExceptionWarnings({ legs: [EX], checks: { getScheduleForDate } });
  assert.ok(warnings.some((w) => w.includes('進行中申請')), JSON.stringify(warnings));
  assert.ok(warnings.some((w) => w.includes('同節兩堂')), JSON.stringify(warnings));
});

test('exception warnings：代課段缺資料與代課人衝堂', () => {
  const getScheduleForDate = () => ({ className: '702', subject: '數學' });
  const warnings = buildExceptionLegWarnings(
    { kind: 'substitution', sub: { teacherEmail: '', dateStr: '', period: '' } }, {}
  );
  assert.ok(warnings.some((w) => w.includes('代課段資料不完整')));
  const warnings2 = buildExceptionWarnings({
    legs: [{ kind: 'substitution', sub: { teacherEmail: 'c@school.example', dateStr: '2026-09-01', period: 8 } }],
    checks: { getScheduleForDate }
  });
  assert.ok(warnings2.some((w) => w.includes('代課人該節已有課程')));
});

test('exception warnings：抽離不對等與同課免換', () => {
  const aPull = { ...A, attr: '抽離' };
  const w1 = buildExceptionLegWarnings({ kind: 'exchange', aSlot: aPull, bSlot: B }, {});
  assert.ok(w1.some((w) => w.includes('抽離不對等')), JSON.stringify(w1));
  const same = {
    ...B,
    className: '701', subject: '國文', dateStr: '2026-09-01', dayOfWeek: 2, period: 8
  };
  const w2 = buildExceptionLegWarnings({ kind: 'exchange', aSlot: A, bSlot: same }, {});
  assert.ok(w2.some((w) => w.includes('無需互換')), JSON.stringify(w2));
});

test('exception warnings：跨組疊堂與同組多組提醒', () => {
  const leg1 = {
    kind: 'exchange',
    aSlot: { teacherEmail: 'a@school.example', dateStr: '2026-09-01', period: 8 },
    bSlot: { teacherEmail: 'b@school.example', dateStr: '2026-09-03', period: 8 }
  };
  const leg2 = {
    kind: 'substitution',
    sub: { teacherEmail: 'a@school.example', dateStr: '2026-09-01', period: 8 }
  };
  const warnings = buildExceptionCrossWarnings([leg1, leg2]);
  assert.ok(warnings.some((w) => w.includes('同教師同格')), JSON.stringify(warnings));
  const leg3 = {
    kind: 'exchange',
    aSlot: { teacherEmail: 'a@school.example', dateStr: '2026-09-05', period: 1 },
    bSlot: { teacherEmail: 'b@school.example', dateStr: '2026-09-06', period: 2 }
  };
  const warnings2 = buildExceptionCrossWarnings([leg1, leg3]);
  assert.ok(warnings2.some((w) => w.includes('同組教師')), JSON.stringify(warnings2));
  assert.deepEqual(buildExceptionCrossWarnings([leg1]), []);
  console.log('exception warnings tests PASS');
});
