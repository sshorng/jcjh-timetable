import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const here = path.dirname(fileURLToPath(import.meta.url));

// Phase 3.3：同列跨欄一次讀 helper（fake sheet 驗證取值等價＋呼叫次數）。
// 注意：vm 沙箱產生的 Array 與本 realm 原型不同，跨域比較一律用 JSON 字串。
function eqJ(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}

function sliceFn(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' must remain discoverable');
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function fakeSheet(grid) {
  const calls = [];
  return {
    calls,
    getRange(r, c, nr, nc) {
      calls.push([r, c, nr, nc]);
      const vals = [];
      for (let i = 0; i < nr; i++) {
        const row = [];
        for (let j = 0; j < nc; j++) row.push(grid[r - 1 + i][c - 1 + j]);
        vals.push(row);
      }
      return { getValues: () => vals };
    }
  };
}

// 5 欄 × 4 列（含表頭列）：A B C D E / r1..r3
const GRID = [
  ['hA', 'hB', 'hC', 'hD', 'hE'],
  ['a1', 'b1', 'c1', 'd1', 'e1'],
  ['a2', 'b2', 'c2', 'd2', 'e2'],
  ['a3', 'b3', 'c3', 'd3', 'e3']
];

test('gas batch reads（Phase 3.3：跨欄一次讀等價＋省呼叫）', () => {
  const source = fs.readFileSync(path.join(here, '..', 'code.gs'), 'utf8');
  new vm.Script(source, { filename: 'code.gs' });

  const ctx1 = { Math };
  vm.createContext(ctx1);
  vm.runInContext(sliceFn(source, 'readKeySemesterCols_'), ctx1, { filename: 'code.gs.batch-key' });
  // 近距（key=1, sem=3）：一次寬讀，取值等價
  let sh = fakeSheet(GRID);
  let out = ctx1.readKeySemesterCols_(sh, 1, 3, 3);
  assert.equal(sh.calls.length, 1, '近距應一次讀完');
  eqJ(out.keyVals, [['a1'], ['a2'], ['a3']]);
  eqJ(out.semesterVals, [['c1'], ['c2'], ['c3']]);
  eqJ(sh.calls[0], [2, 1, 3, 3], '寬讀範圍應為 min..max 欄');
  // 反序（key=4, sem=2）同樣一次
  sh = fakeSheet(GRID);
  out = ctx1.readKeySemesterCols_(sh, 4, 2, 3);
  assert.equal(sh.calls.length, 1);
  eqJ(out.keyVals, [['d1'], ['d2'], ['d3']]);
  eqJ(out.semesterVals, [['b1'], ['b2'], ['b3']]);
  // 無學期欄：一次窄讀＋sem null（舊語義）
  sh = fakeSheet(GRID);
  out = ctx1.readKeySemesterCols_(sh, 5, 0, 3);
  assert.equal(sh.calls.length, 1);
  eqJ(out.keyVals, [['e1'], ['e2'], ['e3']]);
  assert.equal(out.semesterVals, null);

  const ctx2 = { Math };
  vm.createContext(ctx2);
  vm.runInContext(sliceFn(source, 'readTeacherQuotaCols_'), ctx2, { filename: 'code.gs.batch-quota' });
  // 三欄近距（email=1, sem=2, quota=4）：一次寬讀
  sh = fakeSheet(GRID);
  const q = ctx2.readTeacherQuotaCols_(sh, 1, 2, 4, 3);
  assert.equal(sh.calls.length, 1, '三欄近距應一次讀完');
  eqJ(q.emailVals, [['a1'], ['a2'], ['a3']]);
  eqJ(q.semVals, [['b1'], ['b2'], ['b3']]);
  eqJ(q.quotaVals, [['d1'], ['d2'], ['d3']]);
  // 無學期欄：sem null，仍一次
  sh = fakeSheet(GRID);
  const q2 = ctx2.readTeacherQuotaCols_(sh, 1, 0, 4, 3);
  assert.equal(sh.calls.length, 1);
  assert.equal(q2.semVals, null);
  eqJ(q2.quotaVals, [['d1'], ['d2'], ['d3']]);

  // 呼叫端已改走 helper（舊 inline 三讀／二讀消失）
  assert.match(source, /const keySem = readKeySemesterCols_\(sheet, keyCol, semesterCol, numDataRows\);/, 'saveRows 小批量應走一次讀');
  assert.match(source, /var quotaCols = readTeacherQuotaCols_\(sheet, emailCol, semCol, quotaCol, num\);/, '額度欄修補應走一次讀');

  console.log('gas batch read tests PASS');
});
