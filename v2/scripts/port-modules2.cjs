#!/usr/bin/env node
'use strict';
/**
 * port-modules2.cjs — 遺漏檔 ESM 化（標準 IIFE／頂層函式／UMD 三型）。
 *
 * A. 標準 IIFE（掛載＋跨引用與 port-modules 同規則）：
 *    onboarding-tour.js, template-buffer.js,
 *    export-activity-cover.js, export-invigilation-recovered.js,
 *    export-school-timetable.js → v2/src/modules/
 * B. 頂層函式＋window 匯出塊：
 *    print-helper.js → 刪 window.X=X 行，補 export（12 公開 API）
 *    app-shell-utils.js → v2/src/ui/toast.js，補 export 3 函式＋avatar 常數
 * C. UMD (function(root))(window)：
 *    export-accounting.js, export-period8-accounting.js →
 *    檔頭 import＋__root 墊片，尾 `})(window);` 改 `})(__root);`，
 *    再由 __root 取回命名空間 default export。
 *
 * 用法：node scripts/port-modules2.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MOD = path.resolve(__dirname, '..', 'src', 'modules');

const DOMAIN_FILE = {
  DateUtils: 'date-utils.js',
  FeeUtils: 'fee-utils.js',
  FieldMap: 'field-map.js',
  DomainTriangle: 'domain-triangle.js',
  DomainMatch: 'domain-match.js',
  DomainSchoolSwap: 'domain-school-swap.js',
  DomainSchedule: 'domain-schedule.js',
  DomainClassAway: 'domain-class-away.js',
  DomainActivityCover: 'domain-activity-cover.js',
  DomainBilling: 'domain-billing.js'
};

function uiFileOf(ns) {
  const files = fs.readdirSync(ROOT).filter((f) => /^ui-.*\.js$/.test(f));
  for (const f of files) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (new RegExp('window\\.' + ns + '\\s*=\\s*\\(function').test(s)) return f;
  }
  return null;
}

function importFor(names, selfFile) {
  const lines = [];
  for (const name of [...names].sort()) {
    if (DOMAIN_FILE[name]) {
      lines.push('import ' + name + " from '../domain/" + DOMAIN_FILE[name] + "';");
    } else {
      const f = uiFileOf(name) || selfFile;
      if (f !== selfFile) lines.push('import { ' + name + " } from './" + f + "';");
    }
  }
  return lines;
}

function headOf(kind, file) {
  return '/**\n * 自 v1 ' + file + ' 機械移植（port-modules2.cjs，' + kind + '）：\n * body 與 v1 逐字一致。\n */\n';
}

