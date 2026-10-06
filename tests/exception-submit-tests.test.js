import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ref } from 'vue';
import { UiAdmin } from '../src/modules/ui-admin.js';

const NAMES = {
  'a@school.example': 'A師',
  'b@school.example': 'B師'
};

function adminDeps(overrides) {
  const calls = [];
  const api = UiAdmin.create({
    ref,
    isAdmin: { value: true },
    currentSemester: { value: '115-1' },
    getTeacherNameByEmail: (e) => NAMES[String(e || '').toLowerCase()] || e,
    callGasApi: async (action, payload) => {
      calls.push({ action, payload });
      return { success: true };
    },
    showToast: () => {},
    loadWeeklyData: async () => {},
    allSchedules: {
      value: [
        { teacherEmail: 'a@school.example', dayOfWeek: 2, period: 8, className: '701', subject: '國文' },
        { teacherEmail: 'a@school.example', dayOfWeek: 4, period: 8, className: '702', subject: '國文' },
        { teacherEmail: 'b@school.example', dayOfWeek: 2, period: 8, className: '703', subject: '數學' }
      ]
    },
    ...overrides
  });
  return { api, calls };
}

function legsAB() {
  return [{
    kind: 'exchange',
    aSlot: {
      teacherEmail: 'a@school.example', className: '702', subject: '國文',
      dateStr: '2026-09-03', dayOfWeek: 4, period: 8
    },
    bSlot: {
      teacherEmail: 'b@school.example', className: '703', subject: '數學',
      dateStr: '2026-09-01', dayOfWeek: 2, period: 8
    }
  }, {
    kind: 'substitution',
    leave: { teacherEmail: 'a@school.example', dateStr: '2026-09-01', period: 8, dayOfWeek: 2 },
    sub: { teacherEmail: 'b@school.example', dateStr: '2026-09-01', period: 8, dayOfWeek: 2, fee: '第8節代課' }
  }];
}

test('exception submit：調課＋代課兩腿，標記與靜默齊全', async () => {
  const { api, calls } = adminDeps({});
  const res = await api.submitAdminException({ legs: legsAB(), reason: 'A、B 已線下談妥' });
  assert.equal(res.ok, true);
  assert.equal(res.results.length, 2);
  assert.ok(res.results.every((r) => r.ok));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.action === 'submitRequest'));
  const [ex, sub] = calls.map((c) => c.payload);
  assert.equal(ex.request['異動類型'], 'exchange');
  assert.equal(ex.directApprove, true);
  assert.equal(ex.isAdminException, true);
  assert.equal(ex.exceptionReason, 'A、B 已線下談妥');
  assert.equal(ex.skipNotify, true);
  assert.equal(ex.request.directApprove, true);
  assert.equal(ex.request['狀態'], 'approved');
  assert.equal(ex.request['直接核准'], '是');
  assert.equal(sub.request['異動類型'], 'substitution');
  assert.equal(sub.request['經費來源'], '第8節代課');
  assert.equal(sub.request['受邀人Email'], 'b@school.example');
  assert.equal(sub.request['班級'], '701');
  assert.equal(sub.isAdminException, true);
  assert.equal(sub.skipNotify, true);
  console.log('exception submit tests PASS');
});

test('exception submit：單腿同節互換亦可建', async () => {
  const { api, calls } = adminDeps({});
  const res = await api.submitAdminException({
    legs: [{
      kind: 'exchange',
      aSlot: {
        teacherEmail: 'a@school.example', className: '701', subject: '國文',
        dateStr: '2026-09-01', dayOfWeek: 2, period: 8
      },
      bSlot: {
        teacherEmail: 'b@school.example', className: '703', subject: '數學',
        dateStr: '2026-09-01', dayOfWeek: 2, period: 8
      }
    }],
    reason: '同節互換'
  });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.request['對調目標日期'], '2026-09-01');
});

test('exception submit：無事由／超腿／非管理員／同教師拒收', async () => {
  const { api, calls } = adminDeps({});
  await assert.rejects(api.submitAdminException({ legs: legsAB(), reason: '  ' }), /事由/);
  await assert.rejects(
    api.submitAdminException({ legs: [legsAB()[0], legsAB()[0], legsAB()[0], legsAB()[0], legsAB()[0], legsAB()[0]], reason: 'x' }),
    /最多/
  );
  const nonAdmin = adminDeps({ isAdmin: { value: false } });
  await assert.rejects(nonAdmin.api.submitAdminException({ legs: legsAB(), reason: 'x' }), /管理員/);
  const sameTeacher = adminDeps({});
  const sameLegs = legsAB();
  sameLegs[0].bSlot = { ...sameLegs[0].aSlot };
  const sameRes = await sameTeacher.api.submitAdminException({ legs: sameLegs, reason: 'x' });
  assert.equal(sameRes.ok, false);
  assert.ok(sameRes.results[0].error.includes('不同教師'));
  assert.equal(calls.length, 0);
  assert.equal(nonAdmin.calls.length, 0);
  assert.equal(sameTeacher.calls.length, 1);
});
