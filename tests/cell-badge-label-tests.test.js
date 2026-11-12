import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '../src/App.vue'), 'utf8');
const tt = fs.readFileSync(path.join(here, '../src/modules/ui-timetable.js'), 'utf8');

// 夫子 2026-11-12：「互代」改成「額度」——課表格內只看得出這件事吃的是額度，
// 「互代」是流程名詞，老師在課表上讀不出意思。
test('課表格內徽章：扣額度的互代一律標「額度」', () => {
  assert.match(app, /slot\.cell\.isMutualCover \? '額度' : '代課'/, '調入／代課那一格應標「額度」');
  assert.match(app, /slot\.cell\.isMutualCover \? '額度\/外出' : '被代'/, '本人外出被代那一格應標「額度／外出」');
  assert.equal(app.includes("'互代/外出'"), false, '不可留舊字樣「互代/外出」');
  assert.equal(/isMutualCover \? '互代'/.test(app), false, '不可留舊字樣「互代」徽章');
});

test('互代暫定列的經費簡寫：扣額度顯示「額度」', () => {
  assert.match(
    tt,
    /draft\.fee === '扣額度' \|\| draft\.fee === '互代不結'\) feeShort = '額度'/,
    '暫定列經費簡寫應為「額度」'
  );
});
