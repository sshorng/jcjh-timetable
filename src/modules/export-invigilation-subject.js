/**
 * export-invigilation-subject.js — 段考監考表考試科目推論共用模組（純函式、無依賴）
 *
 * 背景：巡堂任務帶年級（巡七／巡八／巡九），而該節該年級巡堂老師的任課科目
 * 通常就是考試科目。班級版用三位巡堂投票填 Row2；教師版用各年級巡堂填 B4:X6。
 *
 * 科目對照（20261013 版：只合併社會；生物／理化／自然各自獨立）：
 *   地理／歷史／公民 → 社會，其餘原名直用。
 * 要增減合併只改 SUBJECT_MERGE_MAP。
 */

function normText(v) {
  return String(v == null ? '' : v).replace(/[　\s]+/g, '').trim();
}

var SUBJECT_MERGE_MAP = {
  '地理': '社會',
  '歷史': '社會',
  '公民': '社會'
};

function normalizeExamSubject(subject) {
  var s = String(subject == null ? '' : subject).trim();
  if (!s) return '';
  var key = s.replace(/[　\s]+/g, '');
  if (Object.prototype.hasOwnProperty.call(SUBJECT_MERGE_MAP, key)) {
    return SUBJECT_MERGE_MAP[key];
  }
  return s;
}

function isPatrolText(text) {
  var s = normText(text);
  return s === '巡堂' || s.indexOf('巡堂') === 0;
}

/**
 * 巡堂分級：回傳 '七' | '八' | '九' | null。
 * 支援：巡七、巡7、七年級巡堂、段考巡七、巡堂(七) 等；數字須緊貼巡字
 * （巡堂704 不算七，避免班級編號誤判）。
 */
function parsePatrolGrade(s) {
  var t = normText(s);
  if (!t || t.indexOf('巡') < 0) return null;
  var m = t.match(/[七八九]/);
  if (m) return m[0];
  m = t.match(/巡\s*([789])|([789])\s*巡/);
  if (m) return m[1] === '7' || m[2] === '7' ? '七' : (m[1] === '8' || m[2] === '8' ? '八' : '九');
  m = t.match(/([789])\s*年\s*級/);
  if (m) return m[1] === '7' ? '七' : (m[1] === '8' ? '八' : '九');
  return null;
}

/**
 * 回傳 '七' | '八' | '九' | 'plain'（有巡無級）| null（非巡堂）。
 * 非「巡堂」開頭者：只有帶分級（巡七…）才視為巡堂，避免班級文字誤收。
 */
function detectPatrolKind(text) {
  var s = normText(text);
  if (!s || s.indexOf('巡') < 0) return null;
  if (s !== '巡堂' && s.indexOf('巡堂') !== 0) {
    return parsePatrolGrade(s);
  }
  var g = parsePatrolGrade(s);
  return g || 'plain';
}

/**
 * 多數決：最多票者；平票或無有效票回 ''（留白手填）。
 * votes 為已正規化科目字串陣列（空字串會被忽略）。
 */
function voteSubject(votes) {
  var counts = Object.create(null);
  var order = [];
  (votes || []).forEach(function (v) {
    var s = String(v || '').trim();
    if (!s) return;
    if (!counts[s]) {
      counts[s] = 0;
      order.push(s);
    }
    counts[s] += 1;
  });
  var best = '';
  var bestCount = 0;
  var tied = false;
  order.forEach(function (s) {
    if (counts[s] > bestCount) {
      best = s;
      bestCount = counts[s];
      tied = false;
    } else if (counts[s] === bestCount) {
      tied = true;
    }
  });
  return tied ? '' : best;
}

/**
 * 非法 XML 1.0 字元會讓整份 xlsx 在 Excel 桌面版跳「已修復」且內容全空；
 * 寫入儲存格前一律清除（保留 \t \n \r；中文不受影響）。
 */
var ILLEGAL_XML_SRC = '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]';
var ILLEGAL_XML_RE = new RegExp(ILLEGAL_XML_SRC, 'g');
var ILLEGAL_XML_TEST = new RegExp(ILLEGAL_XML_SRC);

function sanitizeExamText(v) {
  if (v == null) return '';
  ILLEGAL_XML_RE.lastIndex = 0;
  return String(v).replace(ILLEGAL_XML_RE, '');
}

export {
  SUBJECT_MERGE_MAP,
  normalizeExamSubject,
  isPatrolText,
  parsePatrolGrade,
  detectPatrolKind,
  voteSubject,
  sanitizeExamText,
  ILLEGAL_XML_TEST
};
