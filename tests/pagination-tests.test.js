import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiListHelpers } from '../src/modules/ui-list-helpers.js';

const { paginateList, clampPage } = UiListHelpers;

test('pagination（教師表分頁純函式）', () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({ id: i }));
  let p = paginateList(rows, 1, 50);
  assert.equal(p.rows.length, 50);
  assert.equal(p.rows[0].id, 0);
  assert.equal(p.page, 1);
  assert.equal(p.totalPages, 5);
  assert.equal(p.total, 201);

  p = paginateList(rows, 5, 50);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].id, 200);

  // 越界收斂
  assert.equal(paginateList(rows, 99, 50).page, 5);
  assert.equal(paginateList(rows, -3, 50).page, 1);
  assert.equal(paginateList(rows, 0, 50).page, 1);
  // 空表
  p = paginateList([], 3, 50);
  assert.deepEqual(p.rows, []);
  assert.equal(p.page, 1);
  assert.equal(p.totalPages, 1);
  // 非陣列
  assert.deepEqual(paginateList(null, 1, 50).rows, []);
  // clamp
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(9, 5), 5);
  assert.equal(clampPage(3, 5), 3);
  assert.equal(clampPage('x', 5), 1);
  console.log('pagination tests PASS');
});
