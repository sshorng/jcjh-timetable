#!/usr/bin/env node
'use strict';
/* gen-emit.cjs — 由 gen-base.cjs 的盤點產出 14 stores＋App.vue＋composition test。
 * 用法：node scripts/gen-emit.cjs
 */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const {
  STORES, STORE_VAR, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  PURE_RETURN, unionWrappers, wrapperStore, stateEntries, ownership, factories,
  manifest, app, appLines, sliceLines, dropGuards, GLOBALS, VUE_USE, identifiers
} = B;
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');
fs.mkdirSync(STOUT, { recursive: true });

// ---------- 特殊塊抽取（錨點掃描） ----------
function braceBlockFrom(idx) {
  let k = app.indexOf('{', idx), d = 0, j = k, ins = null;
  for (; j < app.length; j++) {
    const ch = app[j];
    if (ins) {
      if (ch === '\\') j++;
      else if (ch === ins) ins = null;
    } else if (ch === "'" || ch === '"' || ch === '`') ins = ch;
    else if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) break; }
  }
  let e = j + 1;
  while (app[e] === ')' || app[e] === ';' || app[e] === '\n' || app[e] === '\r') e++;
  return app.slice(idx, e);
}
function destructureMembers(block) {
  const m = block.match(/const \{([\s\S]*?)\} = /);
  if (!m) return [];
  return [...m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]);
}
function createBlock(ns) {
  const idx = app.indexOf('window.' + ns + '.create({');
  if (idx < 0) throw new Error('no create site: ' + ns);
  const lineStart = app.lastIndexOf('\n', idx) + 1;
  // 向前找本 statement 起頭（const { 或 const X =）
  const headM = app.slice(Math.max(0, lineStart - 600), idx).match(/const (\{[\s\S]*?\}|[A-Za-z_][A-Za-z0-9_]*) =\s*$/);
  const stmtStart = Math.max(0, lineStart - 600) + (headM ? headM.index : 0);
  // 向後 brace-match 到完整 call 結尾 `});`
  let k = app.indexOf('{', idx), d = 0, j = k, ins = null;
  for (; j < app.length; j++) {
    const ch = app[j];
    if (ins) {
      if (ch === '\\') j++;
      else if (ch === ins) ins = null;
    } else if (ch === "'" || ch === '"' || ch === '`') ins = ch;
    else if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) break; }
  }
  let e = j + 1;
  while (app[e] === ')' || app[e] === ';' || app[e] === '\n' || app[e] === '\r') e++;
  const full = app.slice(stmtStart, e);
  return { full, members: destructureMembers(full) };
}
const batchBlk = createBlock('UiBatchPanel');
const classAwayBlk = createBlock('UiClassAwayAdmin');
const bridgeBlk = createBlock('UiMutualBridge');
const sameSwapBlk = createBlock('UiSamePeriodSwap');
console.log('special members:', batchBlk.members.length, classAwayBlk.members.length, bridgeBlk.members.length, sameSwapBlk.members.length);
// samePeriodSwap return 用到的 12 個（解析 return 的 samePeriodSwapUI.x 條目）
const sameswapMembers = [...new Set([...app.matchAll(/samePeriodSwapUI\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
console.log('sameswap return members:', sameswapMembers.join(','));
// setup-top pure destructure（UiLineTemplate／UiListHelpers／UiStyle）：名→模組
const pureMap = {};
{
  const pureRe = /const \{([\s\S]*?)\} = window\.(UiLineTemplate|UiListHelpers|UiStyle);/g;
  let pm;
  while ((pm = pureRe.exec(app))) {
    if (/;/.test(pm[1])) { pureRe.lastIndex = pm.index + 7; continue; } // 跨語句污染：回退重掃，不吞合法塊
    for (const n of pm[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) pureMap[n[1]] = pm[2];
  }
}
console.log('pure destructure names:', Object.keys(pureMap).length);

// ---------- 模組成員 kind 分類（ref-like vs fn） ----------
const memberKind = {}; // name -> 'ref' | 'fn'
{
  const modDir = path.join(ROOT, 'v2', 'src', 'modules');
  for (const f of fs.readdirSync(modDir)) {
    if (!f.endsWith('.js')) continue;
    const s = fs.readFileSync(path.join(modDir, f), 'utf8');
    for (const m of s.matchAll(/(?:const|let|var) ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.{0,60})/g)) {
      const rhs = m[2];
      if (/^(ref|computed|reactive)\(/.test(rhs)) memberKind[m[1]] = 'ref';
      else if (!(m[1] in memberKind)) memberKind[m[1]] = 'fn';
    }
    for (const m of s.matchAll(/(?:^|[;\n}])\s*(?:async function|function) ([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)) {
      if (!(m[1] in memberKind)) memberKind[m[1]] = 'fn';
    }
  }
}

// ---------- 每 store 組裝 ----------
const storeOf = {};
for (const e of stateEntries) storeOf[e.name] = ownership[e.name] || 'data';
// 覆寫（gen-final 一致採用此表為唯一真相）：
// 1. 九個共用名按職責指派；2. wrapper 跟 factory 走；3. 跨 store 可變 let 搬家
const AMBIG = {
  isCombinedClass: 'timetable', currentWeekDates: 'timetable', isAdmin: 'session',
  isStaff: 'session', canViewAllTimetables: 'session', parseTeacherSubjects: 'session',
  canOperateOnTeacherEmail: 'session', ensureProxyTargetForTeacher: 'session',
  displayTimetableTeachers: 'timetable'
};
for (const k of Object.keys(AMBIG)) storeOf[k] = AMBIG[k];
for (const w of unionWrappers) storeOf[w.name] = wrapperStore[w.name];
const MOVE_LETS = {
  monthlyReportCalculationId: 'output',
  monthlyReportLastCalculationKey: 'output',
  accountingPeriodNavigation: 'output'
};
for (const k of Object.keys(MOVE_LETS)) storeOf[k] = MOVE_LETS[k];
const factoryByName = {};
for (const f of factories) factoryByName[f.name] = f;
// _xApi 緩存強制跟隨 factory
for (const e of stateEntries) {
  const m = e.name.match(/^_([A-Za-z]+)Api$/);
  if (m) {
    const fns = Object.keys(FACTORY_STORE).filter((fn) => fn.toLowerCase() === ('get' + m[1] + 'api').toLowerCase() || fn.toLowerCase() === ('_' + m[1]).toLowerCase());
    if (fns.length) storeOf[e.name] = FACTORY_STORE[fns[0]];
  }
}
if (storeOf['_uiAdminApi']) storeOf['_uiAdminApi'] = 'admin';
if (storeOf['_mutualPanelApi']) storeOf['_mutualPanelApi'] = 'mutual';

const SPECIAL = {
  submit: [{ kind: 'eager', block: batchBlk.full, members: batchBlk.members, module: 'UiBatchPanel', file: 'ui-activity.js' }],
  backoffice: [{ kind: 'eager', block: classAwayBlk.full, members: classAwayBlk.members, module: 'UiClassAwayAdmin', file: 'ui-activity.js' }],
  mutual: [{ kind: 'eager', block: bridgeBlk.full, members: bridgeBlk.members, module: 'UiMutualBridge', file: 'ui-activity.js' }],
  timetable: [{ kind: 'eager', block: sameSwapBlk.full, members: sameswapMembers, module: 'UiSamePeriodSwap', file: 'ui-same-period-swap.js', destructure: true }]
};
for (const s of Object.keys(SPECIAL)) {
  for (const sp of SPECIAL[s]) for (const n of sp.members) storeOf[n] = s;
}

const stores = {};
for (const s of STORES) {
  stores[s] = {
    state: stateEntries.filter((e) => storeOf[e.name] === s),
    factories: factories.filter((f) => FACTORY_STORE[f.name] === s),
    wrappers: unionWrappers.filter((w) => wrapperStore[w.name] === s),
    specials: SPECIAL[s] || [],
    watches: [],
    inits: []
  };
}
// watches 歸屬（watch-assign.json owner；特殊：跨 store 引用由 destructure 解決）
const watchAssign = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-assign.json', 'utf8'));
const watchBodies = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-bodies.json', 'utf8'));
const bodyByLine = {};
for (const b of watchBodies) {
  // watch-assign 與 bodies 同源同序？bodies 只有 {i, body}；用 watchAssign line 對應：重算
}
{
  // 重建 line→body：watchBodies 順序與 watches.json 順序一致
  const watches = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watches.json', 'utf8'));
  watches.forEach((w, i) => { bodyByLine[w[1]] = watchBodies[i].body; });
}
for (const w of watchAssign) {
  const body = bodyByLine[w.line];
  if (!body) throw new Error('watch body 缺失 L' + w.line);
  if (w.kind === 'onMounted') stores[w.owner].inits.push(body);
  else stores[w.owner].watches.push(body);
}

fs.writeFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\gen-plan.json', JSON.stringify(Object.fromEntries(STORES.map((s) => [s, {
  state: stores[s].state.length, factories: stores[s].factories.map((f) => f.name),
  wrappers: stores[s].wrappers.length, watches: stores[s].watches.length, inits: stores[s].inits.length,
  specials: stores[s].specials.map((sp) => sp.module)
}])), null, 1));
console.log('plan written');
module.exports = { stores, storeOf, batchBlk, classAwayBlk, bridgeBlk, sameSwapBlk, sameswapMembers, pureMap, memberKind };
