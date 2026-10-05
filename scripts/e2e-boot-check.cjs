#!/usr/bin/env node
'use strict';
/* e2e-boot-check.cjs — production bundle 真瀏覽器開機冒煙（手動閘，不進 vitest）。
 * 用法：npm run e2e:boot（會先 vite build；需本機有 Playwright Chromium，見下方搜尋順序）
 * 斷言：dist 首屏在 Chromium 渲染出 login 畫面、零 console 錯誤、#app 唯一。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const DIST = path.resolve(__dirname, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function findChrome() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const base = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  const cands = [];
  try {
    // 版號由新到舊（舊版 headless 渲染行為不一致，見 1223 dump 截斷）；完整 chrome 優先於 shell
    const dirs = fs.readdirSync(base).sort().reverse();
    for (const d of dirs) cands.push(path.join(base, d, 'chrome-win64', 'chrome.exe'));
    for (const d of dirs) cands.push(path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'));
  } catch (e) { /* 無 ms-playwright 目錄 */ }
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('e2e-boot-check: dist 不存在，先跑 npm run build');
  process.exit(2);
}
const CHROME = findChrome();
if (!CHROME) {
  console.error('e2e-boot-check: 找不到 Chromium（設 CHROME_BIN 或安裝 Playwright 瀏覽器）');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.resolve(DIST, '.' + p);
  if (process.env.E2E_DEBUG) console.log('REQ ' + req.url + ' -> ' + fp);
  if (!fp.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(0, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  execFile(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--virtual-time-budget=10000', '--dump-dom', url],
    { timeout: 90000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      server.close();
      const html = stdout || '';
      const body = (html.match(/<body[\s\S]*<\/body>/) || [''])[0];
      if (process.env.E2E_DEBUG) {
        console.log('CHROME=' + CHROME);
        console.log('HTML_LEN=' + html.length + ' BODY_LEN=' + body.length);
        console.log('BODY_FULL=' + body.replace(/\s+/g, ' ').slice(0, 400) + '...TAIL=' + body.replace(/\s+/g, ' ').slice(-200));
        console.log('STDERR_HEAD=' + (stderr || '').slice(0, 500).replace(/\s+/g, ' '));
      }
      const fails = [];
      const appCount = (body.match(/id="app"/g) || []).length;
      if (appCount !== 1) fails.push('#app 數量=' + appCount + '（應為 1）');
      // 未登入首屏＝login 卡（結構完整即開機成功；位元組數不判，login 本來就小）
      for (const needle of ['login-title', 'login-container', 'domain-hint', 'btn-google']) {
        if (!body.includes(needle)) fails.push('首屏缺 ' + needle);
      }
      const cerrs = (stderr || '').split('\n').filter((l) => /CONSOLE|Uncaught/i.test(l)).slice(0, 10);
      if (cerrs.length) fails.push('console 錯誤:\n' + cerrs.map((l) => '  ' + l.slice(0, 200)).join('\n'));
      if (err && !/timeout/i.test(String((err && err.message) || ''))) fails.push('CHROME_ERR=' + err.message);
      if (fails.length) { console.error('BOOT_CHECK=FAIL\n' + fails.join('\n')); process.exitCode = 1; }
      else console.log('BOOT_CHECK=PASS (chrome ' + path.basename(path.dirname(path.dirname(CHROME))) + ')');
    });
});
