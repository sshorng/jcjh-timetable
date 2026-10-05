#!/usr/bin/env node
'use strict';
/**
 * port-domain.cjs — v1 全域 IIFE domain 檔 → v2 ESM（機械轉換，body 零手改）。
 *
 * 轉換規則（逐檔）：
 * 1. `window.NAME = (function () {`（首行）→ `const NAME = (() => {`
 *    （body 內無 this 引用，已驗證，可安全轉箭頭函式）
 * 2. `window.DEP` → `DEP`，並在檔頭補 `import DEP from './file.js'`
 *    （bare 引用如 billing 內 `typeof DateUtils` 守衛，import 後恆為真，
 *     語義等同「v1 全檔載入時」的行為）
 * 3. 檔尾補 `export default NAME;`
 *
 * 用法：node scripts/port-domain.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'src', 'domain');

const FILES = [
  { file: 'date-utils.js', name: 'DateUtils', deps: [] },
  { file: 'fee-utils.js', name: 'FeeUtils', deps: [] },
  { file: 'domain-triangle.js', name: 'DomainTriangle', deps: [] },
  { file: 'field-map.js', name: 'FieldMap', deps: ['DomainClassAway'] },
  { file: 'domain-school-swap.js', name: 'DomainSchoolSwap', deps: ['DomainSchedule'] },
  { file: 'domain-schedule.js', name: 'DomainSchedule', deps: ['FeeUtils', 'DateUtils'] },
  {
    file: 'domain-match.js', name: 'DomainMatch',
    deps: ['DomainSchedule', 'DomainClassAway', 'DateUtils', 'DomainActivityCover']
  },
  {
    file: 'domain-class-away.js', name: 'DomainClassAway',
    deps: ['DateUtils', 'DomainBilling', 'DomainSchedule']
  },
  {
    file: 'domain-activity-cover.js', name: 'DomainActivityCover',
    deps: ['FeeUtils', 'DomainClassAway', 'DomainSchedule', 'DateUtils']
  },
  {
    file: 'domain-billing.js', name: 'DomainBilling',
    deps: ['FieldMap', 'DomainSchedule', 'FeeUtils', 'DateUtils', 'DomainClassAway', 'DomainSchoolSwap', 'DomainActivityCover']
  }
];

const FILE_OF = {};
for (const f of FILES) FILE_OF[f.name] = f.file;

for (const f of FILES) {
  let s = fs.readFileSync(path.join(ROOT, f.file), 'utf8');
  const mount = 'window.' + f.name + ' = (function () {';
  if (!s.includes(mount)) throw new Error(f.file + ' 找不到掛載行：' + mount);
  s = s.replace(mount, 'const ' + f.name + ' = (() => {');
  // 2. window.DEP → DEP（掛載行已處理，此處只剩讀取）
  s = s.replace(/window\.([A-Za-z_][A-Za-z0-9_]*)/g, '$1');
  const imports = f.deps.map((d) => "import " + d + " from './" + FILE_OF[d] + "';").join('\n');
  const head = '/**\n * 自 v1 ' + f.file + ' 機械移植（port-domain.cjs）：\n * IIFE 掛載改 ESM default export；body 與 v1 逐字一致。\n */\n' + (imports ? imports + '\n\n' : '\n');
  s = head + s + '\nexport default ' + f.name + ';\n';
  fs.writeFileSync(path.join(OUT, f.file), s);
  console.log('ported ' + f.file);
}
