#!/usr/bin/env node
'use strict';
/* mask.cjs — 位置保持遮罩：字串／註解／模板本文→空白，${} 內視為 code。
 * 不變量：maskCode(s).length === s.length 恆成立（違者拋錯）。
 */
function maskCode(src) {
  const n = src.length;
  let out = '';
  let i = 0;
  function isRegexStart(idx) {
    let k = idx - 1;
    while (k >= 0 && /\s/.test(src[k])) k--;
    if (k < 0) return true;
    const prev = src.slice(Math.max(0, k - 8), k + 1);
    if (/[,=:[(!&|?{};]$/.test(prev)) return true;
    return /(return|typeof|instanceof|in|of|new|delete|void|yield|do|else)$/.test(prev);
  }
  function skipRegex(idx) {
    let k = idx + 1, inClass = false;
    while (k < n) {
      const c = src[k];
      if (c === '\\') { k += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) return k + 1;
      k++;
    }
    return k;
  }
  function maskTemplateBody(k) {
    // k 指向開頭反引號之後；回傳關閉反引號之後位置
    while (k < n) {
      const c = src[k];
      if (c === '\\') { out += '  '; k += 2; continue; }
      if (c === '`') { out += ' '; return k + 1; }
      if (c === '$' && src[k + 1] === '{') {
        out += '  ';
        k = maskExprBody(k + 2);
        continue;
      }
      out += ' ';
      k++;
    }
    return k;
  }
  function maskExprBody(k) {
    // ${ 之後；保留 code，遇到配對 } 回傳其後位置
    let depth = 1;
    while (k < n && depth > 0) {
      const c = src[k];
      if (c === "'" || c === '"') {
        let j = k + 1;
        while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
        j = Math.min(j + 1, n);
        out += ' '.repeat(j - k);
        k = j;
        continue;
      }
      if (c === '`') {
        out += ' ';
        k = maskTemplateBody(k + 1);
        continue;
      }
      if (c === '/' && src[k + 1] === '/') {
        let j = src.indexOf('\n', k);
        if (j < 0) j = n;
        out += ' '.repeat(j - k);
        k = j;
        continue;
      }
      if (c === '/' && isRegexStart(k)) {
        const j = skipRegex(k);
        out += ' '.repeat(j - k);
        k = j;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          out += ' ';
          return k + 1;
        }
      }
      out += c;
      k++;
    }
    return k;
  }
  while (i < n) {
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < n && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
      j = Math.min(j + 1, n);
      out += ' '.repeat(j - i);
      i = j;
    } else if (ch === '`') {
      out += ' ';
      i = maskTemplateBody(i + 1);
    } else if (ch === '/' && src[i + 1] === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      out += ' '.repeat(j - i);
      i = j;
    } else if (ch === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i);
      j = j < 0 ? n : j + 2;
      out += ' '.repeat(j - i);
      i = j;
    } else if (ch === '/' && isRegexStart(i)) {
      const j = skipRegex(i);
      out += ' '.repeat(j - i);
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  if (out.length !== n) throw new Error('mask 長度漂移 ' + n + ' -> ' + out.length);
  return out;
}

if (require.main === module) {
  const cases = [
    "const user = ref(null);\r",
    "const a = `第 ${wn} 週`;",
    "x.replace(/\\d{2}/g, '')",
    "s.split(/[、,，/／|｜\\s]+/)",
    "`outer ${cond ? `inner ${x}` : 'y'} end`",
    "const re = /a{2,3}b/; foo(re);",
    "a ? b : c; // comment\nx = 1; /* block { } */ y = `${a}`;",
    "if (x) { y(); } else { z(); }",
    "const f = (a, b) => a + b;",
    "`a${ {k: v} }b`",
    "'it\\'s ${notcode}' + realCode",
    "a / b / c;",
    "x = a / b;",
    "return /re/.test(s);",
    "`${map(list, x => x * 2).join(',')}`"
  ];
  let ok = 0;
  for (const [i, c] of cases.entries()) {
    try {
      maskCode(c);
      ok++;
    } catch (e) {
      console.log('DRIFT case', i, JSON.stringify(c), e.message);
    }
  }
  console.log(ok + '/' + cases.length + ' length-ok');
  const m2 = maskCode("const t = `hi ${user} and ${a + b}`;");
  console.log('template expr kept:', m2.includes('user') && m2.includes('a + b'));
  const m3 = maskCode("foo('userStr'); bar(userReal);");
  console.log('string blanked, code kept:', !m3.includes('userStr') && m3.includes('userReal'));
  const m4 = maskCode("s.split(/[、,，/／|｜\\s]+/); f(x);");
  console.log('regex with braces ok:', m4.includes('f(x)'));
}
module.exports = { maskCode };
