#!/usr/bin/env node
'use strict';

/**
 * 模板綁定契約測試（2A 終局安全網）
 *
 * index.html 所有模板根識別字（{{ }}／@click／v-model／:bind／v-if 等第一個 token）
 * 必須能在 app.js setup() 的 return 物件中找到，否則畫面靜默壞掉而單元測試全綠。
 * setup return 支援 ...spread（解析自各模組 return 鍵）。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const pats = [
  /\{\{\s*([A-Za-z_$][\w$]*)/g,
  /@\w+="([A-Za-z_$][\w$]*)/g,
  /v-model="([A-Za-z_$][\w$]*)/g,
  /:(?:[a-z-]+)="([A-Za-z_$][\w$]*)/g,
  /v-(?:if|show|for)="([A-Za-z_$][\w$]*)/g
];
const used = new Set();
for (const p of pats) {
  let m;
  while ((m = p.exec(html))) used.add(m[1]);
}
// v-for 別名（區域變數，非 setup 綁定）：v-for="x in y"／v-for="(x, i) in y"
const vueLocals = new Set();
for (const m of html.matchAll(/v-for="([^"]*)"/g)) {
  const lhs = m[1].split(/\bin\b/)[0];
  for (const a of lhs.matchAll(/([A-Za-z_$][\w$]*)/g)) vueLocals.add(a[1]);
}
// 已知非 setup 綁定：Vue／全域／模板語法＋v-for 別名
const GLOBALS = new Set(['true', 'false', 'null', 'undefined', '$event', 'typeof',
  'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'isNaN', 'parseInt',
  'console', 'window', 'document', 'event', ...vueLocals]);

// setup return 區塊：取最後一個頂層 return { ... };
const retStart = appSource.lastIndexOf('    return {');
assert.ok(retStart >= 0, 'setup return must remain discoverable');
let d = 0, retEnd = -1;
{
  const i = appSource.indexOf('{', retStart);
  for (let j = i; j < appSource.length; j++) {
    if (appSource[j] === '{') d++;
    if (appSource[j] === '}') { d--; if (d === 0) { retEnd = j + 1; break; } }
  }
}
assert.ok(retEnd > retStart, 'setup return block must be balanced');
const retText = appSource.slice(retStart, retEnd);
const provided = new Set();
for (const m of retText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)(?=\s*[,}])/g)) {
  provided.add(m[1]);
}
// key: obj.key 形式：屬性名同樣暴露
for (const m of retText.matchAll(/\.([A-Za-z_$][\w$]*)(?=\s*[,}])/g)) {
  provided.add(m[1]);
}
// ...spread：解析自對應模組 return 鍵
const SPREAD_FILES = {
  UiTimetable: 'ui-timetable.js',
  UiHistory: 'ui-history.js',
  UiExport: 'ui-export.js',
  UiClassView: 'ui-classview.js',
  UiLineTemplate: 'ui-line-template.js',
  UiListHelpers: 'ui-list-helpers.js',
  UiCalendar: 'ui-calendar.js',
  UiStyle: 'ui-style.js',
  UiMutualPanelState: 'ui-mutual.js',
  UiMutualSubmit: 'ui-mutual.js',
  UiBatchPanel: 'ui-activity.js',
  UiBatchSubmit: 'ui-activity.js',
  UiClassAwayAdmin: 'ui-activity.js',
  UiMutualBridge: 'ui-activity.js',
  UiApproval: 'ui-approval.js',
  UiAdmin: 'ui-admin.js',
  UiSubmitHelpers: 'ui-request.js',
  TemplateBuffer: 'template-buffer.js',
  UiSamePeriodSwap: 'ui-same-period-swap.js',
  GasApi: 'gas-api.js'
};
for (const m of retText.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)) {
  const name = m[1];
  // setup 內 api 變數（如 timetableApi）→ 對應 window 模組
  const fileMap = {
    timetableApi: 'ui-timetable.js', historyApi: 'ui-history.js',
    calendarApi: 'ui-calendar.js', exportApi: 'ui-export.js',
    classViewApi: 'ui-classview.js', uiAdminApi: 'ui-admin.js'
  };
  const file = fileMap[name];
  if (!file) continue;
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const rStart = src.lastIndexOf('    return {');
  if (rStart < 0) continue;
  let dd = 0, rEnd = -1;
  {
    const i = src.indexOf('{', rStart);
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') dd++;
      if (src[j] === '}') { dd--; if (dd === 0) { rEnd = j + 1; break; } }
    }
  }
  if (rEnd < 0) continue;
  for (const k of src.slice(rStart, rEnd).matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) {
    provided.add(k[1]);
  }
}

const missing = [...used].filter(id => !GLOBALS.has(id) && !provided.has(id));
assert.deepEqual(missing, [], '模板綁定缺失（畫面會靜默失效）: ' + missing.slice(0, 20).join(', '));
console.log(`template binding tests PASS（${used.size} 綁定，${provided.size} 提供）`);
