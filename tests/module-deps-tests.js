#!/usr/bin/env node
'use strict';

/**
 * 模組依賴完整性測試（2A 拆分的安全網第二層）
 *
 * setup-smoke 只驗 setup() 可執行；各 Ui* 模組內 computed／handler 多為懶求值，
 * 缺 dep 在 smoke 階段不炸、實機操作才炸（ReferenceError）。
 * 本測試靜態掃描各模組：凡引用 app.js setup 作用域名稱，必須經 deps 注入或在模組內定義。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const setupNames = new Set();
for (const m of app.matchAll(/^    (?:const|let|var|function|async function) ([A-Za-z0-9_]+)/gm)) setupNames.add(m[1]);
for (const m of app.matchAll(/^\s{6}([A-Za-z0-9_]+),?\s*$/gm)) setupNames.add(m[1]);

const JS = new Set(('window,document,localStorage,sessionStorage,console,Date,Math,JSON,Object,String,Number,Array,Boolean,RegExp,Error,Map,Set,WeakMap,Promise,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,clearTimeout,setTimeout,clearInterval,setInterval,URL,Blob,showToast,showConfirm,Vue,computed,ref,watch,nextTick,createApp,alert,confirm,location,navigator,fetch,atob,undefined,NaN,Infinity,Intl,FormData,FileReader,Uint8Array,TextDecoder,performance,structuredClone,requestAnimationFrame,Google,XMLHttpRequest,deps').split(','));

function checkModule(file) {
  const raw = fs.readFileSync(path.join(root, file), 'utf8');
  const src = stripNoise(raw);
  const depVars = new Set([...src.matchAll(/var ([A-Za-z0-9_]+) = deps\./g)].map(m => m[1]));
  const locals = new Set([...src.matchAll(/(?:var|const|let) ([A-Za-z0-9_]+) ?=/g)].map(m => m[1]));
  for (const m of src.matchAll(/function ([A-Za-z0-9_]+)\s*\(/g)) locals.add(m[1]);
  const used = new Set([...src.matchAll(/(?<![.\w$])([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]));
  const missing = [...used].filter(id => !depVars.has(id) && !locals.has(id) && !JS.has(id) && setupNames.has(id));
  assert.deepEqual([...new Set(missing)], [], file + ' 有未注入的 setup 依賴');
  console.log(file + ' deps OK（' + depVars.size + ' 注入）');
}

checkModule('ui-data.js');
checkModule('ui-submit.js');
checkModule('ui-backoffice.js');
checkModule('ui-match.js');
checkModule('ui-report.js');
checkModule('ui-print.js');
checkModule('ui-interaction.js');
checkModule('ui-homeroom.js');
checkModule('ui-auth.js');
checkModule('ui-proxy.js');
checkModule('ui-schedule.js');
checkModule('ui-sync.js');
checkModule('ui-schoolswap.js');
checkModule('ui-tour.js');

console.log('module deps tests PASS');
