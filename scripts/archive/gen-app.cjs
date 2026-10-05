#!/usr/bin/env node
'use strict';
/* gen-app.cjs — 產出 App.vue（模板原樣＋712 綁定）＋composition test。
 * 用法：node scripts/gen-app.cjs
 */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const E = require('./gen-emit.cjs');
const { STORES, FACTORY_STORE } = B;
const ROOT = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\manifest.json', 'utf8'));
const inv = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\inv.json', 'utf8'));
const invByName = {};
for (const e of inv) if (!invByName[e.name]) invByName[e.name] = e;
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const storeOf = E.storeOf;
const memberKind = E.memberKind;
const unionNames = new Set(B.unionWrappers.map((w) => w.name));
const allFactoryNames = new Set(Object.keys(FACTORY_STORE));

// ---------- 模板抽取 ----------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appOpen = html.indexOf('<div id="app"');
if (appOpen < 0) throw new Error('找不到 #app');
const openEnd = html.indexOf('>', appOpen) + 1;
let dd = 1, j = openEnd;
while (j < html.length && dd > 0) {
  const o = html.indexOf('<div', j);
  const c = html.indexOf('</div>', j);
  if (c < 0) throw new Error('div 未閉合');
  if (o >= 0 && o < c) { dd++; j = o + 4; } else { dd--; j = c + 6; }
}
const template = html.slice(openEnd, j - 6); // inner：外層 #app 掛載點留給 index.html／main 掛載目標，避免 id 重複（j 含結尾 </div> 本身 6 字）
console.log('template lines:', template.split('\n').length);

