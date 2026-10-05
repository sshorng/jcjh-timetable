#!/usr/bin/env node
'use strict';
/**
 * port-unit-tests.cjs — v1 vm-loader 單測 → v2 vitest（機械轉換，斷言零手改）。
 *
 * 轉換規則：
 * - require(assert/fs/path/vm) → import（vm 丟棄；fs/path 無後用則丟棄）
 * - `const context = {...}` 整塊＋createContext＋runInContext 刪除，
 *   改為檔頭 `import { NS } from '../src/modules/<file>';`
 * - `context.window.NS` → `NS`；殘留 `context.window.` → `window.`（setup shim 承接）
 * - 全體包進 `test(name, () => {...})`（2 空格縮排）
 *
 * 用法：node scripts/port-unit-tests.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'tests');

const FILES = [
  // runtime 單測（create／函式直呼叫）：可機械移植
  'data-layer-tests.js', 'backoffice-tests.js', 'match-panel-tests.js',
  'homeroom-tests.js', 'ui-admin-import-tests.js',
  'same-period-swap-ui-tests.js', 'class-away-ui-tests.js',
  'timetable-resolve-tests.js',
  'exchange-week-contract-tests.js', 'triangle-tests.js'
  // 手動移植：school-swap-contract（slice-eval 改 create 回傳，見 port-schoolswap-test.cjs＋手调）
  // v1-only 合約測試（斷言 v1 檔切片／後端／部署，不移植）：
  // batch-exchange-ui, class-timetable-admin, timetable-only-fee,
  // security, permission, match-subject
];

// require('../x.js') 風格（v1 以 global.window=global＋require 載入）：
// x 為已知命名空間檔 → 轉 import；其餘（code.gs 切片等）不處理、整檔跳過。
const REQUIRE_FILE = {
  'date-utils.js': '../src/domain/date-utils.js',
  'fee-utils.js': '../src/domain/fee-utils.js',
  'field-map.js': '../src/domain/field-map.js',
  'domain-triangle.js': '../src/domain/domain-triangle.js',
  'domain-match.js': '../src/domain/domain-match.js',
  'domain-school-swap.js': '../src/domain/domain-school-swap.js',
  'domain-schedule.js': '../src/domain/domain-schedule.js',
  'domain-class-away.js': '../src/domain/domain-class-away.js',
  'domain-activity-cover.js': '../src/domain/domain-activity-cover.js',
  'domain-billing.js': '../src/domain/domain-billing.js',
  'ui-request.js': '../src/modules/ui-request.js'
};

function removeBraceBlock(s, startIdx) {
  const open = s.indexOf('{', startIdx);
  let d = 0;
  let j = open;
  let instr = null;
  while (j < s.length) {
    const ch = s[j];
    if (instr) {
      if (ch === '\\') j++;
      else if (ch === instr) instr = null;
    } else if (ch === "'" || ch === '"' || ch === '`') instr = ch;
    else if (ch === '{') d++;
    else if (ch === '}') {
      d--;
      if (d === 0) {
        let k = j + 1;
        if (s[k] === ';') k++;
        if (s[k] === '\n') k++;
        return s.slice(0, startIdx) + s.slice(k);
      }
    }
    j++;
  }
  throw new Error('brace block 未閉合');
}

for (const f of FILES) {
  let s = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');
  const mods = new Set(); // v1 被測檔 → v2 import
  const extraImports = [];
  // A. require('../x.js') 風格
  s = s.replace(/require\('\.\.\/([^']+)'\);?\n/g, (m0, file) => {
    if (/^ui-.*\.js$/.test(file)) {
      mods.add({ file, dir: '../src/modules/' });
      return '';
    }
    if (!REQUIRE_FILE[file]) throw new Error(f + ' 未知 require：' + file);
    const target = REQUIRE_FILE[file];
    if (target.endsWith('ui-request.js')) extraImports.push("import { UiSubmitHelpers } from '" + target + "';");
    else {
      const base = path.basename(file, '.js');
      const name = base === 'date-utils' ? 'DateUtils'
        : base === 'fee-utils' ? 'FeeUtils'
        : base === 'field-map' ? 'FieldMap'
        : 'Domain' + base.slice('domain-'.length).split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');
      extraImports.push('import ' + name + " from '" + target + "';");
    }
    return '';
  });
  s = s.replace(/global\.window = global;\n/g, '');
  // `const { A, B } = window;` → 刪除（import 直接提供）
  s = s.replace(/const \{[^}]+\} = window;\n/g, '');
  // runInContext 載入檔（inline readFileSync 版）
  s = s.replace(
    /vm\.runInContext\(fs\.readFileSync\(path\.join\(root, '([^']+)'\), 'utf8'\), context[^;]*;/g,
    (m0, file) => {
      if (/^ui-.*\.js$/.test(file)) mods.add({ file, dir: '../src/modules/' });
      else if (/^(domain-.*|date-utils|fee-utils|field-map.*)\.js$/.test(file)) mods.add({ file, dir: '../src/domain/' });
      else throw new Error(f + ' 未知被測檔：' + file);
      return '';
    }
  );
  // 命名空間：context.window.NS → NS（收集 import 名）
  const namespaces = new Set();
  s = s.replace(/context\.window\.([A-Za-z_][A-Za-z0-9_]*)/g, (m0, name) => {
    if (/^(Ui|Domain)[A-Z]/.test(name) || ['DateUtils', 'FeeUtils', 'FieldMap'].includes(name)) {
      namespaces.add(name);
      return name;
    }
    return 'window.' + name;
  });
  // require 風格檔的裸 window.NS（v1 以 global.window=global＋require 載入）→ NS
  s = s.replace(/window\.((?:Ui|Domain)[A-Z][A-Za-z0-9]*|DateUtils|FeeUtils|FieldMap)/g, (m0, name) => {
    namespaces.add(name);
    return name;
  });
  s = s.replace(/context\.window/g, 'window');
  // require 風格的 `const X = window.Y;` → `const X = Y;`（Y 納入來源校驗）
  s = s.replace(/const ([A-Za-z_][A-Za-z0-9_]*) = window\.([A-Za-z_][A-Za-z0-9_]*);/g, (m0, x, y) => {
    namespaces.add(y);
    return 'const ' + x + ' = ' + y + ';';
  });
  // runInContext 載入檔（source 變數版：const source = fs.readFileSync(...) + runInContext(source, ...)）
  s = s.replace(/const source = fs\.readFileSync\(path\.join\(__dirname, '\.\.', '([^']+)'\), 'utf8'\);\n/g, (m0, file) => {
    if (/^ui-.*\.js$/.test(file)) mods.add({ file, dir: '../src/modules/' });
    else if (/^(domain-.*|date-utils|fee-utils|field-map.*)\.js$/.test(file)) mods.add({ file, dir: '../src/domain/' });
    else throw new Error(f + ' 未知被測檔：' + file);
    return '';
  });
  s = s.replace(/vm\.runInContext\(source, context[^;]*;\n/g, '');
  s = s.replace(/vm\.createContext\(context\);\n/g, '');
  // context 塊刪除
  const ci = s.indexOf('const context = {');
  if (ci >= 0) s = removeBraceBlock(s, ci);
  // require → import
  s = s.replace(/const assert = require\('node:assert\/strict'\);\n/, "import assert from 'node:assert/strict';\nimport { test } from 'vitest';\n");
  s = s.replace(/const vm = require\('node:vm'\);\n/g, '');
  // fs/path：後無使用者則刪
  const body1 = s;
  if (!/[^A-Za-z0-9_]fs\./.test(body1.replace(/import fs from 'node:fs';\n/, ''))) {
    s = s.replace(/const fs = require\('node:fs'\);\n/g, '');
  } else {
    s = s.replace(/const fs = require\('node:fs'\);\n/g, "import fs from 'node:fs';\n");
  }
  if (!/[^A-Za-z0-9_]path\./.test(s.replace(/import path from 'node:path';\n/, '').replace(/const path = require\('node:path'\);\n/, ''))) {
    s = s.replace(/const path = require\('node:path'\);\n/g, '');
  } else {
    s = s.replace(/const path = require\('node:path'\);\n/g, "import path from 'node:path';\n");
  }
  s = s.replace(/const root = path\.resolve\(__dirname, '\.\.'\);\n/g, '');
  s = s.replace(/^#!.*\n/, '').replace(/^'use strict';\n/, '');
  // 殘留檢查
  for (const bad of ['vm.', '__dirname', 'context']) {
    if (s.includes(bad)) throw new Error(f + ' 殘留未處理：' + bad);
  }
  // 依檔分組命名空間：讀 v2 產出檔尾 export 取得掛載名，全量 import
  const provided = new Set();
  const importBlock = [...mods].map((m) => {
    // 讀 v2 產出檔尾 export 取得掛載名
    const built = fs.readFileSync(path.join(OUT, '..', 'src', m.dir === '../src/modules/' ? 'modules' : 'domain', m.file), 'utf8');
    const em = built.match(/\nexport \{ ([^}]+) \};\s*$/);
    if (!em && !built.match(/\nexport default /)) throw new Error('v2 檔無 export：' + m.file);
    if (em) {
      for (const n of em[1].split(',')) provided.add(n.trim());
      return 'import { ' + em[1] + " } from '" + m.dir + m.file + "';";
    }
    const dm = built.match(/\nexport default ([A-Za-z_][A-Za-z0-9_]*);/);
    provided.add(dm[1]);
    return 'import ' + dm[1] + " from '" + m.dir + m.file + "';";
  }).join('\n');
  // require 風格的 import 行併入來源集合（校驗合併後一次做）
  for (const line of extraImports) {
    const mNames = line.match(/import (?:\{ ([^}]+) \}|([A-Za-z_][A-Za-z0-9_]*)) from/);
    if (mNames) {
      const raw = mNames[1] || mNames[2];
      for (const n of raw.split(',')) provided.add(n.trim());
    }
  }
  for (const n of namespaces) {
    if (!provided.has(n)) throw new Error(f + ' 命名空間無來源（require 風格）：' + n);
  }
  // body 包 test（去掉已有的 import 行，統一放檔頭）
  let body = s;
  const preImports = [];
  body = body.replace(/^import .*;\n/gm, (m0) => {
    preImports.push(m0.trim());
    return '';
  });
  body = body.replace(/^\n+/, '');
  const indented = body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  const title = f.replace(/\.js$/, '').replace(/-/g, ' ');
  const out = [...new Set([...preImports, ...extraImports, importBlock])].join('\n') + '\n\ntest(\'' + title + '（v1 移植）\', () => {\n' + indented + '\n});\n';
  fs.writeFileSync(path.join(OUT, f.replace(/\.js$/, '.test.js')), out);
  console.log('ported ' + f);
}
