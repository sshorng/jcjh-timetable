#!/usr/bin/env node
'use strict';
/* check-bundle-size.cjs — 主包體積閘門（守住 Phase 1 成果，不可無聲退化）。
 *
 * 用法：npm run check:size（需先 npm run build）
 *
 * 口徑陷阱（2026-10-10 實測確認）：
 *   vite build 報告的 kB 是「字元數 / 1000」，不是 UTF-8 位元組。
 *   本專案含大量中文字元（17,050 字），每字 3 bytes，
 *   故 vite 顯示 693.96 kB 的主包，實際檔案為 728,030 bytes ＝ 710.97 KiB。
 *   瀏覽器下載的是位元組，所以本閘門一律用 bytes / 1024（KiB），
 *   不採 vite 口徑，避免「數字漂亮但實際沒降」。
 *
 * 上限：raw 720 KiB／gzip 220 KiB。
 *   raw：原始 1,172 kB（vite 口徑）→ 現 710.97 KiB（實際位元組），約降 39%。
 *   原始計劃寫的「<700 kB」是 vite 口徑；改用真實位元組後差 11 KiB（約 1.5%），
 *   對使用者無感，故 re-baseline 為 720 KiB 並在此明文記錄，不假裝達標。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 2026-10-15 再 re-baseline 為 724 KiB：296e43a「活動互代綁定空堂事件」
// 新增 ui-mutual／stores-match 約 300 行（實測 717.13 → 720.64 KiB，gzip 210.61 → 212.42 KiB），
// 屬功能成長而非閘門退化（無新增靜態 import、modal 未改回靜態、CSS 未搬回 public/），
// 故上調 4 KiB 並在此明文記錄，不假裝是「瘦身」成果。
const RAW_LIMIT_KIB = 724;
const GZIP_LIMIT_KIB = 220;
const DIST = path.resolve(__dirname, '..', 'dist', 'assets');

function fail(msg) {
  console.error('SIZE_GATE=FAIL ' + msg);
  process.exit(1);
}

if (!fs.existsSync(DIST)) fail('dist/assets 不存在，先跑 npm run build');
const files = fs.readdirSync(DIST).filter(f => /^index-.*\.js$/.test(f));
if (files.length !== 1) fail(`主包檔應恰為 1 個，實得 ${files.length}（${files.join(', ') || '無'}）`);

const file = path.join(DIST, files[0]);
const buf = fs.readFileSync(file);
const rawKiB = buf.length / 1024;
const gzipKiB = zlib.gzipSync(buf, { level: 9 }).length / 1024;

console.log('SIZE_GATE 主包 ' + files[0]);
console.log(`  bytes  ${buf.length}`);
console.log(`  raw    ${rawKiB.toFixed(2)} KiB（上限 ${RAW_LIMIT_KIB} KiB）`);
console.log(`  gzip   ${gzipKiB.toFixed(2)} KiB（上限 ${GZIP_LIMIT_KIB} KiB）`);

if (rawKiB > RAW_LIMIT_KIB) {
  console.error(`\n主包 ${rawKiB.toFixed(2)} KiB 超過 ${RAW_LIMIT_KIB} KiB（超出 ${(rawKiB - RAW_LIMIT_KIB).toFixed(2)} KiB）。`);
  console.error('常見成因：新增靜態 import 到閘門之外、modal 忘記 defineAsyncComponent、CSS 搬回 public/。');
  console.error('解法參考：閘門模式（動態 import() 只能寫在 *-gates.js 內，呼叫端靜態引用）。');
  process.exit(1);
}
if (gzipKiB > GZIP_LIMIT_KIB) {
  console.error(`\n主包 gzip ${gzipKiB.toFixed(2)} KiB 超過 ${GZIP_LIMIT_KIB} KiB。`);
  process.exit(1);
}
console.log('SIZE_GATE=PASS');