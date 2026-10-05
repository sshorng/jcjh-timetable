#!/usr/bin/env node
'use strict';
/* gen-stores.cjs — 見檔頭註解（前一版已述）。本檔只做：讀 inputs → 寫 14 stores＋App.vue＋composition test。
 * 特殊塊（行號以本次執行時 app.js 為準，錨點掃描）：
 * - UiBatchPanel eager＋解構25 → submit
 * - UiClassAwayAdmin eager＋解構 → backoffice
 * - UiMutualBridge eager＋解構 → mutual
 * - samePeriodSwapUI eager＋解構12 → timetable
 * - ensureUiAdminApi → admin（直接 import 版）
 * - getMutualPanelApi → mutual（直接 import 版）
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const STOUT = path.join(__dirname, '..', 'src', 'stores');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const appLines = app.split('\n');
const inv = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\inv.json', 'utf8'));
const ownership = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\ownership.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\manifest.json', 'utf8'));
const factories = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\factories.json', 'utf8'));
const watchAssign = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-assign.json', 'utf8'));
const watchBodies = JSON.parse(fs.readFileSync('C:\\Users\\sshor\\AppData\\Local\\Temp\\opencode\\watch-bodies.json', 'utf8'));
const AMBIG = {
  isCombinedClass: 'timetable', currentWeekDates: 'timetable', isAdmin: 'session',
  isStaff: 'session', canViewAllTimetables: 'session', parseTeacherSubjects: 'session',
  canOperateOnTeacherEmail: 'session', ensureProxyTargetForTeacher: 'session',
  displayTimetableTeachers: 'timetable'
};
for (const k of Object.keys(AMBIG)) ownership[k] = AMBIG[k];

const STORES = ['session', 'data', 'timetable', 'match', 'submit', 'requests', 'history', 'backoffice', 'admin', 'output', 'interaction', 'homeroom', 'mutual', 'tour'];
const STORE_VAR = {};
for (const s of STORES) STORE_VAR[s] = s + 'Store';
const FACTORY_STORE = {
  getMutualPanelApi: 'mutual', getCalendarApi: 'timetable', getTimetableApi: 'timetable',
  getApprovalApi: 'requests', getExportApi: 'output', getHistoryApi: 'history',
  getClassViewApi: 'timetable', getSubmitApi: 'submit', getDataApi: 'data',
  getBackofficeApi: 'backoffice', getMatchApi: 'match', getTourApi: 'tour',
  getSyncApi: 'data', getSchoolSwapApi: 'timetable', getProxyApi: 'session',
  getScheduleApi: 'timetable', getAuthApi: 'session', getHomeroomApi: 'homeroom',
  getReportApi: 'output', getPrintApi: 'output', getInteractApi: 'interaction',
  ensureUiAdminApi: 'admin', needUiAdmin: 'admin'
};
const MODULE_OF_FACTORY = {
  getMutualPanelApi: 'UiMutualPanelState', getCalendarApi: 'UiCalendar',
  getTimetableApi: 'UiTimetable', getApprovalApi: 'UiApproval', getExportApi: 'UiExport',
  getHistoryApi: 'UiHistory', getClassViewApi: 'UiClassView', getSubmitApi: 'UiSubmit',
  getDataApi: 'UiData', getBackofficeApi: 'UiBackoffice', getMatchApi: 'UiMatch',
  getTourApi: 'UiTour', getSyncApi: 'UiSync', getSchoolSwapApi: 'UiSchoolSwap',
  getProxyApi: 'UiProxy', getScheduleApi: 'UiSchedule', getAuthApi: 'UiAuth',
  getHomeroomApi: 'UiHomeroom', getReportApi: 'UiReport', getPrintApi: 'UiPrint',
  getInteractApi: 'UiInteraction', ensureUiAdminApi: 'UiAdmin'
};
const MODULE_FILE = {
  UiMutualPanelState: 'ui-mutual.js', UiMutualSubmit: 'ui-mutual.js', UiCalendar: 'ui-calendar.js',
  UiTimetable: 'ui-timetable.js', UiApproval: 'ui-approval.js', UiExport: 'ui-export.js',
  UiHistory: 'ui-history.js', UiClassView: 'ui-classview.js', UiSubmit: 'ui-submit.js',
  UiData: 'ui-data.js', UiBackoffice: 'ui-backoffice.js', UiMatch: 'ui-match.js',
  UiTour: 'ui-tour.js', UiSync: 'ui-sync.js', UiSchoolSwap: 'ui-schoolswap.js',
  UiProxy: 'ui-proxy.js', UiSchedule: 'ui-schedule.js', UiAuth: 'ui-auth.js',
  UiHomeroom: 'ui-homeroom.js', UiReport: 'ui-report.js', UiPrint: 'ui-print.js',
  UiInteraction: 'ui-interaction.js', UiAdmin: 'ui-admin.js', UiBatchPanel: 'ui-activity.js',
  UiClassAwayAdmin: 'ui-activity.js', UiMutualBridge: 'ui-activity.js', UiBatchSubmit: 'ui-activity.js',
  UiSamePeriodSwap: 'ui-same-period-swap.js', UiSubmitHelpers: 'ui-request.js',
  UiLineTemplate: 'ui-line-template.js', UiListHelpers: 'ui-list-helpers.js',
  UiStyle: 'ui-style.js', OnboardingTour: 'onboarding-tour.js', TemplateBuffer: 'template-buffer.js',
  ExportAccounting: 'export-accounting.js', ExportPeriod8Accounting: 'export-period8-accounting.js'
};
const DOMAIN_FILE = {
  DateUtils: 'date-utils.js', FeeUtils: 'fee-utils.js', FieldMap: 'field-map.js',
  DomainTriangle: 'domain-triangle.js', DomainMatch: 'domain-match.js',
  DomainSchoolSwap: 'domain-school-swap.js', DomainSchedule: 'domain-schedule.js',
  DomainClassAway: 'domain-class-away.js', DomainActivityCover: 'domain-activity-cover.js',
  DomainBilling: 'domain-billing.js'
};
const PURE_RETURN = ['formatTriangleSlot', 'formatRequestApplicationDate', 'getBatchGroupSlotSummary', 'getBatchGroupTeacherSummary', 'getBatchGroupStatusText', 'getBatchGroupStatusClass', 'getScheduleSpecialTags', 'hasScheduleSpecialTag', 'isTimetablePullout', 'isTimetableRestricted', 'getStatusText', 'isTriangleRequest', 'formatLeaveClassSlot', 'getRequestRiskTags', 'getRequestTypeTags', 'getCellPlainStatus'];

const factoryNames = new Set(Object.keys(FACTORY_STORE).filter((k) => factories.some((f) => f.name === k)));
// union wrappers
const unionWrappers = [];
{
  const re = /^    const ([A-Za-z_][A-Za-z0-9_]*) = (?:async )?\(/gm;
  let m;
  while ((m = re.exec(app))) {
    const name = m[1];
    if (factoryNames.has(name)) continue;
    const start = m.index;
    const text = app.slice(start);
    const { stmtEnd } = require('./stmtspan.cjs');
    const end = stmtEnd(text, 0);
    if (end < 0) continue;
    const body = text.slice(0, end);
    const calls = [...new Set([...body.matchAll(/(get[A-Za-z]*Api)\(\)|(needUiAdmin|ensureUiAdminApi)\(/g)].map((x) => x[1] || x[2]))];
    if (calls.length && body.length < 3000) unionWrappers.push({ name, line: app.slice(0, start).split('\n').length, calls, body });
  }
}
const wrapperStore = {};
for (const w of unionWrappers) wrapperStore[w.name] = FACTORY_STORE[w.calls[0]] || 'data';
// v1 潛伏 bug：checkUrlCallback 在登入鏈被呼叫（5335／5404）卻從未定義。
// 按原意補合成包裝（經 approval api，歸 requests），體例同 unionWrappers（無 _setupReady 守衛）。
if (!wrapperStore['checkUrlCallback']) {
  unionWrappers.push({
    name: 'checkUrlCallback', line: 0, calls: ['getApprovalApi'],
    body: '    const checkUrlCallback = (...args) => {\n      const a = getApprovalApi();\n      return a ? a.checkUrlCallback(...args) : undefined;\n    };'
  });
  wrapperStore['checkUrlCallback'] = 'requests';
}

const wrapperNameSet = new Set(unionWrappers.map((w) => w.name));
const stateEntries = inv.filter((e) => !factoryNames.has(e.name) && !wrapperNameSet.has(e.name) && e.name !== 'samePeriodSwapUI');

function sliceLines(a, b) {
  return appLines.slice(a - 1, b).join('\n');
}
function dropGuards(code) {
  return code.replace(/^.*if \(!_setupReady\.value\) return .*;\r?\n/gm, '');
}

const GLOBALS = new Set(['ref', 'computed', 'watch', 'reactive', 'readonly', 'nextTick', 'onMounted', 'onUnmounted', 'toRef', 'toRefs', 'defineStore', 'console', 'window', 'document', 'localStorage', 'sessionStorage', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Math', 'Promise', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'isNaN', 'parseInt', 'parseFloat', 'isFinite', 'fetch', 'location', 'navigator', 'alert', 'confirm', 'Vue', 'defineComponent', 'requestAnimationFrame', 'cancelAnimationFrame', 'decodeURIComponent', 'encodeURIComponent', 'Map', 'Set', 'Error', 'RegExp', 'clearInterval']);
const VUE_USE = new Set(['ref', 'computed', 'watch', 'reactive', 'nextTick']);

function identifiers(code) {
  const clean = code.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``').replace(/\/\/[^\n]*/g, '');
  const out = new Set();
  const re = /(?<![.\w$'"])([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(clean))) out.add(m[1]);
  return out;
}

module.exports = {
  STORES, STORE_VAR, FACTORY_STORE, MODULE_OF_FACTORY, MODULE_FILE, DOMAIN_FILE,
  PURE_RETURN, unionWrappers, wrapperStore, stateEntries, ownership, factories,
  manifest: manifest, app, appLines, sliceLines, dropGuards, GLOBALS, VUE_USE, identifiers
};
