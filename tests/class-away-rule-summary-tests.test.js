import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiClassAwayAdmin } from '../src/modules/ui-activity.js';

function makeAdmin() {
  return UiClassAwayAdmin.create({
    ref: (value) => ({ value }),
    callGasApi: async () => {},
    showToast: () => {},
    showConfirm: async () => true,
    classAwayEvents: { value: [] },
    classList: { value: ['901', '902'] },
    currentSemester: { value: '115-1' },
    loading: { value: false },
    clearScheduleCache: () => {},
    softRefreshInBackground: () => {}
  });
}

test('列表規則數：「規則清單」已含規則 1，條數不可再加一', () => {
  const admin = makeAdmin();
  const single = { scope: 'all', periods: ['all'], billingRule: 'keep' };
  assert.equal(admin.classAwayRuleCount(single), 1);
  assert.equal(admin.classAwayEventRuleSummary(single), '全校 · 全部節次 · 整班');

  const three = {
    scope: 'all',
    periods: ['8'],
    billingRule: 'keep',
    rules: [
      { scope: 'classes', classes: ['901'], periods: ['all'] },
      { scope: 'all', periods: ['all'], subjects: ['本土語(手)'] },
      { scope: 'all', periods: ['8'] }
    ]
  };
  assert.equal(admin.classAwayRuleCount(three), 3);
  assert.equal(admin.classAwayEventRuleSummary(three), '3 條規則');

  assert.equal(admin.classAwayRuleCount({ scope: 'all', rules: [] }), 1, '空陣列視為單一規則');
});

test('列表摘要：連續起迄、科目與扣鐘點只在單一規則時攤開', () => {
  const admin = makeAdmin();
  const range = {
    scope: 'classes', classes: ['901'], startPeriod: '0', endPeriod: '4',
    billingRule: 'reduce', subject: '本土語-台語'
  };
  assert.equal(admin.classAwayEventRuleSummary(range), '指定班級 · 早自習～第4節 · 本土語-台語 · 扣超鐘點');

  const daily = { scope: 'all', periods: ['8'], billingRule: 'keep' };
  assert.equal(admin.classAwayEventRuleSummary(daily), '全校 · 第8節 · 整班');
});
