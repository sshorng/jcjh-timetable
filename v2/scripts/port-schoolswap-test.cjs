#!/usr/bin/env node
'use strict';
/* school-swap 手動移植：loader 改 import；slice-eval 改走 UiSchoolSwap.create 回傳；
 * 其餘 body 逐字保留（context.window. → 直接引用）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const lines = fs.readFileSync(path.join(ROOT, 'tests', 'school-swap-contract-tests.js'), 'utf8').split('\n');
// body：自 `function ref` 起至檔尾（去掉 shebang/loader/console.log PASS）
const start = lines.findIndex((l) => l.startsWith('function ref('));
let body = lines.slice(start).join('\n');
body = body.replace(/context\.window\./g, '');
body = body.replace(/console\.log\('school swap contract tests PASS'\);\s*$/, '');
const out = `import assert from 'node:assert/strict';
import { test } from 'vitest';
import DomainSchoolSwap from '../src/domain/domain-school-swap.js';
import DomainSchedule from '../src/domain/domain-schedule.js';
import { UiTimetable } from '../src/modules/ui-timetable.js';
import { UiSchoolSwap } from '../src/modules/ui-schoolswap.js';

test('school swap contract（v1 移植）', () => {
  // v1 以 slice-eval 取 helper；v2 直接取 create 回傳（同 body、需同等最小樁）
  const DateUtilsStub = {
    getTimetablePeriods() { return [1, 2, 3]; },
    formatPeriodText(period) { return '第' + period + '節'; },
    parseCombinedClasses(raw) {
      return String(raw || '').split(/[、,，/／|｜\\s]+/).filter(Boolean);
    }
  };
  const buildClassSchoolSwapChanges = UiSchoolSwap.create({
    DomainSchoolSwap, DateUtils: DateUtilsStub
  }).buildClassSchoolSwapChanges;
${body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n')}
  console.log('school swap contract tests PASS');
});
`;
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'school-swap-contract.test.js'), out);
console.log('wrote school-swap-contract.test.js');
