#!/usr/bin/env node
'use strict';
/**
 * port-modules.cjs — v1 全域 IIFE → v2 ESM（機械轉換，body 零手改）。
 *
 * 轉換規則（逐檔）：
 * 1. `window.NS = (function () {` → `const NS = (() => {`（body 內無 this，已驗證）
 * 2. `window.NS` 讀取 → `NS`，並在檔頭補 import（同檔自有命名空間除外；
 *    ensure 鉤子／__ 鉤子／瀏覽器 API 等非命名空間 window 原樣保留）
 * 3. 檔尾補 `export { NS1, NS2 };`（呼叫端寫法不變）
 *
 * 用法：node scripts/port-modules.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_MOD = path.join(__dirname, '..', 'src', 'modules');
const OUT_API = path.join(__dirname, '..', 'src', 'api');

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

// 1. 建 Ui 命名空間→檔名表
const UI_FILE = {};
const uiFiles = fs.readdirSync(ROOT).filter((f) => /^ui-.*\.js$/.test(f)).sort();
for (const f of uiFiles) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/window\.(Ui[A-Za-z]+)\s*=\s*\(function/g)) {
    if (UI_FILE[m[1]] && UI_FILE[m[1]] !== f) throw new Error('命名空間重複：' + m[1]);
    UI_FILE[m[1]] = f;
  }
}

const KNOWN = new Set([...Object.keys(UI_FILE), ...Object.keys(DOMAIN_FILE), 'GasApi']);
const EXTRA = [
  { file: 'gas-api.js', outDir: OUT_API, mounts: ['GasApi'] }
];

function importFor(name, selfFile) {
  if (name === 'GasApi') return 'import { GasApi } from \'../api/gas-client.js\';';
  if (UI_FILE[name]) {
    if (UI_FILE[name] === selfFile) return null;
    return 'import { ' + name + " } from '../modules/" + UI_FILE[name] + "';";
  }
  return 'import ' + name + " from '../domain/" + DOMAIN_FILE[name] + "';";
}

function portOne(f, outDir, mounts) {
  let s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const ns of mounts) {
    const mountRe = new RegExp('window\\.' + ns + '\\s*=\\s*\\(function \\(\\) \\{');
    if (!mountRe.test(s)) throw new Error(f + ' 掛載行格式不符：' + ns);
    s = s.replace(mountRe, 'const ' + ns + ' = (() => {');
  }
  const used = new Set();
  for (const m of s.matchAll(/window\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (KNOWN.has(m[1]) && !mounts.includes(m[1])) used.add(m[1]);
  }
  s = s.replace(/window\.([A-Za-z_][A-Za-z0-9_]*)/g, (m0, name) => (KNOWN.has(name) ? name : m0));
  // R-SELF：`const X = window.X` 經上式會變自我遮蔽 `const X = X`（TDZ 必炸）→ 整行刪除（import 已提供；此形恆為 bug，無誤刪）
  s = s.replace(/^[ \t]*(?:var|let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\1\s*;[ \t]*\r?$/gm, '');
  const importLines = [...used].sort().map((name) => importFor(name, f)).filter(Boolean);
  // R-VUE：v1 靠全域 Vue（ref／computed／watch…），ESM 需顯式 import（無頂層同名宣告，已驗證）
  const vueUses = [];
  for (const g of ['ref', 'computed', 'watch', 'reactive', 'nextTick', 'toRef', 'toRefs', 'onMounted']) {
    if (new RegExp('(?<![.\\w$])' + g + '(?![\\w$])').test(s)) vueUses.push(g);
  }
  if (vueUses.length) importLines.unshift('import { ' + vueUses.join(', ') + " } from 'vue';");
  // R-TOAST：v1 showToast／showConfirm／installModalA11y／fallbackAvatarDataUri 是瀏覽器全域
  // （app-shell-utils 頂層），ESM 下無綁定者需顯式 import。判定：有 import／宣告／參數即視為已綁；
  // 否則只要裸引用（呼叫形＋速記屬性＋值傳遞）就補（多補無害，少補必炸）。
  const toastUses = [];
  const noStr = s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
  for (const g of ['showToast', 'showConfirm', 'installModalA11y', 'fallbackAvatarDataUri']) {
    if (new RegExp('import\\s*\\{[^}]*\\b' + g + '\\b').test(s)) continue;
    if (new RegExp('(?:var|let|const|function)\\s+' + g + '\\b').test(s)) continue;
    // 真參數位（函式宣告參數／箭頭單參／catch）：function f(g)／(g) =>／(g,／, g) =>（呼叫傳值 foo(g) 不算）
    if (new RegExp('function\\s*[A-Za-z0-9_]*\\s*\\([^()]*\\b' + g + '\\b').test(s)) continue;
    if (new RegExp('[(,]\\s*' + g + '\\s*[,)]\\s*=>').test(s)) continue;
    if (new RegExp('catch\\s*\\(\\s*' + g + '\\s*\\)').test(s)) continue;
    if (!new RegExp('(?<![.\\w$"\'])' + g + '(?![\\w$])').test(noStr)) continue;
    toastUses.push(g);
  }
  if (toastUses.length) importLines.push('import { ' + toastUses.join(', ') + " } from '../ui/toast.js';");
  const head = '/**\n * 自 v1 ' + f + ' 機械移植（port-modules.cjs）：\n * IIFE 掛載改 ESM export；body 與 v1 逐字一致。\n */\n' + (importLines.length ? importLines.join('\n') + '\n\n' : '\n');
  s = head + s + '\nexport { ' + mounts.join(', ') + ' };\n';
  const outName = f === 'gas-api.js' ? 'gas-client.js' : f;
  fs.writeFileSync(path.join(outDir, outName), s);
  console.log('ported ' + f + ' [' + mounts.join(', ') + ']' + (used.size ? ' imports:' + [...used].sort().join(',') : ''));
}

