#!/usr/bin/env node
'use strict';
/**
 * port-batch2.cjs — require 風格 v1 單測 → v2 vitest（第二批）。
 * 相對 port-unit-tests.cjs 新增：Export* 命名空間、require.resolve 源碼切片改讀 v2。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'tests');

const FILES = [
  'export-accounting-tests.js',
  'billing-data-shape-tests.js',
  'period8-roster-tests.js',
  'period8-accounting-tests.js',
  'invigilation-export-contract-tests.js',
  'timetable-only-fee-tests.js',
  'period-contract-tests.js',
  'class-timetable-admin-tests.js'
];

// 後端合約測試（code.gs 切片＋vm 沙箱）：後端 v1/v2 共用，僅改讀檔路徑（../../），
// 邏輯與沙箱原樣保留。
const FILES_CODEGS = [
  'match-subject-tests.js',
  'cache-contract-tests.js',
  'patrol-contract-tests.js',
  'teacher-login-cache-tests.js',
  'code-gs-contract-tests.js',
  'permission-tests.js'
];
// code-gs 檔內的前端讀檔 → v2 對應（其餘 code.gs 照舊走根目錄）
const CODEGS_FRONTMAP = {
  'app.js': null, // 逐站處理（見下）
  'ui-submit.js': "path.join(here, '..', 'src', 'modules', 'ui-submit.js')",
  'ui-backoffice.js': "path.join(here, '..', 'src', 'modules', 'ui-backoffice.js')"
};

// vm.runInContext 載入檔 → v2 import（檔名→src 目錄）
const VM_FILE_DIR = {
  'export-invigilation-recovered.js': '../src/modules/',
  'export-activity-cover.js': '../src/modules/',
  'export-accounting.js': '../src/modules/',
  'export-period8-accounting.js': '../src/modules/',
  'export-school-timetable.js': '../src/modules/'
};

// v1 被測檔 → v2 import（default／named 與產出檔尾 export 一致）
const REQUIRE_FILE = {
  'date-utils.js': { target: '../src/domain/date-utils.js', name: 'DateUtils', named: false },
  'fee-utils.js': { target: '../src/domain/fee-utils.js', name: 'FeeUtils', named: false },
  'field-map.js': { target: '../src/domain/field-map.js', name: 'FieldMap', named: false },
  'domain-triangle.js': { target: '../src/domain/domain-triangle.js', name: 'DomainTriangle', named: false },
  'domain-match.js': { target: '../src/domain/domain-match.js', name: 'DomainMatch', named: false },
  'domain-school-swap.js': { target: '../src/domain/domain-school-swap.js', name: 'DomainSchoolSwap', named: false },
  'domain-schedule.js': { target: '../src/domain/domain-schedule.js', name: 'DomainSchedule', named: false },
  'domain-class-away.js': { target: '../src/domain/domain-class-away.js', name: 'DomainClassAway', named: false },
  'domain-activity-cover.js': { target: '../src/domain/domain-activity-cover.js', name: 'DomainActivityCover', named: false },
  'domain-billing.js': { target: '../src/domain/domain-billing.js', name: 'DomainBilling', named: false },
  'ui-request.js': { target: '../src/modules/ui-request.js', name: 'UiSubmitHelpers', named: true },
  'export-accounting.js': { target: '../src/modules/export-accounting.js', name: 'ExportAccounting', named: false },
  'export-school-timetable.js': { target: '../src/modules/export-school-timetable.js', name: 'ExportSchoolTimetable', named: true },
  'export-period8-accounting.js': { target: '../src/modules/export-period8-accounting.js', name: 'ExportPeriod8Accounting', named: false },
  'export-activity-cover.js': { target: '../src/modules/export-activity-cover.js', name: 'ExportActivityCover', named: true },
  'export-invigilation-recovered.js': { target: '../src/modules/export-invigilation-recovered.js', name: 'ExportInvigilation', named: true }
};

const V2_SRC_DIR = { 'export-accounting.js': 'modules', 'export-period8-accounting.js': 'modules' };

for (const f of FILES) {
  let s = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8').replace(/\r\n/g, '\n');
  const extraImports = [];
  const namespaces = new Set();
  let needHere = false;

  // A0. path.join(__dirname, '..', 'x.js') 源碼切片 → 讀 v2 對應檔
  const needHereTmp = { v: false };
  const targetDir = {};
  for (const [vf, r] of Object.entries(REQUIRE_FILE)) {
    const mDir = r.target.match(/^\.\.\/src\/(.+)\/[^/]+$/);
    if (mDir) targetDir[vf] = mDir[1];
  }
  // ui-* 通用（未列 REQUIRE_FILE 者，以 v2 檔尾 export 為準，見 port-unit-tests 做法）
  s = s.replace(/path\.join\(__dirname, '\.\.', '([^']+)'\)/g, (m0, file) => {
    const dir = targetDir[file] || (/^ui-.*\.js$/.test(file) ? 'modules' : null);
    if (!dir) throw new Error(f + ' 未知切片檔：' + file);
    needHereTmp.v = true;
    return "path.join(here, '..', 'src', '" + dir + "', '" + file + "')";
  });
  // A. require.resolve('../x.js') 源碼切片 → 讀 v2 對應檔
  if (needHereTmp.v) needHere = true;
  s = s.replace(/require\.resolve\('\.\.\/([^']+)'\)/g, (m0, file) => {
    const dir = V2_SRC_DIR[file];
    if (!dir) throw new Error(f + ' 未知切片檔：' + file);
    needHere = true;
    return "path.join(here, '..', 'src', '" + dir + "', '" + file + "')";
  });
  // B. require('../x.js')
  s = s.replace(/require\('\.\.\/([^']+)'\);?\n/g, (m0, file) => {
    const r = REQUIRE_FILE[file];
    if (!r) {
      // ui-* 通用：讀 v2 檔尾 export 取掛載名
      if (!/^ui-.*\.js$/.test(file)) throw new Error(f + ' 未知 require：' + file);
      const built = fs.readFileSync(path.join(OUT, '..', 'src', 'modules', file), 'utf8');
      const em = built.match(/\nexport \{ ([^}]+) \};\s*$/);
      if (!em) throw new Error('v2 檔無 named export：' + file);
      for (const n of em[1].split(',')) namespaces.add(n.trim());
      extraImports.push('import { ' + em[1] + " } from '../src/modules/" + file + "';");
      return '';
    }
    namespaces.add(r.name);
    extraImports.push(r.named
      ? 'import { ' + r.name + " } from '" + r.target + "';"
      : 'import ' + r.name + " from '" + r.target + "';");
    return '';
  });
  s = s.replace(/global\.window = global;\n/g, '');
  // B2. vm 風格：const source = fs.readFileSync(path.join(root, 'x.js'))＋runInContext
  const vmMods = [];
  s = s.replace(/const source = fs\.readFileSync\(path\.join\(root, '([^']+)'\), 'utf8'\);\n/g, (m0, file) => {
    const dir = VM_FILE_DIR[file];
    if (!dir) throw new Error(f + ' 未知 vm 被測檔：' + file);
    const built = fs.readFileSync(path.join(OUT, '..', 'src', dir === '../src/modules/' ? 'modules' : 'domain', file), 'utf8');
    const em = built.match(/\nexport \{ ([^}]+) \};\s*$/);
    if (!em) throw new Error('v2 檔無 named export：' + file);
    vmMods.push('import { ' + em[1] + " } from '" + dir + file + "';");
    for (const n of em[1].split(',')) namespaces.add(n.trim());
    return '';
  });
  extraImports.push(...vmMods);
  s = s.replace(/vm\.runInContext\(source, context[^;]*?\)\s*;\n/g, '');
  s = s.replace(/vm\.createContext\(context\);\n/g, '');
  s = s.replace(/const root = path\.resolve\(__dirname, '\.\.'\);\n/g, '');
  s = s.replace(/const vm = require\('node:vm'\);\n/g, '');
  // context 塊刪除（brace 匹配）
  const ci = s.indexOf('const context = {');
  if (ci >= 0) {
    const open = s.indexOf('{', ci);
    let d = 0, j = open, instr = null;
    while (j < s.length) {
      const ch = s[j];
      if (instr) { if (ch === '\\') j++; else if (ch === instr) instr = null; }
      else if (ch === "'" || ch === '"' || ch === '`') instr = ch;
      else if (ch === '{') d++;
      else if (ch === '}') { d--; if (d === 0) break; }
      j++;
    }
    let k = j + 1;
    if (s[k] === ';') k++;
    if (s[k] === '\n') k++;
    s = s.slice(0, ci) + s.slice(k);
  }
  // C1. 先處理 context.window.*（必須在裸 window.NS 之前，否則被誤啃）
  s = s.replace(/const ([A-Za-z_][A-Za-z0-9_]*) = context\.window\.([A-Za-z_][A-Za-z0-9_]*);/g, 'const $1 = $2;');
  // const X = context.window.NS.rest... → const X = NS.rest...
  s = s.replace(/const ([A-Za-z_][A-Za-z0-9_]*) = context\.window\.((?:Ui|Domain|Export)[A-Z][A-Za-z0-9_]*|DateUtils|FeeUtils|FieldMap)((?:\.[A-Za-z_][A-Za-z0-9_]*)+);/g, (m0, x, ns, rest) => {
    namespaces.add(ns);
    return 'const ' + x + ' = ' + ns + rest + ';';
  });
  // 行內 context.window.NS.rest → NS.rest
  s = s.replace(/context\.window\.((?:Ui|Domain|Export)[A-Z][A-Za-z0-9_]*|DateUtils|FeeUtils|FieldMap)(?=\.)/g, (m0, ns) => {
    namespaces.add(ns);
    return ns;
  });
  // C2. 裸 window.NS → NS（Ui/Domain/DateUtils/FeeUtils/FieldMap/Export*)
  s = s.replace(/window\.((?:Ui|Domain|Export)[A-Z][A-Za-z0-9]*|DateUtils|FeeUtils|FieldMap)/g, (m0, name) => {
    namespaces.add(name);
    return name;
  });
  // D. require → import
  s = s.replace(/const assert = require\('node:assert\/strict'\);\n/, "import assert from 'node:assert/strict';\nimport { test } from 'vitest';\n");
  s = s.replace(/const assert = require\('assert'\);\n/, "import assert from 'node:assert';\nimport { test } from 'vitest';\n");
  const usesFs = /fs\./.test(s);
  const usesPath = /path\./.test(s);
  s = s.replace(/const fs = require\('node:fs'\);\n/, usesFs ? "import fs from 'node:fs';\n" : '');
  s = s.replace(/const path = require\('node:path'\);\n/, usesPath ? "import path from 'node:path';\n" : '');
  s = s.replace(/^#!.*\n/, '').replace(/^'use strict';\n/, '');
  // E. import 來源校驗：命名空間必須有 import 提供
  const provided = new Set();
  for (const line of extraImports) {
    const mNames = line.match(/import (?:\{ ([^}]+) \}|([A-Za-z_][A-Za-z0-9_]*)) from/);
    if (mNames) for (const n of (mNames[1] || mNames[2]).split(',')) provided.add(n.trim());
  }
  for (const n of namespaces) {
    if (!provided.has(n)) throw new Error(f + ' 命名空間無來源：' + n);
  }
  // F. 殘留檢查
  for (const bad of ['require(', 'global.window', '__dirname', 'context.', 'vm.']) {
    if (s.includes(bad)) throw new Error(f + ' 殘留未處理：' + bad);
  }
  // G. 包 test
  let body = s;
  const preImports = [];
  body = body.replace(/^import .*;\n/gm, (m0) => { preImports.push(m0.trim()); return ''; });
  body = body.replace(/^\n+/, '');
  const head = [...new Set(preImports.concat(extraImports))];
  if (needHere) {
    if (!head.some((l) => l.includes("from 'node:path'"))) head.push("import path from 'node:path';");
    head.unshift("import { fileURLToPath } from 'node:url';");
    head.push("const here = path.dirname(fileURLToPath(import.meta.url));");
  }
  const indented = body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  const title = f.replace(/\.js$/, '').replace(/-/g, ' ');
  const out = head.join('\n') + '\n\ntest(\'' + title + '（v1 移植）\', () => {\n' + indented + '\n});\n';
  fs.writeFileSync(path.join(OUT, f.replace(/\.js$/, '.test.js')), out);
  console.log('ported ' + f);
}

for (const f of FILES_CODEGS) {
  let s = fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8').replace(/\r\n/g, '\n');
  s = s.replace(/^#!.*\n/, '').replace(/^'use strict';\n/, '');
  s = s.replace(/const assert = require\('node:assert\/strict'\);\n/, "import assert from 'node:assert/strict';\nimport { test } from 'vitest';\n");
  s = s.replace(/const assert = require\('assert'\);\n/, "import assert from 'node:assert';\nimport { test } from 'vitest';\n");
  s = s.replace(/const fs = require\('node:fs'\);\n/, "import fs from 'node:fs';\n");
  s = s.replace(/const path = require\('node:path'\);\n/, "import path from 'node:path';\n");
  s = s.replace(/const vm = require\('node:vm'\);\n/, "import vm from 'node:vm';\n");
  s = s.replace(/const root = path\.resolve\(__dirname, '\.\.'\);\n/, '');
  // code-gs 檔內前端讀檔 → v2 對應（app.js 那行逐站處理）
  if (f === 'code-gs-contract-tests.js') {
    s = s.replace(
      /const appSource = fs\.readFileSync\(path\.join\(root, 'app\.js'\), 'utf8'\);\n/,
      "const timetableStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'timetable.js'), 'utf8');\n"
    );
    s = s.replace(
      /assert\.match\(appSource, \/resolveCellFromBaseAndSubs/,
      'assert.match(timetableStoreSource, /resolveCellFromBaseAndSubs'
    );
  }
  // 後端共用：v2/tests → 根目錄（上兩層）；前端檔走 CODEGS_FRONTMAP
  s = s.replace(/path\.join\(root, '([^']+)'\)/g, (m0, file) => {
    if (file === 'app.js') return m0;
    if (CODEGS_FRONTMAP[file]) return CODEGS_FRONTMAP[file];
    return "path.join(here, '..', '..', '" + file + "')";
  });
  for (const bad of ['__dirname', 'path.resolve(__dirname']) {
    if (s.includes(bad)) throw new Error(f + ' 殘留未處理：' + bad);
  }
  let body = s;
  const preImports = [];
  body = body.replace(/^import .*;\n/gm, (m0) => { preImports.push(m0.trim()); return ''; });
  body = body.replace(/^\n+/, '');
  const head = [...new Set(preImports)];
  if (!head.some((l) => l.includes("from 'node:path'"))) head.push("import path from 'node:path';");
  head.unshift("import { fileURLToPath } from 'node:url';");
  head.push("const here = path.dirname(fileURLToPath(import.meta.url));");
  const indented = body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n');
  const title = f.replace(/\.js$/, '').replace(/-/g, ' ');
  // 註記：後端合約（code.gs）v1/v2 共用，非前端移植
  const out = head.join('\n') + '\n\ntest(\'' + title + '（後端合約，v1/v2 共用）\', () => {\n' + indented + '\n});\n';
  fs.writeFileSync(path.join(OUT, f.replace(/\.js$/, '.test.js')), out);
  console.log('ported ' + f);
}
