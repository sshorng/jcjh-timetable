// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const v1html = fs.readFileSync(path.join(here, '..', '..', 'index.html'), 'utf8');

function extractSwitch() {
  const start = v1html.indexOf('?v2 絞殺榕開關');
  expect(start, 'v1 index.html 缺少 ?v2 開關').toBeGreaterThan(-1);
  const sOpen = v1html.lastIndexOf('<script>', start);
  const sClose = v1html.indexOf('</script>', sOpen);
  expect(sOpen).toBeGreaterThan(-1);
  expect(sClose).toBeGreaterThan(sOpen);
  return v1html.slice(sOpen + '<script>'.length, sClose);
}

// 以假 location 跑開關，回傳 replace 目標（無跳轉回傳 null）
function runSwitch(search, hash) {
  let target = null;
  const sandbox = {
    window: {
      location: { search, hash: hash || '', replace: (t) => { target = t; } }
    }
  };
  const fn = new Function('window', extractSwitch());
  fn(sandbox.window);
  return target;
}

test('?v2 開關：矩陣', () => {
  expect(runSwitch('?v2', '')).toBe('./v2/dist/?v2');
  expect(runSwitch('?v2=1', '')).toBe('./v2/dist/?v2=1');
  expect(runSwitch('?class=701&v2', '#records')).toBe('./v2/dist/?class=701&v2#records');
  expect(runSwitch('', '')).toBe(null);
  expect(runSwitch('?class=701', '')).toBe(null);
  expect(runSwitch('?v22=1', '')).toBe(null);
  expect(runSwitch('?av2=1', '')).toBe(null);
});
