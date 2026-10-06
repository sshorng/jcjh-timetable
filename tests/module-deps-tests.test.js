import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

// v1 module-deps 的 v2 版：靜態掃描，揪出「用未宣告／未 import 之識別符」
// （TemplateBuffer、getScheduleSpecialTags 兩次實禍皆屬此類）。
// 允許：import／區域宣告／函式參數／deps 解構／JS 內建＋瀏覽器全域／Vue API。
const JS = new Set((
  'window,document,localStorage,sessionStorage,console,Date,Math,JSON,Object,String,Number,Array,Boolean,RegExp,Error,Map,Set,WeakMap,Promise,parseInt,parseFloat,isNaN,isFinite,encodeURIComponent,decodeURIComponent,clearTimeout,setTimeout,clearInterval,setInterval,URL,Blob,alert,confirm,location,navigator,fetch,atob,undefined,NaN,Infinity,Intl,FormData,FileReader,Uint8Array,TextDecoder,performance,structuredClone,requestAnimationFrame,globalThis,' +
  'ref,computed,watch,onMounted,onUnmounted,nextTick,defineStore,storeToRefs,createPinia,setActivePinia,defineComponent,' +
  'AbortController,ResizeObserver,google,arguments,' +
  'Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URLSearchParams,URL,Image'
).split(','));
const KEYWORDS = new Set((
  'break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,false,finally,for,' +
  'function,if,import,in,instanceof,new,null,return,super,switch,this,throw,true,try,typeof,var,void,while,with,' +
  'let,static,enum,await,async,get,set,of,yield,as,from'
).split(','));

