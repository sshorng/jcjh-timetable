#!/usr/bin/env node
'use strict';
/* gen-emit2.cjs — 產出 14 stores＋App.vue＋composition test。用法見 gen-emit.cjs 檔頭。 */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const E = require('./gen-emit.cjs');
const {
  STORES, STORE_VAR, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  PURE_RETURN, sliceLines, dropGuards, GLOBALS, VUE_USE, identifiers, app, appLines, manifest
} = B;
const { stores, storeOf, pureMap, memberKind } = E;
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');
const retSet = new Set(manifest.retNames);
const useName = {};
for (const s of STORES) useName[s] = 'use' + s[0].toUpperCase() + s.slice(1) + 'Store';

// ---------- 特殊塊正文 ----------
function eagerBlock(ns) {
  const idx = app.indexOf('window.' + ns + '.create({');
  if (idx < 0) throw new Error('no create site: ' + ns);
  const lineStart = app.lastIndexOf('\n', idx) + 1;
  const headM = app.slice(Math.max(0, lineStart - 800), idx).match(/const (\{[\s\S]*?\}|[A-Za-z_][A-Za-z0-9_]*) =\s*$/);
  const stmtStart = Math.max(0, lineStart - 800) + (headM ? headM.index : 0);
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
  return app.slice(stmtStart, e).replace(new RegExp('window\\.' + ns + '\\.create\\('), ns + '.create(');
}
function membersOf(block) {
  const m = block.match(/const \{([\s\S]*?)\} = /);
  if (!m) return [];
  return [...m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]);
}
const batchBlk = eagerBlock('UiBatchPanel');
const classAwayBlk = eagerBlock('UiClassAwayAdmin');
const bridgeBlk = eagerBlock('UiMutualBridge');
const sameSwapBlk = eagerBlock('UiSamePeriodSwap');
const sameswapMembers = [...new Set([...app.matchAll(/samePeriodSwapUI\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
for (const n of membersOf(batchBlk)) storeOf[n] = 'submit';
for (const n of membersOf(classAwayBlk)) storeOf[n] = 'backoffice';
for (const n of membersOf(bridgeBlk)) storeOf[n] = 'mutual';
for (const n of sameswapMembers) storeOf[n] = 'timetable';
const SPECIAL_MEMBERS = {
  submit: membersOf(batchBlk), backoffice: membersOf(classAwayBlk),
  mutual: membersOf(bridgeBlk), timetable: sameswapMembers
};
const SPECIAL_BLOCK = { submit: batchBlk, backoffice: classAwayBlk, mutual: bridgeBlk, timetable: sameSwapBlk };
const SPECIAL_MODULE = { submit: 'UiBatchPanel', backoffice: 'UiClassAwayAdmin', mutual: 'UiMutualBridge', timetable: 'UiSamePeriodSwap' };

// ---------- watch bodies ----------
const watchAssign = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-assign.json', 'utf8'));
const watchBodies = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-bodies.json', 'utf8'));
const watches = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watches.json', 'utf8'));
const bodyByLine = {};
watches.forEach((w, i) => { bodyByLine[w[1]] = watchBodies[i].body; });

// ---------- factories 全文 ----------
const factoriesFull = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\factories.json', 'utf8'));
const fmap = {};
for (const f of factoriesFull) fmap[f.name] = f.body;

// ---------- 每 store 組裝 ----------
const VUE_IMPORTABLE = new Set(['ref', 'computed', 'watch', 'reactive', 'nextTick']);
const out = {};
for (const S of STORES) {
  const st = stores[S];
  const codeParts = [];
  const declared = new Set();
  const returned = [];
  const decl = (code, names) => {
    codeParts.push(code);
    for (const n of names) declared.add(n);
    for (const n of names) returned.push(n);
  };
  // state
  for (const e of st.state) {
    decl(dropGuards(sliceLines(e.line, e.endLine)), [e.name]);
  }
  // factories
  const factoryModules = new Set();
  const dropIfBlock = (body, marker) => {
    // 刪除含 marker 的 if (...) {...}( else {...}) 整塊（brace-matched，含 else）
    let idx = body.indexOf(marker);
    while (idx >= 0) {
      const ls = body.lastIndexOf('\n', idx) + 1;
      const ifIdx = body.indexOf('if', ls);
      if (ifIdx < 0 || ifIdx > idx) break;
      let k = body.indexOf('{', ifIdx), d = 0, j = k, ins = null;
      for (; j < body.length; j++) {
        const ch = body[j];
        if (ins) {
          if (ch === '\\') j++;
          else if (ch === ins) ins = null;
        } else if (ch === "'" || ch === '"' || ch === '`') ins = ch;
        else if (ch === '{') d++;
        else if (ch === '}') { d--; if (d === 0) break; }
      }
      let e = j + 1;
      const rest = body.slice(e).match(/^\s*else\s*\{/);
      if (rest) {
        let d2 = 0, j2 = e + rest[0].length - 1, ins2 = null;
        for (; j2 < body.length; j2++) {
          const ch = body[j2];
          if (ins2) {
            if (ch === '\\') j2++;
            else if (ch === ins2) ins2 = null;
          } else if (ch === "'" || ch === '"' || ch === '`') ins2 = ch;
          else if (ch === '{') d2++;
          else if (ch === '}') { d2--; if (d2 === 0) break; }
        }
        e = j2 + 1;
      }
      while (body[e] === '\n' || body[e] === '\r') e++;
      body = body.slice(0, ls) + body.slice(e);
      idx = body.indexOf(marker);
    }
    return body;
  };
  const dropBlock = (body, marker) => {
    // 刪除含 marker 的 if {...} 整塊（brace-matched）
    let idx = body.indexOf(marker);
    while (idx >= 0) {
      const ls = body.lastIndexOf('\n', idx) + 1;
      let k = body.indexOf('{', idx), d = 0, j = k, ins = null;
      for (; j < body.length; j++) {
        const ch = body[j];
        if (ins) {
          if (ch === '\\') j++;
          else if (ch === ins) ins = null;
        } else if (ch === "'" || ch === '"' || ch === '`') ins = ch;
        else if (ch === '{') d++;
        else if (ch === '}') { d--; if (d === 0) break; }
      }
      let e = j + 1;
      while (body[e] === '\n' || body[e] === '\r') e++;
      body = body.slice(0, ls) + body.slice(e);
      idx = body.indexOf(marker);
    }
    return body;
  };
  for (const f of st.factories) {
    let body = fmap[f.name];
    if (f.name === 'ensureUiAdminApi') {
      body = dropIfBlock(body, 'window.ensureUiAdmin');
      body = dropIfBlock(body, '!window.UiAdmin');
      body = body.replace(/window\.UiAdmin\.create\(/, 'UiAdmin.create(');
      factoryModules.add('UiAdmin');
    } else if (f.name === 'getMutualPanelApi') {
      body = dropIfBlock(body, 'ensureUiMutual');
      body = dropIfBlock(body, '!window.UiMutualPanelState');
      body = dropIfBlock(body, 'ensureDomainActivityCover');
      body = body.replace(/window\.UiMutualPanelState\.create\(/, 'UiMutualPanelState.create(');
      factoryModules.add('UiMutualPanelState');
    } else {
      const mod = MODULE_OF_FACTORY[f.name];
      body = body.replace(new RegExp('window\\.' + mod + '\\.create\\('), mod + '.create(');
      body = body.replace(new RegExp('if \\(!window\\.' + mod + '\\)'), 'if (!' + mod + ')');
      factoryModules.add(mod);
    }
    decl(body, [f.name]);
  }
  // specials（eager）：gen-final 負責發射本體＋sameswap 解構；此處只登記成員＋模組
  const specialMembers = SPECIAL_MEMBERS[S] || [];
  if (SPECIAL_BLOCK[S]) {
    for (const n of specialMembers) { declared.add(n); returned.push(n); }
    factoryModules.add(SPECIAL_MODULE[S]);
  }
  // wrappers
  for (const w of st.wrappers) {
    decl(dropGuards(w.body), [w.name]);
  }
  // watches + inits（v1 語義保持：onMounted→mounted init；其餘 watch 註冊會立即求值 source，
  // 一律延至 App setup 期 init——與 setup 期同為同步 pre-render 區間，callback flush 時機不變）
  const inits = [];
  const initImmediates = [];
  const initCalls = [];
  let mountedCount = 0;
  let immediateCount = 0;
  for (const w of watchAssign.filter((x) => x.owner === S)) {
    const body = bodyByLine[w.line];
    if (w.kind === 'onMounted') {
      mountedCount += 1;
      const initName = 'init' + S[0].toUpperCase() + S.slice(1) + mountedCount;
      const blines = body.split('\n');
      const first = blines[0].replace(/\r$/, '');
      let m = first.match(/^    onMounted\((async )?\(\) => \{$/);
      if (m) {
        blines[0] = '    ' + (m[1] ? 'async ' : '') + 'function ' + initName + '() {';
        const lastIdx = blines.length - 1;
        blines[lastIdx] = blines[lastIdx].replace(/\}\);?\s*$/, '}');
      } else {
        // 單行形：onMounted(() => { ... });
        m = first.match(/^    onMounted\((async )?\(\) => \{(.*)\}\);?\s*$/);
        if (!m) throw new Error('onMounted 形狀不符 L' + w.line);
        blines[0] = '    ' + (m[1] ? 'async ' : '') + 'function ' + initName + '() { ' + m[2].trim() + ' }';
        blines.length = 1;
      }
      decl(blines.join('\n'), [initName]);
      inits.push(initName);
      initCalls.push({ fn: initName, line: w.line, kind: 'mounted' });
    } else {
      // watch 註冊即求值 source（含 computed）：一律搬入 App setup 期 init（全 store 就緒後註冊）
      immediateCount += 1;
      const initName = 'initImmediate' + S[0].toUpperCase() + S.slice(1) + immediateCount;
      decl('    function ' + initName + '() {\n' + body + '\n    }', [initName]);
      inits.push(initName);
      initCalls.push({ fn: initName, line: w.line, kind: 'setup' });
      initImmediates.push(initName);
    }
  }
  out[S] = { codeParts, declared, returned, factoryModules, specialMembers, inits, initImmediates, initCalls };
}
fs.writeFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\emit2-check.json', JSON.stringify(Object.fromEntries(STORES.map((s) => [s, out[s].returned.length])), null, 1));
console.log('assembled');
module.exports = { out, useName, sameswapMembers };
