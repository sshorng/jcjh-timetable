#!/usr/bin/env node
'use strict';
/* gen-emit3.cjs — 外部引用分析 → 寫出 stores。用法：node scripts/gen-emit3.cjs */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const E2 = require('./gen-emit2.cjs');
const {
  STORES, STORE_VAR, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  PURE_RETURN, identifiers, app, manifest
} = B;
const { out, useName } = E2;
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');

const storeOf = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\ownership.json', 'utf8'));
const AMBIG = {
  isCombinedClass: 'timetable', currentWeekDates: 'timetable', isAdmin: 'session',
  isStaff: 'session', canViewAllTimetables: 'session', parseTeacherSubjects: 'session',
  canOperateOnTeacherEmail: 'session', ensureProxyTargetForTeacher: 'session',
  displayTimetableHeaders: 'timetable', displayTimetableTeachers: 'timetable'
};
for (const k of Object.keys(AMBIG)) storeOf[k] = AMBIG[k];
for (const n of JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\batch-names.json', 'utf8'))) storeOf[n] = 'submit';
// classAway／bridge／sameswap 成員歸屬（由 destructure 抽取）
function membersOfCode(code) {
  const out = [];
  for (const m of code.matchAll(/const \{([\s\S]*?)\} = /g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) out.push(x[1]);
  }
  return [...new Set(out)];
}
{
  const bo = out.backoffice.codeParts.join('\n');
  for (const n of membersOfCode(bo)) if (!storeOf[n]) storeOf[n] = 'backoffice';
  const mu = out.mutual.codeParts.join('\n');
  for (const n of membersOfCode(mu)) if (!storeOf[n]) storeOf[n] = 'mutual';
  const su = out.submit.codeParts.join('\n');
  for (const n of membersOfCode(su)) if (!storeOf[n]) storeOf[n] = 'submit';
  const tt = out.timetable.codeParts.join('\n');
  for (const m of tt.matchAll(/const \{ ([\s\S]*?) \} = samePeriodSwapUI;/g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) storeOf[x[1]] = 'timetable';
  }
}

const warnings = [];
for (const S of STORES) {
  const o = out[S];
  const code = o.codeParts.join('\n');
  if (/_setupReady/.test(code)) throw new Error(S + ' 殘留 _setupReady');
  const ids = identifiers(code);
  const local = new Set(o.declared);
  for (const m of o.factoryModules) local.add(m);
  const needVue = new Set(), needDomain = new Set(), needNamed = new Map(), needDefault = new Map();
  const foreignByOwner = {};
  for (const id of ids) {
    if (B.GLOBALS.has(id) || local.has(id)) continue;
    if (B.VUE_USE.has(id)) { needVue.add(id); continue; }
    if (id === 'defineStore') continue;
    if (DOMAIN_FILE[id]) { needDomain.add(id); continue; }
    if (['showToast', 'showConfirm'].includes(id)) continue; // 下方 toast import
    if (/^use[A-Z].*Store$/.test(id)) continue;
    // 模組命名空間 → import（具名 except domain／Export 系 default）
    if (MODULE_FILE[id]) {
      const f = MODULE_FILE[id];
      const isDefault = !!DOMAIN_FILE[id] || f === 'export-accounting.js' || f === 'export-period8-accounting.js';
      const dir = DOMAIN_FILE[id] ? '../domain/' : '../modules/';
      if (isDefault) {
        if (!needDefault.has(f)) needDefault.set(f, []);
        needDefault.get(f).push(id);
      } else {
        if (!needNamed.has(f)) needNamed.set(f, []);
        needNamed.get(f).push(id);
      }
      continue;
    }
    if (storeOf[id] && storeOf[id] !== S) {
      (foreignByOwner[storeOf[id]] = foreignByOwner[storeOf[id]] || new Set()).add(id);
      continue;
    }
    if (storeOf[id] === S) continue;
    warnings.push(S + ': unresolved ' + id);
  }
  o.needVue = needVue; o.needDomain = needDomain; o.needNamed = needNamed;
  o.needDefault = needDefault; o.foreignByOwner = foreignByOwner;
}
const seen = new Set();
for (const w of warnings) {
  if (!seen.has(w)) { seen.add(w); console.log('WARN', w); }
}
console.log('warn total:', warnings.length, 'unique:', seen.size);