// ---- A. 標準 IIFE ----
const A_FILES = [
  'onboarding-tour.js', 'template-buffer.js',
  'export-activity-cover.js', 'export-invigilation-recovered.js',
  'export-school-timetable.js'
];
const NS_RE = /window\.([A-Za-z_][A-Za-z0-9_]*)/g;
for (const f of A_FILES) {
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const mounts = [...s.matchAll(/window\.(Ui[A-Za-z]+|OnboardingTour|TemplateBuffer|Export[A-Za-z]+)\s*=\s*\(function/g)].map((m) => m[1]);
  if (!mounts.length) throw new Error(f + ' 無掛載行');
  for (const ns of mounts) {
    s = s.replace(new RegExp('window\\.' + ns + '\\s*=\\s*\\(function \\(\\) \\{'), 'const ' + ns + ' = (() => {');
  }
  const used = new Set();
  for (const m of s.matchAll(NS_RE)) {
    const name = m[1];
    if (/^(Ui|Domain)[A-Z]/.test(name) || DOMAIN_FILE[name] || /^Export[A-Za-z]+$/.test(name) || name === 'TemplateBuffer') {
      if (!mounts.includes(name)) used.add(name);
    }
  }
  // 同檔自有命名空間不 import（TemplateBuffer 在 template-buffer.js 內自持）
  s = s.replace(/window\.([A-Za-z_][A-Za-z0-9_]*)/g, (m0, name) => {
    if (mounts.includes(name)) return name;
    if (/^(Ui|Domain)[A-Z]/.test(name) || DOMAIN_FILE[name] || /^Export[A-Za-z]+$/.test(name) || name === 'TemplateBuffer') return name;
    return m0;
  });
  // R-SELF（同 port-modules.cjs）：`const X = window.X` 會變自我遮蔽，整行刪除
  s = s.replace(/^[ \t]*(?:var|let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\1\s*;[ \t]*\r?$/gm, '');
  const imports = importFor([...used].filter((n) => {
    if (mounts.includes(n)) return false;
    if (DOMAIN_FILE[n]) return true;
    const f2 = uiFileOf(n);
    return f2 && f2 !== f;
  }), f);
  // TemplateBuffer 等自持命名空間若跨檔才 import；同檔跳過（importFor 已處理）
  s = headOf('標準 IIFE', f) + (imports.length ? imports.join('\n') + '\n\n' : '\n') + s
    + '\nexport { ' + mounts.join(', ') + ' };\n';
  fs.writeFileSync(path.join(MOD, f), s);
  console.log('ported(A) ' + f + ' [' + mounts.join(', ') + ']');
}

// ---- B. print-helper：頂層函式＋window 匯出塊 ----
{
  const f = 'print-helper.js';
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const exported = [];
  s = s.replace(/^window\.([A-Za-z_][A-Za-z0-9_]*) = \1;\r?\n/gm, (m0, name) => {
    exported.push(name);
    return '';
  });
  if (!exported.length) throw new Error('print-helper 無匯出塊');
  s = headOf('頂層函式', f) + '\n' + s + '\nexport { ' + exported.join(', ') + ' };\n';
  fs.writeFileSync(path.join(MOD, f), s);
  console.log('ported(B) ' + f + ' [' + exported.length + ' exports]');
}

// ---- B2. app-shell-utils → src/ui/toast.js ----
{
  const UI = path.resolve(__dirname, '..', 'src', 'ui');
  fs.mkdirSync(UI, { recursive: true });
  let s = fs.readFileSync(path.join(ROOT, 'app-shell-utils.js'), 'utf8');
  s = headOf('全域殼工具', 'app-shell-utils.js') + '\n' + s
    + '\nexport { showToast, installModalA11y, showConfirm, fallbackAvatarDataUri };\n';
  fs.writeFileSync(path.join(UI, 'toast.js'), s);
  console.log('ported(B2) app-shell-utils.js → src/ui/toast.js');
}

// ---- C. UMD ----
const C_FILES = [
  { file: 'export-accounting.js', ns: 'ExportAccounting' },
  { file: 'export-period8-accounting.js', ns: 'ExportPeriod8Accounting' }
];
for (const { file: f, ns } of C_FILES) {
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  s = s.replace(/^﻿/, ''); // BOM
  if (!s.includes('(function (root) {')) throw new Error(f + ' 非預期 UMD 形狀');
  const used = new Set();
  for (const m of s.matchAll(/root\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (m[1] !== ns) used.add(m[1]);
  }
  const imports = [];
  const rootProps = [];
  for (const name of [...used].sort()) {
    if (DOMAIN_FILE[name]) {
      imports.push('import ' + name + " from '../domain/" + DOMAIN_FILE[name] + "';");
      rootProps.push('  ' + name + ',');
    } else if (name === 'TemplateBuffer') {
      imports.push("import { TemplateBuffer } from './template-buffer.js';");
      rootProps.push('  TemplateBuffer,');
    } else if (name === 'localStorage') {
      rootProps.push('  localStorage: globalThis.localStorage,');
    } else if (name === 'ExcelJS') {
      rootProps.push('  get ExcelJS() { return globalThis.ExcelJS; },');
    } else {
      throw new Error(f + ' 未知 root 依賴：' + name);
    }
  }
  s = s.replace('})(window);', '})(__root);');
  const head = headOf('UMD', f) + imports.join('\n') + '\n\n'
    + '// UMD 轉 ESM：原 (window) 改墊片（讀期求值皆延至呼叫時，與 v1 一致）\n'
    + 'const __root = {\n' + rootProps.join('\n') + '\n};\n\n';
  s = head + s + '\nconst ' + ns + ' = __root.' + ns + ';\nexport default ' + ns + ';\n';
  fs.writeFileSync(path.join(MOD, f), s);
  console.log('ported(C) ' + f + ' [' + ns + ']');
}
