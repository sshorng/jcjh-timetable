#!/usr/bin/env node
'use strict';
/**
 * port-domain-tests.cjs — v1 tests/domain-tests.html 內嵌測試體 → v2 vitest。
 *
 * 做法：沿用 v1 run-domain-tests.js 的同一正則抽取 IIFE body，
 * 去掉 DOM 輸出尾，包進 test()；body 內 `window.DomainX` 由區域
 * `const window` 解析（零改寫），計數邏輯原封不動。
 * 另加 expect(passed).toBe(173) 保底：移植若掉測試會立刻現形。
 *
 * 用法：node scripts/port-domain-tests.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'tests', 'domain-tests.html'), 'utf8');
const m = html.match(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>\s*<\/body>/);
if (!m) throw new Error('domain-tests.html 內找不到測試體');

let body = m[0]
  .replace(/^<script>\s*/, '')
  .replace(/<\/script>\s*<\/body>$/, '')
  .replace(/^\(function \(\) \{\r?\n/, '')
  .replace(/\}\)\(\);\s*$/, '');
// 去 DOM 尾（v1 run-domain-tests.js 同理）
const domTail = body.indexOf("document.getElementById('summary')");
if (domTail < 0) throw new Error('找不到 DOM 輸出尾');
body = body.slice(0, domTail);

const out = `import { test, expect } from 'vitest';
import DateUtils from '../src/domain/date-utils.js';
import FeeUtils from '../src/domain/fee-utils.js';
import DomainTriangle from '../src/domain/domain-triangle.js';
import FieldMap from '../src/domain/field-map.js';
import DomainSchoolSwap from '../src/domain/domain-school-swap.js';
import DomainSchedule from '../src/domain/domain-schedule.js';
import DomainMatch from '../src/domain/domain-match.js';
import DomainClassAway from '../src/domain/domain-class-away.js';
import DomainActivityCover from '../src/domain/domain-activity-cover.js';
import DomainBilling from '../src/domain/domain-billing.js';

/**
 * v1 tests/domain-tests.html 移植（port-domain-tests.cjs 生成）：
 * body 與 v1 逐字一致；window 由區域 shim 解析；計數邏輯不變。
 */
test('domain 領域測試（173 項）', () => {
  const window = {
    DateUtils, FeeUtils, DomainTriangle, FieldMap, DomainSchoolSwap,
    DomainSchedule, DomainMatch, DomainClassAway, DomainActivityCover, DomainBilling
  };
${body}  for (const l of log) { if (l.indexOf('✗') === 0) console.log(l); }
  console.log('全部通過 ' + passed + ' 項（失敗 ' + failed + '）');
  expect(failed).toBe(0);
  expect(passed).toBe(173);
});
`;
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'domain.test.js'), out);
console.log('wrote tests/domain.test.js');
