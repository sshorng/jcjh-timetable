import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiSubmitHelpers } from '../src/modules/ui-request.js';

const ref = (v) => ({ value: v });

function makeDeps(overrides) {
  return Object.assign({
    computed: (fn) => ({ get value() { return fn(); } }),
    pendingRequestData: ref(Object.assign({
      mode: 'substitution',
      leaveTeacher: 'a@x', subTeacher: 'b@x',
      cls: '701', subject: '國文',
      date: '2026-09-07', timeKey: '1-1',
      reason: '事假', subFee: '自費代課',
      note: '2、假查回診',
      leaveTimeType: '全天', leaveTimeStart: '08:00', leaveTimeEnd: '16:00'
    }, overrides)),
    currentSemester: ref('115-1'),
    getTeacherNameByEmail: (e) => ({ 'a@x': '甲老師', 'b@x': '乙老師' }[e] || e),
    defaultSubFeeForReason: () => '自費代課',
    getLeaveTimeDefaults: () => ({ type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' }),
    paperFlow: ref(false),
    isMutualCover: ref(false),
    isAdmin: ref(false),
    directApproveMode: ref(false),
    proxySubmitEmails: ref([]),
    showToast: () => {},
    showConfirm: async () => true
  }, {});
}

test('自費代課不寫入請假備註（隱私迴歸）', () => {
  const self = UiSubmitHelpers.buildSubmitPayload(makeDeps({}), 'req-1', 'SUB-1');
  assert.equal(self.newRequest['經費來源'], '自費代課');
  assert.equal(self.newRequest['備註'], '', '自費代課單不可帶請假人備註');

  const pub = UiSubmitHelpers.buildSubmitPayload(makeDeps({ subFee: '公費代課' }), 'req-2', 'SUB-2');
  assert.equal(pub.newRequest['備註'], '2、假查回診', '公費代課維持原行為');
  console.log('selfpay note tests PASS');
});