// 狀態機剝除：註解／字串／模板（含嵌套 ${}）／正則一律換成空白（保留換行）。
// 取代前面一串各自有死角的正則。
function stripNoise(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  const pushChunk = (s) => { out.push(s.replace(/[^\n]/g, ' ')); };
  // 行註解放最後處理（此时字串／模板／正則已清，殘留 // 必為註解；//前不限空白）
  // 回頭找上一個有效字元（跳空白／註解不計，只求近似）
  const prevSig = (pos) => {
    let j = pos - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    return j >= 0 ? src[j] : '';
  };
  while (i < n) {
    const c = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      pushChunk(src.slice(i, j));
      i = j;
    } else if (two === '/*') {
      const j = src.indexOf('*/', i + 2);
      const k = j < 0 ? n : j + 2;
      pushChunk(src.slice(i, k));
      i = k;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
      if (j < n && src[j] === c) j++;
      pushChunk(src.slice(i, j));
      i = j;
    } else if (c === '`') {
      // 模板：frame 堆疊處理嵌套 ${}（內可再含字串／模板）
      let j = i + 1;
      const stack = [{ mode: 'tpl', depth: 0 }];
      while (j < n && stack.length) {
        const top = stack[stack.length - 1];
        const ch = src[j];
        if (top.mode === 'tpl') {
          if (ch === '\\') j += 2;
          else if (ch === '`') { j++; stack.pop(); }
          else if (ch === '$' && src[j + 1] === '{') { stack.push({ mode: 'expr', depth: 1 }); j += 2; }
          else j++;
        } else if (ch === "'" || ch === '"') {
          let k = j + 1;
          while (k < n && src[k] !== ch && src[k] !== '\n') { if (src[k] === '\\') k++; k++; }
          j = k < n && src[k] === ch ? k + 1 : k;
        } else if (ch === '`') {
          stack.push({ mode: 'tpl', depth: 0 }); j++;
        } else if (ch === '/' && src[j + 1] !== '/' && src[j + 1] !== '*') {
          // expr 內的正則（如 /a{2}/，大括號不可計入 depth；除法不處理）
          let p = j - 1;
          while (p >= 0 && /\s/.test(src[p])) p--;
          const pc = p >= 0 ? src[p] : '';
          if (/[=(:,[!&|?{};]/.test(pc)) {
            let k = j + 1;
            let cls = false;
            while (k < n) {
              const c2 = src[k];
              if (c2 === '\\') k += 2;
              else if (c2 === '[') { cls = true; k++; }
              else if (c2 === ']') { cls = false; k++; }
              else if (c2 === '/' && !cls) break;
              else if (c2 === '\n' || c2 === '`') break;
              else k++;
            }
            j = k < n && src[k] === '/' ? k + 1 : j + 1;
          } else j++;
        } else if (ch === '{') { top.depth++; j++; }
        else if (ch === '}') {
          top.depth--; j++;
          if (top.depth === 0) stack.pop();
        } else j++;
      }
      pushChunk(src.slice(i, j));
      i = j;
    } else if (c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*') {
      // 正則或除法：看前一有效字元
      const p = prevSig(i);
      const tail12 = src.slice(Math.max(0, i - 12), i);

      if (/[=(:,[!&|?{};]/.test(p) || /=>\s*$/.test(tail12) || /return|typeof|case|do|else|in|of|new|delete|void|instanceof/.test(tail12.match(/([A-Za-z_][A-Za-z0-9_]*)\s*$/)?.[1] || '\x00')) {
        let j = i + 1;
        let cls = false;
        while (j < n) {
          const ch = src[j];
          if (ch === '\\') j += 2;
          else if (ch === '[') { cls = true; j++; }
          else if (ch === ']') { cls = false; j++; }
          else if (ch === '/' && !cls) break;
          else if (ch === '\n') break;
          else j++;
        }
        if (j < n && src[j] === '/') {
          j++;
          while (j < n && /[gimsuy]/.test(src[j])) j++;
          pushChunk(src.slice(i, j));
          i = j;
          continue;
        }
        out.push(c);
        i++;
      } else {
        out.push(c);
        i++;
      }
    } else {
      out.push(c);
      i++;
    }
  }
  return out.join('');
}

function checkFile(rel) {
  const raw = fs.readFileSync(path.join(srcDir, rel), 'utf8');
  const src = stripNoise(raw);
  // import  binding
  const imported = new Set();
  for (const m of src.matchAll(/import\s+(?:(\w+)|\{([^}]*)\}|\*\s+as\s+(\w+))\s+from/g)) {
    if (m[1]) imported.add(m[1]);
    if (m[2]) for (const x of m[2].split(',')) imported.add(x.trim().split(/\s+as\s+/).pop());
    if (m[3]) imported.add(m[3]);
  }
  // 區域宣告＋函式名＋參數（含解構／多參數／箭頭）
  const locals = new Set();
  const addIdents = (frag) => {
    for (const m of frag.matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) {
      if (!KEYWORDS.has(m[1])) locals.add(m[1]);
    }
  };
  for (const m of src.matchAll(/(?:var|const|let) ([A-Za-z_][A-Za-z0-9_]*)/g)) locals.add(m[1]);
  // 解構宣告：const { a, b: c }／const [x, ...rest]
  for (const m of src.matchAll(/(?:var|const|let) \{([^}]*)\}/g)) addIdents(m[1]);
  for (const m of src.matchAll(/(?:var|const|let) \[([^\]]*)\]/g)) addIdents(m[1]);
  for (const m of src.matchAll(/function ([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) locals.add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g)) locals.add(m[1]);
  // 箭頭參數：單識別符／括號列／解構（含預設值剝除）
  for (const m of src.matchAll(/[=(,]\s*([A-Za-z_][A-Za-z0-9_]*)\s*=>/g)) locals.add(m[1]);
  for (const m of src.matchAll(/\(\s*([^()]*?)\s*\)\s*=>/g)) {
    for (const p of m[1].split(',')) {
      const id = p.trim().split(/\s*=\s*/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) locals.add(id);
      else addIdents(p);
    }
  }
  for (const m of src.matchAll(/function\s*[A-Za-z_0-9$]*\s*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) {
      const id = p.trim().split(/\s*=\s*/)[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) locals.add(id);
      else addIdents(p);
    }
  }
  // 解構 deps：var x = deps.x／const { a } = deps
  for (const m of src.matchAll(/var ([A-Za-z_][A-Za-z0-9_]*) = deps\./g)) locals.add(m[1]);
  const ID = `[A-Za-z_${'\\u4e00-\\u9fff\\u3400-\\u4dbf'}][A-Za-z0-9_${'\\u4e00-\\u9fff\\u3400-\\u4dbf'}]*`;
  const used = new Set();
  for (const m of src.matchAll(new RegExp(`(?<![.\\w$\\u4e00-\\u9fff\\u3400-\\u4dbf])(${ID})`, 'g'))) {
    // 物件鍵 `{ key:`／`, key:` 不算讀取（簡寫 `{ x }` 無冒號，仍算讀取）
    const after = src.slice(m.index + m[1].length).match(/^\s*:/);
    if (after) {
      const before = src.slice(0, m.index).match(/[{,]\s*$/);
      if (before) continue;
    }
    used.add(m[1]);
  }
  // 檔內另有 typeof／window 守衛者（如 CDN 的 ExcelJS／JSZip），視為有守衛的外部全域
  const missing = [...used].filter(id => {
    if (imported.has(id) || locals.has(id) || JS.has(id) || KEYWORDS.has(id)) return false;
    if (/^[一-鿿㐀-䶿]+$/.test(id)) return false; // 純 CJK 殘留（如註解漏網）不算
    if (new RegExp('typeof\\s+' + id + '\\b').test(src)) return false;
    if (new RegExp('window\\.' + id + '\\b').test(src)) return false;
    return true;
  });
  return [...new Set(missing)];
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(path.relative(srcDir, p));
  }
}

test('module deps tests（v2 原生：未綁定識別符掃描）', () => {
  const files = [];
  walk(srcDir, files);
  assert.ok(files.length > 40, '應掃到 40+ 個 v2 模組');
  const bad = {};
  for (const f of files) {
    const missing = checkFile(f);
    if (missing.length) bad[f] = missing;
  }
  assert.deepEqual(bad, {}, '模組不可引用未宣告／未 import 之識別符：' + JSON.stringify(bad).slice(0, 500));
  console.log(`module deps tests PASS（${files.length} 檔全掃描）`);
});
