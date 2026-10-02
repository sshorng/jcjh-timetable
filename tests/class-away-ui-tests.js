#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../domain-class-away.js');
require('../field-map.js');
require('../ui-activity.js');

const savedRows = [];
const toasts = [];
const eventRef = { value: [] };
const admin = window.UiClassAwayAdmin.create({
  ref: value => ({ value }),
  callGasApi: async (action, row) => {
    assert.equal(action, 'saveClassAwayEvent');
    savedRows.push(row);
  },
  showToast: (message, type) => toasts.push({ message, type }),
  showConfirm: async () => true,
  classAwayEvents: eventRef,
  classList: { value: ['901', '902'] },
  currentSemester: { value: '115-1' },
  loading: { value: false },
  clearScheduleCache: () => {},
  softRefreshInBackground: () => {}
});

async function run() {
  admin.openAddClassAwayModal();
  admin.toggleClassAwayPeriod('all');
  admin.selectClassAwayPeriodRange();
  assert.deepEqual(admin.classAwayForm.value.periods, ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  admin.toggleClassAwayPeriod('2');
  assert.equal(admin.classAwayForm.value.periods.includes('2'), false);
  admin.toggleClassAwayPeriod('2');
  admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
    name: '多節次事件', startDate: '2026-10-05', scope: 'all', forMutual: true
  });
  await admin.saveClassAwayEvent();

  assert.equal(savedRows[0]['停課節次'], '早自習、第1節、第2節、第3節、第4節、第5節、第6節、第7節、第8節');
  assert.equal(savedRows[0]['可進互代'], 'FALSE', '指定節次事件不可開放全天互代');
  assert.equal(eventRef.value[0].period, '0,1,2,3,4,5,6,7,8');
  assert.deepEqual(eventRef.value[0].periods, ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.match(toasts[0].message, /早自習.*第8節/);

  admin.openAddClassAwayModal();
  admin.classAwayForm.value = Object.assign({}, admin.classAwayForm.value, {
    name: '全天事件', startDate: '2026-10-06', scope: 'all'
  });
  await admin.saveClassAwayEvent();
  assert.equal(savedRows[1]['停課節次'], '全部節次', '原本的全部節次設定仍可使用');
  assert.equal(savedRows[1]['可進互代'], 'TRUE');

  admin.openEditClassAwayModal(eventRef.value[0]);
  assert.deepEqual(admin.classAwayForm.value.periods, ['0', '1', '2', '3', '4', '5', '6', '7', '8']);
  console.log('class-away UI tests PASS');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
