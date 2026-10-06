/**
 * exception-warnings.js — 特例調代 composer 的檢查（顯示用，不阻擋）。
 *
 * 正常流程的阻擋規則一字不動；此處只把同樣的事實翻譯成警告字串，
 * 由管理員逐條確認後背書送出。純函數，可單測。
 * 另收編舊同節互換的三條專屬檢查（抽離對等、課程須不同），同樣降級為警告。
 *
 * leg: { kind: 'exchange'|'substitution',
 *        aSlot: {teacherEmail,teacherName,className,subject,attr,specialTags,dateStr,dayOfWeek,period},
 *        bSlot: {...}（調課對象端；代課腿不用）,
 *        sub: {teacherEmail,dateStr,period,fee}（代課腿用） }
 * checks: { getScheduleForDate }（可選；有才做佔位／衝堂檢查）
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

function slotKey(email, dateStr, period) {
  return String(email || '').trim().toLowerCase() + '|' + String(dateStr || '').slice(0, 10) + '|' + parseInt(period, 10);
}

function hasPullOutTag(value) {
  return String(value || '').split(/[、,，;；/／|｜\s]+/).some(function (part) {
    return String(part || '').trim() === '抽離';
  });
}

function slotIsPullOut(slot) {
  if (!slot) return false;
  if (slot.isPullOut === true) return true;
  var attr = String(slot.attr || '').trim();
  if (attr.indexOf('抽離') >= 0) return true;
  return hasPullOutTag(slot.specialTags);
}

function buildExceptionLegWarnings(leg, checks) {
  var warnings = [];
  var a = (leg && leg.aSlot) || {};
  var b = (leg && leg.bSlot) || {};
  var sub = (leg && leg.sub) || {};
  var get = checks && checks.getScheduleForDate;
  if (leg.kind === 'exchange') {
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
    var aPull = slotIsPullOut(a);
    var bPull = slotIsPullOut(b);
    if (aPull !== bPull) {
      warnings.push('抽離不對等：抽離課僅可與另一節抽離課互換');
    }
    if (aClass && bClass && aClass === bClass && aSubj && bSubj && aSubj === bSubj
        && String(a.dateStr).slice(0, 10) === String(b.dateStr).slice(0, 10)
        && parseInt(a.period, 10) === parseInt(b.period, 10)) {
      warnings.push('雙方為同一堂課：無需互換');
    }
    if (typeof get === 'function') {
      var bCell = safeGet(get, b.teacherEmail, b.dateStr, b.period, b.dayOfWeek);
      if (bCell && bCell.isPending) {
        warnings.push('對方該節有進行中申請（' + (bCell.pendingText || '待生效') + '）：若該筆未生效將形成衝堂');
      }
      var aAtB = safeGet(get, a.teacherEmail, b.dateStr, b.period, b.dayOfWeek);
      if (cellHasClass(aAtB)) {
        warnings.push('A 在對方時段已有課程，換入後同節兩堂');
      }
      var bAtA = safeGet(get, b.teacherEmail, a.dateStr, a.period, a.dayOfWeek);
      if (cellHasClass(bAtA)) {
        warnings.push('B 在 A 時段已有課程，換入後同節兩堂');
      }
    }
    return warnings;
  }
  if (!sub.teacherEmail || !sub.dateStr || sub.period == null) {
    return ['代課段資料不完整'];
  }
  if (typeof get === 'function') {
    var sCell = safeGet(get, sub.teacherEmail, sub.dateStr, sub.period, sub.dayOfWeek);
    if (cellHasClass(sCell)) {
      warnings.push('代課人該節已有課程');
    }
    if (sCell && sCell.isPending) {
      warnings.push('代課人該節有進行中申請（' + (sCell.pendingText || '待生效') + '）');
    }
  }
  return warnings;
}

/** 跨腿檢查：同教師同格出現兩次（疊堂）、同組教師出現多次（順序提醒） */
function buildExceptionCrossWarnings(legs) {
  var warnings = [];
  legs = legs || [];
  var seen = {};
  var pairCount = {};
  legs.forEach(function (leg, i) {
    var endpoints = [];
    if (leg.kind === 'exchange') {
      var a = leg.aSlot || {};
      var b = leg.bSlot || {};
      endpoints.push({ email: a.teacherEmail, dateStr: a.dateStr, period: a.period, label: '第' + (i + 1) + '腿A端' });
      endpoints.push({ email: b.teacherEmail, dateStr: b.dateStr, period: b.period, label: '第' + (i + 1) + '腿B端' });
      var pair = [String(a.teacherEmail || '').trim().toLowerCase(), String(b.teacherEmail || '').trim().toLowerCase()].sort().join('&');
      pairCount[pair] = (pairCount[pair] || []);
      pairCount[pair].push(i + 1);
    } else {
      var s = leg.sub || {};
      endpoints.push({ email: s.teacherEmail, dateStr: s.dateStr, period: s.period, label: '第' + (i + 1) + '腿代課' });
    }
    endpoints.forEach(function (ep) {
      if (!ep.email || !ep.dateStr || ep.period == null) return;
      var key = slotKey(ep.email, ep.dateStr, ep.period);
      seen[key] = seen[key] || [];
      seen[key].push(ep.label);
    });
  });
  Object.keys(seen).forEach(function (key) {
    if (seen[key].length > 1) {
      var parts = key.split('|');
      warnings.push('同教師同格出現 ' + seen[key].length + ' 次（' + parts[0] + ' ' + parts[1] + ' 第' + parts[2] + '節：' + seen[key].join('、') + '）：完成後將疊堂');
    }
  });
  Object.keys(pairCount).forEach(function (pair) {
    if (pairCount[pair].length > 1) {
      warnings.push('同組教師出現於多腿（第' + pairCount[pair].join('、第') + '腿）：請確認順序與生效狀態');
    }
  });
  return warnings;
}

function buildExceptionWarnings(input) {
  input = input || {};
  var legs = input.legs || [];
  var checks = input.checks || {};
  var out = [];
  legs.forEach(function (leg) {
    if (leg.kind === 'exchange') {
      out = out.concat(buildExceptionLegWarnings(leg, checks));
    } else {
      out = out.concat(buildExceptionLegWarnings({ kind: 'substitution', sub: leg.sub }, checks));
    }
  });
  return out.concat(buildExceptionCrossWarnings(legs));
}

export { buildExceptionWarnings, buildExceptionLegWarnings, buildExceptionCrossWarnings, periodBucket };
