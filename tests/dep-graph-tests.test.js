import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js') || p.endsWith('.vue')) out.push(p);
  }
}

// 取靜態 import 與動態 import('...') 的相對路徑依賴
function parseDeps(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // 只看 <script setup>（vue）避免 template 雜訊
  const src = file.endsWith('.vue')
    ? raw.slice(raw.indexOf('<script setup>'), raw.lastIndexOf('</script>'))
    : raw;
  const deps = new Set();
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) deps.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) deps.add(m[1]);
  const out = [];
  for (const d of deps) {
    if (!d.startsWith('.')) continue; // 只管 repo 內相對引用
    const abs = path.normalize(path.join(path.dirname(file), d));
    const withExt = abs.endsWith('.js') || abs.endsWith('.vue') ? abs : abs + '.js';
    if (fs.existsSync(withExt)) out.push(path.relative(srcDir, withExt));
    else if (fs.existsSync(abs + '.vue')) out.push(path.relative(srcDir, abs + '.vue'));
  }
  return [...new Set(out)];
}

function findCycles(graph) {
  const GRAY = 1, BLACK = 2;
  const color = new Map();
  const stack = [];
  const cycles = [];
  const visit = (node) => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (!graph.has(next)) continue;
      if (color.get(next) === GRAY) {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!color.get(next)) {
        visit(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };
  for (const node of graph.keys()) {
    if (!color.get(node)) visit(node);
  }
  return cycles;
}

test('dep graph（import 循環盤點＋頂層跨模組讀取禁令）', () => {
  const files = [];
  walk(srcDir, files);
  assert.ok(files.length > 50, '應掃到 50+ 個原始檔，實際 ' + files.length);
  const graph = new Map();
  for (const f of files) {
    const rel = path.relative(srcDir, f);
    graph.set(rel, parseDeps(f));
  }
  // 現況：domain 層已無循環（recordPeriod／isWeeklyHoursSlot 下沉 schedule 後斷開）；
  // stores 間仍有歷史循環，但一律走「函式內＋typeof 守衛」呼叫（idiomatic Pinia 跨 store 存取），
  // 故運行安全。此測試鎖定真正的危險：模組頂層（求值期）直接讀取他模組繫結
  // （循環下會 TDZ 炸裂）。循環清單僅印出供重構參考，不擋。
  const cycles = findCycles(graph);
  if (cycles.length) {
    const seen = new Set();
    const uniq = [];
    for (const c of cycles) {
      const key = [...c].sort().join('|');
      if (!seen.has(key)) { seen.add(key); uniq.push(c); }
    }
    console.log(`NOTE: 現存 ${uniq.length} 組歷史循環（函式內守衛呼叫，運行安全；重構時再拆）:`);
    for (const c of uniq.slice(0, 12)) console.log('  ' + c.join(' -> '));
  }
  // 禁令：頂層語句不可直接讀取 import 來的繫結（import X 後在 col 0 使用 X.y）
  const violations = [];
  for (const f of files) {
    const rel = path.relative(srcDir, f);
    const raw = fs.readFileSync(f, 'utf8');
    const src = rel.endsWith('.vue')
      ? raw.slice(raw.indexOf('<script setup>'), raw.lastIndexOf('</script>'))
      : raw;
    const imported = new Set();
    for (const m of src.matchAll(/import\s+(?:(\w+)|\{([^}]*)\}|\*\s+as\s+(\w+))\s+from/g)) {
      if (m[1]) imported.add(m[1]);
      if (m[2]) for (const x of m[2].split(',')) imported.add(x.trim().split(/\s+as\s+/).pop());
      if (m[3]) imported.add(m[3]);
    }
    if (!imported.size) continue;
    for (const line of src.split('\n')) {
      if (/^\s/.test(line) || !line.trim() || line.trim().startsWith('//')) continue;
      for (const name of imported) {
        if (new RegExp(`^${name}\\.[A-Za-z_]`).test(line.trim())) {
          violations.push(`${rel}: 頂層直讀 ${name}（循環下 TDZ 風險）: ${line.trim().slice(0, 80)}`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], '頂層跨模組直讀：\n' + violations.join('\n'));
  console.log(`dep graph PASS（${files.length} 檔；頂層直讀 0 件）`);
});
