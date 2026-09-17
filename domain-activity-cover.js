/**
 * 活動互代／外出班釋出空堂（純邏輯）
 * 規則：
 * - 釋出：未上到 1 節 → 發放額度 1
 * - 1–7 節額度 ≥ 1 → 扣額度（不結鐘點＋扣折抵額度 1）；不足 1 → 活動公費
 * - 第8節 → 第8節代課（計畫經費，不吃額度）
 * - 請假老師（活動公假）一律不扣鐘點
 */
window.DomainActivityCover = (function () {
  var ACTIVITY_PUBLIC_FEE = '活動公費';
  // 活動／一般共用：不結鐘點＋從折抵額度扣 1
  var QUOTA_DEDUCT_FEE = '扣額度';
  // 別名：舊程式碼仍可能讀 MUTUAL_COVER_FEE，值與扣額度相同
  var MUTUAL_COVER_FEE = QUOTA_DEDUCT_FEE;
  // 第8節：計畫經費，一律給代課老師；不吃折抵額度；月報另欄統計
  var PERIOD8_FEE = '第8節代課';
  /** 釋出 1 節 → 發放額度 1 */
  var EARN_PER_SLOT = 1;
  /** 扣額度：滿 1 才可扣，每節扣 1 */
  var SPEND_PER_PERIOD = 1;

  function isQuotaDeductFee(fee) {
    var f = String(fee || '');
    // 讀取相容舊資料「互代不結」；寫入一律用「扣額度」
    return f === QUOTA_DEDUCT_FEE || f === '互代不結';
  }

  function parseQuota(v) {
    if (v === undefined || v === null || v === '') return 0;
    var n = parseFloat(v);
    if (isNaN(n) || n < 0) return 0;
    // 避免 0.1+0.2 浮點雜訊
    return Math.round(n * 1000) / 1000;
  }

  function slotsToEarnQuota(slotCount) {
    var n = parseInt(slotCount, 10) || 0;
    if (n < 0) n = 0;
    return parseQuota(n * EARN_PER_SLOT);
  }

  /** 餘額是否夠扣一節（須滿 1） */
  function canSpendQuota(remaining) {
    return parseQuota(remaining) + 1e-9 >= SPEND_PER_PERIOD;
  }

  function normalizeClass(c) {
    return String(c || '').trim();
  }

  function classTokens(value) {
    return normalizeClass(value).split(/[,，、\/／|｜\s]+/)
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function normalizeDate(d) {
    var s = String(d || '').trim().slice(0, 10).replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return s;
    return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  }

  /** 日期是否落在活動期間（含起迄；缺一邊則只比有填的那端） */
  function isDateInRange(dateStr, startDate, endDate) {
    var d = normalizeDate(dateStr);
    if (!d) return false;
    var a = normalizeDate(startDate);
    var b = normalizeDate(endDate);
    if (!a && !b) return true; // 未設期間：不限制（呼叫端應避免）
    if (a && d < a) return false;
    if (b && d > b) return false;
    return true;
  }

  /** 列舉期間內的日期 YYYY-MM-DD（最多 60 天防呆） */
  function listDatesInRange(startDate, endDate) {
    var a = normalizeDate(startDate);
    var b = normalizeDate(endDate);
    if (!a && !b) return [];
    if (a && !b) b = a;
    if (!a && b) a = b;
    if (a > b) {
      var t = a; a = b; b = t;
    }
    var out = [];
    var cur = new Date(a.replace(/-/g, '/') + ' 00:00:00');
    var end = new Date(b.replace(/-/g, '/') + ' 00:00:00');
    var guard = 0;
    while (cur <= end && guard < 60) {
      var y = cur.getFullYear();
      var m = String(cur.getMonth() + 1).padStart(2, '0');
      var day = String(cur.getDate()).padStart(2, '0');
      out.push(y + '-' + m + '-' + day);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return out;
  }

  /** 該日星期（1=一…5=五；六日 6/0→0 表示非平日） */
  function dayOfWeekMon1(dateStr) {
    var d = new Date(normalizeDate(dateStr).replace(/-/g, '/') + ' 00:00:00');
    if (isNaN(d.getTime())) return 0;
    var wd = d.getDay(); // 0日…6六
    if (wd === 0 || wd === 6) return 0;
    return wd; // 1一…5五
  }

  function toAwaySet(awayClasses) {
    var set = {};
    (awayClasses || []).forEach(function (c) {
      classTokens(c).forEach(function (k) { set[k] = true; });
    });
    return set;
  }

  function isAnyClassAway(value, awaySet) {
    return classTokens(value).some(function (token) { return !!awaySet[token]; });
  }

  function toAwayList(awayClasses) {
    return Object.keys(toAwaySet(awayClasses)).sort();
  }

  /**
   * 該 cell 是否為「空堂／外出」釋出（畫面可淡化，邏輯視同可代空堂）
   * - 活動互代勾選的外出班
   * - 空堂事件班（cell.isClassAway）
   */
  function isCellAwayReleased(cell, awayClasses) {
    if (!cell || cell.isSubstituted) return false;
    if (cell.isClassAway) return true;
    var set = toAwaySet(awayClasses);
    return isAnyClassAway(cell.className, set);
  }

  /**
   * 該節是否可代
   * @returns {{ free: boolean, released: boolean }}
   */
  function isFreeForActivity(cell, awayClasses) {
    if (cell === null || cell === undefined || cell.isSubstituted) {
      return { free: true, released: false };
    }
    // 巡堂可當空堂排入
    if (window.DomainSchedule && window.DomainSchedule.isPatrolCell
        && window.DomainSchedule.isPatrolCell(cell)) {
      return { free: true, released: false };
    }
    if (isCellAwayReleased(cell, awayClasses)) {
      return { free: true, released: true };
    }
    return { free: false, released: false };
  }

  /**
   * 活動期間內，某師因外出班「釋出」的節數（基礎課表 × 期間平日）
   * opts._schedByTeacher：可傳預建索引 email → 課表列[]，避免每人掃全校課表
   */
  function countReleasedSlotsForTeacher(teacherEmail, opts) {
    opts = opts || {};
    var em = emailKey(teacherEmail);
    if (!em) return 0;
    var away = toAwaySet(opts.awayClasses);
    if (!Object.keys(away).length) return 0;
    var startDate = normalizeDate(opts.startDate);
    var endDate = normalizeDate(opts.endDate);
    var rangeDates = listDatesInRange(startDate, endDate);
    if (!rangeDates.length) rangeDates = (opts.weekDates || []).filter(Boolean);
    // 期間內出現的星期（1–5）次數
    var datesByDow = {};
    rangeDates.forEach(function (dateStr) {
      var dow = dayOfWeekMon1(dateStr);
      if (!dow) return;
      if (!datesByDow[dow]) datesByDow[dow] = [];
      datesByDow[dow].push(dateStr);
    });
    var slots = null;
    if (opts._schedByTeacher && opts._schedByTeacher[em]) {
      slots = opts._schedByTeacher[em];
    } else {
      slots = [];
      (opts.allSchedules || []).forEach(function (s) {
        if (s && emailKey(s.teacherEmail) === em) slots.push(s);
      });
    }
    var n = 0;
    slots.forEach(function (s) {
      if (!s || !isAnyClassAway(s.className, away)) return;
      var p = parseInt(s.period, 10);
      if (p > 7) return;
      var d = parseInt(s.dayOfWeek, 10);
      var dates = datesByDow[d] || [];
      dates.forEach(function (dateStr) {
        if (!window.DomainSchedule || !window.DomainSchedule.isActiveOnDate
            || window.DomainSchedule.isActiveOnDate(s, dateStr)) n++;
      });
    });
    return n;
  }

  /**
   * 活動期間內，某師已擔任「扣額度」代課的節數（已送出申請）
   */
  function countUsedMutualAsSub(teacherEmail, opts) {
    opts = opts || {};
    var em = emailKey(teacherEmail);
    if (!em) return 0;
    var startDate = normalizeDate(opts.startDate);
    var endDate = normalizeDate(opts.endDate);
    var rangeDates = listDatesInRange(startDate, endDate);
    if (!rangeDates.length) rangeDates = (opts.weekDates || []).filter(Boolean);
    var rangeSet = {};
    rangeDates.forEach(function (d) { rangeSet[String(d)] = true; });
    var n = 0;
    (opts.requests || []).forEach(function (r) {
      if (!r || r.type === 'exchange') return;
      if (r.status === 'cancelled' || r.status === 'rejected') return;
      if (!isQuotaDeductFee(r.subFee)) return;
      if (emailKey(r.targetTeacherEmail || r.subTeacherEmail) !== em) return;
      var rd = String(r.requestDate || '');
      if (rangeDates.length && !rangeSet[rd]) return;
      n++;
    });
    return n;
  }

  function ledgerField(row, keys) {
    if (!row) return '';
    for (var i = 0; i < keys.length; i++) {
      var value = row[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  }

  function ledgerNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    var n = parseFloat(value);
    return isNaN(n) ? null : Math.round(n * 1000) / 1000;
  }

  function ledgerIdentityValues(value) {
    var values = typeof value === 'object' && value !== null
      ? [value.email, value.loginEmail, value.teacherEmail, value.name, value.teacherName,
        value['教師Email'], value['教師姓名']]
      : [value];
    return values.map(function (item) { return emailKey(item); }).filter(Boolean);
  }

  function ledgerTeacherMatches(row, teacher) {
    var rowValues = ledgerIdentityValues({
      email: ledgerField(row, ['teacherEmail', 'email', '教師Email']),
      name: ledgerField(row, ['name', 'teacherName', '教師姓名'])
    });
    var teacherValues = ledgerIdentityValues(teacher);
    return rowValues.some(function (value) { return teacherValues.indexOf(value) >= 0; });
  }

  function ledgerDate(row) {
    var value = ledgerField(row, [
      'startDate', '起日', 'requestDate', '異動日期', 'date', '日期', 'time', '時間'
    ]);
    return normalizeDate(value);
  }

  function ledgerTime(row) {
    var value = ledgerField(row, ['time', '時間', 'createdAt', '建立時間']);
    return String(value || ledgerDate(row) || '').replace('T', ' ').trim();
  }

  function ledgerType(row) {
    var type = String(ledgerField(row, ['type', '類型']) || '').trim().toLowerCase();
    var aliases = { '發放': 'earn', '扣用': 'spend', '還原': 'restore', '手動調整': 'adjust' };
    return aliases[type] || type;
  }

  function ledgerDelta(row) {
    return ledgerNumber(ledgerField(row, ['delta', '異動'])) || 0;
  }

  function ledgerRequestId(row) {
    return String(ledgerField(row, ['requestId', '申請單ID', 'id']) || '').trim();
  }

  function ledgerHistoryEntries(rows, teacher) {
    var source = (rows || []).map(function (row, index) {
      return { row: row, index: index };
    }).filter(function (item) {
      return item.row && (!teacher || ledgerTeacherMatches(item.row, teacher));
    });
    source.sort(function (a, b) {
      var ta = ledgerTime(a.row);
      var tb = ledgerTime(b.row);
      if (ta !== tb) return ta < tb ? -1 : 1;
      // Bulk ledger responses retain the sheet order for same-second writes.
      var oa = ledgerNumber(ledgerField(a.row, ['historyOrder', 'order']));
      var ob = ledgerNumber(ledgerField(b.row, ['historyOrder', 'order']));
      if (oa !== null && ob !== null && oa !== ob) return oa - ob;
      return a.index - b.index;
    });

    var running = 0;
    return source.map(function (item) {
      var delta = ledgerDelta(item.row);
      var afterRaw = ledgerNumber(ledgerField(item.row, ['balanceAfter', '餘額後']));
      var before = afterRaw === null ? running : afterRaw - delta;
      var after = afterRaw === null ? running + delta : afterRaw;
      running = Math.round(after * 1000) / 1000;
      return {
        row: item.row,
        index: item.index,
        delta: delta,
        before: Math.round(before * 1000) / 1000,
        after: running,
        type: ledgerType(item.row),
        date: ledgerDate(item.row),
        time: ledgerTime(item.row),
        requestId: ledgerRequestId(item.row),
        packageId: String(ledgerField(item.row, ['packageId', '包ID']) || '').trim(),
        eventId: String(ledgerField(item.row, ['eventId', '事件ID']) || '').trim(),
        eventName: String(ledgerField(item.row, ['eventName', '事件名稱']) || '').trim(),
        note: String(ledgerField(item.row, ['note', '備註']) || '').trim()
      };
    });
  }

  function requestMapById(requests) {
    var map = {};
    (requests || []).forEach(function (request) {
      var id = String(request && (request.id || request.requestId || request['申請單ID']) || '').trim();
      if (id) map[id] = request;
    });
    return map;
  }

  function requestDate(request) {
    return normalizeDate(request && (request.requestDate || request.date || request['異動日期']));
  }

  function requestPeriod(request) {
    return parseInt(request && (request.requestPeriod != null
      ? request.requestPeriod
      : (request.period != null ? request.period : request['異動節次'])), 10) || 0;
  }

  function requestText(request) {
    if (!request) return '';
    return [
      request.eventName, request.eventId, request.reason, request['請假事由'],
      request.note, request['備註'], request.subject, request['科目'],
      request.className, request['班級']
    ].map(function (value) { return String(value || ''); }).join(' ');
  }

  function isExamQuotaEntry(entry, request) {
    var text = [
      entry && entry.eventName,
      entry && entry.note,
      requestText(request)
    ].map(function (value) { return String(value || ''); }).join(' ');
    return /監考|段考|考試|試務/.test(text);
  }

  function isEmptyDutyQuotaEntry(entry, request) {
    var text = [
      entry && entry.eventName,
      entry && entry.note,
      requestText(request)
    ].map(function (value) { return String(value || ''); }).join(' ');
    return /空堂|輪值|巡堂/.test(text);
  }

  function roundQuota(value) {
    return Math.round((parseFloat(value) || 0) * 1000) / 1000;
  }

  /**
   * 以實際勤務日期重播帳本，避免行政輸入順序改變報表歸屬。
   * earn 先於同日扣用；同日同節固定監考優先，再排空堂輪值與其他代課。
   */
  function buildChronologicalLedgerStats(opts) {
    opts = opts || {};
    var requestById = requestMapById(opts.requests || []);
    var entries = ledgerHistoryEntries(opts.ledgerRows || opts.rows, opts.teacher);
    var timeline = entries.map(function (entry) {
      var request = requestById[entry.requestId] || null;
      var requestDutyDate = requestDate(request);
      // spend／restore 的申請日期才是實際勤務日期；舊帳本的時間或起日只作備援。
      var date = entry.type === 'spend' || entry.type === 'restore'
        ? (requestDutyDate || entry.date)
        : (entry.date || requestDutyDate);
      var period = requestPeriod(request);
      if (!period) {
        period = parseInt(entry.row && (entry.row.period || entry.row['節次']
          || entry.row.requestPeriod || entry.row['異動節次']), 10) || 0;
      }
      var phase = entry.type === 'earn' && entry.delta > 0 ? 0
        : (entry.type === 'restore' && entry.delta > 0 ? 3 : 1);
      var priority = 30;
      if (entry.type === 'spend' && entry.delta < 0) {
        if (opts.priorityKind === 'exam') {
          priority = isEmptyDutyQuotaEntry(entry, request) && !isExamQuotaEntry(entry, request) ? 20 : 10;
        } else if (isExamQuotaEntry(entry, request)) priority = 10;
        else if (isEmptyDutyQuotaEntry(entry, request)) priority = 20;
      }
      return {
        entry: entry,
        request: request,
        date: date,
        period: period,
        phase: phase,
        priority: priority
      };
    });

    timeline.sort(function (a, b) {
      if (a.date !== b.date) {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date < b.date ? -1 : 1;
      }
      if (a.phase !== b.phase) return a.phase - b.phase;
      var ap = a.period || 999;
      var bp = b.period || 999;
      if (ap !== bp) return ap - bp;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.entry.time !== b.entry.time) return a.entry.time < b.entry.time ? -1 : 1;
      var ah = a.entry.index == null ? 0 : a.entry.index;
      var bh = b.entry.index == null ? 0 : b.entry.index;
      if (ah !== bh) return ah - bh;
      return String(a.entry.requestId || '').localeCompare(String(b.entry.requestId || ''));
    });

    var rangeDates = Array.isArray(opts.rangeDates)
      ? opts.rangeDates.map(normalizeDate).filter(Boolean)
      : [];
    var rangeSet = {};
    rangeDates.forEach(function (date) { rangeSet[date] = true; });
    var hasExactDates = rangeDates.length > 0;
    var rangeStart = hasExactDates ? rangeDates.slice().sort()[0] : normalizeDate(opts.startDate);
    var rangeEnd = hasExactDates ? rangeDates.slice().sort().slice(-1)[0] : normalizeDate(opts.endDate);
    if (!rangeStart && rangeEnd) rangeStart = rangeEnd;
    if (!rangeEnd && rangeStart) rangeEnd = rangeStart;

    function isSelectedDate(date) {
      if (!date) return false;
      if (hasExactDates) return !!rangeSet[date];
      if (rangeStart && date < rangeStart) return false;
      if (rangeEnd && date > rangeEnd) return false;
      return true;
    }

    var balance = 0;
    var balanceAtRangeStart = null;
    var balanceAtRangeEnd = null;
    var before = null;
    var used = 0;
    var selectedSpends = [];

    timeline.forEach(function (item) {
      var date = item.date;
      if (rangeEnd && date && date > rangeEnd) return;
      if (rangeStart && date && date >= rangeStart && balanceAtRangeStart === null) {
        balanceAtRangeStart = balance;
      }
      if (item.entry.type === 'spend' && item.entry.delta < 0 && isSelectedDate(date)) {
        if (before === null) before = balance;
        balance = roundQuota(balance + item.entry.delta);
        used = roundQuota(used + Math.abs(item.entry.delta));
        selectedSpends.push(item.entry);
      } else {
        balance = roundQuota(balance + item.entry.delta);
      }
      if (rangeEnd && date && date <= rangeEnd) balanceAtRangeEnd = balance;
    });

    if (balanceAtRangeStart === null) balanceAtRangeStart = balance;
    if (balanceAtRangeEnd === null) balanceAtRangeEnd = balance;
    if (before === null) before = balanceAtRangeStart;

    return {
      hasHistory: entries.length > 0,
      hasExamSpend: selectedSpends.length > 0,
      before: Math.max(0, roundQuota(before)),
      used: roundQuota(used),
      remaining: Math.max(0, roundQuota(balanceAtRangeEnd)),
      entries: selectedSpends,
      timeline: timeline
    };
  }

  function ledgerEntryInRange(entry, opts) {
    opts = opts || {};
    var date = entry && entry.date;
    if (!date) return false;
    var dates = opts.rangeDates || opts.dates;
    if (Array.isArray(dates) && dates.length) {
      return dates.map(normalizeDate).indexOf(date) >= 0;
    }
    return isDateInRange(date, opts.startDate, opts.endDate);
  }

  function isLedgerSpend(entry) {
    return !!entry && entry.type === 'spend' && entry.delta < 0;
  }

  function isExamLedgerSpend(entry, opts) {
    // 段考欄位只看選定日期內的實際扣額度，不受事件名、備註或申請單格式影響。
    return isLedgerSpend(entry) && ledgerEntryInRange(entry, opts);
  }

  /**
   * 由帳本歷程重建段考備註三欄。
   * before：第一筆段考扣用前的餘額；used：段考扣用；remaining：最後一筆段考扣用後餘額。
   */
  function buildLedgerExamStats(opts) {
    opts = opts || {};
    return buildChronologicalLedgerStats(Object.assign({}, opts, { priorityKind: 'exam' }));
  }

  function ledgerEventMatches(entry, opts) {
    opts = opts || {};
    var eventId = String(opts.eventId || '').trim();
    var eventName = String(opts.eventName || opts.activityName || '').trim();
    if (eventId && entry.eventId && eventId === entry.eventId) return true;
    if (eventName && entry.eventName && eventName === entry.eventName) return true;
    return false;
  }

  /**
   * 由活動額度包重建個人輪值單三欄。
   * 同一包的 earn／spend／restore 會共同反映在剩餘額度，能跨越段考與畢旅正確累計。
   */
  function buildLedgerActivityStats(opts) {
    opts = opts || {};
    var entries = ledgerHistoryEntries(opts.ledgerRows || opts.rows, opts.teacher);
    var earnEntries = entries.filter(function (entry) {
      return entry.type === 'earn' && entry.delta > 0 && ledgerEventMatches(entry, opts);
    });
    var packageIds = {};
    earnEntries.forEach(function (entry) {
      if (entry.packageId) packageIds[entry.packageId] = true;
    });
    var packageEntries = entries.filter(function (entry) {
      return entry.packageId && packageIds[entry.packageId];
    });
    var eventEntries = packageEntries.length ? packageEntries : entries.filter(function (entry) {
      return ledgerEventMatches(entry, opts);
    });
    var ledgerDemand = earnEntries.reduce(function (sum, entry) {
      return sum + entry.delta;
    }, 0);
    var fallbackDemand = ledgerNumber(opts.demand);
    if (fallbackDemand === null || fallbackDemand < 0) fallbackDemand = 0;
    var demand = earnEntries.length ? ledgerDemand : fallbackDemand;
    var selectedEventEntries = eventEntries.filter(function (entry) {
      return ledgerEntryInRange(entry, opts);
    });
    selectedEventEntries.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      return (a.index || 0) - (b.index || 0);
    });
    var selectedSpend = selectedEventEntries.filter(isLedgerSpend).reduce(function (sum, entry) {
      return sum + Math.abs(entry.delta);
    }, 0);
    var selectedRestore = selectedEventEntries.filter(function (entry) {
      return entry.type === 'restore' && entry.delta > 0;
    }).reduce(function (sum, entry) {
      return sum + entry.delta;
    }, 0);
    var fallbackArranged = ledgerNumber(opts.fallbackArranged);
    if (fallbackArranged === null || fallbackArranged < 0) fallbackArranged = 0;
    var arranged = earnEntries.length
      ? Math.max(0, selectedSpend - selectedRestore)
      : Math.max(0, Math.max(selectedSpend, fallbackArranged) - selectedRestore);
    var remaining = Math.max(0, demand - arranged);
    return {
      hasHistory: entries.length > 0,
      hasEvent: earnEntries.length > 0 || eventEntries.length > 0,
      demand: Math.round(demand * 1000) / 1000,
      arranged: Math.round(arranged * 1000) / 1000,
      remaining: Math.round(remaining * 1000) / 1000,
      entries: selectedEventEntries
    };
  }

  /**
   * 暫定草稿中，某師已佔用的「扣額度」節數（尚未送出）
   * opts.pendingDrafts: [{ subEmail|subTeacherEmail, fee|subFee, dateStr?, key? }]
   * opts.excludeDraftKey: 重算「目前這格」時可排除自己舊暫定
   */
  function countPendingDraftMutual(teacherEmail, opts) {
    opts = opts || {};
    var em = emailKey(teacherEmail);
    if (!em) return 0;
    var excludeKey = opts.excludeDraftKey ? String(opts.excludeDraftKey) : '';
    var n = 0;
    (opts.pendingDrafts || opts.drafts || []).forEach(function (d) {
      if (!d) return;
      if (excludeKey && String(d.key || '') === excludeKey) return;
      var sub = emailKey(d.subEmail || d.subTeacherEmail || d.targetTeacherEmail);
      if (sub !== em) return;
      var fee = d.fee || d.subFee || '';
      if (!isQuotaDeductFee(fee)) return;
      n++;
    });
    return n;
  }

  /**
   * 某師釋出／額度餘額
   * 優先使用教師名單上的 mutualQuota（sheet 銀行）；
   * 並扣掉「暫定草稿」已佔用的扣額度，讓智慧媒合即時反映
   * @returns {{ totalReleased, usedMutual, pendingDraft, remaining, overQuota, source }}
   */
  function getTeacherReleaseBalance(teacherEmail, opts) {
    opts = opts || {};
    var em = emailKey(teacherEmail);
    var sheetQuota = null;
    if (opts.teachers && opts.teachers.length) {
      for (var i = 0; i < opts.teachers.length; i++) {
        var t = opts.teachers[i];
        if (t && emailKey(t.email) === em) {
          if (t.mutualQuota !== undefined && t.mutualQuota !== null && t.mutualQuota !== '') {
            sheetQuota = parseQuota(t.mutualQuota);
          }
          break;
        }
      }
    }
    var totalSlots = countReleasedSlotsForTeacher(teacherEmail, opts);
    var total = slotsToEarnQuota(totalSlots); // 額度單位（節×1）
    var used = countUsedMutualAsSub(teacherEmail, opts); // 已扣節數（每節 1）
    var pendingDraft = countPendingDraftMutual(teacherEmail, opts);
    if (sheetQuota !== null) {
      // sheet 額度已在送出時扣過；媒合時再扣暫定（每暫定 1）
      var remSheet = parseQuota(Math.max(0, sheetQuota - pendingDraft * SPEND_PER_PERIOD));
      return {
        totalReleased: total,
        totalSlots: totalSlots,
        usedMutual: used,
        pendingDraft: pendingDraft,
        remaining: remSheet,
        overQuota: !canSpendQuota(remSheet),
        source: 'sheet'
      };
    }
    var rem = parseQuota(Math.max(0, total - used * SPEND_PER_PERIOD - pendingDraft * SPEND_PER_PERIOD));
    return {
      totalReleased: total,
      totalSlots: totalSlots,
      usedMutual: used,
      pendingDraft: pendingDraft,
      remaining: rem,
      overQuota: !canSpendQuota(rem),
      source: 'computed'
    };
  }

  /**
   * 依活動期間＋外出班，為每位教師計算建議寫回的折抵額度
   * mode: 'set' 覆寫為本次釋出額度；'add' 累加
   * 釋出：1 節 → 1 額度（released）；releasedSlots＝堂數
   * excludeEmails / leaderEmails: 帶隊／請假外出 → 不寫入額度
   * @returns {Array<{email, name, released, releasedSlots, prevQuota, nextQuota, skipped, skipReason}>}
   */
  function buildQuotaRecalcRows(opts) {
    opts = opts || {};
    var mode = opts.mode === 'add' ? 'add' : 'set';
    var teachers = opts.teachers || [];
    var exclude = {};
    (opts.excludeEmails || opts.leaderEmails || []).forEach(function (e) {
      var k = emailKey(e);
      if (k) exclude[k] = true;
    });
    // 一次建 email → 課表列，避免每人掃全校
    var schedBy = opts._schedByTeacher;
    if (!schedBy) {
      schedBy = {};
      (opts.allSchedules || []).forEach(function (s) {
        if (!s || !s.teacherEmail) return;
        var k = emailKey(s.teacherEmail);
        if (!k) return;
        if (!schedBy[k]) schedBy[k] = [];
        schedBy[k].push(s);
      });
      opts = Object.assign({}, opts, { _schedByTeacher: schedBy });
    }
    var rows = [];
    teachers.forEach(function (t) {
      if (!t || !t.email) return;
      var em = emailKey(t.email);
      var releasedSlots = countReleasedSlotsForTeacher(t.email, opts);
      var released = slotsToEarnQuota(releasedSlots); // 額度 1／節
      var prev = parseQuota(t.mutualQuota);
      var isLeader = !!exclude[em];
      var next = prev;
      var skipped = false;
      var skipReason = '';
      if (isLeader) {
        skipped = true;
        skipReason = '帶隊外出';
        next = prev;
      } else {
        next = mode === 'add' ? parseQuota(prev + released) : released;
        if (next < 0) next = 0;
      }
      rows.push({
        email: t.email,
        loginEmail: t.loginEmail || t["教師Email"] || '',
        name: t.name || '',
        released: released,
        releasedSlots: releasedSlots,
        prevQuota: prev,
        nextQuota: next,
        skipped: skipped,
        skipReason: skipReason
      });
    });
    return rows;
  }

  function isPeriod8(period) {
    return parseInt(period, 10) === 8;
  }

  /**
   * 依剩餘額度決定經費（1–7 節）
   * remaining ≥ 1 → 扣額度；否則 → 活動公費
   * 第8節請用 resolveActivityFee（計畫經費，不走額度）
   */
  function feeByReleaseBalance(remainingBefore, isReleasedThisSlot) {
    if (canSpendQuota(remainingBefore)) return QUOTA_DEDUCT_FEE;
    return ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 活動模式統一經費（含第8節）
   * @param {object} opts
   * @param {number} [opts.period]
   * @param {number} [opts.remainingBefore]
   * @param {boolean} [opts.isReleasedByAway]
   */
  function resolveActivityFee(opts) {
    opts = opts || {};
    if (isPeriod8(opts.period)) return PERIOD8_FEE;
    if (typeof opts.remainingBefore === 'number') {
      return feeByReleaseBalance(opts.remainingBefore, !!opts.isReleasedByAway);
    }
    if (opts.isReleasedByAway) return QUOTA_DEDUCT_FEE;
    return ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 依是否釋出決定建議經費（無餘額資料時的後備）
   */
  function suggestedFee(isReleasedByAway, activityMode) {
    if (!activityMode) return '';
    return isReleasedByAway ? QUOTA_DEDUCT_FEE : ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 批次送出：代課老師該節經費（支援餘額）
   * @param {object} opts
   * @param {boolean} opts.activityMode
   * @param {string} opts.fallbackFee
   * @param {object|null} opts.subTeacherCell
   * @param {Array} opts.awayClasses
   * @param {number} [opts.remainingBefore]  送出前剩餘釋出
   */
  function feeForSubSlot(opts) {
    opts = opts || {};
    if (!opts.activityMode) return opts.fallbackFee || '自費代課';
    if (isPeriod8(opts.period)) return PERIOD8_FEE;
    if (typeof opts.remainingBefore === 'number') {
      return feeByReleaseBalance(opts.remainingBefore, false);
    }
    var cell = opts.subTeacherCell;
    if (cell && !cell.isSubstituted && isCellAwayReleased(cell, opts.awayClasses)) {
      return QUOTA_DEDUCT_FEE;
    }
    return ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 從候選名單取建議經費（優先用 remaining；第8節固定計畫費）
   * @param {object} cand
   * @param {boolean} activityMode
   * @param {number} [period]
   */
  function feeFromCandidate(cand, activityMode, period) {
    if (!activityMode) return '自費代課';
    if (isPeriod8(period != null ? period : (cand && cand.period))) return PERIOD8_FEE;
    if (!cand) return ACTIVITY_PUBLIC_FEE;
    if (typeof cand.remainingReleased === 'number') {
      return feeByReleaseBalance(cand.remainingReleased, !!cand.isReleasedByAway);
    }
    if (cand.suggestedFee && cand.suggestedFee !== PERIOD8_FEE) return cand.suggestedFee;
    if (cand.isReleasedByAway) return QUOTA_DEDUCT_FEE;
    return ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 批次：依序為每節計算經費，並遞減各代課老師餘額
   * 第8節：固定第8節代課，不扣折抵額度
   * @param {Array} slots [{ subTeacherEmail, dateStr, period, dayOfWeek }]
   * @param {object} ctx
   * @returns {Array<{ fee, remainingBefore, remainingAfter, totalReleased, usedMutual }>}
   */
  function assignFeesForBatchSlots(slots, ctx) {
    ctx = ctx || {};
    var balanceCache = {};
    function getBal(email) {
      var k = emailKey(email);
      if (!balanceCache[k]) {
        balanceCache[k] = getTeacherReleaseBalance(email, ctx);
      }
      return balanceCache[k];
    }
    return (slots || []).map(function (s) {
      var email = s.subTeacherEmail || s.subEmail || '';
      var period = s.period;
      if (isPeriod8(period)) {
        var bal8 = getBal(email);
        return {
          fee: PERIOD8_FEE,
          remainingBefore: bal8.remaining,
          remainingAfter: bal8.remaining,
          totalReleased: bal8.totalReleased,
          usedMutual: bal8.usedMutual,
          isPeriod8: true
        };
      }
      var bal = getBal(email);
      var remainingBefore = bal.remaining;
      var fee = feeByReleaseBalance(remainingBefore, false);
      if (isQuotaDeductFee(fee)) {
        bal.remaining = parseQuota(Math.max(0, bal.remaining - SPEND_PER_PERIOD));
        bal.usedMutual = (bal.usedMutual || 0) + 1;
      }
      return {
        fee: fee,
        remainingBefore: remainingBefore,
        remainingAfter: bal.remaining,
        totalReleased: bal.totalReleased,
        usedMutual: bal.usedMutual,
        isPeriod8: false
      };
    });
  }

  /**
   * 為媒合名單附上釋出餘額與建議經費
   * @param {Array} list
   * @param {object} ctx  可含 targetPeriod / period（目前媒合節次）
   */
  function enrichCandidatesWithBalance(list, ctx) {
    ctx = ctx || {};
    var period = ctx.targetPeriod != null ? ctx.targetPeriod : ctx.period;
    return (list || []).map(function (t) {
      var bal = getTeacherReleaseBalance(t.email, ctx);
      var fee = resolveActivityFee({
        period: period,
        remainingBefore: bal.remaining,
        isReleasedByAway: !!t.isReleasedByAway
      });
      return Object.assign({}, t, {
        totalReleased: bal.totalReleased,
        usedMutual: bal.usedMutual,
        pendingDraft: bal.pendingDraft || 0,
        remainingReleased: bal.remaining,
        suggestedFee: fee,
        isPeriod8: isPeriod8(period)
      });
    });
  }

  /** 表單最終經費（活動模式） */
  function normalizeActivityFee(fee) {
    var f = String(fee || '');
    if (f === QUOTA_DEDUCT_FEE || f === ACTIVITY_PUBLIC_FEE || f === PERIOD8_FEE) return f;
    return ACTIVITY_PUBLIC_FEE;
  }

  function isActivityFee(fee) {
    var f = String(fee || '');
    return f === QUOTA_DEDUCT_FEE || f === ACTIVITY_PUBLIC_FEE || f === PERIOD8_FEE;
  }

  /** 請假端是否應扣鐘點：扣額度／活動公費皆不扣 */
  function isLeaveNonDeductible(fee) {
    var f = String(fee || '');
    return f === QUOTA_DEDUCT_FEE || f === ACTIVITY_PUBLIC_FEE || f === PERIOD8_FEE;
  }

  /** 送出後是否應扣折抵額度：經費為「扣額度」即扣 */
  function shouldDeductQuota(fee, activityMode) {
    return isQuotaDeductFee(fee);
  }

  /** 代課端是否計入公費代課收入 */
  function isPublicSubPayout(fee) {
    var f = String(fee || '');
    // 學校移撥：舊資料仍計公費；新單不再寫入
    return f === '公費代課' || f === '學校移撥' || f === ACTIVITY_PUBLIC_FEE;
  }

  /**
   * 切換單班外出
   * @returns {string[]} 新的 awayClasses
   */
  function toggleAwayClass(awayClasses, cls) {
    var c = normalizeClass(cls);
    if (!c) return toAwayList(awayClasses);
    var set = toAwaySet(awayClasses);
    if (set[c]) delete set[c];
    else set[c] = true;
    return Object.keys(set).sort();
  }

  /**
   * 年級快捷：全選／全消該年級班級
   * @param {string[]} classList 全校班級
   * @param {string[]} awayClasses 目前外出
   * @param {string} grade '7'|'8'|'9'
   */
  function toggleAwayGrade(classList, awayClasses, grade) {
    var g = String(grade || '');
    var all = (classList || []).filter(function (c) {
      var s = String(c);
      return s.indexOf(g) >= 0 || s.indexOf(g) === 0;
    });
    var set = toAwaySet(awayClasses);
    var allSelected = all.length > 0 && all.every(function (c) { return !!set[normalizeClass(c)]; });
    if (allSelected) {
      all.forEach(function (c) { delete set[normalizeClass(c)]; });
    } else {
      all.forEach(function (c) { set[normalizeClass(c)] = true; });
    }
    return Object.keys(set).sort();
  }

  function emailKey(e) {
    return String(e || '').toLowerCase().trim();
  }

  /**
   * 是否衝堂（活動模式：外出班釋出視同不衝堂）
   * @param {object|null} cell
   * @param {boolean} activityMode
   * @param {string[]} awayClasses
   */
  function isConflictCell(cell, activityMode, awayClasses) {
    if (!cell || cell.isSubstituted) return false;
    // 空堂事件班：一律不當衝堂（畫面淡化、邏輯空堂）
    if (cell.isClassAway) return false;
    // 巡堂：可當空堂，不當衝堂
    if (window.DomainSchedule && window.DomainSchedule.isPatrolCell
        && window.DomainSchedule.isPatrolCell(cell)) {
      return false;
    }
    if (activityMode && isCellAwayReleased(cell, awayClasses)) return false;
    return true;
  }

  /**
   * 進度統計
   * @param {object} opts
   * @param {boolean} opts.active
   * @param {string[]} opts.awayClasses
   * @param {string} [opts.startDate]  活動起日 YYYY-MM-DD
   * @param {string} [opts.endDate]    活動迄日 YYYY-MM-DD
   * @param {Array} opts.allSchedules  基礎課表（星期+節次）
   * @param {Array} opts.requests
   * @param {string[]} opts.weekDates  本週一～五（無活動期間時後備）
   * @param {string[]} [opts.leaveEmails]
   * @param {Array} [opts.pendingSlots]
   * @param {function} [opts.getScheduleForDate]
   */
  function buildStats(opts) {
    opts = opts || {};
    var empty = {
      awayClasses: 0,
      releasedSlots: 0,
      mutualDone: 0,
      publicDone: 0,
      arranged: 0,
      demand: 0,
      remaining: 0,
      leaveTeachers: 0,
      pendingSelected: 0,
      rangeDays: 0,
      rangeLabel: '',
      byLeaders: []
    };
    if (!opts.active) return empty;

    var startDate = normalizeDate(opts.startDate);
    var endDate = normalizeDate(opts.endDate);
    var rangeDates = listDatesInRange(startDate, endDate);
    // 無期間：退回本週日期（避免整份課表×學期）
    if (!rangeDates.length) {
      rangeDates = (opts.weekDates || []).filter(Boolean);
    }
    var rangeSet = {};
    rangeDates.forEach(function (d) { rangeSet[String(d)] = true; });

    var away = toAwaySet(opts.awayClasses);
    var awayCount = Object.keys(away).length;

    // 釋出空堂：外出班 × 期間平日 × 節次（同班同時段只算 1，避免多師重計）
    var released = 0;
    var releasedKeys = {};
    if (awayCount && rangeDates.length) {
      rangeDates.forEach(function (dateStr) {
        var dow = dayOfWeekMon1(dateStr);
        if (!dow) return;
        (opts.allSchedules || []).forEach(function (s) {
          if (!s || !s.className) return;
           var cn = normalizeClass(s.className);
            if (!isAnyClassAway(cn, away)) return;
           if (parseInt(s.dayOfWeek, 10) !== dow) return;
           if (window.DomainSchedule && window.DomainSchedule.isActiveOnDate
               && !window.DomainSchedule.isActiveOnDate(s, dateStr)) return;
           var per = parseInt(s.period, 10);
          if (!per || per > 7) return; // 釋出額度只算 1–7
          var rk = cn + '|' + dateStr + '|' + per;
          if (releasedKeys[rk]) return;
          releasedKeys[rk] = true;
          released++;
        });
      });
    }

    // 帶隊名單：只認面板勾選（opts.leaderEmails）
    var leaderEmails = [];
    var leaderNameMap = {};
    var leaderSet = {};
    (opts.leaderEmails || []).forEach(function (item) {
      var em = '';
      var nm = '';
      if (item && typeof item === 'object') {
        em = emailKey(item.email || item.teacherEmail);
        nm = item.name || item.teacherName || '';
      } else {
        em = emailKey(item);
      }
      if (!em) return;
      if (leaderEmails.indexOf(em) === -1) leaderEmails.push(em);
      leaderSet[em] = true;
      if (nm) leaderNameMap[em] = nm;
    });
    (opts.teachers || []).forEach(function (t) {
      if (!t || !t.email) return;
      var em = emailKey(t.email);
      if (leaderEmails.indexOf(em) >= 0 && !leaderNameMap[em]) {
        leaderNameMap[em] = t.name || em;
      }
    });

    // 已安排：只算「勾選帶隊老師」當申請人的代課（扣額度／活動公費／第8節）
    var mutualDone = 0;
    var publicDone = 0;
    var period8DoneAll = 0;
    var hasLeaders = leaderEmails.length > 0;

    (opts.requests || []).forEach(function (r) {
      if (!r || r.type === 'exchange') return;
      if (!hasLeaders) return; // 未勾帶隊：總覽已安排顯示 0
      var leaveEm = emailKey(r.requesterEmail || r.originalTeacherEmail);
      if (!leaderSet[leaveEm]) return;
      var rd = String(r.requestDate || r.date || '').slice(0, 10);
      if (rangeDates.length && !rangeSet[rd]) return;
      if (!rangeDates.length && !isDateInRange(rd, startDate, endDate)) return;
      var st = String(r.status || '');
      if (st === 'cancelled' || st === 'rejected' || st === 'admin_rejected' || st === 'withdrawn') return;
      if (isQuotaDeductFee(r.subFee)) {
        mutualDone++;
      } else if (r.subFee === ACTIVITY_PUBLIC_FEE) {
        publicDone++;
      } else if (r.subFee === PERIOD8_FEE || parseInt(r.requestPeriod || r.period, 10) === 8) {
        period8DoneAll++;
      }
    });

    // 批次已選：只算帶隊老師的格
    var pendingSelected = 0;
    var pendingKeys = {};
    (opts.pendingSlots || []).forEach(function (s) {
      if (!s) return;
      if (hasLeaders && !leaderSet[emailKey(s.teacherEmail)]) return;
      if (!hasLeaders) return;
      var sd = String(s.dateStr || '').slice(0, 10);
      if (rangeDates.length && !rangeSet[sd]) return;
      var key = emailKey(s.teacherEmail) + '|' + sd + '|' + String(s.period || '');
      if (!pendingKeys[key]) {
        pendingKeys[key] = true;
        pendingSelected++;
      }
    });

    var arranged = mutualDone + publicDone + period8DoneAll;

    /**
     * 需求＝期間內帶隊老師「應找人代」的節數（累計口徑）
     * 與課表同一套 getScheduleForDate：含單雙週／已代仍算；排除巡堂、抽離、外出班、空堂事件班。
     * 尚缺＝需求−已送出−暫定（已找人代的仍留在需求裡，避免補排時需求變小）
     */
    function isDemandCell_(cell) {
      if (!cell) return false;
      if (window.DomainSchedule && window.DomainSchedule.isPatrolCell
          && window.DomainSchedule.isPatrolCell(cell)) return false;
      var attr = String(cell.attr || '');
       if (attr === '抽離'
           || cell.isPullOut
           || (window.DomainSchedule && window.DomainSchedule.isPullOutCell
             && window.DomainSchedule.isPullOutCell(cell))
           || attr === '巡堂') return false;
      // 已代（isSubstituted）仍算需求：累計口徑，已送出另欄扣，避免補排時需求變小
      // 僅「純調入而無原班」不在此用 isSubstituted 排除
      var cn = normalizeClass(cell.className);
      if (!cn) return false;
      if (cn === '巡堂') return false;
       if (awayCount && isAnyClassAway(cn, away)) return false;
      if (cell.isClassAway) return false;
      return true;
    }

    function countDemandForLeader(em) {
      if (!rangeDates.length) return 0;
      var getSched = opts.getScheduleForDate;
      var slotKeys = {}; // date|period
      var isSingleWeek = typeof opts.isSingleWeek === 'function' ? opts.isSingleWeek : null;

      // 優先：與畫面課表相同的解析結果（正確處理單雙週／疊代）
      if (typeof getSched === 'function') {
        rangeDates.forEach(function (dateStr) {
          var dow = dayOfWeekMon1(dateStr);
          if (!dow) return;
          var periodList = (window.DateUtils && window.DateUtils.getTimetablePeriods)
            ? window.DateUtils.getTimetablePeriods()
             : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
          for (var pi = 0; pi < periodList.length; pi++) {
            var p = periodList[pi];
            var cell = null;
            try { cell = getSched(em, dateStr, p, dow); } catch (eG) { cell = null; }
            if (!isDemandCell_(cell)) continue;
            slotKeys[dateStr + '|' + p] = true;
          }
        });
        return Object.keys(slotKeys).length;
      }

      // 後備：掃基礎課表（無 getSchedule 時）
      rangeDates.forEach(function (dateStr) {
        var dow = dayOfWeekMon1(dateStr);
        if (!dow) return;
        var single = isSingleWeek ? !!isSingleWeek(dateStr) : null;
        (opts.allSchedules || []).forEach(function (s) {
           if (!s) return;
           if (emailKey(s.teacherEmail) !== em) return;
           if (parseInt(s.dayOfWeek, 10) !== dow) return;
           if (window.DomainSchedule && window.DomainSchedule.isActiveOnDate
               && !window.DomainSchedule.isActiveOnDate(s, dateStr)) return;
           var per = parseInt(s.period, 10);
          // 允許早自習 0、午休 45；其餘僅 1–8
          if (!(per === 0 || per === 45 || (per >= 1 && per <= 8))) return;
          var attr = String(s.attr || '');
           if (attr === '抽離'
               || s.isPullOut
               || (window.DomainSchedule && window.DomainSchedule.isPullOutCell
                 && window.DomainSchedule.isPullOutCell(s))
               || attr === '巡堂') return;
          if (window.DomainSchedule && window.DomainSchedule.isPatrolAttr
              && window.DomainSchedule.isPatrolAttr(attr)) return;
          if (single !== null) {
            if (attr === '單週' && !single) return;
            if (attr === '雙週' && single) return;
          }
          var cn = normalizeClass(s.className);
          if (!cn || cn === '巡堂') return;
           if (awayCount && isAnyClassAway(cn, away)) return;
          slotKeys[dateStr + '|' + per] = true;
        });
      });

      return Object.keys(slotKeys).length;
    }

    function countArrangedForLeader(em) {
      var arrMut = 0;
      var arrPub = 0;
      var arrP8 = 0;
      (opts.requests || []).forEach(function (r) {
        if (!r || r.type === 'exchange') return;
        if (emailKey(r.requesterEmail || r.originalTeacherEmail) !== em) return;
        var rd = String(r.requestDate || r.date || '').slice(0, 10);
        if (rangeDates.length && !rangeSet[rd]) return;
        var st = String(r.status || '');
        if (st === 'cancelled' || st === 'rejected' || st === 'admin_rejected' || st === 'withdrawn') return;
        if (isQuotaDeductFee(r.subFee)) arrMut++;
        else if (r.subFee === ACTIVITY_PUBLIC_FEE) arrPub++;
        else if (r.subFee === PERIOD8_FEE || parseInt(r.requestPeriod || r.period, 10) === 8) arrP8++;
      });
      return { arrMut: arrMut, arrPub: arrPub, arrP8: arrP8, arr: arrMut + arrPub + arrP8 };
    }

    function countDraftedForLeader(em) {
      var drafted = 0;
      (opts.pendingDrafts || []).forEach(function (d) {
        if (!d) return;
        if (emailKey(d.leaveEmail || d.teacherEmail) !== em) return;
        var sd = String(d.dateStr || '').slice(0, 10);
        if (rangeDates.length && sd && !rangeSet[sd]) return;
        drafted++;
      });
      return drafted;
    }

    function countPendingForLeader(em) {
      var pend = 0;
      (opts.pendingSlots || []).forEach(function (s) {
        if (!s) return;
        if (emailKey(s.teacherEmail) !== em) return;
        var sd = String(s.dateStr || '').slice(0, 10);
        if (rangeDates.length && !rangeSet[sd]) return;
        pend++;
      });
      return pend;
    }

    var byLeaders = [];
    var demand = 0;
    // hasLeaders 已在上方宣告

    if (hasLeaders) {
      leaderEmails.forEach(function (em) {
        var dem = countDemandForLeader(em);
        var arrInfo = countArrangedForLeader(em);
        var drafted = countDraftedForLeader(em);
        var pend = countPendingForLeader(em);
        demand += dem;
        byLeaders.push({
          email: em,
          name: leaderNameMap[em] || em,
          demand: dem,
          mutualDone: arrInfo.arrMut,
          publicDone: arrInfo.arrPub,
          period8Done: arrInfo.arrP8,
          arranged: arrInfo.arr,
          drafted: drafted,
          pendingSelected: pend,
          // 尚缺＝需求 − 已送出 − 暫定（批次選取另顯示，不重複扣）
          remaining: Math.max(0, dem - arrInfo.arr - drafted)
        });
      });
    }

    var remaining = 0;
    var draftedTotal = 0;
    if (hasLeaders) {
      remaining = byLeaders.reduce(function (sum, L) { return sum + (L.remaining || 0); }, 0);
      draftedTotal = byLeaders.reduce(function (sum, L) { return sum + (L.drafted || 0); }, 0);
    }
    var rangeLabel = '';
    if (startDate && endDate) rangeLabel = startDate === endDate ? startDate : (startDate + '～' + endDate);
    else if (startDate) rangeLabel = startDate + ' 起';
    else if (endDate) rangeLabel = '至 ' + endDate;
    else rangeLabel = '本週（未設期間）';

    // 按尚缺多→少、再按姓名
    byLeaders.sort(function (a, b) {
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return String(a.name).localeCompare(String(b.name), 'zh-Hant');
    });

    return {
      awayClasses: awayCount,
      releasedSlots: released,
      mutualDone: mutualDone,
      publicDone: publicDone,
      arranged: arranged,
      drafted: draftedTotal,
      demand: hasLeaders ? demand : 0,
      remaining: hasLeaders ? remaining : 0,
      leaveTeachers: byLeaders.length,
      pendingSelected: pendingSelected,
      rangeDays: rangeDates.length,
      rangeLabel: rangeLabel,
      byLeaders: byLeaders
    };
  }

  /** 空堂排班事由（固定；課表／額度辨識用） */
  var EMPTY_SLOT_REASON = '空堂排班';

  /**
   * 該格是否可排「空堂任務」
   * 可：真的空、巡堂、調開／被代課（isSubstituted，本人已釋出時段）
   * 不可：進行中申請、已是空堂任務、代課義務（isSubstitutionDuty）、一般有課
   * @param {object|null} cell getScheduleForDate 結果
   */
  function isEmptySlotAssignable(cell) {
    if (!cell) return true;
    if (cell.isPending) return false;
    if (cell.isEmptySlotAssign) return false;
    // 已排代課義務（代別人的課）→ 非空堂
    if (cell.isSubstitutionDuty) return false;
    // 調出／請假被代：本人該節已釋出，可排巡堂等空堂任務
    if (cell.isSubstituted) return true;
    if (window.DomainSchedule && window.DomainSchedule.isPatrolCell
        && window.DomainSchedule.isPatrolCell(cell)) {
      return true;
    }
    if (cell.isPatrol || cell.attr === '巡堂') return true;
    // 有實質班科＝有課
    var cn = String(cell.className || '').trim();
    var subj = String(cell.subject || '').trim();
    if (cn && cn !== '巡堂') return false;
    if (subj && subj !== '巡堂') return false;
    return true;
  }

  function quotaZeroNeedsRepay(remaining) {
    // 不足 1 即無法扣一節 → 視為需另還／改公費
    return !canSpendQuota(remaining);
  }

  /**
   * 組空堂排班申請列（Sheets 中文欄位）
   * @param {object} opts
   * @param {string} opts.date
   * @param {number} opts.period
   * @param {number} opts.dayOfWeek
   * @param {string} opts.teacherEmail
   * @param {string} opts.teacherName
   * @param {string} opts.taskName 任務名稱（寫入科目）
   * @param {string} [opts.className] 班級可選
   * @param {string} [opts.note]
   * @param {string} opts.semesterId
   * @param {string} opts.requestId
   * @param {string} opts.serial
   */
  function buildEmptySlotPayload(opts) {
    opts = opts || {};
    var task = String(opts.taskName || '').trim();
    var cls = String(opts.className || '').trim();
    var nm = String(opts.teacherName || '').trim();
    if (!nm) throw new Error('空堂排班缺少教師姓名');
    var noteBase = String(opts.note || '').trim();
    var noteOut = noteBase ? ('[空堂排班] ' + noteBase) : '[空堂排班]';
    var newRequest = {
      "學期代號": opts.semesterId || '',
      "申請單ID": opts.requestId,
      "單號": opts.serial,
      "異動類型": 'substitution',
      "申請人姓名": nm,
      "受邀人姓名": nm,
      "異動日期": String(opts.date || '').slice(0, 10),
      "異動節次": parseInt(opts.period, 10) || 0,
      "異動星期": parseInt(opts.dayOfWeek, 10) || 0,
      "班級": cls,
      "科目": task,
      "請假事由": EMPTY_SLOT_REASON,
      "經費來源": QUOTA_DEDUCT_FEE,
      "備註": noteOut,
      "狀態": 'approved',
      "直接核准": '是',
      directApprove: true,
      isProxySubmit: false,
      isEmptySlotAssign: true
    };
    return {
      request: newRequest,
      directApprove: true,
      skipNotify: true,
      newRequest: newRequest
    };
  }

  return {
    MUTUAL_COVER_FEE: MUTUAL_COVER_FEE, // === 扣額度
    ACTIVITY_PUBLIC_FEE: ACTIVITY_PUBLIC_FEE,
    QUOTA_DEDUCT_FEE: QUOTA_DEDUCT_FEE,
    PERIOD8_FEE: PERIOD8_FEE,
    EARN_PER_SLOT: EARN_PER_SLOT,
    SPEND_PER_PERIOD: SPEND_PER_PERIOD,
    EMPTY_SLOT_REASON: EMPTY_SLOT_REASON,
    parseQuota: parseQuota,
    slotsToEarnQuota: slotsToEarnQuota,
    canSpendQuota: canSpendQuota,
    isQuotaDeductFee: isQuotaDeductFee,
    shouldDeductQuota: shouldDeductQuota,
    isPeriod8: isPeriod8,
    resolveActivityFee: resolveActivityFee,
    toAwaySet: toAwaySet,
    toAwayList: toAwayList,
    isDateInRange: isDateInRange,
    listDatesInRange: listDatesInRange,
    dayOfWeekMon1: dayOfWeekMon1,
    isCellAwayReleased: isCellAwayReleased,
    isFreeForActivity: isFreeForActivity,
    isConflictCell: isConflictCell,
    countReleasedSlotsForTeacher: countReleasedSlotsForTeacher,
    countUsedMutualAsSub: countUsedMutualAsSub,
    buildChronologicalLedgerStats: buildChronologicalLedgerStats,
    buildLedgerExamStats: buildLedgerExamStats,
    buildLedgerActivityStats: buildLedgerActivityStats,
    countPendingDraftMutual: countPendingDraftMutual,
    getTeacherReleaseBalance: getTeacherReleaseBalance,
    buildQuotaRecalcRows: buildQuotaRecalcRows,
    feeByReleaseBalance: feeByReleaseBalance,
    suggestedFee: suggestedFee,
    feeForSubSlot: feeForSubSlot,
    feeFromCandidate: feeFromCandidate,
    assignFeesForBatchSlots: assignFeesForBatchSlots,
    enrichCandidatesWithBalance: enrichCandidatesWithBalance,
    normalizeActivityFee: normalizeActivityFee,
    isActivityFee: isActivityFee,
    isLeaveNonDeductible: isLeaveNonDeductible,
    isPublicSubPayout: isPublicSubPayout,
    toggleAwayClass: toggleAwayClass,
    toggleAwayGrade: toggleAwayGrade,
    buildStats: buildStats,
    isEmptySlotAssignable: isEmptySlotAssignable,
    quotaZeroNeedsRepay: quotaZeroNeedsRepay,
    buildEmptySlotPayload: buildEmptySlotPayload
  };
})();
