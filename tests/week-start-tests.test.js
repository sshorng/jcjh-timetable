import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiHistory } from '../src/modules/ui-history.js';

test('week start：取當週週一本地日期（含週日歸前一週一）', () => {
  const api = UiHistory.create({ computed: () => ({}) });
  assert.equal(typeof api.getWeekStart, 'function');
  assert.equal(api.getWeekStart('2026-09-07'), '2026-09-07'); // 週一
  assert.equal(api.getWeekStart('2026-09-09'), '2026-09-07'); // 週三
  assert.equal(api.getWeekStart('2026-09-13'), '2026-09-07'); // 週日
  console.log('week start tests PASS');
});
