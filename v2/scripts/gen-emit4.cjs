#!/usr/bin/env node
'use strict';
/* gen-emit4.cjs — 最終發射：14 stores＋App.vue＋composition test。
 * 用法：node scripts/gen-emit4.cjs
 */
const fs = require('fs');
const path = require('path');
const B = require('./gen-base.cjs');
const {
  STORES, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  identifiers, app, manifest
} = B;
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');
const retSet = new Set(manifest.retNames);
const useName = {};
for (const s of STORES) useName[s] = 'use' + s[0].toUpperCase() + s.slice(1) + 'Store';
const inv = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\inv.json', 'utf8'));
const ownership = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\ownership.json', 'utf8'));
const AMBIG = {
  isCombinedClass: 'timetable', currentWeekDates: 'timetable', isAdmin: 'session',
  isStaff: 'session', canViewAllTimetables: 'session', parseTeacherSubjects: 'session',
  canOperateOnTeacherEmail: 'session', ensureProxyTargetForTeacher: 'session',
  displayTimetableTeachers: 'timetable'
};
for (const k of Object.keys(AMBIG)) ownership[k] = AMBIG[k];
const factoriesFull = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\factories.json', 'utf8'));
const fmap = {};
for (const f of factoriesFull) fmap[f.name] = f.body;
const batchNames = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\batch-names.json', 'utf8'));
for (const n of batchNames) ownership[n] = 'submit';

// sameswap／classAway／bridge 成員（由 App return 側解析：x: NS.x 形＋destructure）
const memberOwner = {};
for (const n of batchNames) memberOwner[n] = 'submit';
{
  // classAway：UiClassAwayAdmin.create 解構（錨點掃描）
  const idx = app.indexOf('window.UiClassAwayAdmin.create({');
  const headStart = app.lastIndexOf('const {', idx);
  const headEnd = app.indexOf('} = ', headStart);
  const lhs = app.slice(headStart, headEnd);
  for (const m of lhs.matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (m[1] !== 'const') { memberOwner[m[1]] = 'backoffice'; ownership[m[1]] = 'backoffice'; }
  }
  const idx2 = app.indexOf('window.UiMutualBridge.create({');
  const hs2 = app.lastIndexOf('const {', idx2);
  const he2 = app.indexOf('} = ', hs2);
  for (const m of app.slice(hs2, he2).matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (m[1] !== 'const') { memberOwner[m[1]] = 'mutual'; ownership[m[1]] = 'mutual'; }
  }
  for (const m of app.matchAll(/samePeriodSwapUI\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    memberOwner[m[1]] = 'timetable'; ownership[m[1]] = 'timetable';
  }
}
// setup-top pure destructure 名→模組
const pureMap = {};
for (const m of app.matchAll(/const \{([\s\S]*?)\} = window\.(UiLineTemplate|UiListHelpers|UiStyle);/g)) {
  for (const n of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) pureMap[n[1]] = m[2];
}
// union wrappers（gen-base 已算，name→{calls,body}）
const unionByName = {};
for (const w of B.unionWrappers) unionByName[w.name] = w;
const wrapperStore = {};
for (const w of B.unionWrappers) wrapperStore[w.name] = FACTORY_STORE[w.calls[0]] || 'data';

fs.writeFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\emit4-meta.json', JSON.stringify({
  memberOwnerCount: Object.keys(memberOwner).length,
  pureCount: Object.keys(pureMap).length,
  unionCount: B.unionWrappers.length
}));
console.log('meta ok');
module.exports = { useName, storeOf: ownership, memberOwner, pureMap, unionByName, wrapperStore, fmap, batchNames };
