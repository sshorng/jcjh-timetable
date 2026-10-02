/**
  * 空堂事件（畢旅 keep／畢業 reduce）
 * - 迄日空白 → 學期結束日
 * - 課表：事件期間內該班視為空堂
  * - 小鐘點／逐日鐘點可依實際空堂判定；超鐘點會計月報不因空堂扣減
 */
window.DomainClassAway = (function () {
  var RULE_KEEP = 'keep';
  var RULE_REDUCE = 'reduce';
  var SCOPE_ALL = 'all';
  var SCOPE_CLASSES = 'classes';
  var PERIOD_ALL = 'all';
  // 順序依校內作息：早自習、上午課、午休、下午課。
  var PERIOD_VALUES = ['0', '1', '2', '3', '4', '45', '5', '6', '7', '8'];
  var PERIOD_LABELS = {
    '0': '早自習', '1': '第1節', '2': '第2節', '3': '第3節', '4': '第4節',
    '45': '午休', '5': '第5節', '6': '第6節', '7': '第7節', '8': '第8節'
  };

  function normDate(d) {
    return String(d || '').trim().slice(0, 10);
  }

  /**
   * 正規化班名：去掉 Sheets 數字／日期污染（0、000、日期字串）
   * 合法例：701、901、7A、美一
   */
  function normClass(c) {
    if (c === undefined || c === null) return '';
    // 純數字 0 不當班名
    if (typeof c === 'number') {
      if (!c || !isFinite(c)) return '';
      // 拒絕過大／小數（常是日期序號）
      if (c < 1 || c > 9999 || Math.floor(c) !== c) return '';
      return String(c);
    }
    var s = String(c).trim();
    if (!s) return '';
    // 明確垃圾：0 / 00 / 000
    if (/^0+$/.test(s)) return '';
    // 日期字串（Sheets 誤把 7/01 當日期）
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return '';
    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)) return '';
    // 科學記號／浮點
    if (/e|E|\./.test(s) && !/^[A-Za-z\u4e00-\u9fff]/.test(s)) return '';
    return s;
  }

  function parseClassList(raw) {
    if (Array.isArray(raw)) {
      return raw.map(normClass).filter(Boolean);
    }
    // 數字 0 → 無效；901 → "901"
    if (typeof raw === 'number') {
      var one = normClass(raw);
      return one ? [one] : [];
    }
    if (raw !== undefined && raw !== null && typeof raw !== 'string') {
      raw = String(raw);
    }
    return String(raw || '')
      .split(/[,，、;\s]+/)
      .map(normClass)
      .filter(Boolean);
  }

  function pickEventValue(ev, keys) {
    ev = ev || {};
    for (var i = 0; i < keys.length; i++) {
      if (ev[keys[i]] !== undefined && ev[keys[i]] !== null && ev[keys[i]] !== '') {
        return ev[keys[i]];
      }
    }
    return '';
  }

  /** 事件適用範圍：all＝全校；classes＝班級清單。舊資料預設指定班級。 */
  function normalizeScope(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (s === SCOPE_ALL || s === 'school' || s === 'all_school' || s === '*'
        || s === '全校' || s === '全校適用' || s === '全校班級') {
      return SCOPE_ALL;
    }
    return SCOPE_CLASSES;
  }

  function isAllPeriodValue(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    return !s || s === PERIOD_ALL || s === '*' || s === '全部'
      || s === '全部節次' || s === '全天' || s === '全日';
  }

  function normalizePeriodKey(value) {
    var s = String(value == null ? '' : value).trim().replace(/^'+/, '').toLowerCase();
    if (s === '早自習' || s === '早讀' || s === '晨讀') return '0';
    if (s === '午休' || s === '午餐' || s === '午' || s === 'lunch') return '45';
    var match = s.match(/(?:第\s*)?(\d+)\s*(?:節)?/);
    if (!match) return '';
    var n = parseInt(match[1], 10);
    if (n === 45) return '45';
    return n >= 0 && n <= 8 ? String(n) : '';
  }

  /** 節次可用「全部」或早自習 0 至第 8 節多選；舊資料仍可直接正規化。 */
  function normalizePeriods(raw) {
    if (Array.isArray(raw)) {
      if (!raw.length) return [];
      if (raw.some(isAllPeriodValue)) return [PERIOD_ALL];
    } else {
      var whole = String(raw == null ? '' : raw).trim();
      if (isAllPeriodValue(whole)) return [PERIOD_ALL];
      raw = whole.split(/[,，、;；|｜/／]+/);
    }

    var selected = {};
    (raw || []).forEach(function (item) {
      if (isAllPeriodValue(item)) {
        selected[PERIOD_ALL] = true;
        return;
      }
      var value = normalizePeriodKey(item);
      if (PERIOD_VALUES.indexOf(value) >= 0) selected[value] = true;
    });
    if (selected[PERIOD_ALL]) return [PERIOD_ALL];
    return PERIOD_VALUES.filter(function (value) { return selected[value]; });
  }

  /** 事件節次的儲存格式：all 或以逗號連接的 0 至 8。 */
  function normalizePeriod(raw) {
    var periods = normalizePeriods(raw);
    if (!periods.length || periods[0] === PERIOD_ALL) return PERIOD_ALL;
    return periods.join(',');
  }

  function periodLabel(raw) {
    var periods = normalizePeriods(raw);
    if (!periods.length || periods[0] === PERIOD_ALL) return '全部節次';
    return periods.map(function (value) { return PERIOD_LABELS[value]; }).join('、');
  }

  function normalizeBoundaryPeriod(value) {
    var key = normalizePeriodKey(value);
    return PERIOD_VALUES.indexOf(key) >= 0 ? key : '';
  }

  function periodIndex(value) {
    return PERIOD_VALUES.indexOf(normalizeBoundaryPeriod(value));
  }

  function eventPeriodRange(ev) {
    var start = normalizeBoundaryPeriod(pickEventValue(ev, ['startPeriod', '起始節次', '起點節次']));
    var end = normalizeBoundaryPeriod(pickEventValue(ev, ['endPeriod', '結束節次', '終點節次']));
    var startIndex = periodIndex(start);
    var endIndex = periodIndex(end);
    if (startIndex < 0 || endIndex < 0) return null;
    return { startPeriod: start, endPeriod: end, startIndex: startIndex, endIndex: endIndex };
  }

  function periodRangeLabel(startPeriod, endPeriod) {
    var start = normalizeBoundaryPeriod(startPeriod);
    var end = normalizeBoundaryPeriod(endPeriod);
    if (!start || !end) return '';
    return start === end ? PERIOD_LABELS[start] : PERIOD_LABELS[start] + '～' + PERIOD_LABELS[end];
  }

  function classListToStore(list) {
    return parseClassList(list).join(',');
  }

  /** 是否像合理班名（供 UI 勾選清單過濾） */
  function isPlausibleClassName(c) {
    var s = normClass(c);
    if (!s) return false;
    if (/^0+$/.test(s)) return false;
    // 至少含一個非零數字，或含中文／字母（特殊班）
    if (/[1-9]/.test(s)) return true;
    if (/[A-Za-z\u4e00-\u9fff]/.test(s)) return true;
    return false;
  }

  function isEnabled(ev) {
    if (!ev) return false;
    if (ev.enabled === false || ev.enabled === 'FALSE' || ev.enabled === 'false') return false;
    if (ev['啟用'] === false || ev['啟用'] === 'FALSE' || ev['啟用'] === '否') return false;
    return true;
  }

  function getRule(ev) {
    var r = String(ev.billingRule || ev['鐘點規則'] || RULE_KEEP).toLowerCase();
    if (r === RULE_REDUCE || r === '調降' || r === 'reduce') return RULE_REDUCE;
    return RULE_KEEP;
  }

  function canMutual(ev) {
    var v = ev.forMutual != null ? ev.forMutual : ev['可進互代'];
    return v === true || v === 'TRUE' || v === 'true' || v === '是' || v === 1 || v === '1';
  }

  function eventClasses(ev) {
    return parseClassList(pickEventValue(ev, ['classes', 'classList', '班級清單']));
  }

  function eventScope(ev) {
    return normalizeScope(pickEventValue(ev, ['scope', '適用範圍', 'awayScope']));
  }

  function eventPeriods(ev) {
    var range = eventPeriodRange(ev);
    if (range) {
      var startDate = eventStart(ev);
      var endDate = normDate(ev.endDate || ev['迄日']);
      if (!startDate || !endDate) return PERIOD_VALUES.slice();
      if (startDate === endDate) return PERIOD_VALUES.slice(range.startIndex, range.endIndex + 1);
      var startParts = startDate.split('-').map(Number);
      var endParts = endDate.split('-').map(Number);
      var daysApart = Math.round((Date.UTC(endParts[0], endParts[1] - 1, endParts[2])
        - Date.UTC(startParts[0], startParts[1] - 1, startParts[2])) / 86400000);
      if (daysApart > 1) return PERIOD_VALUES.slice();
      var included = {};
      PERIOD_VALUES.slice(range.startIndex).concat(PERIOD_VALUES.slice(0, range.endIndex + 1))
        .forEach(function (period) { included[period] = true; });
      return PERIOD_VALUES.filter(function (period) { return included[period]; });
    }
    var raw = ev && ev.periods;
    if (raw !== undefined && raw !== null && (!Array.isArray(raw) || raw.length)) {
      return normalizePeriods(raw);
    }
    return normalizePeriods(pickEventValue(ev, ['period', '停課節次', 'awayPeriod']));
  }

  function eventPeriod(ev) {
    return normalizePeriod(eventPeriods(ev));
  }

  function eventAppliesToPeriod(ev, period, dateStr, semesterEndDate) {
    var range = eventPeriodRange(ev);
    if (range) {
      if (period === undefined || period === null || String(period).trim() === '') return true;
      var requestedIndex = periodIndex(period);
      if (requestedIndex < 0) return false;
      if (dateStr === undefined || dateStr === null || String(dateStr).trim() === '') {
        return eventPeriods(ev).indexOf(normalizeBoundaryPeriod(period)) >= 0;
      }
      var date = normDate(dateStr);
      var startDate = eventStart(ev);
      var endDate = effectiveEnd(ev, semesterEndDate);
      if (date === startDate && requestedIndex < range.startIndex) return false;
      if (date === endDate && requestedIndex > range.endIndex) return false;
      return true;
    }
    if (period === undefined || period === null || String(period).trim() === '') return true;
    var eventP = eventPeriods(ev);
    if (!eventP.length || eventP[0] === PERIOD_ALL) return true;
    var requestedPeriod = normalizePeriodKey(period);
    return !!requestedPeriod && eventP.indexOf(requestedPeriod) >= 0;
  }

  function eventAppliesToClass(ev, className) {
    if (eventScope(ev) === SCOPE_ALL) return true;
    return eventClasses(ev).indexOf(normClass(className)) >= 0;
  }

  function classesForEvent(ev, allClasses) {
    if (eventScope(ev) === SCOPE_ALL && Array.isArray(allClasses)) {
      return parseClassList(allClasses);
    }
    return eventClasses(ev);
  }

  /**
   * 有效迄日：空白 → semesterEndDate
   */
  function effectiveEnd(ev, semesterEndDate) {
    var end = normDate(ev.endDate || ev['迄日']);
    if (end) return end;
    return normDate(semesterEndDate) || '9999-12-31';
  }

  function eventStart(ev) {
    return normDate(ev.startDate || ev['起日']);
  }

  function isDateInEvent(dateStr, ev, semesterEndDate) {
    if (!isEnabled(ev)) return false;
    var d = normDate(dateStr);
    var s = eventStart(ev);
    if (!d || !s) return false;
    if (d < s) return false;
    var e = effectiveEnd(ev, semesterEndDate);
    if (d > e) return false;
    return true;
  }

  function isClassAwayOnDate(className, dateStr, events, semesterEndDate, period) {
    // 併班「701、702」：任一班外出即視為該格外出
    var candidates = [];
    if (window.DateUtils && typeof window.DateUtils.parseCombinedClasses === 'function') {
      candidates = window.DateUtils.parseCombinedClasses(className).map(normClass).filter(Boolean);
    }
    if (!candidates.length) {
      var one = normClass(className);
      if (one) candidates = [one];
    }
    if (!candidates.length) return false;
    var list = events || [];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!isDateInEvent(dateStr, ev, semesterEndDate)) continue;
      if (!eventAppliesToPeriod(ev, period, dateStr, semesterEndDate)) continue;
      for (var j = 0; j < candidates.length; j++) {
        if (eventAppliesToClass(ev, candidates[j])) return true;
      }
    }
    return false;
  }

  function getActiveAwayClasses(dateStr, events, semesterEndDate, period, opts) {
    if (period && typeof period === 'object') {
      opts = period;
      period = undefined;
    }
    opts = opts || {};
    var set = {};
    (events || []).forEach(function (ev) {
      if (!isDateInEvent(dateStr, ev, semesterEndDate)) return;
      if (!eventAppliesToPeriod(ev, period, dateStr, semesterEndDate)) return;
      classesForEvent(ev, opts.allClasses).forEach(function (c) { set[c] = 1; });
    });
    return Object.keys(set).sort();
  }

  /**
   * 期間內有交集的外出班（活動互代帶入用）
   * @param {{ forMutualOnly?: boolean }} opts
   */
  function getAwayClassesInRange(startDate, endDate, events, semesterEndDate, opts) {
    opts = opts || {};
    var a = normDate(startDate);
    var b = normDate(endDate) || a;
    if (!a) return [];
    var set = {};
    (events || []).forEach(function (ev) {
      if (!isEnabled(ev)) return;
      if (opts.forMutualOnly && !canMutual(ev)) return;
      var s = eventStart(ev);
      var e = effectiveEnd(ev, semesterEndDate);
      if (!s || s > b || e < a) return;
      if (opts.period !== undefined && opts.period !== null && String(opts.period).trim() !== '') {
        var requestedPeriods = normalizePeriods(opts.period);
        var anyRequestedPeriod = !requestedPeriods.length || requestedPeriods[0] === PERIOD_ALL;
        var overlapStart = s > a ? s : a;
        var overlapEnd = e < b ? e : b;
        var cursorParts = overlapStart.split('-').map(Number);
        var cursor = new Date(Date.UTC(cursorParts[0], cursorParts[1] - 1, cursorParts[2]));
        var lastParts = overlapEnd.split('-').map(Number);
        var last = new Date(Date.UTC(lastParts[0], lastParts[1] - 1, lastParts[2]));
        var foundPeriod = anyRequestedPeriod;
        while (cursor <= last && !foundPeriod) {
          var candidateDate = cursor.getUTCFullYear() + '-' + String(cursor.getUTCMonth() + 1).padStart(2, '0')
            + '-' + String(cursor.getUTCDate()).padStart(2, '0');
          for (var pi = 0; pi < requestedPeriods.length; pi++) {
            if (eventAppliesToPeriod(ev, requestedPeriods[pi], candidateDate, semesterEndDate)) {
              foundPeriod = true;
              break;
            }
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        if (!foundPeriod) return;
      }
      // 區間重疊：s<=b && e>=a
      classesForEvent(ev, opts.allClasses).forEach(function (c) { set[c] = 1; });
    });
    return Object.keys(set).sort();
  }

  /** 建議帶入的期間：可進互代事件的聯集起迄 */
  function suggestMutualRangeFromEvents(events, semesterEndDate) {
    var start = '';
    var end = '';
    (events || []).forEach(function (ev) {
      if (!isEnabled(ev) || !canMutual(ev)) return;
      var s = eventStart(ev);
      var e = effectiveEnd(ev, semesterEndDate);
      if (!s) return;
      if (!start || s < start) start = s;
      if (!end || e > end) end = e;
    });
    return { startDate: start, endDate: end === '9999-12-31' ? '' : end };
  }

  function eventsActiveOnDate(dateStr, events, semesterEndDate, period) {
    return (events || []).filter(function (ev) {
      return isDateInEvent(dateStr, ev, semesterEndDate)
        && eventAppliesToPeriod(ev, period, dateStr, semesterEndDate);
    });
  }

  /**
   * 取得報告月內各週一（YYYY-MM-DD），最多取 reportWeeksCount 個
   * 從該月第一個週一起算
   */
  function mondaysInReportMonth(reportMonth, reportWeeksCount) {
    var ym = String(reportMonth || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return [];
    var y = parseInt(ym.slice(0, 4), 10);
    var m = parseInt(ym.slice(5, 7), 10) - 1;
    var d = new Date(y, m, 1);
    var dow = d.getDay();
    var monDiff = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
    // 若 1 號已是週一 monDiff=0；若週日則下週一；其餘推到下一個週一
    // 更正：月內第一個週一
    var first = new Date(y, m, 1);
    while (first.getDay() !== 1) {
      first.setDate(first.getDate() + 1);
      if (first.getMonth() !== m) return [];
    }
    var maxW = Math.max(1, parseInt(reportWeeksCount, 10) || 4);
    var out = [];
    var cur = new Date(first.getTime());
    while (out.length < maxW && cur.getMonth() === m) {
      var ys = cur.getFullYear();
      var ms = String(cur.getMonth() + 1).padStart(2, '0');
      var ds = String(cur.getDate()).padStart(2, '0');
      out.push(ys + '-' + ms + '-' + ds);
      cur.setDate(cur.getDate() + 7);
    }
    // 若不足 reportWeeksCount（跨月教學週），用連續週一補足
    while (out.length < maxW) {
      var last = out[out.length - 1];
      if (!last) break;
      var parts = last.split('-');
      var nd = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 7);
      out.push(
        nd.getFullYear() + '-' +
        String(nd.getMonth() + 1).padStart(2, '0') + '-' +
        String(nd.getDate()).padStart(2, '0')
      );
    }
    return out;
  }

  function mondaysInDateRange(startDate, endDate) {
    var start = normDate(startDate);
    var end = normDate(endDate);
    if (!start || !end || start > end) return [];
    var cursor = new Date(start.replace(/-/g, '/') + ' 00:00:00');
    var last = new Date(end.replace(/-/g, '/') + ' 00:00:00');
    if (isNaN(cursor.getTime()) || isNaN(last.getTime())) return [];
    var day = cursor.getDay();
    cursor.setDate(cursor.getDate() - (day === 0 ? 6 : day - 1));
    var out = [];
    while (cursor <= last) {
      out.push(cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-'
        + String(cursor.getDate()).padStart(2, '0'));
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }

  /**
   * 某週一是否落在 reduce 事件生效後（monday >= start 且 monday <= end）
   */
  function mondayInReduceWindow(monday, ev, semesterEndDate) {
    if (getRule(ev) !== RULE_REDUCE) return false;
    if (!isEnabled(ev)) return false;
    var mon = normDate(monday);
    var s = eventStart(ev);
    var e = effectiveEnd(ev, semesterEndDate);
    if (!mon || !s) return false;
    return mon >= s && mon <= e;
  }

  /**
   * 教師基礎課表中，屬於「reduce 空堂班」的週鐘點節數
    * （早自習0＋1–7＋午休45；基本／一般／代課／抽離；超鐘點由特殊標記判定；不含巡堂／第8）
   */
  function periodSetMatches(value, period) {
    if (!value) return false;
    // 舊呼叫端若傳 1／true，代表所有節次。
    if (value === true || value === 1 || value === '1') return true;
    if (value.all) return true;
    return !!value[normalizePeriodKey(period)];
  }

  function addEventToReduceSet(awayClassSet, ev) {
    var targets = eventScope(ev) === SCOPE_ALL ? ['*'] : eventClasses(ev);
    var periods = eventPeriods(ev);
    targets.forEach(function (target) {
      if (!awayClassSet[target]) awayClassSet[target] = {};
      if (!periods.length || periods[0] === PERIOD_ALL) {
        awayClassSet[target].all = true;
      } else {
        periods.forEach(function (period) { awayClassSet[target][period] = true; });
      }
    });
  }

  function countReduceSlotsForTeacher(teacherEmail, allSchedules, awayClassSet, weekDates, rangeEvents, semesterEndDate) {
    var em = String(teacherEmail || '').toLowerCase();
    var n = 0;
    (allSchedules || []).forEach(function (s) {
      if (String(s.teacherEmail || '').toLowerCase() !== em) return;
      // 與 DomainBilling.isWeeklyHoursSlot 對齊
      if (window.DomainBilling && typeof window.DomainBilling.isWeeklyHoursSlot === 'function') {
        if (!window.DomainBilling.isWeeklyHoursSlot(s)) return;
      } else {
        var p = parseInt(s.period, 10);
        if (!(p === 0 || p === 45 || (p >= 1 && p <= 7))) return;
        var attr = String(s.attr || '').trim();
        if (attr && attr !== '基本' && attr !== '一般' && attr !== '超鐘點' && attr !== '抽離' && attr !== '實支' && attr !== '代課') return;
      }
      // 併班：任一班在 reduce 名單即計
      var classes = [];
      if (window.DateUtils && typeof window.DateUtils.parseCombinedClasses === 'function') {
        classes = window.DateUtils.parseCombinedClasses(s.className).map(normClass).filter(Boolean);
      }
      if (!classes.length) {
        var one = normClass(s.className);
        if (one) classes = [one];
      }
      for (var i = 0; i < classes.length; i++) {
        var period = parseInt(s.period, 10);
        var scheduleDay = parseInt(s.dayOfWeek != null ? s.dayOfWeek : s['星期'], 10);
        var activeDate = (weekDates || [])[scheduleDay - 1] || '';
        if (activeDate && window.DomainSchedule && window.DomainSchedule.isActiveOnDate
            && !window.DomainSchedule.isActiveOnDate(s, activeDate)) continue;
        var legacyHit = periodSetMatches(awayClassSet[classes[i]], period)
          || periodSetMatches(awayClassSet['*'], period);
        var rangeHit = !!activeDate && (rangeEvents || []).some(function (ev) {
          return isDateInEvent(activeDate, ev, semesterEndDate)
            && eventAppliesToPeriod(ev, period, activeDate, semesterEndDate)
            && eventAppliesToClass(ev, classes[i]);
        });
        if (legacyHit || rangeHit) {
          n++;
          break;
        }
      }
    });
    return n;
  }

  /**
   * 獨立計算 reduce 事件在起日後的週 × 該師對應班節數。
   * 超鐘點會計月報不呼叫此工具，改以固定每週超鐘點 × 結算週數計算。
   * @returns {number} reduceDeduction 節數
   */
  function computeReduceDeduction(opts) {
    opts = opts || {};
    var email = opts.teacherEmail;
    var allSchedules = opts.allSchedules || [];
    var events = opts.events || [];
    var semesterEnd = opts.semesterEndDate || '';
    var reportMonth = opts.reportMonth;
    var reportWeeksCount = opts.reportWeeksCount || 4;
    var mondays = (opts.reportStartDate || opts.reportEndDate)
      ? mondaysInDateRange(opts.reportStartDate, opts.reportEndDate)
      : mondaysInReportMonth(reportMonth, reportWeeksCount);
    if (!mondays.length) return 0;

    var total = 0;
    // 依事件加總（多事件同班不重複：先建「每個週一要扣的班集合」）
    mondays.forEach(function (mon) {
      var awaySet = {};
      var weekStart = new Date(String(mon).replace(/-/g, '/'));
      var weekDates = [];
      for (var wi = 0; wi < 5; wi++) {
        var weekDate = new Date(weekStart.getTime());
        weekDate.setDate(weekStart.getDate() + wi);
        weekDates.push(weekDate.getFullYear() + '-' + String(weekDate.getMonth() + 1).padStart(2, '0')
          + '-' + String(weekDate.getDate()).padStart(2, '0'));
      }
      var rangeEvents = [];
      events.forEach(function (ev) {
        if (eventPeriodRange(ev)) {
          if (getRule(ev) !== RULE_REDUCE || !isEnabled(ev)) return;
          var rangeStart = eventStart(ev);
          var rangeEnd = effectiveEnd(ev, semesterEnd);
          if (rangeStart && rangeStart <= weekDates[4] && rangeEnd >= weekDates[0]) rangeEvents.push(ev);
          return;
        }
        if (!mondayInReduceWindow(mon, ev, semesterEnd)) return;
        addEventToReduceSet(awaySet, ev);
      });
      if (!Object.keys(awaySet).length && !rangeEvents.length) return;
      total += countReduceSlotsForTeacher(email, allSchedules, awaySet, weekDates, rangeEvents, semesterEnd);
    });
    return total;
  }

  /**
   * 從課表掃出所有班名（排序）
   */
  function scanClassNames(allSchedules) {
    var set = {};
    (allSchedules || []).forEach(function (s) {
      // 巡堂不是實際班級，一律排除
      if (s.attr === '巡堂' || s.isPatrol) return;
      if (String(s.subject || '').trim() === '巡堂') return;
      var raw = s.className || s['班級'];
      if (String(raw || '').trim() === '巡堂') return;
      // 抽離也不應出現在班級清單（不代表真實授課班）
      if (s.isPullOut
          || (window.DomainSchedule && window.DomainSchedule.isPullOutCell
            && window.DomainSchedule.isPullOutCell(s))
          || s.attr === '抽離') return;
      // 併班「701、702」拆成個別班名
      var parts = null;
      if (window.DateUtils && typeof window.DateUtils.parseCombinedClasses === 'function') {
        parts = window.DateUtils.parseCombinedClasses(raw);
      }
      if (!parts || !parts.length) {
        var one = normClass(raw);
        parts = one ? [one] : [];
      }
      parts.forEach(function (c0) {
        var c = normClass(c0);
        if (c && isPlausibleClassName(c)) set[c] = 1;
      });
    });
    return Object.keys(set).sort(function (a, b) {
      return a.localeCompare(b, 'zh-Hant', { numeric: true });
    });
  }

  function filterClassesByGrade(classNames, gradeDigit) {
    var g = String(gradeDigit || '');
    return (classNames || []).filter(function (c) {
      var s = normClass(c);
      return s && s.charAt(0) === g && isPlausibleClassName(s);
    });
  }

  return {
    RULE_KEEP: RULE_KEEP,
    RULE_REDUCE: RULE_REDUCE,
    SCOPE_ALL: SCOPE_ALL,
    SCOPE_CLASSES: SCOPE_CLASSES,
    PERIOD_ALL: PERIOD_ALL,
    normClass: normClass,
    parseClassList: parseClassList,
    normalizeScope: normalizeScope,
    normalizePeriods: normalizePeriods,
    normalizePeriod: normalizePeriod,
    periodLabel: periodLabel,
    classListToStore: classListToStore,
    isPlausibleClassName: isPlausibleClassName,
    isEnabled: isEnabled,
    getRule: getRule,
    canMutual: canMutual,
    eventClasses: eventClasses,
    eventScope: eventScope,
    eventPeriods: eventPeriods,
    eventPeriod: eventPeriod,
    eventPeriodRange: eventPeriodRange,
    periodRangeLabel: periodRangeLabel,
    eventAppliesToClass: eventAppliesToClass,
    eventAppliesToPeriod: eventAppliesToPeriod,
    effectiveEnd: effectiveEnd,
    isDateInEvent: isDateInEvent,
    isClassAwayOnDate: isClassAwayOnDate,
    getActiveAwayClasses: getActiveAwayClasses,
    getAwayClassesInRange: getAwayClassesInRange,
    suggestMutualRangeFromEvents: suggestMutualRangeFromEvents,
    eventsActiveOnDate: eventsActiveOnDate,
    mondaysInReportMonth: mondaysInReportMonth,
    computeReduceDeduction: computeReduceDeduction,
    scanClassNames: scanClassNames,
    filterClassesByGrade: filterClassesByGrade
  };
})();