// ---------- 綁定分類 ----------
const pureMap = {};
{
  const pureRe = /const \{([\s\S]*?)\} = window\.(UiLineTemplate|UiListHelpers|UiStyle);/g;
  let pm;
  while ((pm = pureRe.exec(app))) {
    if (/;/.test(pm[1])) { pureRe.lastIndex = pm.index + 7; continue; } // 跨語句污染：回退重掃
    for (const n of pm[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (!pureMap[n[1]]) {
        // 存在性校驗（沿用 gen-final 規則）
        pureMap[n[1]] = pm[2];
      }
    }
  }
}
function rhsOf(name) {
  const e = invByName[name];
  if (!e) return '';
  const slice = app.split('\n').slice(e.line - 1, e.endLine).join('\n');
  const m = slice.match(/=\s*([\s\S]{0,30})/);
  return m ? m[1] : '';
}
// v1 use-site（script .value／template v-model）：store 成員是否為 ref 的最終依據
// （memberKind 來自模組掃描，會被 `var x = deps.x` 誤導，不可作為 store 成員依據）
const { maskCode: maskCodeApp } = require('./mask.cjs');
const v1refUsed = new Set();
for (const m of maskCodeApp(app).matchAll(/(?<![.\w$"'])([A-Za-z_][A-Za-z0-9_]*)\.value/g)) v1refUsed.add(m[1]);
const v1modelUsed = new Set();
for (const m of html.matchAll(/v-model(?::[A-Za-z0-9_-]+)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) v1modelUsed.add(m[1]);
function kindOf(name) {
  if (unionNames.has(name) || allFactoryNames.has(name) || name === 'needUiAdmin') return 'fn';
  if (['saveScheduleCell', 'clearScheduleCell', 'updateTeacherBaseHours', 'fillFixedOvertimeFromCurrentSchedule', 'fillFixedOvertimeForAllTeachers'].includes(name)) return 'fn';
  if (pureMap[name]) return 'pure';
  const own = ownerOf(name);
  if (own && E.stores[own] && E.stores[own].state) {
    const st = E.stores[own].state.find((e) => e.name === name);
    if (st) {
      const head = app.split('\n').slice(st.line - 1, st.line + 1).join('\n');
      const mm = head.match(/=\s*(ref|computed|reactive|function|async function)/);
      if (mm && ['ref', 'computed', 'reactive'].includes(mm[1])) return 'ref';
      if (mm && ['function', 'async function'].includes(mm[1])) return 'fn';
      // plain const／箭頭函式：v1 用法決定（.value／v-model 即 ref，其餘沿 v1 快照語義）
      if (v1refUsed.has(name) || v1modelUsed.has(name)) return 'ref';
      return 'plain';
    }
  }
  if (v1refUsed.has(name) || v1modelUsed.has(name)) return 'ref';
  if (memberKind[name]) return memberKind[name] === 'ref' ? 'ref' : 'fn';
  const e = invByName[name];
  if (!e) return 'unknown';
  if (e.kind === 'function' || e.kind === 'async function') return 'fn';
  const rhs = rhsOf(name);
  if (/^(ref|computed|reactive)\(/.test(rhs)) return 'ref';
  return 'plain';
}
const missing = [];
const perStore = {};
for (const s of STORES) perStore[s] = { fn: [], ref: [], plain: [] };
const pureGroups = {};
// 特殊成員歸屬（與 gen-emit SPECIAL 一致）
const batchNames2 = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\batch-names.json', 'utf8'));
for (const n of batchNames2) E.storeOf[n] = 'submit';
function membersOfCode(code) {
  const r = [];
  for (const m of code.matchAll(/const \{([\s\S]*?)\} = /g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) r.push(x[1]);
  }
  return [...new Set(r)];
}
{
  const blk = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const grab = (ns, store) => {
    const idx = blk.indexOf('window.' + ns + '.create({');
    const hs = blk.lastIndexOf('const {', idx);
    const he = blk.indexOf('} = ', hs);
    for (const m of blk.slice(hs, he).matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (m[1] !== 'const') E.storeOf[m[1]] = store;
    }
  };
  grab('UiClassAwayAdmin', 'backoffice');
  grab('UiMutualBridge', 'mutual');
}
function ownerOf(n) {
  if (B.wrapperStore[n]) return B.wrapperStore[n];
  if (E.storeOf[n]) return E.storeOf[n];
  if (['saveScheduleCell', 'clearScheduleCell', 'updateTeacherBaseHours', 'fillFixedOvertimeFromCurrentSchedule', 'fillFixedOvertimeForAllTeachers'].includes(n)) return 'admin';
  return null;
}
for (const n of manifest.retNames) {
  if (pureMap[n]) {
    (pureGroups[pureMap[n]] = pureGroups[pureMap[n]] || []).push(n);
    continue;
  }
  const own = ownerOf(n);
  if (!own || !perStore[own]) { missing.push(n); continue; }
  const k = kindOf(n);
  if (k === 'unknown') { missing.push(n + '(?)'); continue; }
  perStore[own][k === 'ref' ? 'ref' : k === 'fn' ? 'fn' : 'plain'].push(n);
}
console.log('missing bindings:', missing.length, missing.slice(0, 20).join(','));

// ---------- inits 順序（與 gen-emit2 同源：mounted → onMounted，setup → App setup 期直調）----------
const E2 = require('./gen-emit2.cjs');
const initCallsMounted = [];
const initCallsSetup = [];
for (const s of STORES) {
  for (const c of (E2.out[s].initCalls || [])) {
    if (c.kind === 'setup') initCallsSetup.push({ store: s, fn: c.fn, line: c.line });
    else initCallsMounted.push({ store: s, fn: c.fn, line: c.line });
  }
}
initCallsSetup.sort((a, b) => a.line - b.line);
initCallsMounted.sort((a, b) => a.line - b.line);

// 模板直引的 special 成員：v1 return 沒有，但 template 經 setup scope 取用（如 sameswap 家族）。
// 未補會在渲染該分支時 warn「not defined on instance」。kind 沿 kindOf 精神（.value／v-model 即 ref）。
{
  const specialOwner = {};
  for (const s of STORES) for (const n of (E2.out[s].specialMembers || [])) specialOwner[n] = s;
  for (const n of (E2.sameswapMembers || [])) specialOwner[n] = 'timetable';
  // 模板運算式識別字集合（屬性引號內的運算式＋{{}}；字串字面量先遮掉）
  const tplUsed = new Set();
  const stripQ = (s) => s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
  for (const m of template.matchAll(/v-[a-z-]+(?:=[^\s>]+)?="([^"]*)"|:([a-zA-Z][\w-]*)(?:\.[a-z]+)*="([^"]*)"|@[\w.-]+="([^"]*)"|\{\{\s*([\s\S]*?)\s*\}\}/g)) {
    const expr = stripQ([m[1], m[3], m[4], m[5]].find((x) => x !== undefined) || '');
    for (const x of expr.matchAll(/(?<![.\w$])([A-Za-z_][A-Za-z0-9_]*)/g)) tplUsed.add(x[1]);
  }
  const already = new Set(manifest.retNames);
  // special 成員 kind 以模組 create 內宣告為準（var NAME = ref(/computed( 即 ref；函式即 fn）
  const SPECIAL_MOD = { submit: 'ui-activity.js', backoffice: 'ui-activity.js', mutual: 'ui-activity.js', timetable: 'ui-same-period-swap.js' };
  const modSrcCache = {};
  const specialKind = (store, n) => {
    const f = SPECIAL_MOD[store];
    if (!f) return null;
    if (!modSrcCache[f]) modSrcCache[f] = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', f), 'utf8');
    const src = modSrcCache[f];
    const m = src.match(new RegExp('(?:var|let|const)\\s+' + n + '\\s*=\\s*(ref\\(|computed\\(|reactive\\(|[^;]{0,60})'));
    if (!m) return null;
    if (/^(ref|computed|reactive)\(/.test(m[1])) return 'ref';
    return 'fn';
  };
  const extra = [];
  for (const [n, s] of Object.entries(specialOwner)) {
    if (already.has(n)) continue;
    if (!tplUsed.has(n)) continue;
    let k = specialKind(s, n);
    if (!k) k = (v1refUsed.has(n) || v1modelUsed.has(n)) ? 'ref' : 'fn';
    perStore[s][k === 'ref' ? 'ref' : 'fn'].push(n);
    extra.push(s + '.' + n + '(' + k + ')');
  }
  console.log('template special extras:', extra.length, extra.join(','));
}

// ---------- App.vue ----------
const useName = {};
for (const s of STORES) useName[s] = 'use' + s[0].toUpperCase() + s.slice(1) + 'Store';
const L = [];
L.push('<template>');
L.push(template);
L.push('</template>');
L.push('');
L.push('<script setup>');
L.push("import { onMounted } from 'vue';");
L.push("import { storeToRefs } from 'pinia';");
for (const s of STORES) L.push('import { ' + useName[s] + " } from './stores/" + s + ".js';");
const NS_FILE = { UiLineTemplate: 'ui-line-template.js', UiListHelpers: 'ui-list-helpers.js', UiStyle: 'ui-style.js' };
for (const ns of Object.keys(pureGroups)) L.push('import { ' + ns + " } from './modules/" + NS_FILE[ns] + "';");
for (const s of STORES) L.push('const ' + s + 'Store = ' + useName[s] + '();');
for (const s of STORES) {
  const g = perStore[s];
  if (g.fn.length) L.push('const { ' + g.fn.sort().join(', ') + ' } = ' + s + 'Store;');
  if (g.plain.length) L.push('const { ' + g.plain.sort().join(', ') + ' } = ' + s + 'Store;');
  if (g.ref.length) L.push('const { ' + g.ref.sort().join(', ') + ' } = storeToRefs(' + s + 'Store);');
}
for (const ns of Object.keys(pureGroups)) {
  L.push('const { ' + [...new Set(pureGroups[ns])].sort().join(', ') + ' } = ' + ns + ';');
}
L.push('onMounted(() => {');
for (const c of initCallsMounted) L.push('  ' + c.store + 'Store.' + c.fn + '();');
L.push('});');
if (initCallsSetup.length) {
  // immediate watcher 語義：全 store 就緒後、首屏渲染前註冊（v1 setup 期 immediate 等價點）
  const insertAt = L.findIndex((x) => x.startsWith('onMounted('));
  L.splice(insertAt, 0, ...initCallsSetup.map((c) => c.store + 'Store.' + c.fn + '();'));
}
L.push('</script>');
L.push('');
fs.writeFileSync(path.join(__dirname, '..', 'src', 'App.vue'), L.join('\n'));
console.log('wrote App.vue, setup-inits:', initCallsSetup.map((c) => c.store + '.' + c.fn).join(','), 'mounted-inits:', initCallsMounted.map((c) => c.store + '.' + c.fn).join(','));
// App 映射表（composition test 用：name → store｜pure）
const appmap = {};
for (const s of STORES) {
  const g = perStore[s];
  for (const n of [...g.fn, ...g.plain, ...g.ref]) appmap[n] = s;
}
for (const ns of Object.keys(pureGroups)) {
  for (const n of pureGroups[ns]) appmap[n] = 'pure:' + ns;
}
fs.writeFileSync(path.join(__dirname, '..', 'tests', '__appmap.json'), JSON.stringify(appmap, null, 1));

// ---------- composition test ----------
const boundCheck = [];
for (const s of STORES) {
  const g = perStore[s];
  for (const n of [...g.fn, ...g.plain, ...g.ref]) boundCheck.push(n);
}
for (const ns of Object.keys(pureGroups)) for (const n of pureGroups[ns]) boundCheck.push(n);
const testSrc = `import { test, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
const script = appSrc.slice(appSrc.indexOf('<script setup>'), appSrc.indexOf('</script>'));
function boundNames() {
  const out = new Set();
  for (const m of script.matchAll(/const \\{([^}]*)\\} = /g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(x[1]);
  }
  return out;
}
const RET = ${JSON.stringify(manifest.retNames)};
test('composition：712 綁定全數可達', () => {
  const bound = boundNames();
  const missing = RET.filter((n) => !bound.has(n));
  expect(missing).toEqual([]);
});
test('composition：映射名皆為其 store 實際回傳成員', () => {
  const appmap = JSON.parse(fs.readFileSync(path.join(here, '__appmap.json'), 'utf8'));
  const storeReturns = JSON.parse(fs.readFileSync(path.join(here, '__storeReturns.json'), 'utf8'));
  const bad = [];
  for (const n of RET) {
    const o = appmap[n];
    if (!o) { bad.push(n + '(無映射)'); continue; }
    if (o.startsWith('pure:')) continue;
    if (!(storeReturns[o] || []).includes(n)) bad.push(n + '(store ' + o + ' 未回傳)');
  }
  expect(bad).toEqual([]);
});
test('composition：模板用到的 store 成員全數有綁（防 not defined on instance）', () => {
  const tpl = appSrc.slice(0, appSrc.indexOf('<script setup>'));
  const tplUsed = new Set();
  const stripQ = (s) => s.replace(/'(?:[^'\\\\\\n]|\\\\.)*'/g, "''").replace(/"(?:[^"\\\\\\n]|\\\\.)*"/g, '""').replace(/\`(?:[^\`\\\\]|\\\\.)*\`/g, '\`\`');
  for (const m of tpl.matchAll(/v-[a-z-]+(?:=[^\\s>]+)?="([^"]*)"|:([a-zA-Z][\\w-]*)(?:\\.[a-z]+)*="([^"]*)"|@[\\w.-]+="([^"]*)"|\\{\\{\\s*([\\s\\S]*?)\\s*\\}\\}/g)) {
    const expr = stripQ([m[1], m[3], m[4], m[5]].find((x) => x !== undefined) || '');
    for (const x of expr.matchAll(/(?<![.\\w$])([A-Za-z_][A-Za-z0-9_]*)/g)) tplUsed.add(x[1]);
  }
  const bound = boundNames();
  const storeReturns = JSON.parse(fs.readFileSync(path.join(here, '__storeReturns.json'), 'utf8'));
  const known = new Set();
  for (const s of Object.keys(storeReturns)) for (const n of storeReturns[s]) known.add(n);
  const bad = [...tplUsed].filter((n) => known.has(n) && !bound.has(n));
  expect(bad).toEqual([]);
});
test('composition：stores 無 null／undefined 成員（storeToRefs 全量迭代前提）', async () => {
  setActivePinia(createPinia());
  const { toRaw } = await import('vue');
  const bad = [];
  const mods0 = {};
  ${STORES.map((s) => "mods0." + s + " = await import('../src/stores/" + s + ".js');").join('\n  ')}
  const apis0 = [];
  ${STORES.map((s) => "apis0.push(['" + s + "', mods0." + s + "." + useName[s] + "()]);").join('\n  ')}
  for (const [name, store] of apis0) {
    for (const k of Object.keys(toRaw(store))) {
      const v = toRaw(store)[k];
      if (v === null || v === undefined) bad.push(name + '.' + k);
    }
  }
  expect(bad).toEqual([]);
}, 30000);
test('composition：14 stores 實例化＋factory 接線', async () => {
  setActivePinia(createPinia());
  const mods = {};
  ${STORES.map((s) => "mods." + s + " = await import('../src/stores/" + s + ".js');").join('\n  ')}
  mods.gas = await import('../src/stores/gas.js');
  const apis = [];
  ${STORES.map((s) => "apis.push(['" + s + "', mods." + s + "." + useName[s] + "()]);").join('\n  ')}
  apis.push(['gas', mods.gas.useGasStore()]);
  for (const [name, store] of apis) {
    expect(store, name + ' 空 store').toBeTruthy();
  }
  // factory 接線證明：每座 getApi 跑一次（含 ensureUiAdminApi／getMutualPanelApi）
  const FACTORY_CALLS = ${JSON.stringify(Object.fromEntries(STORES.map((s) => [s, E.stores[s].factories.map((f) => f.name)])))};
  for (const [name, store] of apis) {
    for (const fn of FACTORY_CALLS[name] || []) {
      expect(typeof store[fn], name + '.' + fn).toBe('function');
      const t0 = Date.now();
      await Promise.race([
        (async () => store[fn]())(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('HANG: ' + name + '.' + fn)), 8000))
      ]);
      console.log('factory ok', name + '.' + fn, Date.now() - t0 + 'ms');
    }
  }
}, 60000);
`;
fs.writeFileSync(path.join(__dirname, '..', 'tests', 'composition.test.js'), testSrc);
console.log('wrote composition.test.js');
