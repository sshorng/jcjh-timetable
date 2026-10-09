import assert from 'node:assert/strict';
import { test } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFilesCached } from './helpers/module-deps-scan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

// v1 module-deps 的 v2 版：靜態掃描，揪出「用未宣告／未 import 之識別符」
// （TemplateBuffer、getScheduleSpecialTags 兩次實禍皆屬此類）。
// 掃描實作見 tests/helpers/module-deps-scan.js（純函式，供測試與 profiling 共用）。
// 增量快取：內容 hash 未變即沿用上次結果，規則（JS／KEYWORDS／演算法版本）一變就全掃；
// CI 全新安裝本來就無快取，永遠全掃。快取只加速，不削弱閘門。
test('module deps tests（v2 原生：未綁定識別符掃描）', () => {
  const { files, bad, scanned, reused } = scanFilesCached(srcDir);
  assert.ok(files.length > 40, '應掃到 40+ 個 v2 模組');
  assert.deepEqual(bad, {}, '模組不可引用未宣告／未 import 之識別符：' + JSON.stringify(bad).slice(0, 500));
  console.log(`module deps tests PASS（${files.length} 檔：新掃 ${scanned}／快取命中 ${reused}）`);
});
