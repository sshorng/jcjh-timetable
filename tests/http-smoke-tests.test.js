import assert from 'node:assert/strict';
import { test } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function startStatic() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('nf');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache'
      });
      res.end(data);
    });
  });
  return server;
}

function request(server, requestPath) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      method: 'GET',
      path: requestPath
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('http smoke tests（v2：dist 靜態殼層）', async () => {
  // v1 版測 dev-server＋舊站 HTML；v2 測 vite build 產物可被靜態伺服。
  // （需先跑過 npm run build；CI 由 e2e:boot 保證。）
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('skip: dist 不存在（先跑 npm run build）');
    return;
  }
  const server = startStatic();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const root = await request(server, '/');
    assert.equal(root.status, 200);
    assert.match(root.body.toString('utf8'), /<title>建成國中線上課表系統/);
    assert.match(root.body.toString('utf8'), /application-name" content="JCJH Timetable"/);
    assert.match(root.body.toString('utf8'), /src="\/src\/main.js"|assets\/index-[^"']+\.js/);
    // 第三方庫走 npm＋import() 懶載：殼層不可再有 CDN（版本鎖在 package.json＋lock）
    assert.doesNotMatch(root.body.toString('utf8'), /cdn\.jsdelivr\.net/, '殼層不應再載入 CDN');
    assert.match(root.body.toString('utf8'), /accounts\.google\.com\/gsi\/client/);
    assert.equal(root.headers['cache-control'], 'no-cache');

    for (const asset of ['/style.css', '/mobile.css', '/templates/accounting-template.xlsx', '/templates/activity-cover-template.docx']) {
      const res = await request(server, asset);
      assert.equal(res.status, 200, asset + ' 應隨 dist 發布');
      assert.ok(res.body.length > 0, asset + ' 不可為空');
    }
    // 懶載分包：vendor libs 應獨立成 chunk（首屏不含，匯出時才抓）
    const assets = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js'));
    assert.ok(!assets.some((f) => /^xlsx-/i.test(f)), 'xlsx 已移除，不可再有分包：' + assets.join(','));
    assert.ok(assets.some((f) => /^exceljs/i.test(f)), 'exceljs 應獨立分包');
    assert.ok(assets.some((f) => /^jszip/i.test(f)), 'jszip 應獨立分包');
    assert.ok(assets.some((f) => /^index-/.test(f)), '主包應存在');
    const nf = await request(server, '/nope-missing');
    assert.equal(nf.status, 404);
    console.log('http smoke tests PASS');
  } finally {
    server.close();
  }
});
