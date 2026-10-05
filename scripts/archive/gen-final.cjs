#!/usr/bin/env node
'use strict';
/* gen-final.cjs — 寫出 14 stores＋App.vue＋composition test。
 * 用法：node scripts/gen-final.cjs
 */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const E2 = require('./gen-emit2.cjs');
const EP = require('./gen-emit.cjs');
const storeOf = EP.storeOf; // 唯一真相（含 AMBIG／wrapper／MOVE_LETS／特殊成員覆寫）
// GasApi.createClient 19 成員 → gas store（v1 setup 多行解構，inv 不可見；此處顯式登記）
// 注意：須在 candidates 建構前完成（foreign 分析依賴）
const GAS_MEMBERS = ['callGasApi', 'fetchInitialData', 'fetchMetaData', 'fetchPublicClassData', 'fetchPendingOnly', 'fetchRequestsDelta', 'fetchHistoryMonth', 'fetchMatchCandidates', 'fetchMutualQuotaLedger', 'fetchQuotaSpendPreview', 'decodeJwt', 'isTokenExpired', 'isTokenExpiringSoon', 'formatError', 'clearSWR', 'cancelAll', 'parseAllowedHd', 'isEmailDomainAllowed', 'DEFAULT_ALLOWED_HD'];
for (const n of GAS_MEMBERS) storeOf[n] = 'gas';
const Mb = require('./gen-emit.cjs');
const {
  STORES, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  identifiers, app, manifest
} = B;
const { out, useName } = E2;
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');
const appLines = app.split('\n');
// v1 全域 .value use-site（special／未知成員 ref-vs-fn 判定用；mask 後比對，避開字串註解）
const { maskCode: maskCodeTop } = require('./mask.cjs');
const v1refUsed = new Set();
for (const m of maskCodeTop(app).matchAll(/(?<![.\w$"'])([A-Za-z_][A-Za-z0-9_]*)\.value/g)) v1refUsed.add(m[1]);
const retSet = new Set(manifest.retNames);
const inv = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\inv.json', 'utf8'));
const invByName = {};
for (const e of inv) invByName[e.name] = e;
const unionByName = {};
for (const w of B.unionWrappers) unionByName[w.name] = w;
// classAway／bridge 成員（destructure 抽取）
function membersOfCode(code) {
  const r = [];
  for (const m of code.matchAll(/const \{([\s\S]*?)\} = /g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) r.push(x[1]);
  }
  return [...new Set(r)];
}
const memberOwner = {};
const batchNames = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\batch-names.json', 'utf8'));
for (const n of batchNames) memberOwner[n] = 'submit';
// pure 名→模組（setup-top destructure；逐名以模組源碼存在性校驗，防跨區誤捕）
const pureMap = {};
{
  const modSrc = {
    UiLineTemplate: fs.readFileSync(path.join(ROOT, 'v2', 'src', 'modules', 'ui-line-template.js'), 'utf8'),
    UiListHelpers: fs.readFileSync(path.join(ROOT, 'v2', 'src', 'modules', 'ui-list-helpers.js'), 'utf8'),
    UiStyle: fs.readFileSync(path.join(ROOT, 'v2', 'src', 'modules', 'ui-style.js'), 'utf8')
  };
  const JS_KW = new Set('break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,in,instanceof,new,return,super,switch,this,throw,try,typeof,var,void,while,with,yield,true,false,null,undefined'.split(','));
  const pureRe = /const \{([\s\S]*?)\} = window\.(UiLineTemplate|UiListHelpers|UiStyle);/g;
  let pm;
  while ((pm = pureRe.exec(app))) {
    if (/;/.test(pm[1])) { pureRe.lastIndex = pm.index + 7; continue; } // 跨語句污染：回退重掃
    for (const n of pm[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const name = n[1];
      if (JS_KW.has(name)) continue;
      const src = modSrc[pm[2]];
      const defined = new RegExp('(^|[^A-Za-z0-9_])' + name + '\\s*[:=]').test(src);
      if (defined) pureMap[name] = pm[2];
    }
  }
}
// 模組成員 kind（Mb.memberKind）
const memberKind = Mb.memberKind || {};

// ---------- 特殊 eager 塊 ----------
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
const SPECIAL_DEF = {
  submit: { ns: 'UiBatchPanel', file: 'ui-activity.js' },
  backoffice: { ns: 'UiClassAwayAdmin', file: 'ui-activity.js' },
  mutual: { ns: 'UiMutualBridge', file: 'ui-activity.js' },
  timetable: { ns: 'UiSamePeriodSwap', file: 'ui-same-period-swap.js' }
};
const specialCode = {}, specialMembers = {}, specialModules = new Set();
for (const s of Object.keys(SPECIAL_DEF)) {
  const { ns, file } = SPECIAL_DEF[s];
  specialCode[s] = eagerBlock(ns);
  specialModules.add(ns);
  if (s === 'timetable') {
    specialMembers[s] = [...new Set([...app.matchAll(/samePeriodSwapUI\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
  } else {
    specialMembers[s] = membersOfCode(specialCode[s]);
  }
  for (const n of specialMembers[s]) { memberOwner[n] = s; storeOf[n] = s; }
}
// mutual 追加 _getMutualImportEventId 賦值行（排除 let 宣告行本身）
{
  const m = app.match(/^    _getMutualImportEventId = \(\) =>.*$/m);
  if (!m) throw new Error('找不到 _getMutualImportEventId 賦值行');
  specialCode.mutual += '\n' + m[0];
}

const VUE_USE = new Set(['ref', 'computed', 'watch', 'reactive', 'nextTick']);
const GLOBALS = B.GLOBALS;
// PURE 轉發別名（定義須在 foreign 循環前；使用處在下方 rewriteJobs 組裝）
const PURE_FORWARD = {
  toLocalDateStr: ['DateUtils', 'toLocalDateStr'],
  getPeriodTimeSpan: ['DateUtils', 'getPeriodTimeSpan'],
  getWeekDayText: ['DateUtils', 'getWeekDayText'],
  formatDateMMDD: ['DateUtils', 'formatDateMMDD'],
  getTodayString: ['DateUtils', 'getTodayString'],
  sheetRequestToFront: ['FieldMap', 'mapRequest']
};
const factoryNames = new Set(Object.keys(FACTORY_STORE).filter((k) => (B.unionWrappers, true)));
const allFactoryNames = new Set([...Object.keys(FACTORY_STORE)]);
const wrapperNames = new Set(B.unionWrappers.map((w) => w.name));

// ---------- 寫 stores ----------
const storeReturns = {}; // store -> [names]
for (const S of STORES) {
  const o = out[S];
  // _setupReady 宣告是 v1 機制殘留：不搬移（守衛行已由 dropGuards 清除）
  o.codeParts = o.codeParts.filter((c) => !/const _setupReady = ref\(false\);/.test(c));
  o.declared = new Set([...o.declared].filter((n) => n !== '_setupReady'));
  o.returned = o.returned.filter((n) => n !== '_setupReady');
  // v1:329：縮排髒掉的 setup 層 const（5 空格，inv 漏掃；僅 session 使用）→ 手動補入 session（內部常數，不 return）
  if (S === 'session') {
    o.codeParts.push('    ' + appLines[328].trim());
    o.declared.add('VALID_ADMIN_SUBTABS');
  }
  // 5022-5026：縮排髒掉的頂層 needUiAdmin 包裝（inv／union 皆因錨點漏掃，手動補入 admin）
  if (S === 'admin') {
    const extra = [];
    for (let i = 5021; i <= 5025; i++) extra.push('    ' + appLines[i].trim());
    o.codeParts.push(extra.join('\n'));
    for (const n of ['saveScheduleCell', 'clearScheduleCell', 'updateTeacherBaseHours', 'fillFixedOvertimeFromCurrentSchedule', 'fillFixedOvertimeForAllTeachers']) {
      o.declared.add(n); o.returned.push(n);
    }
  }
  const st = EP.stores[S];
  const parts = [...o.codeParts];
  if (specialCode[S]) parts.push(specialCode[S]);
  if (S === 'timetable') {
    parts.push('    const { ' + specialMembers.timetable.join(', ') + ' } = samePeriodSwapUI;');
  }
  // R-WINDOW：v2 無全域腳本，移植命名空間 window.NS → NS（import 由 foreign 分析自動補；
  // ensure／__ 鉤子／瀏覽器 API／window[...] 保持原樣）
  const NS_WORDS = [...Object.keys(MODULE_FILE), ...Object.keys(DOMAIN_FILE), 'ExportAccounting', 'ExportPeriod8Accounting'];
  for (let i = 0; i < parts.length; i++) {
    parts[i] = parts[i].replace(/window\.([A-Za-z_][A-Za-z0-9_]*)/g, (m0, name) => (NS_WORDS.includes(name) ? name : m0));
  }
  // ---- R-LETS：跨 store 可變 let 搬家＋accessor ----
  const extraReturns = [];
  const forceForeign = {}; // owner -> Set(names)
  const foreignUse = (own, n) => { (forceForeign[own] = forceForeign[own] || new Set()).add(n); };
  if (S === 'data') {
    // 3 lets 搬去 output（刪宣告）；watch 讀處改 isReportNavigating()
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\s*let (monthlyReportCalculationId|monthlyReportLastCalculationKey|accountingPeriodNavigation) = /.test(parts[i])) {
        parts.splice(i, 1);
      }
    }
    for (let i = 0; i < parts.length; i++) {
      if (/\baccountingPeriodNavigation\b/.test(parts[i])) {
        parts[i] = parts[i].replace(/\baccountingPeriodNavigation\b/g, 'isReportNavigating()');
      }
    }
    foreignUse('output', 'isReportNavigating');
    parts.push('    const nextDataLoadSeq = () => { _dataLoadSeq += 1; return _dataLoadSeq; };');
    extraReturns.push('nextDataLoadSeq');
  }
  if (S === 'output') {
    // 3 lets 已由 ownership 搬入（gen-emit state）；此處只補 accessor
    parts.push('    const isReportNavigating = () => accountingPeriodNavigation;');
    extraReturns.push('isReportNavigating');
    // R-PRINT：ensurePrintReady 的 window.generateFormHtml 守衛在 v2 恆假→改走 getPrintApi
    for (let i = 0; i < parts.length; i++) {
      if (/const ensurePrintReady = async \(\) => \{/.test(parts[i]) && /列印模組尚未載入/.test(parts[i])) {
        parts[i] = '    const ensurePrintReady = async () => {\n      const a = getPrintApi();\n      if (!a) throw new Error(\'列印模組尚未載入\');\n    };';
      }
    }
  }
  if (S === 'backoffice') {
    for (let i = 0; i < parts.length; i++) {
      if (/_nextDataLoadSeq: \(\) => \{ _dataLoadSeq \+= 1; return _dataLoadSeq; \},/.test(parts[i])) {
        parts[i] = parts[i].replace('_nextDataLoadSeq: () => { _dataLoadSeq += 1; return _dataLoadSeq; },', '_nextDataLoadSeq: () => nextDataLoadSeq(),');
      }
    }
    foreignUse('data', 'nextDataLoadSeq');
  }
  if (S === 'history') {
    // R-HISTORY：v1 UiHistory.create 漏傳 loading／loadingMessage（v1 點完整學期即炸，為潛伏 bug）。
    // v2 補上（history 本已 import useSessionStore＋storeToRefs，無新增依賴）。
    for (let i = 0; i < parts.length; i++) {
      if (/UiHistory\.create\(\{/.test(parts[i]) && !/loading: storeToRefs\(useSessionStore\(\)\)\.loading/.test(parts[i])) {
        parts[i] = parts[i].replace(/(UiHistory\.create\(\{\r?\n\s*computed,)/, '$1\r\n        loading: storeToRefs(useSessionStore()).loading, loadingMessage: storeToRefs(useSessionStore()).loadingMessage,');
      }
    }
  }
  if (S === 'interaction') {
    // R-INTERACT：v1 UiInteraction.create 漏傳 substitutionRecords（v1 點任何紀錄列即炸，為潛伏 bug）。
    // v2 補上（interaction 本已 import useSessionStore＋storeToRefs，無新增依賴）。
    for (let i = 0; i < parts.length; i++) {
      if (/UiInteraction\.create\(\{/.test(parts[i]) && !/substitutionRecords: storeToRefs\(useSessionStore\(\)\)\.substitutionRecords/.test(parts[i])) {
        parts[i] = parts[i].replace(/(UiInteraction\.create\(\{\r?\n)/, '$1        substitutionRecords: storeToRefs(useSessionStore()).substitutionRecords,\r\n');
      }
    }
  }
  if (S === 'submit') {
    // R-SUBMIT：v1 UiSubmit.create 閉包引用的 setup 殘留（create 未傳；v1 按送出路徑即炸，為潛伏 bug）。
    // - buildLineInviteText：setup-local pure 本體（UiLineTemplate 解構已有）速記傳入；
    // - batchCompareWeekDates（data ref）、resolvePendingPeriods（homeroom fn wrapper）：跨店直連；
    // - isBatchExchangeFlow：自家 special（UiBatchPanel 結果）速記傳入。
    // 缺口以「模組 var X = deps.X − create 傳入」精確 diff 得出。
    for (let i = 0; i < parts.length; i++) {
      if (/UiSubmit\.create\(\{/.test(parts[i])) {
        if (!/buildLineInviteText[:,]/.test(parts[i])) {
          parts[i] = parts[i].replace(/(UiSubmit\.create\(\{\r?\n)/, '$1        buildLineInviteText,\r\n');
        }
        if (!/batchCompareWeekDates[:,]/.test(parts[i])) {
          parts[i] = parts[i].replace(/(UiSubmit\.create\(\{\r?\n)/, '$1        batchCompareWeekDates: storeToRefs(useDataStore()).batchCompareWeekDates,\r\n');
        }
        if (!/resolvePendingPeriods[:,]/.test(parts[i])) {
          parts[i] = parts[i].replace(/(UiSubmit\.create\(\{\r?\n)/, '$1        resolvePendingPeriods: useHomeroomStore().resolvePendingPeriods,\r\n');
        }
        if (!/isBatchExchangeFlow[:,]/.test(parts[i])) {
          parts[i] = parts[i].replace(/(UiSubmit\.create\(\{\r?\n)/, '$1        isBatchExchangeFlow,\r\n');
        }
      }
    }
    foreignUse('data', 'batchCompareWeekDates');
    foreignUse('homeroom', 'resolvePendingPeriods');
  }
  const code = parts.join('\n');
  const codeNoComments = code.replace(/\/\/[^\n]*/g, '');
  if (/_setupReady/.test(codeNoComments)) throw new Error(S + ' 殘留 _setupReady');
  // 候選集合精確匹配（避免 params／關鍵字噪音）：storeOf＋factory＋pure＋模組命名空間
  // toast 系為 v1 app-shell-utils 全域（showToast／showConfirm／installModalA11y／fallbackAvatarDataUri）
  const candidates = new Set([
    ...Object.keys(storeOf), ...Object.keys(FACTORY_STORE),
    ...Object.keys(pureMap), ...Object.keys(MODULE_FILE),
    ...Object.keys(DOMAIN_FILE), 'showToast', 'showConfirm', 'installModalA11y', 'fallbackAvatarDataUri',
    ...[...VUE_USE], 'defineStore'
  ]);
  const codeNoStrings = code.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``').replace(/\/\/[^\n]*/g, '');
  const usesBare = (name) => new RegExp('(?<![.\\w$\'"])' + name + '(?![\\w$])').test(codeNoStrings);
  const local = new Set(o.declared);
  for (const m of o.factoryModules) local.add(m);
  for (const n of (specialMembers[S] || [])) local.add(n);
  if (S === 'timetable') local.add('samePeriodSwapUI');
  if (S === 'mutual') local.add('_getMutualImportEventId');
  for (const f of st.factories) local.add(f.name);
  for (const n of extraReturns) local.add(n);
  if (S === 'output') {
    for (const n of ['monthlyReportCalculationId', 'monthlyReportLastCalculationKey', 'accountingPeriodNavigation', 'isReportNavigating']) local.add(n);
  }
  for (const n of (specialMembers[S] || [])) local.add(n);
  if (S === 'timetable') local.add('samePeriodSwapUI');
  if (S === 'mutual') local.add('_getMutualImportEventId');
  for (const f of st.factories) local.add(f.name);
  const SPECIAL_FILE = { submit: 'ui-activity.js', backoffice: 'ui-activity.js', mutual: 'ui-activity.js', timetable: 'ui-same-period-swap.js' };
  const SPECIAL_NS = { submit: 'UiBatchPanel', backoffice: 'UiClassAwayAdmin', mutual: 'UiMutualBridge', timetable: 'UiSamePeriodSwap' };
  const specialNs = SPECIAL_NS[S];
  const needVue = new Set(), needDomain = new Set(), needNS = new Map(), needToast = new Set();
  const foreignByOwner = {};
  for (const id of candidates) {
    if (id === '_setupReady') continue; // v1 機制殘留，守衛行已刪、宣告已棄
    if (local.has(id)) continue;
    if (VUE_USE.has(id)) { needVue.add(id); continue; }
    if (B.GLOBALS.has(id)) continue;
    if (id === 'defineStore') continue;
    if (DOMAIN_FILE[id]) { needDomain.add(id); continue; }
    if (id === 'ExportAccounting' || id === 'ExportPeriod8Accounting') {
      const key = id === 'ExportAccounting' ? '../modules/export-accounting.js' : '../modules/export-period8-accounting.js';
      if (!needNS.has(key)) needNS.set(key, { def: [], named: [] });
      needNS.get(key).def.push(id);
      continue;
    }
    if (['showToast', 'showConfirm', 'installModalA11y', 'fallbackAvatarDataUri'].includes(id)) { needToast.add(id); continue; }
    if (MODULE_FILE[id]) {
      if (id === specialNs) continue; // special import 另行補（下方）
      const f = MODULE_FILE[id];
      const isDefault = !!DOMAIN_FILE[id] || f === 'export-accounting.js' || f === 'export-period8-accounting.js';
      const dir = DOMAIN_FILE[id] ? '../domain/' : '../modules/';
      const key = dir + f;
      if (!needNS.has(key)) needNS.set(key, { def: [], named: [] });
      needNS.get(key)[isDefault ? 'def' : 'named'].push(id);
      continue;
    }
    if (pureMap[id]) continue; // pure 成員走下方 pureMembers 解構（NS import 另補）
    if (PURE_FORWARD[id]) {
      const [ns] = PURE_FORWARD[id];
      const key = '../domain/' + DOMAIN_FILE[ns];
      if (!needNS.has(key)) needNS.set(key, { def: [], named: [] });
      if (!needNS.get(key).def.includes(ns)) needNS.get(key).def.push(ns);
      continue;
    }
    if (FACTORY_STORE[id]) {
      const ost = FACTORY_STORE[id];
      if (ost !== S) { (foreignByOwner[ost] = foreignByOwner[ost] || new Set()).add(id); }
      continue;
    }
    if (storeOf[id]) {
      if (storeOf[id] !== S) { (foreignByOwner[storeOf[id]] = foreignByOwner[storeOf[id]] || new Set()).add(id); }
      else console.log('WARN ' + S + ': owned but undeclared ' + id);
      continue;
    }
  }
  // forceForeign 併入（R-LETS 指定依賴）
  for (const own of Object.keys(forceForeign)) {
    for (const n of forceForeign[own]) {
      (foreignByOwner[own] = foreignByOwner[own] || new Set()).add(n);
    }
  }
  // foreign let mutation 檢查（宣告行除外）
  const codeLines = code.split('\n');
  for (const [own, names] of Object.entries(foreignByOwner)) {
    for (const n of names) {
      const re = new RegExp('(^|[^\\w$.])' + n + '\\s*(=[^=>]|\\+=|-=|\\+\\+|--)');
      let li = -1;
      const linesHit = [];
      let mm;
      const reG = new RegExp(re.source, 'gm');
      while ((mm = reG.exec(code))) {
        const lno = code.slice(0, mm.index).split('\n').length;
        linesHit.push(lno);
      }
      for (const lno of linesHit) {
        const line = codeLines[lno - 1] || '';
        if (new RegExp('^\\s*(const|let|var|function|async function)\\s+' + n + '\\b').test(line)) continue;
        console.log('WARN ' + S + ': mutates foreign let ' + n + ' (owner ' + own + ') L' + lno);
      }
    }
  }
  // pure NS 本體 import（成員解構在 setupHead 後）——須在 imp 組裝前登記
  const pureMembers = {};
  for (const id of candidates) {
    if (pureMap[id] && usesBare(id)) {
      const pm = pureMap[id];
      (pureMembers[pm] = pureMembers[pm] || new Set()).add(id);
    }
  }
  for (const pm of Object.keys(pureMembers)) {
    const f = pm === 'UiLineTemplate' ? 'ui-line-template.js' : pm === 'UiListHelpers' ? 'ui-list-helpers.js' : 'ui-style.js';
    const key = '../modules/' + f;
    if (!needNS.has(key)) needNS.set(key, { def: [], named: [] });
    needNS.get(key).named.push(pm);
  }
  // import 合併（按檔聚合同名去重；special／factoryModules／needNS 可能重疊）
  // （SPECIAL_* 常數見上方 foreign 循環前定義）
  const impByFile = new Map(); // file -> {def:Set, named:Set}
  const addImp = (file, def, named) => {
    if (!impByFile.has(file)) impByFile.set(file, { def: new Set(), named: new Set() });
    const g = impByFile.get(file);
    for (const n of def) g.def.add(n);
    for (const n of named) g.named.add(n);
  };
  for (const [f, g] of needNS) {
    for (const n of g.def) addImp(f, [n], []);
    for (const n of new Set(g.named)) addImp(f, [], [n]);
  }
  for (const d of needDomain) addImp('../domain/' + DOMAIN_FILE[d], [d], []);
  if (needToast.size) addImp('../ui/toast.js', [], [...needToast]);
  for (const m of o.factoryModules) addImp('../modules/' + MODULE_FILE[m], [], [m]);
  if (specialCode[S]) addImp('../modules/' + SPECIAL_FILE[S], [], [specialNs]);
  const imp = [];
  imp.push("import { defineStore } from 'pinia';");
  if (needVue.size) imp.push('import { ' + [...needVue].sort().join(', ') + " } from 'vue';");
  for (const f of [...impByFile.keys()].sort()) {
    const g = impByFile.get(f);
    const parts2 = [];
    if (g.def.size) parts2.push([...g.def].join(', '));
    if (g.named.size) parts2.push('{ ' + [...g.named].sort().join(', ') + ' }');
    imp.push('import ' + parts2.join(', ') + " from '" + f + "';");
  }
  const crossOwners = Object.keys(foreignByOwner).sort();
  for (const co of crossOwners) imp.push("import { " + ('use' + co[0].toUpperCase() + co.slice(1) + 'Store') + " } from './" + co + ".js';");
  // ---- 跨 store ref 別名（Pinia setup store 會 unwrap ref：useX().ref 拿到的是值不是 ref）
  // ref-like 成員走 setup-top storeToRefs 別名（真 ref 身份，.value／傳址皆與 v1 一致）；fn／plain 沿用內聯。
  const ownerStateRef = {};
  for (const o of STORES) {
    const set = new Set();
    const ost = EP.stores[o];
    if (ost && ost.state) {
      for (const e of ost.state) {
        const head = ((appLines[e.line - 1] || '') + '\n' + (appLines[e.line] || ''));
        if (/=\s*(ref|computed|reactive)\(/.test(head)) set.add(e.name);
      }
    }
    ownerStateRef[o] = set;
  }
  const isRefForeign = (owner, name) => {
    if (wrapperNames.has(name) || allFactoryNames.has(name)) return false;
    const ost = EP.stores[owner];
    const stateNames = ost && ost.state ? ost.state.map((e) => e.name) : [];
    if (stateNames.includes(name)) return !!(ownerStateRef[owner] && ownerStateRef[owner].has(name));
    // special／未知（create 結果解構等）：以 v1 全域 use-site 判定（.value 讀過即 ref；純呼叫即 fn）
    return v1refUsed.has(name);
  };
  const aliasByOwner = {};
  for (const co of crossOwners) {
    for (const name of [...foreignByOwner[co]]) {
      if (isRefForeign(co, name)) (aliasByOwner[co] = aliasByOwner[co] || []).push(name);
    }
  }
  const aliasOwners = Object.keys(aliasByOwner).sort();
  // 別名聲明不出現在 setup-top（storeToRefs 全量迭代會把 owner setup 提前觸發，製造人工循環）；
  // 改為 use-site 內聯 storeToRefs(useXStore()).name（求值時 owner 必已就緒：setup 期沿 v1 行序，lazy 位延至全就緒後）。
  if (aliasOwners.length) {
    imp.push("import { storeToRefs } from 'pinia';");
  }
  // ---- 內聯惰性重寫：跨 store 引用一律改為 useXStore().name（呼叫時求值）
  // setupHead 已刪除（setup 期零跨 store 呼叫 → 無初始化循環）。
  // 跳過：宣告處、成員存取、函式參數／catch／for 變數、顯式物件鍵、字串註解。
  // （GAS_MEMBERS 登記見檔頭 storeOf 處；PURE_FORWARD 見檔頭）
  const useVarOf = {};
  for (const co of crossOwners) useVarOf[co] = 'use' + co[0].toUpperCase() + co.slice(1) + 'Store';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const { maskCode } = require('./mask.cjs');
  // 收集重寫任務：owner -> names（已含 forceForeign）。
  // ref-like 走 use-site 內聯 storeToRefs(useXStore()).name（真 ref，.value／傳址皆與 v1 一致）；
  // fn／plain 沿用 useXStore().name（函式與純值不受 unwrap 影響）。
  const aliased = new Set();
  for (const co of aliasOwners) for (const n of aliasByOwner[co]) aliased.add(co + '.' + n);
  const rewriteJobs = [];
  for (const co of crossOwners) {
    for (const name of [...foreignByOwner[co]].sort((a, b) => b.length - a.length)) {
      if (aliased.has(co + '.' + name)) rewriteJobs.push({ name, expr: 'storeToRefs(' + useVarOf[co] + '()).' + name, owner: co });
      else rewriteJobs.push({ name, expr: useVarOf[co] + '().' + name, owner: co });
    }
  }
  // PURE 轉發直連（DateUtils／FieldMap 等，不經 owner store）
  for (const alias of Object.keys(PURE_FORWARD)) {
    if (local.has(alias) || !usesBare(alias)) continue;
    const [ns, member] = PURE_FORWARD[alias];
    rewriteJobs.push({ name: alias, expr: ns + '.' + member, owner: 'pure:' + ns });
  }
  // 包圍開括號判定（在 mask 上）：決定 { NAME } 是否為物件速記
  function enclosingOpener(maskedText, idx) {
    let d = 0;
    for (let j = idx - 1; j >= 0; j--) {
      const ch = maskedText[j];
      if (ch === '}' || ch === ')' || ch === ']') d++;
      else if (ch === '{' || ch === '(' || ch === '[') {
        if (d === 0) return ch;
        d--;
      }
    }
    return null;
  }
  // 排除區間：解構宣告、函式參數、catch／for 變數（其內識別字為綁定目標，不可重寫）
  function exclusionSpans(code) {
    const spans = [];
    const push = (a, b) => { if (b > a) spans.push([a, b]); };
    let m;
    const re1 = /(?:const|let|var)\s*\{[^}]*\}/g;
    while ((m = re1.exec(code))) push(m.index, m.index + m[0].length);
    const re2 = /function\s*[A-Za-z0-9_]*\s*\([^)]*\)/g;
    while ((m = re2.exec(code))) push(m.index, m.index + m[0].length);
    const re3 = /\([^()]*\)\s*=>/g;
    while ((m = re3.exec(code))) push(m.index, m.index + m[0].length);
    const re4 = /catch\s*\([^)]*\)/g;
    while ((m = re4.exec(code))) push(m.index, m.index + m[0].length);
    const re5 = /for\s*\([^;]*;/g;
    while ((m = re5.exec(code))) push(m.index, m.index + m[0].length);
    const re6 = /for\s*\([^)]*\)/g;
    while ((m = re6.exec(code))) push(m.index, m.index + m[0].length);
    return spans;
  }
  const inSpans = (spans, idx) => spans.some(([a, b]) => idx >= a && idx < b);
  for (let pi = 0; pi < parts.length; pi++) {
    let code = parts[pi];
    const excl = exclusionSpans(code);
    // 在 mask 上找候選（位置對應原字串；mask.cjs 保證等長）
    let masked = maskCode(code);
    if (masked.length !== code.length) throw new Error(S + ' mask 長度漂移 pi=' + pi);
    // mixed 段（含 ${} 內 code）：視為 code
    const edits = [];
    for (const { name, expr } of rewriteJobs) {
      const re = new RegExp('(?<![.\\w$\'"])' + esc(name) + '(?![\\w$])', 'g');
      let m;
      while ((m = re.exec(masked))) {
        edits.push({ index: m.index, len: name.length, name, expr });
      }
    }
    edits.sort((a, b) => a.index - b.index);
    // 判定＋套用（由後往前）
    let out2 = code;
    const skipped = [];
    for (let k = edits.length - 1; k >= 0; k--) {
      const { index, len, name, expr } = edits[k];
      if (inSpans(excl, index)) { skipped.push(name + '(scope)'); continue; }
      // 判定用 mask 後上下文（註解已空白化，避免 // 內文字干擾 key/param 判定）
      const before = masked.slice(Math.max(0, index - 160), index);
      const after = masked.slice(index + len, index + len + 40);
      const beforeLine = before.slice(before.lastIndexOf('\n') + 1);
      let skip = false;
      let shorthand = false;
      const why = [];
      if (new RegExp('^' + esc(name) + '\\s*=>').test(after)) { skip = true; why.push('arrow'); } // 單參箭頭 params
      else if (/^\s*(const|let|var|function|async function)\s+$/.test(beforeLine)) { skip = true; why.push('decl'); } // 宣告
      else if (enclosingOpener(masked, index) === '{' && /^\s*[,}]/.test(after) && !/:\s*$/.test(before)) shorthand = true; // 物件速記 { NAME, / { NAME }（排除 key: value 的 value）
      else if (/[{,]\s*$/.test(before) && /^\s*:/.test(after)) { skip = true; why.push('key'); } // 顯式鍵
      else if (/case\s+$/.test(before)) { /* case 值：重寫 */ }
      else if (/\(\s*[^()]*$/.test(before) && !/\)/.test(before.split('(').pop())) {
        // 可能在參數列：檢查其後是否有 ) => / ) {/function 前導等
        const ahead = masked.slice(index + len, index + len + 120);
        if (/^\s*[,)]/.test(ahead)) {
          const seg = before + name + ahead;
          if (/\([^()]*$/.test(before) && /^\s*\)\s*(=>|\{)/.test(ahead)) { skip = true; why.push('param'); } // 參數
          else if (/function\s+\w*\s*\([^()]*$/.test(before)) { skip = true; why.push('fnparam'); }
          else if (/catch\s*\(\s*$/.test(before)) { skip = true; why.push('catch'); }
          else if (/for\s*\([^;()]*$/.test(before)) { skip = true; why.push('for'); }
        }
      }
      if (skip) { skipped.push(name + '(' + why.join('/') + ')'); continue; }
      const rep = shorthand ? name + ': ' + expr : expr;
      out2 = out2.slice(0, index) + rep + out2.slice(index + len);
    }
    if (skipped.length) console.log('  [' + S + '] skip rewrite: ' + [...new Set(skipped)].join(','));
    parts[pi] = out2;
  }
  const lines = [];
  lines.push('/** v2 stores/' + S + '.js — 由 v1 setup() §分節機械分解（gen-final.cjs）。 */');
  lines.push(...imp);
  lines.push('export const ' + ('use' + S[0].toUpperCase() + S.slice(1) + 'Store') + " = defineStore('" + S + "', () => {");
  for (const pm of Object.keys(pureMembers)) {
    lines.push('  const { ' + [...pureMembers[pm]].sort().join(', ') + ' } = ' + pm + ';');
  }
  lines.push(...parts);
  // 同店重複宣告守衛（state／wrapper／destructure 成員互斥）
  {
    const seen = {};
    const joined = lines.join('\n');
    for (const line of joined.split('\n')) {
      const dm = line.match(/^  const \{([\s\S]*?)\} = ([A-Za-z_][A-Za-z0-9_]*);/);
      if (dm) {
        // 只計 LHS 成員；RHS（store／NS）不計
        for (const mm of dm[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
          seen[mm[1]] = (seen[mm[1]] || 0) + 1;
        }
        continue;
      }
      const dm2 = line.match(/^    (?!\s)(?:const|let|function|async function) ([A-Za-z_][A-Za-z0-9_]*)/);
      if (dm2) seen[dm2[1]] = (seen[dm2[1]] || 0) + 1;
    }
    const dups = Object.keys(seen).filter((k) => seen[k] > 1);
    if (dups.length) throw new Error(S + ' 重複宣告: ' + dups.join(','));
  }
  // _ 前綴為 setup 內部緩存（let _x = null 等）：移出 return（storeToRefs 迭代撞 null；template 零綁定）。
  // 僅保留跨 store 讀寫的 2 個（皆非 null：boolean／Object.create(null)）。
  // 另有 2 個非 _ 前綴 null 緩存（內部读写，template／跨 store 零引用）：同樣移出 return。
  const KEEP_UNDER = new Set(['_navPersistReady', '_quotaLedgerCache']);
  const DROP_NULL_CACHE = new Set(['monthlyReportLastCalculationKey', 'uiAdminWarmupHandle', 'storedReportPeriod']);
  const ret = [...new Set([...o.returned, ...(specialMembers[S] || []), ...extraReturns])].filter((n) => (!/^_/.test(n) || KEEP_UNDER.has(n)) && !DROP_NULL_CACHE.has(n));
  lines.push('  return { ' + ret.join(', ') + ' };');
  lines.push('});');
  lines.push('');
  fs.writeFileSync(path.join(STOUT, S + '.js'), lines.join('\n'));
  storeReturns[S] = ret;
  console.log('wrote stores/' + S + '.js (' + ret.length + ' members)');
}
fs.writeFileSync(path.join(__dirname, '..', 'tests', '__storeReturns.json'), JSON.stringify(storeReturns, null, 1));
