#!/usr/bin/env node
'use strict';
/**
 * sync-public.cjs — v2 prebuild：把 V1 根目錄的靜態資源同步進 v2/public/。
 *
 * 單一真相來源＝根目錄（V1 照改）；v2 每次 build 前自動同步，零漂移。
 * 來源遺失時直接報錯中斷 build（fail-closed），避免帶著缺件上線。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const pub = path.resolve(__dirname, '..', 'public');

const FILES = [
  'style.css',
  'mobile.css',
  'onboarding-tour.css',
  'templates/activity-cover-template.docx',
  'templates/invigilation-template.xlsx',
  'templates/period8-accounting-template.xlsx',
  'templates/accounting-template.xlsx'
];

let bytes = 0;
for (const rel of FILES) {
  const src = path.join(root, rel);
  const dst = path.join(pub, rel);
  if (!fs.existsSync(src)) {
    console.error('[sync-public] 缺少來源檔，中止：' + src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  bytes += fs.statSync(dst).size;
  console.log('[sync-public] ' + rel);
}
console.log('[sync-public] OK：' + FILES.length + ' 檔，共 ' + (bytes / 1024).toFixed(1) + ' KB');
