/**
 * exception-warnings.js — 特例調代 composer 的檢查（顯示用，不阻擋）。
 *
 * 正常流程的阻擋規則一字不動；此處只把同樣的事實翻譯成警告字串，
 * 由管理員逐條確認後背書送出。純函數，可單測。
 *
 * 輸入：
 *   aSlot / bSlot: { teacherEmail, teacherName, className, subject, dateStr, dayOfWeek, period }
 *   sub: { enabled, teacherEmail, dateStr, period }（代課段）
 *   checks: { getScheduleForDate }（可選；有才做佔位／衝堂檢查）
 */
function periodBucket(period) {
  var p = parseInt(period, 10);
  if (p === 0) return '早自習';
  if (p === 45) return '午休';
  if (p === 8) return '第8節';
  if (p >= 1 && p <= 7) return '一般';
  return '未知';
}

function cellHasClass(cell) {
  return !!(cell && (cell.className || cell.subject));
}

function safeGet(getScheduleForDate, email, dateStr, period, dayOfWeek) {
  if (typeof getScheduleForDate !== 'function' || !email || !dateStr || period == null) return null;
  try {
    return getScheduleForDate(email, dateStr, period, dayOfWeek) || null;
  } catch (e) {
    return null;
  }
}

function buildExceptionWarnings(input) {
  input = input || {};
  var warnings = [];
  var a = input.aSlot || {};
  var b = input.bSlot || {};
  var sub = input.sub || {};
  var get = input.checks && input.checks.getScheduleForDate;
  if (!a.teacherEmail || !b.teacherEmail) return ['請先選定雙方教師與課堂'];
  if (!a.dateStr || a.period == null || !b.dateStr || b.period == null) {
    return ['請先選定雙方日期與節次'];
  }

  var aClass = String(a.className || '');
  var bClass = String(b.className || '');
  if (aClass && bClass && aClass !== bClass) {
    warnings.push('跨班調課：' + aClass + ' ⇄ ' + bClass + '（正常流程僅允許同班）');
  }
  var aSubj = String(a.subject || '');
  var bSubj = String(b.subject || '');
  if (aSubj && bSubj && aSubj !== bSubj) {
    warnings.push('科目不同：' + aSubj + ' ⇄ ' + bSubj);
  }
  var aBucket = periodBucket(a.period);
  var bBucket = periodBucket(b.period);
  if (aBucket !== bBucket) {
    warnings.push('節次類型不同：' + aBucket + ' ⇄ ' + bBucket + '（正常流程第8節只對第8節）');
  }

  if (typeof get === 'function') {
    var bCell = safeGet(get, b.teacherEmail, b.dateStr, b.period, b.dayOfWeek);
    if (bCell && bCell.isPending) {
      warnings.push('對方該節有進行中申請（' + (bCell.pendingText || '待生效') + '）：若該筆未生效將形成衝堂');
    }
    var aAtB = safeGet(get, a.teacherEmail, b.dateStr, b.period, b.dayOfWeek);
    if (cellHasClass(aAtB)) {
      warnings.push('A 在對方時段已有課程，換入後同節兩堂（須由代課段消化或確認併班）');
    }
    var bAtA = safeGet(get, b.teacherEmail, a.dateStr, a.period, a.dayOfWeek);
    if (cellHasClass(bAtA)) {
      warnings.push('B 在 A 時段已有課程，換入後同節兩堂（須由代課段消化或確認併班）');
    }
    if (sub.enabled) {
      if (!sub.teacherEmail || !sub.dateStr || sub.period == null) {
        warnings.push('代課段資料不完整');
      } else {
        var sCell = safeGet(get, sub.teacherEmail, sub.dateStr, sub.period, sub.dayOfWeek);
        if (cellHasClass(sCell)) {
          warnings.push('代課人該節已有課程');
        }
        if (sCell && sCell.isPending) {
          warnings.push('代課人該節有進行中申請（' + (sCell.pendingText || '待生效') + '）');
        }
      }
    }
  }
  return warnings;
}

export { buildExceptionWarnings, periodBucket };
