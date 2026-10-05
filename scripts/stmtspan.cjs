// stmtspan.js — 強健語句跨度掃描（處理 function 宣告無分號、箭頭、三元物件等）。
// 用法：const { stmtEnd } = require('./stmtspan.js');
// stmtEnd(text, startIdx) → 语句结束位置（含尾部分号）exclusive；-1 表失败。
'use strict';
function stmtEnd(text, startIdx) {
  let pd = 0, bd = 0, sd = 0, instr = null, inLineComment = false, inBlockComment = false;
  for (let j = startIdx; j < text.length; j++) {
    const ch = text[j];
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && text[j + 1] === '/') { inBlockComment = false; j++; }
      continue;
    }
    if (instr) {
      if (ch === '\\') j++;
      else if (ch === instr) instr = null;
      continue;
    }
    if (ch === '/' && text[j + 1] === '/') { inLineComment = true; j++; continue; }
    if (ch === '/' && text[j + 1] === '*') { inBlockComment = true; j++; continue; }
    if (ch === '/') {
      // regex 字面量啟發式：前一有效字元為運算子／起頭／return 等關鍵字則視為 regex
      let k = j - 1;
      while (k >= 0 && /\s/.test(text[k])) k--;
      const prev = text.slice(Math.max(0, k - 8), k + 1);
      if (k < 0 || /[,=:[(!&|?{};]$/.test(prev) || /(return|typeof|instanceof|in|of|new|delete|void|yield)$/.test(prev)) {
        j++;
        let inClass = false;
        while (j < text.length) {
          const c2 = text[j];
          if (c2 === '\\') j += 2;
          else if (c2 === '[') { inClass = true; j++; }
          else if (c2 === ']') { inClass = false; j++; }
          else if (c2 === '/' && !inClass) break;
          else j++;
        }
        continue;
      }
    }
    if (ch === "'" || ch === '"' || ch === '`') { instr = ch; continue; }
    if (ch === '(') pd++;
    else if (ch === ')') pd--;
    else if (ch === '{') bd++;
    else if (ch === '[') sd++;
    else if (ch === ']') sd--;
    else if (ch === '}') {
      bd--;
      if (bd === 0 && pd === 0 && sd === 0) {
        // 向前看：;（結束）或延續詞則繼續，否則語句結束（function 宣告等）
        let k = j + 1;
        while (k < text.length && /\s/.test(text[k])) k++;
        // 跳過註解
        if (text.startsWith('//', k)) {
          const nl = text.indexOf('\n', k);
          k = nl < 0 ? text.length : nl + 1;
          while (k < text.length && /\s/.test(text[k])) k++;
        }
        if (text[k] === ';') return k + 1;
        const rest = text.slice(k);
        if (/^(else|catch|finally)\b/.test(rest)) continue;
        if (/^[,)\]:.(+\-*/%&|^?<>]/.test(rest)) continue;
        return j + 1;
      }
      if (bd < 0) return j + 1;
    } else if (ch === ';' && pd === 0 && bd === 0 && sd === 0) {
      return j + 1;
    }
  }
  return -1;
}
module.exports = { stmtEnd };