for (const f of uiFiles) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const mounts = [...s.matchAll(/window\.(Ui[A-Za-z]+)\s*=\s*\(function/g)].map((m) => m[1]);
  if (!mounts.length) throw new Error(f + ' 無掛載行');
  portOne(f, OUT_MOD, mounts);
}
for (const e of EXTRA) portOne(e.file, e.outDir, e.mounts);

// PATCHES（v1 潛伏問題，移植時一併修正；重跑不丟失）：
// P1 ui-timetable：activeAwayBanner 定義在 dep 賦值之前，eager computed 樁下會讀到
// 未賦值的 getTodayString（真 Vue 懶求值無感，但排序後兩者皆成立）。
{
  const P = path.join(OUT_MOD, 'ui-timetable.js');
  let s = fs.readFileSync(P, 'utf8');
  const startM = s.match(/\nconst activeAwayBanner = computed\(\(\) => \{/);
  if (!startM) throw new Error('P1 錨點遺失');
  const start = startM.index + 1;
  let d = 0, j = s.indexOf('{', start), ins = null;
  for (; j < s.length; j++) {
    const ch = s[j];
    if (ins) {
      if (ch === '\\') j++;
      else if (ch === ins) ins = null;
    } else if (ch === "'" || ch === '"' || ch === '`') ins = ch;
    else if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) break; }
  }
  let e = j + 1;
  while (s[e] === ')' || s[e] === ';' || s[e] === '\n' || s[e] === '\r') e++;
  const block = s.slice(start, e);
  s = s.slice(0, start) + s.slice(e);
  const anchor = '    var semesterEndDate = deps.semesterEndDate;';
  if (!s.includes(anchor)) throw new Error('P1 插入錨點遺失');
  const fixed = [
    '',
    '    // R-v2：activeAwayBanner 需排在 dep 賦值之後（eager computed stub 下亦成立；',
    '    // 真 Vue 懶求值語義不變）。原 v1 位置在 dep 賦值之前，屬潛伏排序問題。',
    '    const activeAwayBanner = computed(() => {',
    '      if (!DomainClassAway) return null;',
    '      const today = getTodayString();',
    '      const active = DomainClassAway.eventsActiveOnDate(',
    '        today, getClassAwayEventsForView(), semesterEndDate.value',
    '      );',
    '      if (!active.length) return null;',
    "      const names = active.map(e => e.name || '未命名').join('、');",
    '      const classes = DomainClassAway.getActiveAwayClasses(',
    '        today, getClassAwayEventsForView(), semesterEndDate.value, undefined, { allClasses: classList.value }',
    '      );',
    '      return { names, classes, count: classes.length };',
    '    });',
    ''
  ].join('\n');
  s = s.replace(anchor, anchor + fixed);
  fs.writeFileSync(P, s);
  console.log('patched P1 ui-timetable activeAwayBanner order');
}

// P2 ui-submit：create 漏解構 buildLineInviteText（v1 create 未傳＋未解構，送出即炸；
// gen-final R-SUBMIT 已補傳入，此處補解構，兩處配套）：
{
  const P = path.join(OUT_MOD, 'ui-submit.js');
  let s = fs.readFileSync(P, 'utf8');
  const anchor = '    var isTimetableOnlyFee = deps.isTimetableOnlyFee;';
  if (!s.includes(anchor)) throw new Error('P2 錨點遺失');
  if (!s.includes('var buildLineInviteText = deps.buildLineInviteText;')) {
    s = s.replace(anchor, anchor + '\n    var buildLineInviteText = deps.buildLineInviteText;');
    fs.writeFileSync(P, s);
    console.log('patched P2 ui-submit buildLineInviteText destructure');
  }
}

// P3 ui-submit：create 漏解構 isBatchExchangeFlow（同 P2 類；gen-final R-SUBMIT 已補傳入）：
{
  const P = path.join(OUT_MOD, 'ui-submit.js');
  let s = fs.readFileSync(P, 'utf8');
  const anchor = '    var batchAssignMode = deps.batchAssignMode;';
  if (!s.includes(anchor)) throw new Error('P3 錨點遺失');
  if (!s.includes('var isBatchExchangeFlow = deps.isBatchExchangeFlow;')) {
    s = s.replace(anchor, anchor + '\n    var isBatchExchangeFlow = deps.isBatchExchangeFlow;');
    fs.writeFileSync(P, s);
    console.log('patched P3 ui-submit isBatchExchangeFlow destructure');
  }
}
