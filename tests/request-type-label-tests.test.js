import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiListHelpers } from '../src/modules/ui-list-helpers.js';

test('空堂排班要標「空堂任務」，不是「代課」', () => {
  const byReason = { type: 'substitution', reason: '空堂排班', note: '12/02(三) 第6節 巡九' };
  assert.equal(UiListHelpers.requestTypeLabel(byReason), '空堂任務');
  assert.equal(UiListHelpers.requestTypeBadgeClass(byReason), 'tag-purple');

  const byNote = { type: 'substitution', reason: '事假', note: '[空堂排班] 支援 802' };
  assert.equal(UiListHelpers.requestTypeLabel(byNote), '空堂任務', '備註有 [空堂排班] 也算');

  const byFlag = { type: 'substitution', isEmptySlotAssign: true };
  assert.equal(UiListHelpers.requestTypeLabel(byFlag), '空堂任務');
});

test('代課、調課、三角調標籤不受影響', () => {
  const sub = { type: 'substitution', reason: '事假' };
  assert.equal(UiListHelpers.requestTypeLabel(sub), '代課');
  assert.equal(UiListHelpers.requestTypeBadgeClass(sub), 'tag-red');

  assert.equal(UiListHelpers.requestTypeLabel({ type: 'exchange' }), '調課');
  assert.equal(UiListHelpers.requestTypeBadgeClass({ type: 'exchange' }), 'tag-blue');

  assert.equal(UiListHelpers.requestTypeLabel({ type: 'triangle' }), '三角調');
  assert.equal(UiListHelpers.requestTypeLabel({ type: '調課' }), '調課');
  assert.equal(UiListHelpers.requestTypeLabel(null), '');
});
