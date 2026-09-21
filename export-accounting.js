/*
 * 會計核銷版 Excel 匯出
 *
 * 這個模組只負責兩件事：
 * 1. 依現有前端資料產生六類核銷資料與匯出前摘要。
 * 2. 載入去識別化的會計範本，保留版面後寫入資料。
 *
 * 扣勞健保／實際金額刻意保持空白，避免在系統尚無扣款來源時誤算。
 */
(function (root) {
  'use strict';

  var TEMPLATE_URL = 'templates/accounting-template.xlsx';
  var STORAGE_KEY = 'school-substitution-accounting-periods-v1';
  // 同一頁面內的範本不會變動，避免每次匯出都重新抓取與解析前置資料。
  var templateBufferPromise = null;
  var FEE_DEFAULT = 455;
  var DEFAULT_EXPENSE_PLAN_FULL = '補助調整教師授課鐘點費（國教）';
  var MONEY_NUMBER_FORMAT = '#,##0';
  var DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
  var PERIOD_NAMES = {
    '0': '早自習',
    '1': '一',
    '2': '二',
    '3': '三',
    '4': '四',
    '5': '五',
    '6': '六',
    '7': '七',
    '8': '八',
    '45': '午休'
  };

  var SHEET_CONFIG = {
    overtime: {
      index: 0,
      key: 'overtime',
      label: '超鐘點',
      suffix: '超鐘點',
      titleSuffix: '超鐘點（計畫）印領清冊',
      dataStart: 3,
      templateTotalRow: 15,
      columns: 15,
      kind: 'summary'
    },
    adjunct: {
      index: 1,
      key: 'adjunct',
      label: '兼課教師鐘點',
      suffix: '兼課',
      titleSuffix: '教師兼課費印領清冊',
      dataStart: 3,
      templateTotalRow: 10,
      columns: 14,
      kind: 'summary'
    },
    teachingSupport: {
      key: 'teachingSupport',
      label: '教支人員鐘點',
      suffix: '教支人員',
      titleSuffix: '教師兼課費印領清冊',
      dataStart: 3,
      templateTotalRow: 10,
      columns: 14,
      kind: 'summary'
    },
    publicSub: {
      index: 2,
      key: 'publicSub',
      label: '公付代課',
      suffix: '公付代課',
      titleSuffix: '公付代課鐘點費印領清冊',
      dataStart: 3,
      templateTotalRow: 14,
      columns: 15,
      kind: 'public'
    },
    publicSubAdjustment: {
      index: 5,
      key: 'publicSubAdjustment',
      label: '公付代課-身心調適假',
      suffix: '公付代課-身心調適假',
      titleSuffix: '公付代課-身心調適假鐘點費印領清冊',
      dataStart: 3,
      templateTotalRow: 14,
      columns: 15,
      kind: 'public'
    },
    substituteAttribute: {
      key: 'substituteAttribute',
      label: '課表代課（小鐘點）',
      suffix: '小鐘點',
      titleSuffix: '代課鐘點費印領清冊',
      dataStart: 3,
      templateTotalRow: 15,
      columns: 15,
      kind: 'summary'
    },
    selfSub: {
      index: 3,
      key: 'selfSub',
      label: '自付代課',
      suffix: '  自付代課',
      titleSuffix: '自付代課鐘點費',
      dataStart: 3,
      templateTotalRow: 14,
      columns: 10,
      kind: 'line'
    },
    mentor: {
      index: 4,
      key: 'mentor',
      label: '代導鐘點',
      suffix: '代導鐘點',
      titleSuffix: '公付代導師鐘點費',
      dataStart: 3,
      templateTotalRow: 11,
      columns: 10,
      kind: 'line'
    }
  };

  var PERIOD_OPTIONS = [
    { key: 'overtime', label: '超鐘點' },
    { key: 'adjunct', label: '兼課教師鐘點' },
    { key: 'publicSub', label: '公付代課' },
    { key: 'selfSub', label: '自付代課' },
    { key: 'mentor', label: '代導鐘點' }
  ];

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function isScheduleActiveOnDate(schedule, dateStr) {
    if (!dateStr || !root.DomainSchedule || !root.DomainSchedule.isActiveOnDate) return true;
    return root.DomainSchedule.isActiveOnDate(schedule, dateStr);
  }

  function scheduleActiveInPeriod(schedule, period) {
    if (!period || !dateObj(period.start) || !dateObj(period.end)) return true;
    var start = dateObj(period.start);
    var end = dateObj(period.end);
    var wantedDay = Number(schedule && (schedule.dayOfWeek != null ? schedule.dayOfWeek : schedule['星期']));
    for (var date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      var day = date.getDay() === 0 ? 7 : date.getDay();
      if (day === wantedDay && isScheduleActiveOnDate(schedule, isoDate(date))) return true;
    }
    return false;
  }

  function dateObj(value) {
    var s = String(value || '').slice(0, 10);
    if (!isIsoDate(s)) return null;
    var p = s.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    if (d.getFullYear() !== p[0] || d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) return null;
    return d;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function monthEnd(month) {
    var parts = String(month || '').split('-').map(Number);
    if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
    return parts[0] + '-' + pad2(parts[1]) + '-' + pad2(new Date(parts[0], parts[1], 0).getDate());
  }

  function monthStart(month) {
    return /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) + '-01' : '';
  }

  function defaultPeriod(month) {
    var start = monthStart(month);
    var end = monthEnd(month);
    return { start: start, end: end };
  }

  function defaultPeriodSettings(month) {
    return defaultPeriod(month);
  }

  function normalizePeriod(period, fallback) {
    var p = period || {};
    var start = isIsoDate(p.start) ? p.start : fallback.start;
    var end = isIsoDate(p.end) ? p.end : fallback.end;
    if (!dateObj(start) || !dateObj(end) || start > end) {
      return { start: fallback.start, end: fallback.end };
    }
    return { start: start, end: end };
  }

  function loadPeriodSettings(month) {
    var fallback = defaultPeriod(month);
    var saved = null;
    try {
      if (root.localStorage) saved = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      saved = null;
    }
    var monthSaved = saved && saved[month] ? saved[month] : {};
    if (monthSaved.period && (isIsoDate(monthSaved.period.start) || isIsoDate(monthSaved.period.end))) {
      return normalizePeriod(monthSaved.period, fallback);
    }
    if (isIsoDate(monthSaved.start) || isIsoDate(monthSaved.end)) {
      return normalizePeriod(monthSaved, fallback);
    }
    for (var i = 0; i < PERIOD_OPTIONS.length; i += 1) {
      var legacy = monthSaved[PERIOD_OPTIONS[i].key];
      if (legacy && (isIsoDate(legacy.start) || isIsoDate(legacy.end))) {
        return normalizePeriod(legacy, fallback);
      }
    }
    return fallback;
  }

  function savePeriodSettings(month, settings) {
    try {
      if (!root.localStorage) return;
      var all = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}');
      var fallback = defaultPeriod(month);
      var source = settings && (settings.period || settings);
      all[month] = { period: normalizePeriod(source, fallback) };
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      // 私密瀏覽或瀏覽器封鎖 localStorage 時，匯出仍可繼續。
    }
  }

  function getPeriod(settings, key, month) {
    var fallback = defaultPeriod(month);
    var source = settings || {};
    var unified = source.period || source;
    if (isIsoDate(unified.start) || isIsoDate(unified.end)) {
      return normalizePeriod(unified, fallback);
    }
    return normalizePeriod(source[key], fallback);
  }

  function dateInPeriod(value, period) {
    var s = String(value || '').slice(0, 10).replace(/\//g, '-');
    return isIsoDate(s) && s >= period.start && s <= period.end;
  }

  function periodWeekCount(period) {
    var start = dateObj(period.start);
    var end = dateObj(period.end);
    if (!start || !end || start > end) return 0;
    var keys = {};
    var d = new Date(start);
    while (d <= end) {
      var dow = d.getDay();
      var monday = new Date(d);
      monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      keys[isoDate(monday)] = true;
      d.setDate(d.getDate() + 1);
    }
    return Object.keys(keys).length;
  }

  function rocYear(year) {
    return Number(year) - 1911;
  }

  function reportParts(reportMonth) {
    var parts = String(reportMonth || '').split('-').map(Number);
    return { year: parts[0] || new Date().getFullYear(), month: parts[1] || (new Date().getMonth() + 1) };
  }

  function reportPartsForPeriod(reportMonth, period) {
    var fallback = reportParts(reportMonth);
    var start = dateObj(period && period.start);
    var end = dateObj(period && period.end);
    if (!start || !end || start.getMonth() === end.getMonth() || end.getDate() > 7) return fallback;
    var nominal = new Date(end.getFullYear(), end.getMonth(), 0);
    return { year: nominal.getFullYear(), month: nominal.getMonth() + 1 };
  }

  function reportMonthForPeriod(reportMonth, period) {
    var parts = reportPartsForPeriod(reportMonth, period);
    return parts.year + '-' + pad2(parts.month);
  }

  function rangeLabel(period) {
    var a = dateObj(period.start);
    var b = dateObj(period.end);
    if (!a || !b) return '';
    return (a.getMonth() + 1) + '/' + a.getDate() + '-' + (b.getMonth() + 1) + '/' + b.getDate();
  }

  function monthLabelForPeriod(reportMonth, period) {
    var parts = reportPartsForPeriod(reportMonth, period);
    var primaryMonth = parts.month;
    var start = dateObj(period && period.start);
    var startMonth = start ? start.getMonth() + 1 : primaryMonth;
    return start && startMonth !== primaryMonth
      ? startMonth + '-' + primaryMonth
      : String(primaryMonth);
  }

  function titleFromTemplate(templateValue, reportMonth, period, expensePlan) {
    var title = String(templateValue == null ? '' : templateValue).trim();
    if (!title || title.indexOf('[[') < 0) return '';
    var parts = reportPartsForPeriod(reportMonth, period);
    return title
      .replace(/\[\[年\]\]/g, String(rocYear(parts.year)))
      .replace(/\[\[月\]\]/g, monthLabelForPeriod(reportMonth, period))
      .replace(/\s*[（(]\s*\[\[日期\]\]\s*[）)]/g, '')
      .replace(/\[\[日期\]\]/g, '')
      .replace(/\[\[計畫\]\]/g, planFullLabel(expensePlan))
      .trim();
  }

  function dateRangeFileLabel(period, reportMonth) {
    var normalized = normalizePeriod(period, defaultPeriod(reportMonth));
    return normalized.start.slice(5, 7) + normalized.start.slice(8, 10)
      + '-' + normalized.end.slice(5, 7) + normalized.end.slice(8, 10);
  }

  function normalizeExpensePlan(value) {
    var plan = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return plan === '未分配' ? '預設' : plan;
  }

  function mergedExpensePlanAssignment(value) {
    var text = normalizeExpensePlan(value);
    if (text.charAt(0) === '[') return { group: text, individual: '' };
    var match = text.match(/^(.+?)\s*-\s*(.+)$/);
    if (match && hasMergedExpensePlan(match[1])) {
      return { group: String(match[1]).trim(), individual: String(match[2]).trim() };
    }
    return { group: text, individual: '' };
  }

  function expensePlanName(value) {
    var groupedValue = mergedExpensePlanAssignment(value).group;
    if (root.FieldMap && typeof root.FieldMap.expensePlanName === 'function') {
      return root.FieldMap.expensePlanName(groupedValue);
    }
    var text = groupedValue;
    if (!text || text === '預設') return { raw: text, short: '預設', full: '預設', explicit: false };
    var match = text.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!match) return { raw: text, short: text, full: text, explicit: false };
    var short = String(match[1] || '').trim();
    var full = String(match[2] || '').trim();
    return short && full
      ? { raw: text, short: short, full: full, explicit: true }
      : { raw: text, short: text, full: text, explicit: false };
  }

  function outputExpensePlan(value) {
    var plan = expensePlanName(value);
    return !plan.short || plan.short === '預設' ? '國教' : plan.short;
  }

  function planFullLabel(value) {
    var plan = expensePlanName(value);
    if (!plan.full || plan.short === '預設' || plan.short === '國教') return DEFAULT_EXPENSE_PLAN_FULL;
    return plan.full;
  }

  function teacherExpensePlan(teacher) {
    return normalizeExpensePlan(teacher && (
      teacher.expensePlan || teacher['鐘點支出計畫'] || teacher['鐘點支出來源']
      || teacher['支出計畫'] || teacher['計畫'] || teacher.plan || ''
    ));
  }

  function parseExpensePlan(value) {
    if (root.FieldMap && typeof root.FieldMap.parseExpensePlan === 'function') {
      return root.FieldMap.parseExpensePlan(value);
    }
    var text = normalizeExpensePlan(value);
    if (!text) return { mode: 'empty', slots: [], legacySource: '', invalid: false, invalidCount: 0 };
    if (text.charAt(0) !== '[') return { mode: 'legacy', slots: [], legacySource: text, invalid: false, invalidCount: 0 };
    try {
      var raw = JSON.parse(text);
      if (!Array.isArray(raw)) throw new Error('not array');
      var slots = raw.map(function (item) {
        return item && {
          day: Number(item.day !== undefined ? item.day : item.dayOfWeek),
          period: Number(item.period),
          className: String(item.className || '').trim(),
          source: normalizeExpensePlan(item.source || item.plan || item['經費來源'])
        };
      }).filter(function (item) {
        return item && item.source && Number.isFinite(item.day) && Number.isFinite(item.period);
      });
      return { mode: 'slots', slots: slots, legacySource: '', invalid: slots.length !== raw.length, invalidCount: raw.length - slots.length };
    } catch (e) {
      if (/^\[[^\]]+\]\s*\S/.test(text)) return { mode: 'legacy', slots: [], legacySource: text, invalid: false, invalidCount: 0 };
      return { mode: 'invalid', slots: [], legacySource: '', invalid: true, invalidCount: 1 };
    }
  }

  function expensePlanSourcesForRow(row) {
    var sources = [];
    function add(source) {
      var value = outputExpensePlan(source);
      if (value && sources.indexOf(value) < 0) sources.push(value);
    }
    (row && row.expensePlanAllocations || []).forEach(function (allocation) {
      add(allocation && allocation.source);
    });
    var parsed = parseExpensePlan(row && row.expensePlan);
    if (parsed.mode === 'legacy') add(parsed.legacySource);
    if (parsed.mode === 'slots') (parsed.slots || []).forEach(function (slot) { add(slot.source); });
    if (parsed.mode === 'empty') add('預設');
    return sources;
  }

  function expensePlanFullNamesForRow(row) {
    var names = {};
    function add(source) {
      var short = outputExpensePlan(source);
      if (short && !names[short]) names[short] = planFullLabel(source);
    }
    (row && row.expensePlanAllocations || []).forEach(function (allocation) {
      add(allocation && allocation.source);
    });
    var parsed = parseExpensePlan(row && row.expensePlan);
    if (parsed.mode === 'legacy') add(parsed.legacySource);
    if (parsed.mode === 'slots') (parsed.slots || []).forEach(function (slot) { add(slot.source); });
    if (parsed.mode === 'empty') add('預設');
    return names;
  }

  function addUniqueMessage(list, message) {
    if (message && list.indexOf(message) < 0) list.push(message);
  }

  function planLabel(value) {
    return outputExpensePlan(value);
  }

  function teachingSupportPlanLabel(value) {
    return planFullLabel(value);
  }

  function overtimeTitleSuffix(expensePlan) {
    return planFullLabel(expensePlan) + '印領清冊';
  }

  function titleFor(config, reportMonth, period, expensePlan) {
    var parts = reportPartsForPeriod(reportMonth, period);
    var monthLabel = monthLabelForPeriod(reportMonth, period);
    var suffix = config.titleSuffix;
    if (config.key === 'overtime') {
      suffix = overtimeTitleSuffix(expensePlan);
    }
    if (config.key === 'substituteAttribute') {
      suffix = '代課鐘點費（' + planLabel(expensePlan) + '）印領清冊';
    }
    if (config.key === 'teachingSupport') {
      suffix = '教支人員鐘點費印領清冊（' + teachingSupportPlanLabel(expensePlan) + '）';
    }
    if (config.key === 'overtime' || config.key === 'selfSub' || config.key === 'mentor') {
      return '臺北市立建成國民中學' + rocYear(parts.year) + '年' + monthLabel + '月' + suffix;
    }
    return '臺北市立建成國中' + rocYear(parts.year) + '年' + monthLabel + '月' + suffix;
  }

  function safeSheetPart(value) {
    return outputExpensePlan(value).replace(/[\\/:*?\[\]]/g, '-').trim();
  }

  function sheetName(config, reportMonth, period, expensePlan) {
    var parts = reportParts(reportMonth);
    var a = dateObj(period.start);
    var b = dateObj(period.end);
    var prefix = rocYear(parts.year) + '.' + (a ? (a.getMonth() + 1) : parts.month) + '.' + (a ? a.getDate() : 1)
      + '-' + (b ? (b.getMonth() + 1) : parts.month) + '.' + (b ? b.getDate() : 31);
    var planSuffix = (config.key === 'overtime' || config.key === 'substituteAttribute'
      || config.key === 'teachingSupport') && outputExpensePlan(expensePlan)
      ? '-' + safeSheetPart(expensePlan)
      : '';
    var name = prefix + config.suffix + planSuffix;
    return name.slice(0, 31);
  }

  function teacherEmail(value) {
    if (value && typeof value === 'object') {
      value = value.email || value['\u6559\u5e2bEmail'] || value.teacherEmail || '';
    }
    return String(value || '').trim().toLowerCase();
  }

  function teacherIdentityKeys(value) {
    var values = value && typeof value === 'object'
      ? [value.email, value.loginEmail, value.teacherEmail, value['教師Email'], value.name,
        value.teacherName, value['教師姓名'], value.originalTeacherName, value.actualTeacherName]
      : [value];
    var seen = {};
    return values.map(function (item) { return String(item == null ? '' : item).trim().toLowerCase(); })
      .filter(function (item) {
        if (!item || seen[item]) return false;
        seen[item] = true;
        return true;
      });
  }

  function sameTeacher(left, right) {
    var rightKeys = teacherIdentityKeys(right);
    return teacherIdentityKeys(left).some(function (key) { return rightKeys.indexOf(key) >= 0; });
  }

  function teacherName(teacher, fallback) {
    if (typeof teacher === 'string') return String(teacher || fallback || '').trim();
    return String((teacher && (teacher.name || teacher['\u6559\u5e2b\u59d3\u540d'] || teacher.teacherName)) || fallback || '').trim();
  }

  function teacherTitle(teacher) {
    return String((teacher && (teacher.jobTitle || teacher.title || teacher['\u8077\u52d9'] || teacher['\u8077\u7a31'] || teacher['\u8077\u4f4d'] || teacher.teacherTitle)) || '').trim();
  }

  function teacherSubject(teacher) {
    return String((teacher && (teacher.subject || teacher['\u6388\u8ab2\u79d1\u76ee'] || teacher['\u79d1\u76ee'])) || '').trim();
  }

  var LOCAL_LANGUAGE_MARKERS = ['本土語', '本土語文', '閩南語', '台語', '臺語', '客語', '原住民族語', '族語'];

  function isTeachingSupportTeacher(teacher) {
    var title = teacherTitle(teacher);
    if (title.indexOf('教支') < 0 && title.indexOf('教學支援') < 0) return false;
    var text = [title, teacherSubject(teacher), teacherExpensePlan(teacher)].join(' ');
    return LOCAL_LANGUAGE_MARKERS.some(function (marker) { return text.indexOf(marker) >= 0; });
  }

  function addTeacherToMap(map, teacher) {
    var email = teacherEmail(teacher);
    var name = teacherName(teacher, '');
    if (email) map[email] = teacher;
    if (name) map['name:' + name] = teacher;
  }

  function teacherFromMap(map, email, name) {
    return (map && (map[teacherEmail(email)] || map['name:' + String(name || '').trim()])) || {};
  }
  function teacherOrderMap(teachers) {
    var order = {};
    (teachers || []).forEach(function (teacher, index) {
      teacherIdentityKeys(teacher).forEach(function (key) {
        if (order[key] === undefined) order[key] = index;
      });
    });
    return order;
  }
  function teacherOrderValue(order, value) {
    var keys = teacherIdentityKeys(value);
    for (var i = 0; i < keys.length; i += 1) {
      if (order[keys[i]] !== undefined) return order[keys[i]];
    }
    return Number.MAX_SAFE_INTEGER;
  }
  function compareTeacherOrder(order, left, right) {
    var rankDiff = teacherOrderValue(order, left) - teacherOrderValue(order, right);
    if (rankDiff) return rankDiff;
    return teacherName(left, '').localeCompare(teacherName(right, ''), 'zh-Hant');
  }
  function isAdjunctTeacher(teacher) {
    var title = teacherTitle(teacher);
    return !isTeachingSupportTeacher(teacher)
      && title.indexOf('兼課') >= 0 && title.indexOf('共聘') < 0;
  }

  function isAdjunctStyleTeacher(teacher) {
    return isAdjunctTeacher(teacher) || isTeachingSupportTeacher(teacher);
  }

  function teacherSortKey(value) {
    return teacherIdentityKeys(value)[0] || '';
  }

  function feeRate(record, fallback) {
    var n = Number(record && (record.feeAmount || record.rate || record['鐘點費']));
    return Number.isFinite(n) && n > 0 ? n : (fallback || FEE_DEFAULT);
  }

  function periodCount(record, mentor) {
    var n = Number(record && (record.periodCount || record['合計節數']));
    if (Number.isFinite(n) && n >= 0) return n;
    return mentor ? 0.8 : 1;
  }

  function periodText(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw || raw === '代導') return raw === '代導' ? '' : '';
    return PERIOD_NAMES[raw] || raw;
  }

  function rocDate(value) {
    var d = dateObj(value);
    if (!d) return String(value || '');
    return rocYear(d.getFullYear()) + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + '(' + DAY_NAMES[d.getDay()] + ')';
  }

  function shortDate(value) {
    var normalized = String(value || '').slice(0, 10).replace(/\//g, '-');
    var d = dateObj(normalized);
    return d ? (d.getMonth() + 1) + '/' + d.getDate() : String(value || '').trim();
  }

  function lookupTeacherName(opts, email, fallback) {
    var key = teacherEmail(email);
    if (opts && typeof opts.getTeacherNameByEmail === 'function' && key) {
      try {
        var fromLookup = opts.getTeacherNameByEmail(email);
        if (fromLookup) return String(fromLookup).trim();
      } catch (e) {
        // 名稱查詢失敗時回退到教師清單。
      }
    }
    var found = (opts && opts.teachers || []).find(function (t) {
      return teacherEmail(t && t.email) === key;
    });
    return teacherName(found, fallback || email);
  }

  function displayCount(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
  }

  function uniqueNotes(notes) {
    var seen = {};
    return (notes || []).map(function (note) {
      return cleanAccountingText(note);
    }).filter(function (note) {
      if (!note || seen[note]) return false;
      seen[note] = true;
      return true;
    });
  }

  function joinAccountingNotes(notes) {
    var list = uniqueNotes(notes);
    if (list.length <= 1) return list[0] || '';
    return list.map(function (note, index) {
      return (index + 1) + '、' + note;
    }).join('\n');
  }

  function mergedExpensePlanParts(value) {
    return String(value || '').split('、').map(function (part) {
      return String(part || '').trim();
    }).filter(Boolean);
  }

  function hasMergedExpensePlan(value) {
    return mergedExpensePlanParts(value).length > 1;
  }

  function rowHasMergedExpensePlan(row) {
    return [row && row.expensePlanForNote, row && row.expensePlan, row && row.plan]
      .some(hasMergedExpensePlan);
  }

  function individualExpensePlanForNote(row) {
    return [row && row.expensePlanForNote, row && row.expensePlan, row && row.plan]
      .map(function (value) {
        var assignment = mergedExpensePlanAssignment(value);
        return assignment.individual || assignment.group;
      })
      .find(function (value) { return value && !hasMergedExpensePlan(value); }) || '';
  }

  function appendMergedPlanNotes(rows, config, planFilter) {
    if (!config || config.key !== 'overtime') return rows;
    var mergedPlanFilter = hasMergedExpensePlan(planFilter);
    if (!mergedPlanFilter && !(rows || []).some(rowHasMergedExpensePlan)) return rows;
    (rows || []).forEach(function (row) {
      if (!mergedPlanFilter && !rowHasMergedExpensePlan(row)) return;
      var rawPlan = individualExpensePlanForNote(row);
      if (!rawPlan) return;
      var plan = planFullLabel(rawPlan);
      if (!plan) return;
      var note = '計畫：' + plan;
      var current = String(row.note || '').trim();
      if (current.indexOf(note) >= 0) return;
      row.note = current ? current + '；' + note : note;
    });
    return rows;
  }

  function expensePlanMatchesFilter(value, expectedPlan) {
    var candidate = planLabel(value);
    if (candidate === expectedPlan) return true;
    return hasMergedExpensePlan(expectedPlan)
      && mergedExpensePlanParts(expectedPlan).some(function (part) {
        return planLabel(part) === candidate;
      });
  }

  function individualExpensePlanSource(source, allocation) {
    var sourcePlan = source && source.expensePlan;
    var sourceAssignment = mergedExpensePlanAssignment(sourcePlan);
    if (sourceAssignment.individual) return sourceAssignment.individual;
    var parsedSource = parseExpensePlan(sourcePlan);
    if (parsedSource.mode === 'legacy' && !hasMergedExpensePlan(sourcePlan)) return sourcePlan;
    var allocationPlan = allocation && allocation.source;
    var allocationAssignment = mergedExpensePlanAssignment(allocationPlan);
    if (allocationAssignment.individual) return allocationAssignment.individual;
    if (allocationPlan && !hasMergedExpensePlan(allocationPlan)) return allocationPlan;
    return sourcePlan || allocationPlan || '';
  }

  function noteDates(records) {
    return (records || []).map(function (record) {
      return shortDate(record.date);
    }).filter(Boolean).filter(function (date, index, all) {
      return all.indexOf(date) === index;
    }).join('、');
  }

  function notePeriodCount(records) {
    return (records || []).reduce(function (sum, record) {
      return sum + periodCount(record, false);
    }, 0);
  }

  function groupedCoverNoteParts(records, opts) {
    var groups = {};
    var order = [];
    (records || []).slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''))
        || String(a.originalTeacherEmail || '').localeCompare(String(b.originalTeacherEmail || ''))
        || Number(a.period || 0) - Number(b.period || 0);
    }).forEach(function (record) {
      var name = lookupTeacherName(opts, record.originalTeacherEmail, record.originalTeacherName || '');
      var label = reason(record) || subFee(record);
      var date = shortDate(record.date);
      var key = teacherEmail(record.originalTeacherEmail) + '|' + name + '|' + label;
      if (!groups[key]) {
        groups[key] = { dates: [], dateIndex: {}, name: name, label: label, count: 0 };
        order.push(key);
      }
      var group = groups[key];
      if (date && !group.dateIndex[date]) {
        group.dateIndex[date] = true;
        group.dates.push(date);
      }
      group.count += periodCount(record, false);
    });
    return order.map(function (key) {
      var group = groups[key];
      return group.dates.join('、') + '代' + (group.name || '課務') + group.label
        + displayCount(group.count) + '節';
    }).filter(Boolean);
  }

  function substitutionNoteText(record, opts, fallbackName) {
    var name = lookupTeacherName(opts, record && record.originalTeacherEmail,
      (record && record.originalTeacherName) || fallbackName || '');
    var label = reason(record) || subFee(record);
    return shortDate(record && record.date) + '代' + (name || '課務') + label
      + displayCount(periodCount(record, false)) + '節';
  }

  function deductionReasonLabel(record, fallback) {
    var value = reason(record);
    if (!value) return fallback;
    if (value.indexOf('\u516c\u5047') >= 0 || value.indexOf('\u516c\u5dee') >= 0) return '\u516c\u5047';
    if (value.indexOf('\u4e8b\u5047') >= 0) return '\u4e8b\u5047';
    if (value.indexOf('\u75c5\u5047') >= 0) return '\u75c5\u5047';
    if (value.indexOf('\u88dc\u4f11') >= 0) return '\u88dc\u4f11';
    return value;
  }

  function leaveNoteParts(records, publicUsed, combinedRecords) {
    var groups = {};
    var order = [];
    var addRecord = function (record, combined) {
      if (!record || (!isSelfPaidRecord(record) && !isPublicOvertimeRecord(record))) return;
      var fallback = isSelfPaidRecord(record) ? '\u81ea\u4ed8' : '\u516c\u5047';
      var label = deductionReasonLabel(record, fallback);
      var date = shortDate(record.date);
      var rawDate = String(record.date || '').slice(0, 10).replace(/\//g, '-');
      var key = label;
      if (!groups[key]) {
        groups[key] = { label: label, dates: [], dateIndex: {} };
        order.push(key);
      }
      var group = groups[key];
      var dateKey = rawDate || date;
      if (!group.dateIndex[dateKey]) {
        group.dateIndex[dateKey] = { date: date, rawDate: rawDate, count: 0, combinedCount: 0 };
        group.dates.push(group.dateIndex[dateKey]);
      }
      var dateGroup = group.dateIndex[dateKey];
      if (combined) dateGroup.combinedCount += periodCount(record, false);
      else dateGroup.count += periodCount(record, false);
    };
    (records || []).filter(function (record) {
      return !isCombinedReturnRecord(record);
    }).forEach(function (record) { addRecord(record, false); });
    (combinedRecords || []).forEach(function (record) { addRecord(record, true); });
    order.forEach(function (key) {
      groups[key].dates.sort(function (left, right) {
        return String(left.rawDate || left.date || '').localeCompare(String(right.rawDate || right.date || ''));
      });
    });
    order.sort(function (left, right) {
      var leftDate = groups[left].dates[0] || {};
      var rightDate = groups[right].dates[0] || {};
      return String(leftDate.rawDate || leftDate.date || '').localeCompare(String(rightDate.rawDate || rightDate.date || ''))
        || groups[left].label.localeCompare(groups[right].label);
    });
    return order.map(function (key) {
      var group = groups[key];
      return group.dates.map(function (dateGroup) {
        var count = dateGroup.count + dateGroup.combinedCount;
        var combinedNote = dateGroup.combinedCount
          ? '\uff08\u5408\u73ed' + displayCount(dateGroup.combinedCount) + '\u7bc0\u4e0d\u6392\uff09'
          : '';
        return dateGroup.date + group.label + '\u6263' + displayCount(count) + '\u7bc0' + combinedNote;
      }).filter(Boolean).join('\u3001');
    }).filter(Boolean);
  }
  function legacySelfSubNoteParts(value) {
    var raw = cleanAccountingText(value);
    if (!raw || raw === '無') return [];
    return raw.split(/\s*,\s*|\s*，\s*/).map(function (part) {
      var match = part.match(/^(.+?)\((\d{1,2})-(\d{1,2})\)$/);
      return match ? Number(match[2]) + '/' + Number(match[3]) + '代' + match[1] + '自費1節' : part;
    }).filter(Boolean);
  }

  function summaryNote(opts, source, period, leaveRecords, publicUsed, schoolSwapIndex) {
    var actualRecords = (opts.substitutionRecords || []).filter(function (record) {
      return isUsableSubstitution(record)
        && !isCombinedReturnRecord(record)
        && dateInPeriod(record.date, period)
         && sameTeacher(record.actualTeacherEmail, source)
        && isWeeklyPeriod(record.period);
    });
    var notes = groupedCoverNoteParts(actualRecords, opts);
    if (!actualRecords.length) notes = notes.concat(legacySelfSubNoteParts(source && source.selfSubDetail));
    var chargedRecords = chargedSubstitutionRecords(opts.substitutionRecords || [], opts.allSchedules || [], source, period, schoolSwapIndex, source);
    notes = notes.concat(leaveNoteParts(
      chargedRecords,
      publicUsed,
      chargedRecords.filter(isCombinedReturnRecord)
    ));
    if (source && source.note) notes.push(source.note);
    return joinAccountingNotes(notes);
  }
  function recordStatus(record) {
    return String(record && (record.status || record['狀態']) || '').trim().toLowerCase();
  }

  function isApprovedActive(record) {
    var status = recordStatus(record);
    if (!status) return true;
    var good = ['approved', 'active', 'effective', 'approved_active', '核准生效', '已核准', '核准', '已生效', '生效', '有效', '啟用'];
    var bad = ['pending_teacher', 'pending_admin', 'rejected', 'admin_rejected', 'cancelled', 'withdrawn', '待受邀人簽核', '待行政審核', '受邀人已拒絕', '行政已退回', '已取消', '已撤銷', '已撤回'];
    if (good.indexOf(status) >= 0) return true;
    if (bad.indexOf(status) >= 0) return false;
    return false;
  }

  function isActiveHomeroom(record) {
    if (!record || record.enabled === false) return false;
    var status = recordStatus(record);
    if (!status) return true;
    var bad = ['cancelled', 'withdrawn', 'rejected', 'admin_rejected', '已取消', '已撤銷', '已撤回', '撤銷', '撤回'];
    if (bad.indexOf(status) >= 0) return false;
    var good = ['approved', 'active', 'effective', 'approved_active', 'assigned', '核准生效', '已核准', '核准', '已生效', '生效', '有效', '啟用', '已指定', '已指派', '已分派', '指定'];
    return good.indexOf(status) >= 0 || !!record.actualTeacherEmail;
  }

  function missingActualTeacherWarning(record, opts) {
    var className = String(record && (record.className || record['班級']) || '').trim() || '未記載';
    var originalTeacherEmail = String(record && (
      record.originalTeacherEmail || record['原授課教師Email'] || record['原任課教師Email']
    ) || '').trim();
    var originalTeacher = String(record && (
      record.originalTeacherName || record['原授課教師姓名'] || record['原任課教師姓名'] || record['原導師姓名']
    ) || '').trim();
    if (!originalTeacher && originalTeacherEmail) {
      originalTeacher = lookupTeacherName(opts, originalTeacherEmail, originalTeacherEmail);
    }
    originalTeacher = originalTeacher || '未記載';
    var subject = String(record && (record.subject || record['科目']) || '').trim();
    var course = subject ? '、科目「' + subject + '」' : '';
    return '代課紀錄 ' + (record.date || record['異動日期'] || '')
      + '：班級「' + className + '」、原授課教師「' + originalTeacher + '」' + course
      + '的課缺少實際代課教師，未列入會計表。';
  }

  function subFee(record) {
    return String(record && (record.subFee || record['經費來源']) || '').trim();
  }

  function isTimetableOnlyFee(fee) {
    if (root.FeeUtils && typeof root.FeeUtils.isTimetableOnlyFee === 'function') {
      return root.FeeUtils.isTimetableOnlyFee(fee);
    }
    var value = String(fee || '').trim();
    return value === '僅課表呈現（不結算）' || value === '僅課表呈現';
  }

  function isTimetableOnlyRecord(record) {
    return isTimetableOnlyFee(subFee(record));
  }

  function reason(record) {
    return String(record && (record.reason || record['請假事由']) || '').trim();
  }

  function isCourseAdjustmentOnlyRecord(record) {
    if (root.FieldMap && typeof root.FieldMap.isCourseAdjustmentOnly === 'function') {
      return root.FieldMap.isCourseAdjustmentOnly(record);
    }
    var raw = record && (record.courseAdjustmentOnly !== undefined
      ? record.courseAdjustmentOnly : record['僅課務調整']);
    var normalized = String(raw == null ? '' : raw).trim().toLowerCase();
    return raw === true || raw === 1
      || normalized === 'true' || normalized === '1' || normalized === '是' || normalized === 'yes'
      || reason(record) === '課務調整';
  }

  function sourceRequestIds(record) {
    return String(record && (record.sourceRequestId || record['來源申請單ID']) || '')
      .split(/[,，;；\s]+/)
      .map(function (value) { return String(value || '').trim(); })
      .filter(Boolean);
  }

  function homeroomIsCourseAdjustmentOnly(record, substitutionRecords) {
    if (isCourseAdjustmentOnlyRecord(record)) return true;
    var ids = sourceRequestIds(record);
    if (!ids.length) return false;
    var matched = (substitutionRecords || []).filter(function (request) {
      var requestId = String(request && (request.requestId || request.id || request['申請單ID']) || '').trim();
      return requestId && ids.indexOf(requestId) >= 0;
    });
    return matched.length === ids.length && matched.length > 0
      && matched.every(isCourseAdjustmentOnlyRecord);
  }

  function homeroomTimeRangeBounds(raw) {
    var s = String(raw == null ? '' : raw).trim()
      .replace(/[～—–]/g, '~').replace(/\s*至\s*/g, '~').replace(/\s*-\s*/g, '~');
    if (!s || s === '全天' || s === '全日') return null;
    var m = s.match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var sh = Number(m[1]);
    var sm = Number(m[2]);
    var eh = Number(m[3]);
    var em = Number(m[4]);
    if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
    var start = sh * 60 + sm;
    var end = eh * 60 + em;
    return end > start ? { start: start, end: end } : null;
  }

  function homeroomFullDayEndMinutes(record, teachers, teacherKey) {
    var key = String(record && (record.leaveEmail || record.originalTeacherEmail
      || record.requesterEmail || record['申請人Email'] || record['原導師Email']
      || record.originalTeacherName || record.requesterName || record['申請人姓名'] || record['原導師姓名']
      || teacherKey) || '').trim().toLowerCase();
    var teacher = (teachers || []).find(function (t) {
      var email = String(t && (t.loginEmail || t.email) || '').trim().toLowerCase();
      var name = String(t && (t.teacherName || t.name) || '').trim().toLowerCase();
      return key && (key === email || key === name);
    });
    var role = String(teacher && teacher.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'staff' ? 17 * 60 : 16 * 60;
  }

  function homeroomIsFullDayLeave(record, teachers, teacherKey) {
    var type = String(record && (record.leaveTimeType || record['請假時間類型']) || '').trim();
    if (/^(上午|下午|半日|半天)$/.test(type)) return false;
    var raw = record && (record.leaveTime || record['請假時間'] || record.timeRange || '');
    var normalized = String(raw == null ? '' : raw).trim()
      .replace(/[～—–]/g, '~').replace(/\s*至\s*/g, '~').replace(/\s*-\s*/g, '~');
    if (!normalized || normalized === '全天' || normalized === '全日') {
      return !type || type === '全天' || type === '全日';
    }
    var bounds = homeroomTimeRangeBounds(normalized);
    return !!bounds && bounds.start <= 8 * 60 && bounds.end >= homeroomFullDayEndMinutes(record, teachers, teacherKey);
  }

  function homeroomIsBillable(record, substitutionRecords, teachers) {
    if (isTimetableOnlyRecord(record)) return false;
    if (isCourseAdjustmentOnlyRecord(record)) return false;
    var ids = sourceRequestIds(record);
    var matched = (substitutionRecords || []).filter(function (request) {
      var requestId = String(request && (request.requestId || request.id || request['申請單ID']) || '').trim();
      return requestId && ids.indexOf(requestId) >= 0;
    });
    matched = matched.filter(function (request) { return !isTimetableOnlyRecord(request); });
    if (!matched.length && ids.length) return false;
    if (!matched.length) return homeroomIsFullDayLeave(record, teachers);
    var teacherKey = record && (record.leaveEmail || record.originalTeacherEmail
      || record['原導師Email'] || record.originalTeacherName || record['原導師姓名'] || '');
    if (matched.some(function (request) {
      return !isCourseAdjustmentOnlyRecord(request) && homeroomIsFullDayLeave(request, teachers, teacherKey);
    })) return true;
    return matched.length < ids.length && homeroomIsFullDayLeave(record, teachers);
  }

  function isCombinedReturnRecord(record) {
    var raw = record && record.specialFlow;
    if (String(raw == null ? '' : raw).trim() === '') raw = record && record['特殊流程'];
    var value = String(raw == null ? '' : raw).trim().toLowerCase();
    return value === 'combined_return' || value === '合班回原班';
  }

  function cleanAccountingText(value) {
    return String(value == null ? '' : value)
      .replace(/\[直接核准\]|【直接核准】|［直接核准］/g, '')
      .split(/\r?\n/)
      .map(function (line) {
        return line
          .replace(/[ \t]{2,}/g, ' ')
          .replace(/[ \t]*([；;、,，])[ \t]*/g, '$1')
          .trim();
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  function isPublic(record) {
    if (isTimetableOnlyRecord(record)) return false;
    var fee = subFee(record);
    var why = reason(record);
    if (['\u516c\u8cbb\u4ee3\u8ab2', '\u5b78\u6821\u79fb\u64a5', '\u6d3b\u52d5\u516c\u8cbb', '\u516c\u8cbb', '\u4ee3\u8ab2\u8cbb'].indexOf(fee) >= 0) return true;
    if (['\u81ea\u8cbb\u4ee3\u8ab2', '\u81ea\u8cbb'].indexOf(fee) >= 0) return false;
    if (/\u516c\u5047\u81ea\u7406|\u4e8b\u5047|\u75c5\u5047|\u88dc\u4f11/.test(why)) return false;
    return true;
  }

  function isSelfPaidRecord(record) {
    var fee = subFee(record);
    return fee === '\u81ea\u8cbb\u4ee3\u8ab2' || fee === '\u81ea\u8cbb';
  }

  function isPublicOvertimeRecord(record) {
    var fee = subFee(record);
    return fee === '\u516c\u8cbb\u4ee3\u8ab2' || fee === '\u5b78\u6821\u79fb\u64a5';
  }

  function isPublicPayoutRecord(record) {
    if (isTimetableOnlyRecord(record)) return false;
    var fee = subFee(record);
    return isPublicOvertimeRecord(record) || fee === '\u6d3b\u52d5\u516c\u8cbb';
  }

  function isMindBodyAdjustmentLeave(record) {
    return reason(record) === '身心調適假';
  }

  function isDefaultExpensePlan(value) {
    return planLabel(value) === '國教';
  }

  function isSubstitutionRecord(record) {
    var type = String(record && (record.type || record['\u7570\u52d5\u985e\u578b']) || '').trim().toLowerCase();
    return !type || type === 'substitution' || type === '\u4ee3\u8ab2';
  }
  function isWeeklyPeriod(value) {
    var n = Number(value);
    return n === 0 || n === 45 || (n >= 1 && n <= 7);
  }

  function fixedOvertimeSetting(teacher) {
    if (root.FieldMap && typeof root.FieldMap.fixedOvertimeSetting === 'function') {
      return root.FieldMap.fixedOvertimeSetting(teacher || {});
    }
    return { configured: false, valid: false, hours: 0, slots: [], slotKeys: [], slotsText: '' };
  }

  function fixedOvertimeSettingForSchedules(teacher, schedules) {
    if (root.DomainBilling && typeof root.DomainBilling.fixedOvertimeSettingForSchedules === 'function') {
      return root.DomainBilling.fixedOvertimeSettingForSchedules(teacher, schedules || []);
    }
    return fixedOvertimeSetting(teacher);
  }

  function isFixedOvertimeRecord(record, teacher, schoolSwapIndex, schedules) {
    var setting = fixedOvertimeSettingForSchedules(teacher, schedules);
    if (!setting.configured || !setting.valid) return false;
    var slot = resolveOvertimeSourceSlot(record, schoolSwapIndex);
    return setting.slotKeys.indexOf(String(slot.dayOfWeek) + '|' + String(slot.period)) >= 0;
  }

  function hasCourseAttributeMetadata(record) {
    if (!record) return false;
    return ['courseAttr', 'courseSpecialTags', 'courseIsOvertime', 'courseIsSubstitute'].some(function (key) {
      return Object.prototype.hasOwnProperty.call(record, key);
    });
  }

  function isRecordSubstituteCourse(record) {
    if (!hasCourseAttributeMetadata(record)) return false;
    return record.courseIsSubstitute === true || String(record.courseAttr || '').trim() === '代課';
  }

  function isRecordOvertimeCourse(record) {
    if (!hasCourseAttributeMetadata(record) || isRecordSubstituteCourse(record)) return false;
    var attr = String(record.courseAttr || '').trim();
    var tags = String(record.courseSpecialTags || '')
      .split(/[、,，;；/／|｜\s]+/).map(function (value) { return String(value || '').trim(); });
    return record.courseIsOvertime === true || attr.indexOf('超鐘點') >= 0 || tags.indexOf('超鐘點') >= 0;
  }

  function isSubstituteSchedule(schedule) {
    if (!schedule) return false;
    if (schedule.isSubstitute === true) return true;
    return String(schedule.attr || schedule['\u8ab2\u5802\u5c6c\u6027'] || '').trim() === '\u4ee3\u8ab2';
  }

  function isSubstituteAttributePayoutRecord(record, schedules, schoolSwapIndex) {
    if (!record) return false;
    if (isTimetableOnlyRecord(record)) return false;
    if (hasCourseAttributeMetadata(record)) return isRecordSubstituteCourse(record);
    var date = dateObj(record.date);
    var period = Number(record.period);
    if (!date || !Number.isFinite(period) || !isWeeklyPeriod(period)) return false;
    var sourceSlot = resolveOvertimeSourceSlot(record, schoolSwapIndex);
    return (schedules || []).some(function (schedule) {
      return sameTeacher(schedule, record.originalTeacherEmail)
        && Number(schedule.dayOfWeek) === sourceSlot.dayOfWeek
        && Number(schedule.period) === sourceSlot.period
        && isScheduleActiveOnDate(schedule, String(record.date || '').slice(0, 10))
        && sameScheduleClass(record, schedule)
        && isSubstituteSchedule(schedule);
    });
  }

  function isUsableSubstitution(record) {
    if (!record || !record.date || !isApprovedActive(record) || !isSubstitutionRecord(record)) return false;
    var fee = subFee(record);
    if (isTimetableOnlyFee(fee)) return false;
    if (['\u6263\u984d\u5ea6', '\u4e92\u4ee3\u4e0d\u7d50', '\u7b2c8\u7bc0\u4ee3\u8ab2'].indexOf(fee) >= 0) return false;
    if (!isWeeklyPeriod(record.period)) return false;
    return true;
  }
  function dayPeriodKey(date, period) {
    var d = dateObj(date);
    if (!d) return '';
    var day = d.getDay() === 0 ? 7 : d.getDay();
    return day + '|' + Number(period);
  }

  function isOvertimeSchedule(schedule) {
    var attr = String(schedule && (schedule.attr || schedule['\u8ab2\u5802\u5c6c\u6027']) || '').trim();
    if (attr === '\u4ee3\u8ab2' || (schedule && schedule.isSubstitute === true)) return false;
    if (schedule && schedule.isOvertime === true) return true;
    if (attr.indexOf('\u8d85\u9418\u9ede') >= 0) return true;
    var tags = String(schedule && (schedule.specialTags || schedule['\u7279\u6b8a\u6a19\u8a18']) || '')
      .split(/[、,，;；/／|｜\s]+/).map(function (value) { return value.trim(); });
    return tags.indexOf('\u8d85\u9418\u9ede') >= 0;
  }

  function resolveOvertimeSourceSlot(record, schoolSwapIndex) {
    var date = dateObj(record && record.date);
    var period = Number(record && record.period);
    var dayOfWeek = date && (date.getDay() === 0 ? 7 : date.getDay());
    if (schoolSwapIndex && root.DomainSchoolSwap && root.DomainSchoolSwap.resolveSlot) {
      var resolved = root.DomainSchoolSwap.resolveSlot(
        schoolSwapIndex,
        String(record && record.date || '').slice(0, 10),
        dayOfWeek,
        period
      );
      if (resolved) {
        dayOfWeek = Number(resolved.dayOfWeek);
        period = Number(resolved.period);
      }
    }
    return { dayOfWeek: dayOfWeek, period: period };
  }
  function dayNameForWeekday(day) {
    var n = Number(day);
    return DAY_NAMES[n === 7 ? 0 : n] || '';
  }

  function periodName(period) {
    var value = Number(period);
    if (value === 0) return '早自習';
    if (value === 45) return '午休';
    return String(value || '');
  }

  function dayPeriodText(day, period) {
    return dayNameForWeekday(day) + periodName(period);
  }

  function scheduleText(email, allSchedules, onlyOvertime, period) {
    var seen = {};
    var fixedSetting = onlyOvertime && email && typeof email === 'object'
      ? fixedOvertimeSettingForSchedules(email, allSchedules) : { configured: false, valid: false, slotKeys: [] };
    var list = (allSchedules || []).filter(function (s) {
      if (!sameTeacher(s, email)) return false;
      if (!isWeeklyPeriod(s.period)) return false;
      if (onlyOvertime) {
        var scheduleKey = String(Number(s.dayOfWeek)) + '|' + String(Number(s.period));
        if (fixedSetting.configured && fixedSetting.valid) {
          if (fixedSetting.slotKeys.indexOf(scheduleKey) < 0) return false;
        } else if (!isOvertimeSchedule(s)) return false;
      }
      if (!scheduleActiveInPeriod(s, period)) return false;
      return true;
    }).map(function (s) {
      return { day: Number(s.dayOfWeek) || 0, period: Number(s.period) || 0 };
    }).filter(function (x) {
      var key = x.day + '|' + x.period;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    }).sort(function (a, b) {
      return a.day - b.day || a.period - b.period;
    });
    return list.map(function (x) {
      return dayPeriodText(x.day, x.period);
    }).filter(Boolean).join('\u3001');
  }

  function teachingSupportDateNote(teacher, allSchedules, period) {
    var start = dateObj(period && period.start);
    var end = dateObj(period && period.end);
    if (!teacher || !start || !end || start > end) return '';
    var fixedSetting = fixedOvertimeSettingForSchedules(teacher, allSchedules || []);
    var dates = [];
    for (var date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      var dateStr = isoDate(date);
      var hasClass = (allSchedules || []).some(function (schedule) {
        var scheduleDay = Number(schedule && (schedule.dayOfWeek != null ? schedule.dayOfWeek : schedule['星期']));
        var schedulePeriod = Number(schedule && (schedule.period != null ? schedule.period : schedule['節次']));
        if (!sameTeacher(schedule, teacher) || !isWeeklyPeriod(schedulePeriod)
            || isSubstituteSchedule(schedule) || !isScheduleActiveOnDate(schedule, dateStr)) return false;
        var actualDay = date.getDay() === 0 ? 7 : date.getDay();
        if (Number.isFinite(scheduleDay) && scheduleDay !== actualDay) return false;
        var slotKey = String(scheduleDay) + '|' + String(schedulePeriod);
        if (fixedSetting.configured && fixedSetting.valid) {
          return fixedSetting.slotKeys.indexOf(slotKey) >= 0;
        }
        return isOvertimeSchedule(schedule);
      });
      if (hasClass) dates.push(shortDate(dateStr));
    }
    return dates.filter(function (date, index, all) {
      return date && all.indexOf(date) === index;
    }).join('、');
  }
  function accountingClassParts(value) {
    return String(value == null ? '' : value)
      .trim()
      .split(/[、,，/／|｜\s]+/)
      .map(function (part) { return part.replace(/班$/, '').trim(); })
      .filter(function (part) {
        return part && !/^0+$/.test(part) && part !== '巡堂';
      });
  }

  function fallbackReportRow(teacher, allSchedules, period) {
    var email = teacherEmail(teacher && teacher.email);
    var schedules = (allSchedules || []).filter(function (s) {
       return sameTeacher(s, teacher) && isWeeklyPeriod(s.period)
        && String(s.attr || '') !== '巡堂' && scheduleActiveInPeriod(s, period);
    });
    var weeklyPeriods = schedules.length;
    var rawBase = teacher && (teacher.baseHours !== undefined ? teacher.baseHours : teacher['基本鐘點']);
    var baseHours = rawBase === 0 || rawBase === '0' ? 0 : (parseInt(rawBase, 10) || 16);
    return {
      email: email,
      name: teacherName(teacher, email),
      subject: teacher && (teacher.subject || teacher['授課科目']) || '',
      weeklyPeriods: weeklyPeriods,
      baseHours: baseHours,
      weeklyOvertime: Math.max(0, weeklyPeriods - baseHours),
      reduceDeduction: 0,
      actualOvertime: 0,
      selfPaidDeduction: 0,
      publicOvertimeUsed: 0,
      overtimeFee: 0,
      selfSubDetail: '無',
      expensePlan: teacherExpensePlan(teacher)
    };
  }

  function reportSourceRows(opts) {
    var teachers = opts.teachers || [];
    var teacherMap = {};
    teachers.forEach(function (teacher) {
      teacherMap[teacherEmail(teacher && teacher.email)] = teacher;
    });
    var map = {};
    (opts.monthlyReportRows || []).forEach(function (row) {
      map[teacherEmail(row.email)] = row;
    });
    return teachers.map(function (teacher) {
       var source = map[teacherEmail(teacher.email)] || fallbackReportRow(teacher, opts.allSchedules, opts.period);
      var plan = teacherExpensePlan(teacher) || normalizeExpensePlan(source.expensePlan || source['鐘點支出計畫'] || source['鐘點支出來源'] || source.plan);
      return Object.assign({}, source, { expensePlan: plan });
    });
  }
  function leaveRecordsFor(email, records, period, schedules, schoolSwapIndex) {
     return (records || []).filter(function (r) {
       return isUsableSubstitution(r)
         && dateInPeriod(r.date, period)
         && sameTeacher(r.originalTeacherEmail, email)
         && !isSubstituteAttributePayoutRecord(r, schedules, schoolSwapIndex);
     });
  }

  function expenseSourceForChargedRecord(opts, source, record, schoolSwapIndex) {
    if (root.DomainBilling && typeof root.DomainBilling.overtimeExpenseSourceForRecord === 'function') {
      var resolved = root.DomainBilling.overtimeExpenseSourceForRecord(
        record,
        opts.teachers || [],
        opts.allSchedules || [],
        schoolSwapIndex
      );
      if (resolved) return resolved;
    }
    var parsed = parseExpensePlan(source && source.expensePlan);
    if (parsed.mode === 'legacy' && parsed.legacySource) return parsed.legacySource;
    if (parsed.mode === 'empty') return '預設';
    return '';
  }

  function substitutionKey(record) {
    var id = record && (record.id || record.recordId || record['紀錄ID'] || record['調代課紀錄ID']);
    if (id) return 'id:' + String(id);
    return [
      teacherEmail(record && record.originalTeacherEmail),
      String(record && record.date || '').slice(0, 10),
      String(record && record.period || ''),
      String(record && (record.className || record['班級']) || '').trim(),
      teacherEmail(record && record.actualTeacherEmail),
      String(record && record.type || '')
    ].join('|');
  }

  function sameScheduleClass(record, schedule) {
    var cn = String(record && (record.className || record['班級']) || '').trim();
    var scn = String(schedule && (schedule.className || schedule['班級']) || '').trim();
    return !cn || !scn || cn === scn || cn.indexOf(scn) >= 0 || scn.indexOf(cn) >= 0;
  }

  function isOvertimeSubstitution(record, schedules, schoolSwapIndex, teacher) {
    var d = dateObj(record && record.date);
    var period = Number(record && record.period);
    if (!d || !Number.isFinite(period) || !isWeeklyPeriod(period)) return false;
    var fixedSetting = fixedOvertimeSettingForSchedules(teacher, schedules);
    if (fixedSetting.configured && fixedSetting.valid) {
      return isFixedOvertimeRecord(record, teacher, schoolSwapIndex, schedules);
    }
    if (hasCourseAttributeMetadata(record)) return isRecordOvertimeCourse(record);
    var sourceSlot = resolveOvertimeSourceSlot(record, schoolSwapIndex);
    return (schedules || []).some(function (schedule) {
       return sameTeacher(schedule, record.originalTeacherEmail)
        && Number(schedule.dayOfWeek) === sourceSlot.dayOfWeek
        && Number(schedule.period) === sourceSlot.period
        && isScheduleActiveOnDate(schedule, String(record.date || '').slice(0, 10))
        && sameScheduleClass(record, schedule)
        && isOvertimeSchedule(schedule);
    });
  }

  function chargedSubstitutionRecords(records, schedules, email, period, schoolSwapIndex, teacher) {
    var eligible = (records || []).filter(function (record) {
      return isUsableSubstitution(record)
        && dateInPeriod(record.date, period)
         && sameTeacher(record.originalTeacherEmail, email)
         && teacherEmail(record.actualTeacherEmail)
         && !isSubstituteAttributePayoutRecord(record, schedules, schoolSwapIndex);
    });
    // \u4f9d\u7db2\u9801\u6708\u5831\uff1a\u81ea\u8cbb\u5168\u90e8\u6263\u539f\u6559\u5e2b\u8d85\u9418\uff1b\u516c\u8cbb\u4f9d\u6b63\u5f0f\u8ab2\u7a0b\u539f\u5802\u5c6c\u6027\u70ba\u8d85\u9418\u9ede\u6642\u6263\uff0c\u542b\u65e9\u81ea\u7fd00\u30011\u81f37\u8207\u5348\u4f1145\u3002
    var selfRecords = eligible.filter(function (record) {
      return isSelfPaidRecord(record)
        && isOvertimeSubstitution(record, schedules, schoolSwapIndex, teacher);
    });
    var publicRecords = eligible.filter(function (record) {
      return isPublicOvertimeRecord(record) && isOvertimeSubstitution(record, schedules, schoolSwapIndex, teacher);
    });
    // 固定設定時，自費與公費都只扣固定節次；舊資料未設定時保留原本自費全扣口徑。
    var selected = selfRecords.concat(publicRecords.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''))
        || Number(a.period || 0) - Number(b.period || 0)
        || substitutionKey(a).localeCompare(substitutionKey(b));
    }));
    var seen = {};
    return selected.filter(function (record) {
      var key = substitutionKey(record);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
  function publicOvertimeUsed(email, records, schedules, period, schoolSwapIndex, teacher) {
    return chargedSubstitutionRecords(records, schedules, email, period, schoolSwapIndex, teacher)
      .filter(isPublicOvertimeRecord).length;
  }
  function buildChargedRecordMap(opts, period, schoolSwapIndex) {
    var result = { byKey: {}, byOriginal: {} };
    var records = opts.substitutionRecords || [];
    reportSourceRows(opts).forEach(function (source) {
      var sourceTeacher = (opts.teachers || []).find(function (teacher) {
        return sameTeacher(teacher, source);
      });
      var adjunct = isAdjunctStyleTeacher(sourceTeacher || source);
      if (!expensePlanSourcesForRow(source).length) return;
      var weeks = Number(opts.reportWeeksCount) > 0 ? Number(opts.reportWeeksCount) : (periodWeekCount(period) || 1);
      var scheduledOvertime = source.scheduledOvertime !== undefined
        ? Number(source.scheduledOvertime) || 0
        : (Number(source.weeklyOvertime) || 0) * weeks;
      var chargedSourceRecords = adjunct
        ? records.filter(function (record) {
          return isUsableSubstitution(record)
            && dateInPeriod(record.date, period)
            && sameTeacher(record.originalTeacherEmail, source)
            && teacherEmail(record.actualTeacherEmail)
            && !isSubstituteAttributePayoutRecord(record, opts.allSchedules || [], schoolSwapIndex);
        })
        : chargedSubstitutionRecords(records, opts.allSchedules, source, period, schoolSwapIndex, source);
      var chargedKeys = {};
      chargedSourceRecords.forEach(function (record) {
        chargedKeys[substitutionKey(record)] = true;
      });
      var allSourceRecords = records.filter(function (record) {
        return isUsableSubstitution(record)
          && dateInPeriod(record.date, period)
          && sameTeacher(record.originalTeacherEmail, source)
          && teacherEmail(record.actualTeacherEmail)
          && !isSubstituteAttributePayoutRecord(record, opts.allSchedules || [], schoolSwapIndex);
      });
      var sourceRecords = allSourceRecords.filter(function (record) {
        var key = substitutionKey(record);
        var plan = expenseSourceForChargedRecord(opts, source, record, schoolSwapIndex);
        if (chargedKeys[key] || adjunct) return adjunct || !!plan;
        if (scheduledOvertime <= 0) return false;
        return isDefaultExpensePlan(plan);
      });
      sourceRecords
        .filter(function (record) { return !isCombinedReturnRecord(record); })
        .forEach(function (record) {
          var key = substitutionKey(record);
          var email = teacherEmail(source.email);
          var plan = expenseSourceForChargedRecord(opts, source, record, schoolSwapIndex);
          var item = {
            record: record,
            source: source,
            plan: plan,
            charged: adjunct || !!chargedKeys[key],
            routeToAdjunctSheet: adjunct,
            routeToSubstituteSheet: false
          };
          result.byKey[key] = item;
          if (!result.byOriginal[email]) result.byOriginal[email] = [];
          result.byOriginal[email].push(item);
        });
    });
    return result;
  }
  function buildOvertimeSubstitutionRow(opts, source, teacherMap, item, serial) {
    var record = item.record;
    var actualTeacher = teacherFromMap(teacherMap, record.actualTeacherEmail, record.actualTeacherName);
    var sourceTeacher = teacherFromMap(teacherMap, source.email, source.name);
    var count = periodCount(record, false);
    var rate = feeRate(record, FEE_DEFAULT);
    var originalName = teacherName(sourceTeacher, source.name || source.email);
    var detail = substitutionNoteText(record, opts, originalName);
    var actualTeacherKey = teacherSortKey(actualTeacher)
      || teacherSortKey(record.actualTeacherEmail)
      || teacherSortKey(record.actualTeacherName);
    return {
      expensePlan: planLabel(item.plan || source.expensePlan),
      serial: serial,
      _rowKind: 'overtimeSubstitution',
      _teacherKey: actualTeacherKey,
      title: teacherTitle(actualTeacher) || '\u6559\u5e2b',
      name: teacherName(actualTeacher, record.actualTeacherName || record.actualTeacherEmail),
      weeklyOvertime: '',
      schedule: '',
      weeks: '',
      grossHours: '',
      deduction: '',
      actualHours: count,
      rate: rate,
      amount: count * rate,
      reduceNote: '',
      note: detail,
      _noteRecords: [record]
    };
  }

  function summaryRowTeacherKey(row) {
    return String((row && row._teacherKey) || (row && row.name) || '')
      .trim().toLowerCase();
  }

  function mergeOvertimeSubstitutionRows(rows, substitutionRows, opts) {
    var teacherOrder = teacherOrderMap(opts.teachers || []);
    var primaryGroups = {};
    var substitutionGroups = {};
    var labels = {};

    function rememberLabel(key, row) {
      if (key && !labels[key]) labels[key] = String(row && row.name || '').trim();
    }

    (rows || []).forEach(function (row) {
      if (!row) return;
      var key = summaryRowTeacherKey(row) || '__unknown__';
      if (!primaryGroups[key]) primaryGroups[key] = [];
      primaryGroups[key].push(row);
      rememberLabel(key, row);
    });

    var mergedSubstitutionGroups = {};
    (substitutionRows || []).forEach(function (row) {
      if (!row) return;
      var teacherKey = summaryRowTeacherKey(row) || '__unknown__';
      var groupKey = teacherKey + '|' + (Number(row.rate) || 0);
      if (!mergedSubstitutionGroups[groupKey]) {
        mergedSubstitutionGroups[groupKey] = row;
      } else {
        var merged = mergedSubstitutionGroups[groupKey];
        merged.amount = (Number(merged.amount) || 0) + (Number(row.amount) || 0);
        merged.actualHours = (Number(merged.actualHours) || 0) + (Number(row.actualHours) || 0);
        merged._noteRecords = (merged._noteRecords || []).concat(row._noteRecords || []);
      }
      rememberLabel(teacherKey, row);
    });

    Object.keys(mergedSubstitutionGroups).forEach(function (groupKey) {
      var row = mergedSubstitutionGroups[groupKey];
      var teacherKey = summaryRowTeacherKey(row) || '__unknown__';
      if (!substitutionGroups[teacherKey]) substitutionGroups[teacherKey] = [];
      substitutionGroups[teacherKey].push(row);
    });

    var teacherKeys = [];
    Object.keys(primaryGroups).concat(Object.keys(substitutionGroups)).forEach(function (key) {
      if (teacherKeys.indexOf(key) < 0) teacherKeys.push(key);
    });
    teacherKeys.sort(function (left, right) {
      var rankDiff = teacherOrderValue(teacherOrder, left) - teacherOrderValue(teacherOrder, right);
      if (rankDiff) return rankDiff;
      return String(labels[left] || left).localeCompare(String(labels[right] || right), 'zh-Hant');
    });

    var output = [];
    teacherKeys.forEach(function (key) {
      (primaryGroups[key] || []).forEach(function (row) { output.push(row); });
      (substitutionGroups[key] || []).forEach(function (row) {
        row.weeklyOvertime = '';
        row.schedule = '';
        row.weeks = '';
        row.grossHours = '';
        row.deduction = '';
        row.note = joinAccountingNotes(groupedCoverNoteParts(row._noteRecords || [], opts));
        output.push(row);
      });
    });
    output.forEach(function (row, index) {
      row.serial = index + 1;
      delete row._rowKind;
      delete row._teacherKey;
      delete row._noteRecords;
    });
    return output;
  }

  function overtimeSourceVariants(source, expectedPlan) {
    var allocations = Array.isArray(source && source.expensePlanAllocations)
      ? source.expensePlanAllocations : [];
    var matches = allocations.filter(function (allocation) {
      return expensePlanMatchesFilter(allocation && allocation.source, expectedPlan);
    });
    if (matches.length) {
      return matches.map(function (allocation) {
        return {
          row: Object.assign({}, source, {
            expensePlan: expectedPlan,
            expensePlanForNote: individualExpensePlanSource(source, allocation)
          }),
          allocation: allocation
        };
      });
    }
    if (!allocations.length && !(source && source.expensePlanConflicts && source.expensePlanConflicts.length)
        && expensePlanSourcesForRow(source).some(function (sourcePlan) {
          return expensePlanMatchesFilter(sourcePlan, expectedPlan);
        })) {
      return [{
        row: Object.assign({}, source, {
          expensePlan: expectedPlan,
          expensePlanForNote: individualExpensePlanSource(source, null)
        }),
        allocation: null
      }];
    }
    return [];
  }

  function buildSummaryRows(config, opts, period, planFilter, chargedMap, schoolSwapIndex) {
    var teacherMap = {};
    (opts.teachers || []).forEach(function (t) { addTeacherToMap(teacherMap, t); });
    var records = opts.substitutionRecords || [];
    var weeks = Number(opts.reportWeeksCount) > 0 ? Number(opts.reportWeeksCount) : (periodWeekCount(period) || 1);
    var rows = [];
    var substitutionRows = [];
    var expectedPlan = (config.key === 'overtime' || config.key === 'teachingSupport')
      ? planLabel(planFilter) : null;
    reportSourceRows(opts).forEach(function (source) {
      var variants = (config.key === 'overtime' || config.key === 'teachingSupport') && expectedPlan
        ? overtimeSourceVariants(source, expectedPlan)
        : [{ row: source, allocation: null }];
      variants.forEach(function (variant) {
        var sourceRow = variant.row;
        var allocation = variant.allocation;
        var t = teacherFromMap(teacherMap, sourceRow.email, sourceRow.name);
        var sourcePlan = allocation
          ? planLabel(allocation.source)
          : outputExpensePlan(sourceRow.expensePlan || sourceRow['鐘點支出計畫'] || sourceRow.plan);
        var teachingSupport = isTeachingSupportTeacher(t || sourceRow);
        var adjunct = isAdjunctTeacher(t || sourceRow);
        if (config.key === 'adjunct' && !adjunct) return;
        if (config.key === 'teachingSupport' && !teachingSupport) return;
        if (config.key === 'overtime' && (adjunct || teachingSupport)) return;
        var title = teacherTitle(t) || (adjunct || teachingSupport ? '兼課教師' : '教師');
        var leave = leaveRecordsFor(source, records, period, opts.allSchedules || [], schoolSwapIndex);
        var sourceItems = chargedMap && chargedMap.byOriginal[teacherEmail(source.email)] || null;
        var chargedItems = null;
        if (sourceItems) {
          sourceItems = (config.key === 'overtime' || config.key === 'teachingSupport') && expectedPlan
            ? sourceItems.filter(function (item) { return planLabel(item.plan) === expectedPlan; })
            : sourceItems.slice();
          chargedItems = sourceItems.filter(function (item) { return item.charged !== false; });
        }
        var chargedRecordsForSource = chargedItems
          ? chargedItems.map(function (item) { return item.record; })
          : chargedSubstitutionRecords(records, opts.allSchedules || [], source, period, schoolSwapIndex, source);
        var chargedCombinedRecords = chargedSubstitutionRecords(
          records,
          opts.allSchedules || [],
          source,
          period,
          schoolSwapIndex,
          source
        ).filter(function (record) {
          if (!isCombinedReturnRecord(record)) return false;
          if ((config.key !== 'overtime' && config.key !== 'teachingSupport') || !expectedPlan) return true;
          return planLabel(expenseSourceForChargedRecord(opts, source, record, schoolSwapIndex)) === expectedPlan;
        });
        var selfCount = allocation
          ? chargedRecordsForSource.filter(isSelfPaidRecord).length
          : leave.filter(function (record) {
            return isSelfPaidRecord(record)
              && isOvertimeSubstitution(record, opts.allSchedules || [], schoolSwapIndex, sourceRow);
          }).length;
        var publicUsed = allocation
          ? chargedRecordsForSource.filter(isPublicOvertimeRecord).length
          : publicOvertimeUsed(source, records, opts.allSchedules, period, schoolSwapIndex, source);
        // 超鐘點／兼課鐘點不因放假或空堂減少；小鐘點的實際未授課扣減
        // 會在 substituteAttributePlans 依逐日明細處理。
        var noAwayDeduction = config.key === 'overtime'
          || config.key === 'adjunct' || config.key === 'teachingSupport';
        var reduce = noAwayDeduction ? 0 : (allocation
          ? Math.max(0, Number(allocation.reduceHours) || 0)
          : (Number(sourceRow.reduceDeduction) || 0));
        if (!opts.reportStartDate && !opts.reportEndDate
            && (period.start.slice(0, 7) !== String(opts.reportMonth || '')
              || period.end.slice(0, 7) !== String(opts.reportMonth || ''))) {
          reduce = 0;
        }
        var scheduledOvertime = allocation
          ? Number(allocation.rawHours) || 0
          : (sourceRow.scheduledOvertime !== undefined
            ? Number(sourceRow.scheduledOvertime) || 0
            : (Number(sourceRow.weeklyOvertime) || 0) * weeks);
        if ((config.key === 'overtime' || config.key === 'adjunct' || config.key === 'teachingSupport')
            && scheduledOvertime <= 0) return;
        var grossHours = noAwayDeduction && allocation && allocation.rawHours !== undefined
          ? Number(allocation.rawHours) || 0
          : allocation && allocation.grossHours !== undefined
            ? Number(allocation.grossHours) || 0
            : Math.max(0, scheduledOvertime - reduce);
        var deduction = allocation && allocation.deduction !== undefined
          ? Number(allocation.deduction) || 0
          : selfCount + publicUsed;
        var actualHours = allocation && allocation.actualHours !== undefined && !noAwayDeduction
          ? Number(allocation.actualHours) || 0
          : grossHours - deduction;
        var weeklyOvertime = allocation
          ? (allocation.weeklyHours !== undefined
            ? (Number(allocation.weeklyHours) || 0)
            : (Number(sourceRow.weeklyOvertime) || 0))
          : (Number(sourceRow.weeklyOvertime) || 0);
        var rate = Number(opts.overtimeRate) || FEE_DEFAULT;
        var schedule = allocation && allocation.schedule
          ? String(allocation.schedule)
          : scheduleText(sourceRow, opts.allSchedules, true, period);
        var overtimeNotes = leaveNoteParts(
          chargedRecordsForSource,
          publicUsed,
          chargedCombinedRecords
        );
        var notes = config.key === 'overtime'
          ? joinAccountingNotes(overtimeNotes)
          : summaryNote(opts, sourceRow, period, leave, publicUsed, schoolSwapIndex);
        if (config.key === 'teachingSupport') {
          var teachingSupportDates = teachingSupportDateNote(t || sourceRow, opts.allSchedules || [], period);
          if (teachingSupportDates) notes = [notes, teachingSupportDates].filter(Boolean).join('；');
        }
        var row = {
          expensePlan: sourcePlan,
          expensePlanForNote: sourceRow.expensePlanForNote
            || (allocation && allocation.source)
            || sourceRow.expensePlan,
          _rowKind: 'summary',
          _teacherKey: teacherSortKey(t) || teacherSortKey(sourceRow),
          serial: rows.length + 1,
          title: title,
          name: teacherName(t, sourceRow.name),
          weeklyOvertime: weeklyOvertime,
          schedule: schedule,
          weeks: weeks,
          grossHours: grossHours,
          deduction: deduction,
          actualHours: actualHours,
          rate: rate,
          amount: actualHours * rate,
          reduceNote: reduce ? ('空堂扣減 ' + reduce + ' 節') : '',
          note: notes
        };
        // 合班回原即使實得為零，仍須在超鐘點表呈現原教師的扣鐘點。
        var hasCombinedReturn = chargedCombinedRecords.length > 0;
        if ((config.key !== 'overtime' && config.key !== 'adjunct' && config.key !== 'teachingSupport')
            || actualHours !== 0 || hasCombinedReturn) rows.push(row);
        var substitutionItems = config.key === 'overtime' && chargedItems
          ? chargedItems.filter(function (item) { return !item.routeToSubstituteSheet; })
          : (config.key === 'adjunct' || config.key === 'teachingSupport') && sourceItems
            ? sourceItems.filter(function (item) { return item.routeToAdjunctSheet; })
            : [];
        substitutionItems.forEach(function (item) {
          substitutionRows.push(buildOvertimeSubstitutionRow(opts, sourceRow, teacherMap, item, substitutionRows.length + 1));
        });
      });
    });
    var output = config.key === 'overtime' || config.key === 'adjunct' || config.key === 'teachingSupport'
      ? mergeOvertimeSubstitutionRows(rows, substitutionRows, opts)
      : rows;
    return appendMergedPlanNotes(output, config, planFilter);
  }

  function courseText(record) {
    var cls = String(record && (record.className || record['班級']) || '').trim();
    var subj = String(record && (record.subject || record['科目']) || '').trim();
    return cls + subj;
  }

  function publicRows(opts, period, chargedMap, adjustmentOnly, schoolSwapIndex) {
    var teacherMap = {};
    var teacherOrder = teacherOrderMap(opts.teachers || []);
    (opts.teachers || []).forEach(function (t) { addTeacherToMap(teacherMap, t); });
    var groups = {};
    (opts.substitutionRecords || []).filter(function (r) {
      var isAdjustment = isMindBodyAdjustmentLeave(r);
      return isUsableSubstitution(r) && !isCombinedReturnRecord(r)
        && dateInPeriod(r.date, period) && isPublicPayoutRecord(r) && r.actualTeacherEmail
        && !isSubstituteAttributePayoutRecord(r, opts.allSchedules || [], schoolSwapIndex)
        && Boolean(adjustmentOnly) === isAdjustment
        && (!chargedMap || !chargedMap.byKey[substitutionKey(r)]
          || chargedMap.byKey[substitutionKey(r)].charged === false
          || chargedMap.byKey[substitutionKey(r)].routeToSubstituteSheet);
    }).forEach(function (r) {
      var email = teacherEmail(r.actualTeacherEmail);
      if (!groups[email]) groups[email] = { email: email, records: [], hours: 0, rate: feeRate(r, FEE_DEFAULT) };
      groups[email].records.push(r);
      groups[email].hours += periodCount(r, false);
      groups[email].rate = feeRate(r, groups[email].rate);
    });
    return Object.keys(groups).sort(function (leftEmail, rightEmail) {
      var result = compareTeacherOrder(teacherOrder, groups[leftEmail], groups[rightEmail]);
      return result || leftEmail.localeCompare(rightEmail);
    }).map(function (email, idx) {
      var group = groups[email];
      var firstRecord = group.records[0] || {};
      var t = teacherFromMap(teacherMap, email, group.name || firstRecord.actualTeacherName);
      var name = teacherName(t, group.name || firstRecord.actualTeacherName || email);
      var notes = groupedCoverNoteParts(group.records, opts);
      return {
        serial: idx + 1,
        title: teacherTitle(t) || '\u6559\u5e2b',
        name: name,
        hours: group.hours,
        rate: group.rate,
        amount: group.hours * group.rate,
        note: joinAccountingNotes(notes)
      };
    });
  }

  function expenseSourceForSubstituteSchedule(teacher, schedule) {
    var raw = teacher && (teacher.expensePlan !== undefined
      ? teacher.expensePlan
      : (teacher['鐘點支出計畫'] || teacher['鐘點支出來源'] || ''));
    var parsed = parseExpensePlan(raw);
    if (parsed.mode === 'legacy') return outputExpensePlan(parsed.legacySource);
    if (parsed.mode !== 'slots') return outputExpensePlan('預設');
    var slot = {
      day: Number(schedule && (schedule.dayOfWeek != null ? schedule.dayOfWeek : schedule['星期'])),
      period: Number(schedule && (schedule.period != null ? schedule.period : schedule['節次'])),
      className: String(schedule && (schedule.className || schedule['班級']) || '').trim()
    };
    if (root.FieldMap && typeof root.FieldMap.expensePlanSourceForSlot === 'function') {
      return outputExpensePlan(root.FieldMap.expensePlanSourceForSlot(parsed, slot) || '預設');
    }
    var sources = parsed.slots.filter(function (item) {
      return item.day === slot.day && item.period === slot.period
        && (!item.className || !slot.className || item.className === slot.className);
    }).map(function (item) { return outputExpensePlan(item.source); });
    return sources.length ? sources[0] : outputExpensePlan('預設');
  }

  function substituteScheduleSlotsForPlan(source, opts, period, plan) {
    var seen = {};
    return (opts.allSchedules || []).filter(function (schedule) {
      if (!sameTeacher(schedule, source) || !isSubstituteSchedule(schedule)
          || !isWeeklyPeriod(schedule.period) || !scheduleActiveInPeriod(schedule, period)) return false;
      return expenseSourceForSubstituteSchedule(source, schedule) === outputExpensePlan(plan);
    }).map(function (schedule) {
      var day = Number(schedule.dayOfWeek);
      var periodValue = Number(schedule.period);
      var key = day + '|' + periodValue;
      if (seen[key]) return null;
      seen[key] = true;
      return { day: day, period: periodValue };
    }).filter(Boolean).sort(function (left, right) {
      return left.day - right.day || left.period - right.period;
    });
  }

  function substituteDetailSlots(details) {
    var seen = {};
    return (details || []).map(function (detail) {
      var key = dayPeriodKey(detail && detail.date, detail && detail.period);
      if (!key || seen[key]) return null;
      seen[key] = true;
      var parts = key.split('|');
      return { day: Number(parts[0]), period: Number(parts[1]) };
    }).filter(Boolean).sort(function (left, right) {
      return left.day - right.day || left.period - right.period;
    });
  }

  function substitutePlanMetrics(source, sourceRow, group, groupCount, opts, period) {
    var weeks = Number(sourceRow && sourceRow.reportWeeksCount) > 0
      ? Number(sourceRow.reportWeeksCount)
      : (Number(opts.reportWeeksCount) > 0 ? Number(opts.reportWeeksCount) : (periodWeekCount(period) || 1));
    var scheduleSlots = substituteScheduleSlotsForPlan(sourceRow || source, opts, period, group.source);
    var detailSlots = substituteDetailSlots(group.details);
    var slots = scheduleSlots.length ? scheduleSlots : detailSlots;
    var paid = Number(group.hours) || 0;
    var scheduled = scheduleSlots.length ? scheduleSlots.length * weeks : paid;
    var sourceScheduled = Number(sourceRow && sourceRow.substituteScheduledCount);
    if (groupCount === 1 && Number.isFinite(sourceScheduled) && sourceScheduled >= paid) {
      scheduled = sourceScheduled;
    }
    if (!scheduled) scheduled = paid;
    var deduction = Math.max(0, scheduled - paid);
    var sourceDeduction = Number(sourceRow && sourceRow.substituteDeduction);
    if (groupCount === 1 && Number.isFinite(sourceDeduction)
        && sourceDeduction >= 0 && sourceDeduction <= scheduled) {
      deduction = sourceDeduction;
    }
    var weekly = scheduleSlots.length
      ? scheduled / weeks
      : (slots.length || paid);
    return {
      weekly: Math.round(weekly * 100) / 100,
      schedule: slots.map(function (slot) { return dayPeriodText(slot.day, slot.period); }).filter(Boolean).join('、'),
      weeks: weeks,
      scheduled: scheduled,
      deduction: deduction,
      paid: paid
    };
  }

  function substituteAttributePlans(opts, period) {
    var teacherMap = {};
    var teacherOrder = teacherOrderMap(opts.teachers || []);
    var groups = {};
    var sourceRows = {};
    var sourceFullNames = {};
    (opts.teachers || []).forEach(function (t) { addTeacherToMap(teacherMap, t); });
    (opts.monthlyReportRows || []).forEach(function (sourceRow) {
      var sourceEmail = teacherEmail(sourceRow.email || sourceRow.teacherEmail);
      if (sourceEmail) sourceRows[sourceEmail] = sourceRow;
      var details = Array.isArray(sourceRow.substituteAttributeDetails)
        ? sourceRow.substituteAttributeDetails.filter(function (detail) {
          return dateInPeriod(detail.date, period) && String(detail.source || '').trim();
        })
        : [];
      if (!details.length) return;
      var email = sourceEmail;
      if (!email) return;
      details.forEach(function (detail) {
        var source = planLabel(detail.source);
        if (!sourceFullNames[source]) sourceFullNames[source] = planFullLabel(detail.source);
        var key = source + '|' + email;
        if (!groups[key]) {
          groups[key] = {
            source: source,
            email: email,
            name: sourceRow.name || '',
            details: [],
            hours: 0
          };
        }
        groups[key].details.push(detail);
        groups[key].hours += 1;
      });
    });

    var groupCounts = {};
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      groupCounts[group.email] = (groupCounts[group.email] || 0) + 1;
    });
    var bySource = {};
    Object.keys(groups).forEach(function (key) {
      var group = groups[key];
      if (!bySource[group.source]) bySource[group.source] = [];
      bySource[group.source].push(group);
    });
    return Object.keys(bySource).sort(function (left, right) {
      if (left === '國教') return -1;
      if (right === '國教') return 1;
      return left.localeCompare(right, 'zh-Hant', { numeric: true });
    }).map(function (source) {
      var rows = bySource[source].sort(function (left, right) {
        return compareTeacherOrder(teacherOrder, left, right)
          || left.email.localeCompare(right.email);
      }).map(function (group, index) {
        var t = teacherFromMap(teacherMap, group.email, group.name);
        var sourceRow = sourceRows[group.email] || t;
        var isSubstituteHelper = group.details.some(function (detail) {
          return String(detail.substituteForName || '').trim() !== '';
        });
        var metrics = substitutePlanMetrics(
          { email: group.email, name: group.name },
          sourceRow,
          group,
          groupCounts[group.email] || 1,
          opts,
          period
        );
        var noteGroups = {};
        group.details.forEach(function (detail) {
          var target = String(detail.substituteForName || '').trim();
          var key = target || '__default__';
          if (!noteGroups[key]) noteGroups[key] = [];
          noteGroups[key].push(detail);
        });
        var noteParts = Object.keys(noteGroups).sort(function (left, right) {
          if (left === '__default__') return 1;
          if (right === '__default__') return -1;
          return left.localeCompare(right, 'zh-Hant', { numeric: true });
        }).map(function (key) {
          var noteDetails = noteGroups[key];
          var noteDates = noteDetails.map(function (detail) {
            return {
              key: String(detail.date || '').slice(0, 10),
              label: shortDate(detail.date)
            };
          }).filter(function (item) {
            return item.label;
          }).sort(function (left, right) {
            return left.key.localeCompare(right.key);
          }).map(function (item, dateIndex, all) {
            return dateIndex === 0 || item.key !== all[dateIndex - 1].key ? item.label : '';
          }).filter(Boolean);
          if (key === '__default__') return noteDates.join('、');
          return '代' + key + displayCount(noteDetails.length) + '節（' + noteDates.join('、') + '）';
        });
        return {
          serial: index + 1,
          title: teacherTitle(t) || '\u6559\u5e2b',
          name: teacherName(t, group.name || group.email),
          weeklyOvertime: isSubstituteHelper ? '' : metrics.weekly,
          schedule: isSubstituteHelper ? '' : metrics.schedule,
          weeks: isSubstituteHelper ? '' : metrics.weeks,
          grossHours: isSubstituteHelper ? '' : metrics.scheduled,
          deduction: isSubstituteHelper ? '' : metrics.deduction,
          actualHours: metrics.paid,
          hours: group.hours,
          rate: FEE_DEFAULT,
          amount: metrics.paid * FEE_DEFAULT,
          isSubstituteHelper: isSubstituteHelper,
          note: noteParts.join('；')
        };
      });
      return { plan: source, fullPlan: sourceFullNames[source] || planFullLabel(source), rows: rows };
    });
  }

  function selfRows(opts, period, chargedMap, schoolSwapIndex) {
    var teacherMap = {};
    var teacherOrder = teacherOrderMap(opts.teachers || []);
    (opts.teachers || []).forEach(function (t) { addTeacherToMap(teacherMap, t); });
    return (opts.substitutionRecords || []).filter(function (r) {
      return isUsableSubstitution(r) && !isCombinedReturnRecord(r)
        && dateInPeriod(r.date, period) && isSelfPaidRecord(r) && r.actualTeacherEmail
        && !isSubstituteAttributePayoutRecord(r, opts.allSchedules || [], schoolSwapIndex)
        && (!chargedMap || !chargedMap.byKey[substitutionKey(r)]
          || chargedMap.byKey[substitutionKey(r)].charged === false
          || chargedMap.byKey[substitutionKey(r)].routeToSubstituteSheet);
    }).sort(function (a, b) {
      return compareTeacherOrder(teacherOrder,
        { email: a.actualTeacherEmail, name: a.actualTeacherName },
        { email: b.actualTeacherEmail, name: b.actualTeacherName })
        || String(a.date || '').localeCompare(String(b.date || ''))
        || Number(a.period || 0) - Number(b.period || 0);
    }).map(function (r) {
      var t = teacherFromMap(teacherMap, r.actualTeacherEmail, r.actualTeacherName);
      var originalName = r.originalTeacherName || teacherName(
        teacherFromMap(teacherMap, r.originalTeacherEmail, r.originalTeacherName),
        r.originalTeacherEmail
      );
      return {
        actualName: teacherName(t, r.actualTeacherName || r.actualTeacherEmail),
        date: rocDate(r.date),
        time: r.leaveTime || r.timeRange || '08:00-16:00',
        course: courseText(r),
        period: periodText(r.period),
        count: periodCount(r, false),
        rate: feeRate(r, FEE_DEFAULT),
        amount: periodCount(r, false) * feeRate(r, FEE_DEFAULT),
        originalName: originalName,
        reason: reason(r) || subFee(r),
        substitutionNote: substitutionNoteText(r, opts, originalName),
        note: r.note || ''
      };
    });
  }

  function mentorRows(opts, period) {
    var teacherOrder = teacherOrderMap(opts.teachers || []);
    return (opts.homeroomRecords || []).filter(function (r) {
       return homeroomIsBillable(r, opts.substitutionRecords, opts.teachers)
        && isActiveHomeroom(r) && r.actualTeacherEmail && dateInPeriod(r.date, period);
    }).sort(function (a, b) {
      return compareTeacherOrder(teacherOrder,
        { email: a.actualTeacherEmail, name: a.actualTeacherName },
        { email: b.actualTeacherEmail, name: b.actualTeacherName })
        || String(a.date || '').localeCompare(String(b.date || ''));
    }).map(function (r) {
      var count = periodCount(r, true);
      var rate = feeRate(r, FEE_DEFAULT);
      var className = String(r.className || '').trim();
      return {
        actualName: r.actualTeacherName || r.actualTeacherEmail,
        date: rocDate(r.date),
        time: r.leaveTime || r.timeRange || '08:00-16:00',
        course: '代導',
        period: '1日',
        count: count,
        rate: rate,
        amount: count * rate,
        originalName: '',
        reason: '',
        note: className ? (className.replace(/導師$/, '') + '導師') : '導師'
      };
    });
  }

  function buildExportData(opts) {
    opts = opts || {};
    if (!Array.isArray(opts.monthlyReportRows)
        && root.DomainBilling && typeof root.DomainBilling.buildMonthlyReportRows === 'function') {
      opts.monthlyReportRows = root.DomainBilling.buildMonthlyReportRows(opts);
    }
    var schoolSwapIndex = root.DomainSchoolSwap && root.DomainSchoolSwap.buildIndex
      ? root.DomainSchoolSwap.buildIndex(opts.schoolSwaps || [])
      : null;
    var periods = opts.periods || loadPeriodSettings(opts.reportMonth);
    var data = {
      periods: periods,
      sheets: {},
      overtimePlans: [],
      teachingSupportPlans: [],
      substituteAttributePlans: [],
      summary: [],
      warnings: [],
      blocking: []
    };
    var summaryFor = function (key, label, rows) {
      data.summary.push({
        key: key,
        label: label,
        count: rows.length,
        hours: rows.reduce(function (sum, row) {
          return sum + Number(row.actualHours !== undefined ? row.actualHours : (row.hours !== undefined ? row.hours : row.count)) || 0;
        }, 0),
        amount: rows.reduce(function (sum, row) {
          return sum + Number(row.amount) || 0;
        }, 0)
      });
    };

    var overtimeConfig = SHEET_CONFIG.overtime;
    var overtimePeriod = getPeriod(periods, 'overtime', opts.reportMonth);
    var chargedMapCache = {};
    var chargedMapFor = function (period) {
      var periodKey = String(period && period.start || '') + '|' + String(period && period.end || '');
      if (!chargedMapCache[periodKey]) {
        chargedMapCache[periodKey] = buildChargedRecordMap(opts, period, schoolSwapIndex);
      }
      return chargedMapCache[periodKey];
    };
    var chargedMap = chargedMapFor(overtimePeriod);
    data.sheets.overtime = buildSummaryRows(overtimeConfig, opts, overtimePeriod, '', chargedMap, schoolSwapIndex);

    var planKeys = [];
    var planFullNames = {};
    reportSourceRows(opts).forEach(function (source) {
      var parsed = parseExpensePlan(source.expensePlan);
      var addPlan = function (value) {
        var plan = planLabel(value);
        if (plan && planKeys.indexOf(plan) < 0) planKeys.push(plan);
      };
      expensePlanSourcesForRow(source).forEach(addPlan);
      Object.keys(expensePlanFullNamesForRow(source)).forEach(function (plan) {
        if (!planFullNames[plan]) planFullNames[plan] = expensePlanFullNamesForRow(source)[plan];
      });
      if (parsed.invalid) {
        var invalidMessage = '教師「' + teacherName(source, source.email) + '」的超鐘點經費配置格式有誤。';
        addUniqueMessage(data.warnings, invalidMessage);
        addUniqueMessage(data.blocking, invalidMessage + '請先修正後再匯出。');
      }
      (source.expensePlanWarnings || []).forEach(function (warning) {
        addUniqueMessage(data.warnings, warning);
      });
      if (source.fixedOvertimeConfigError) {
        addUniqueMessage(data.warnings, '教師「' + teacherName(source, source.email)
          + '」的固定超鐘點設定有誤：' + source.fixedOvertimeConfigError + '，本次暫以課表推算。');
      }
      (source.expensePlanConflicts || []).forEach(function (conflict) {
        var slot = conflict.day && conflict.period !== undefined
          ? '（星期' + conflict.day + '第' + conflict.period + '節）' : '';
        var conflictMessage = '教師「' + teacherName(source, source.email) + '」' + slot
          + '的經費來源無法與課表一致，已停止自動分表，請先核對。';
        addUniqueMessage(data.warnings, conflictMessage);
        addUniqueMessage(data.blocking, conflictMessage);
      });
      if (Number(source.expensePlanBlockedHours) > 0) {
        var blockedMessage = '教師「' + teacherName(source, source.email) + '」有 '
          + Number(source.expensePlanBlockedHours) + ' 節經費來源尚未分配，請先核對。';
        addUniqueMessage(data.warnings, blockedMessage);
        addUniqueMessage(data.blocking, blockedMessage);
      }
    });
    planKeys.sort(function (a, b) {
      if (a === '國教') return -1;
      if (b === '國教') return 1;
      return a.localeCompare(b, 'zh-Hant', { numeric: true });
    });
    planKeys.forEach(function (plan) {
      var rows = buildSummaryRows(overtimeConfig, opts, overtimePeriod, plan, chargedMap, schoolSwapIndex);
      if (!rows.length) return;
      var outputPlan = planLabel(plan);
      data.overtimePlans.push({
        plan: outputPlan,
        fullPlan: planFullNames[outputPlan] || planFullLabel(plan),
        rows: rows
      });
      summaryFor('overtime:' + outputPlan, '超鐘點-' + outputPlan, rows);
    });

    var teachingSupportConfig = SHEET_CONFIG.teachingSupport;
    var teachingSupportPeriod = getPeriod(periods, 'adjunct', opts.reportMonth);
    var teachingSupportChargedMap = chargedMapFor(teachingSupportPeriod);
    var teachingSupportPlanKeys = [];
    var teachingSupportPlanFullNames = {};
    reportSourceRows(opts).forEach(function (source) {
      var sourceTeacher = (opts.teachers || []).find(function (teacher) { return sameTeacher(teacher, source); }) || source;
      if (!isTeachingSupportTeacher(sourceTeacher)) return;
      expensePlanSourcesForRow(source).forEach(function (value) {
        var plan = planLabel(value);
        if (plan && teachingSupportPlanKeys.indexOf(plan) < 0) teachingSupportPlanKeys.push(plan);
      });
      Object.keys(expensePlanFullNamesForRow(source)).forEach(function (plan) {
        if (!teachingSupportPlanFullNames[plan]) {
          teachingSupportPlanFullNames[plan] = expensePlanFullNamesForRow(source)[plan];
        }
      });
    });
    teachingSupportPlanKeys.sort(function (a, b) {
      if (a === '國教') return -1;
      if (b === '國教') return 1;
      return a.localeCompare(b, 'zh-Hant', { numeric: true });
    });
    data.sheets.teachingSupport = [];
    teachingSupportPlanKeys.forEach(function (plan) {
      var rows = buildSummaryRows(
        teachingSupportConfig,
        opts,
        teachingSupportPeriod,
        plan,
        teachingSupportChargedMap,
        schoolSwapIndex
      );
      if (!rows.length) return;
      var outputPlan = planLabel(plan);
      data.teachingSupportPlans.push({
        plan: outputPlan,
        fullPlan: teachingSupportPlanFullNames[outputPlan] || planFullLabel(plan),
        rows: rows
      });
      data.sheets.teachingSupport = data.sheets.teachingSupport.concat(rows);
      summaryFor('teachingSupport:' + outputPlan, '教支人員-' + outputPlan, rows);
    });

    [SHEET_CONFIG.adjunct, SHEET_CONFIG.publicSub, SHEET_CONFIG.publicSubAdjustment, SHEET_CONFIG.selfSub, SHEET_CONFIG.mentor].forEach(function (config) {
      var periodKey = config.key === 'publicSubAdjustment' ? 'publicSub' : config.key;
      var period = getPeriod(periods, periodKey, opts.reportMonth);
      // 代導明細不使用 chargedMap；其餘同期間工作表共用同一份索引。
      var periodChargedMap = config.key === 'mentor' ? null : chargedMapFor(period);
      if (config.kind === 'summary') data.sheets[config.key] = buildSummaryRows(config, opts, period, '', periodChargedMap, schoolSwapIndex);
      if (config.key === 'publicSub') data.sheets[config.key] = publicRows(opts, period, periodChargedMap, false, schoolSwapIndex);
      if (config.key === 'publicSubAdjustment') data.sheets[config.key] = publicRows(opts, period, periodChargedMap, true, schoolSwapIndex);
      if (config.key === 'selfSub') data.sheets[config.key] = selfRows(opts, period, periodChargedMap, schoolSwapIndex);
      if (config.key === 'mentor') data.sheets[config.key] = mentorRows(opts, period);
      summaryFor(config.key, config.label, data.sheets[config.key]);
    });
    var substituteAttributePeriod = getPeriod(periods, 'publicSub', opts.reportMonth);
    data.substituteAttributePlans = substituteAttributePlans(opts, substituteAttributePeriod);
    data.substituteAttributePlans.forEach(function (group) {
      summaryFor('substituteAttribute:' + group.plan, '課表代課（小鐘點）-' + group.plan, group.rows);
    });

    (opts.teachers || []).forEach(function (t) {
      if (!teacherTitle(t)) data.warnings.push('教師「' + teacherName(t, t.email) + '」缺少職稱，已使用預設職稱。');
    });
    (opts.substitutionRecords || []).filter(function (r) {
      return r && r.date && isApprovedActive(r) && dateInPeriod(r.date, getPeriod(periods, 'publicSub', opts.reportMonth)) && !r.actualTeacherEmail;
    }).forEach(function (r) {
      data.warnings.push(missingActualTeacherWarning(r, opts));
    });
    if (!data.summary.some(function (x) { return x.count > 0; })) data.warnings.push('目前會計匯出範圍內沒有可匯出的資料。');
    return data;
  }
  function firstTitleCell(sheet, columns) {
    for (var c = 1; c <= columns; c += 1) {
      var cell = sheet.getCell(1, c);
      if (cell && cell.value !== null && cell.value !== undefined && String(cell.value).trim()) return cell;
    }
    return sheet.getCell(1, 1);
  }

  function titleForSheet(sheet, config, reportMonth, period, expensePlan) {
    var titleCell = firstTitleCell(sheet, config.columns);
    var templateTitle = titleFromTemplate(titleCell.value, reportMonth, period, expensePlan);
    if (templateTitle && config.key !== 'overtime'
        && config.key !== 'substituteAttribute' && config.key !== 'teachingSupport') {
      return templateTitle;
    }
    return titleFor(config, reportMonth, period, expensePlan);
  }

  function clearRow(sheet, rowNumber, columns) {
    for (var c = 1; c <= columns; c += 1) sheet.getCell(rowNumber, c).value = null;
  }

  function copyRowStyle(sheet, fromRow, toRow, columns) {
    var src = sheet.getRow(fromRow);
    var dst = sheet.getRow(toRow);
    if (src.height) dst.height = src.height;
    for (var c = 1; c <= columns; c += 1) {
      var sourceCell = src.getCell(c);
      var targetCell = dst.getCell(c);
      try { targetCell.style = clone(sourceCell.style); } catch (e) { /* ExcelJS may share immutable styles */ }
    }
  }

  function prepareRows(sheet, config, rowCount) {
    var totalRow = config.templateTotalRow;
    var capacity = totalRow - config.dataStart;
    if (rowCount > capacity) {
      var extra = rowCount - capacity;
      var blanks = [];
      for (var i = 0; i < extra; i += 1) blanks.push([]);
      sheet.insertRows(totalRow, blanks, 'i');
      for (var j = 0; j < extra; j += 1) copyRowStyle(sheet, totalRow - 1, totalRow + j, config.columns);
      totalRow += extra;
    }
    for (var r = config.dataStart; r < totalRow; r += 1) clearRow(sheet, r, config.columns);
    clearRow(sheet, totalRow, config.columns);
    return totalRow;
  }

  function writeRows(sheet, start, rows) {
    rows.forEach(function (values, index) {
      var rowNumber = start + index;
      values.forEach(function (value, colIndex) {
        var outputValue = value === undefined ? null : value;
        if (typeof outputValue === 'string') outputValue = cleanAccountingText(outputValue);
        sheet.getCell(rowNumber, colIndex + 1).value = outputValue;
      });
    });
  }

  function applyMoneyNumberFormat(sheet, columns, start, end) {
    for (var row = start; row <= end; row += 1) {
      columns.forEach(function (column) {
        sheet.getCell(row, column).numFmt = MONEY_NUMBER_FORMAT;
      });
    }
  }

  function sumRows(rows, field) {
    return (rows || []).reduce(function (sum, row) {
      return sum + (Number(row && row[field]) || 0);
    }, 0);
  }

  function sumFormula(column, start, end, result) {
    return {
      formula: end >= start ? 'SUM(' + column + start + ':' + column + end + ')' : '0',
      result: Number(result) || 0
    };
  }

  function isNetAmountSummary(config) {
    return !!config && (config.key === 'adjunct' || config.key === 'teachingSupport');
  }

  function applyActualAmountFormulas(sheet, config, rows) {
    if (!isNetAmountSummary(config)) return;
    (rows || []).forEach(function (row, index) {
      var rowNumber = config.dataStart + index;
      sheet.getCell(rowNumber, 13).value = {
        formula: 'K' + rowNumber + '-L' + rowNumber,
        result: Number(row && row.amount) || 0
      };
    });
  }

  function mergeCellRange(sheet, range) {
    try { sheet.mergeCells(range); } catch (e) { /* 範本可能已經合併 */ }
  }

  function mergeSummaryNoteRow(sheet, config, totalRow) {
    var endColumn = config.key === 'overtime' || config.key === 'substituteAttribute' ? 'O' : 'N';
    var noteRow = totalRow + 1;
    mergeCellRange(sheet, 'B' + noteRow + ':' + endColumn + noteRow);
  }

  function lineNoteText(row) {
    if (row && row.substitutionNote) return joinAccountingNotes([row.substitutionNote, row.note]);
    return [row && row.originalName, row && (row.reason || row.note)]
      .map(function (value) { return String(value == null ? '' : value).trim(); })
      .filter(Boolean)
      .join('；');
  }

  function writeSummarySheet(sheet, config, rows) {
    var totalRow = prepareRows(sheet, config, rows.length);
    var values = rows.map(function (row) {
      if (config.key === 'overtime') {
        return [row.serial, row.title, row.name, row.weeklyOvertime, row.schedule, row.weeks === '' ? null : row.weeks, row.grossHours, row.deduction, row.actualHours, row.rate, row.amount, row.reduceNote === '' ? null : row.reduceNote, null, null, row.note];
      }
      if (config.key === 'substituteAttribute') {
        return [row.serial, row.title, row.name, row.weeklyOvertime, row.schedule, row.weeks === '' ? null : row.weeks, row.grossHours, row.deduction, row.actualHours, row.rate, row.amount, null, null, null, row.note];
      }
      return [row.serial, row.title, row.name, row.weeklyOvertime, row.schedule, row.weeks === '' ? null : row.weeks, row.grossHours, row.deduction, row.actualHours, row.rate, row.amount, null, null, row.note];
    });
    writeRows(sheet, config.dataStart, values);
    applyActualAmountFormulas(sheet, config, rows);
    var end = config.dataStart + rows.length - 1;
    if (config.key === 'overtime') {
      sheet.getCell(totalRow, 2).value = '合計';
      sheet.getCell(totalRow, 4).value = sumFormula('D', config.dataStart, end, sumRows(rows, 'weeklyOvertime'));
      sheet.getCell(totalRow, 7).value = sumFormula('G', config.dataStart, end, sumRows(rows, 'grossHours'));
      sheet.getCell(totalRow, 8).value = sumFormula('H', config.dataStart, end, sumRows(rows, 'deduction'));
      sheet.getCell(totalRow, 9).value = sumFormula('I', config.dataStart, end, sumRows(rows, 'actualHours'));
      sheet.getCell(totalRow, 11).value = sumFormula('K', config.dataStart, end, sumRows(rows, 'amount'));
    } else {
      sheet.getCell(totalRow, 3).value = '合計';
      sheet.getCell(totalRow, 4).value = sumFormula('D', config.dataStart, end, sumRows(rows, 'weeklyOvertime'));
      sheet.getCell(totalRow, 7).value = sumFormula('G', config.dataStart, end, sumRows(rows, 'grossHours'));
      sheet.getCell(totalRow, 8).value = sumFormula('H', config.dataStart, end, sumRows(rows, 'deduction'));
      sheet.getCell(totalRow, 9).value = sumFormula('I', config.dataStart, end, sumRows(rows, 'actualHours'));
      sheet.getCell(totalRow, 11).value = sumFormula('K', config.dataStart, end, sumRows(rows, 'amount'));
    }
    if (isNetAmountSummary(config)) {
      sheet.getCell(totalRow, 13).value = sumFormula('M', config.dataStart, end, sumRows(rows, 'amount'));
    }
    var moneyColumns = [10, 11];
    if (isNetAmountSummary(config)) moneyColumns.push(13);
    applyMoneyNumberFormat(sheet, moneyColumns, config.dataStart, totalRow);
    mergeSummaryNoteRow(sheet, config, totalRow);
    return totalRow;
  }

  function applySummaryHeaderLabels(sheet, config) {
    if (!sheet || !config || config.key !== 'substituteAttribute') return;
    sheet.getCell(2, 4).value = '每週代課';
    sheet.getCell(2, 5).value = '代課星期/節次';
    sheet.getCell(2, 6).value = '應發周數';
    sheet.getCell(2, 7).value = '代課節數';
    sheet.getCell(2, 8).value = '請假扣代課';
  }

  function writePublicSheet(sheet, config, rows) {
    var totalRow = prepareRows(sheet, config, rows.length);
    writeRows(sheet, config.dataStart, rows.map(function (row) {
      return [row.serial, row.title, row.name, row.hours, row.rate, row.amount, null, null, row.note, null, null, null, null, null, null];
    }));
    var end = config.dataStart + rows.length - 1;
    sheet.getCell(totalRow, 2).value = '合計';
    sheet.getCell(totalRow, 4).value = sumFormula('D', config.dataStart, end, sumRows(rows, 'hours'));
    sheet.getCell(totalRow, 6).value = sumFormula('F', config.dataStart, end, sumRows(rows, 'amount'));
    applyMoneyNumberFormat(sheet, [5, 6], config.dataStart, totalRow);
    return totalRow;
  }

  function writeLineSheet(sheet, config, rows) {
    var totalRow = prepareRows(sheet, config, rows.length);
    writeRows(sheet, config.dataStart, rows.map(function (row) {
      return [row.actualName, row.date, row.time, row.course, row.period, row.count, row.rate, row.amount, lineNoteText(row), null];
    }));
    var end = config.dataStart + rows.length - 1;
    sheet.getCell(totalRow, 1).value = '合計';
    sheet.getCell(totalRow, 6).value = sumFormula('F', config.dataStart, end, sumRows(rows, 'count'));
    sheet.getCell(totalRow, 8).value = sumFormula('H', config.dataStart, end, sumRows(rows, 'amount'));
    applyMoneyNumberFormat(sheet, [7, 8], config.dataStart, totalRow);
    return totalRow;
  }

  function cloneWorksheet(source, workbook, name, maxColumns) {
    var target = workbook.addWorksheet(name);
    var copyValue = function (value) {
      try { return clone(value); } catch (e) { return value; }
    };
    ['properties', 'pageSetup', 'pageMargins', 'views', 'headerFooter', 'printOptions', 'sheetProtection', 'sheetFormatProperties'].forEach(function (key) {
      if (source[key] !== undefined && source[key] !== null) {
        try { target[key] = copyValue(source[key]); } catch (e) { /* optional ExcelJS metadata */ }
      }
    });
    var columnCount = Number(maxColumns) > 0 ? Number(maxColumns) : Math.max(Number(source.columnCount) || 0, (source.columns || []).length || 0);
    for (var c = 1; c <= columnCount; c += 1) {
      var sourceColumn = source.getColumn(c);
      var targetColumn = target.getColumn(c);
      ['width', 'hidden', 'outlineLevel', 'collapsed', 'style'].forEach(function (key) {
        if (sourceColumn[key] !== undefined && sourceColumn[key] !== null) {
          try { targetColumn[key] = copyValue(sourceColumn[key]); } catch (e) { /* optional column metadata */ }
        }
      });
    }
    var rowCount = Number(source.rowCount) || 0;
    for (var r = 1; r <= rowCount; r += 1) {
      var sourceRow = source.getRow(r);
      var targetRow = target.getRow(r);
      ['height', 'hidden', 'outlineLevel', 'collapsed', 'style'].forEach(function (key) {
        if (sourceRow[key] !== undefined && sourceRow[key] !== null) {
          try { targetRow[key] = copyValue(sourceRow[key]); } catch (e) { /* optional row metadata */ }
        }
      });
      for (var c2 = 1; c2 <= columnCount; c2 += 1) {
        var sourceCell = sourceRow.getCell(c2);
        var targetCell = targetRow.getCell(c2);
        if (sourceCell.value !== undefined && sourceCell.value !== null) {
          try { targetCell.value = copyValue(sourceCell.value); } catch (e) { /* ignore unsupported cell value */ }
        }
        if (sourceCell.style) {
          try { targetCell.style = copyValue(sourceCell.style); } catch (e) { /* ExcelJS may share immutable styles */ }
        }
        ['numFmt', 'alignment', 'font', 'border', 'fill', 'protection'].forEach(function (key) {
          if (sourceCell[key] !== undefined && sourceCell[key] !== null) {
            try { targetCell[key] = copyValue(sourceCell[key]); } catch (e) { /* optional cell metadata */ }
          }
        });
      }
    }
    var merges = source.model && source.model.merges ? source.model.merges : [];
    merges.forEach(function (range) {
      try { target.mergeCells(range); } catch (e) { /* ignore malformed optional merge */ }
    });
    return target;
  }

  function populateWorkbook(workbook, opts, data) {
    var usedNames = {};
    var overtimeConfig = SHEET_CONFIG.overtime;
    var teachingSupportConfig = SHEET_CONFIG.teachingSupport;
    var substituteAttributeConfig = SHEET_CONFIG.substituteAttribute;
    var overtimeTemplate = workbook.worksheets[overtimeConfig.index];
    if (!overtimeTemplate) throw new Error('範本缺少工作表：' + overtimeConfig.label);
    var adjunctTemplate = workbook.worksheets[SHEET_CONFIG.adjunct.index];
    if (!adjunctTemplate) throw new Error('範本缺少工作表：' + SHEET_CONFIG.adjunct.label);
    var publicSubTemplate = workbook.worksheets[SHEET_CONFIG.publicSub.index];
    if (!publicSubTemplate) throw new Error('範本缺少工作表：' + SHEET_CONFIG.publicSub.label);
    var baseSheetRefs = [];
    var planSheets = [];
    (data.overtimePlans || []).forEach(function (group, index) {
      planSheets.push({
        group: group,
        sheet: index === 0
          ? overtimeTemplate
          : cloneWorksheet(overtimeTemplate, workbook, '__overtime_plan_' + index, overtimeConfig.columns)
      });
    });
    var teachingSupportSheets = (data.teachingSupportPlans || []).map(function (group, index) {
      return {
        group: group,
        sheet: cloneWorksheet(adjunctTemplate, workbook, '__teaching_support_' + index, teachingSupportConfig.columns)
      };
    });
    var substituteAttributeSheets = (data.substituteAttributePlans || []).map(function (group, index) {
      return {
        group: group,
        sheet: cloneWorksheet(overtimeTemplate, workbook, '__substitute_attribute_' + index, substituteAttributeConfig.columns)
      };
    });
    [SHEET_CONFIG.adjunct, SHEET_CONFIG.publicSub, SHEET_CONFIG.publicSubAdjustment, SHEET_CONFIG.selfSub, SHEET_CONFIG.mentor].forEach(function (config) {
      var sheet = workbook.worksheets[config.index];
      if (!sheet) throw new Error('範本缺少工作表：' + config.label);
      baseSheetRefs.push(sheet);
      var periodKey = config.key === 'publicSubAdjustment' ? 'publicSub' : config.key;
      var period = getPeriod(data.periods, periodKey, opts.reportMonth);
      var plan = null;
      var titleCell = firstTitleCell(sheet, config.columns);
      titleCell.value = titleForSheet(sheet, config, opts.reportMonth, period, plan);
      var name = sheetName(config, opts.reportMonth, period, plan);
      var base = name;
      var suffix = 2;
      while (usedNames[name]) {
        name = (base.slice(0, 28) + '_' + suffix).slice(0, 31);
        suffix += 1;
      }
      usedNames[name] = true;
      sheet.name = name;
      if (config.kind === 'summary') writeSummarySheet(sheet, config, data.sheets[config.key]);
      if (config.kind === 'public') writePublicSheet(sheet, config, data.sheets[config.key]);
      if (config.kind === 'line') writeLineSheet(sheet, config, data.sheets[config.key]);
    });
    planSheets.forEach(function (entry) {
      var group = entry.group;
      var sheet = entry.sheet;
      var period = getPeriod(data.periods, 'overtime', opts.reportMonth);
      var titleCell = firstTitleCell(sheet, overtimeConfig.columns);
      titleCell.value = titleForSheet(sheet, overtimeConfig, opts.reportMonth, period, group.fullPlan || group.plan);
      var name = sheetName(overtimeConfig, opts.reportMonth, period, group.plan);
      var base = name;
      var suffix = 2;
      while (usedNames[name]) {
        name = (base.slice(0, 28) + '_' + suffix).slice(0, 31);
        suffix += 1;
      }
      usedNames[name] = true;
      sheet.name = name;
      writeSummarySheet(sheet, overtimeConfig, group.rows);
    });
    teachingSupportSheets.forEach(function (entry) {
      var group = entry.group;
      var sheet = entry.sheet;
      var period = getPeriod(data.periods, 'adjunct', opts.reportMonth);
      var titleCell = firstTitleCell(sheet, teachingSupportConfig.columns);
      titleCell.value = titleForSheet(sheet, teachingSupportConfig, opts.reportMonth, period, group.fullPlan || group.plan);
      var name = sheetName(teachingSupportConfig, opts.reportMonth, period, group.plan);
      var base = name;
      var suffix = 2;
      while (usedNames[name]) {
        name = (base.slice(0, 28) + '_' + suffix).slice(0, 31);
        suffix += 1;
      }
      usedNames[name] = true;
      sheet.name = name;
      writeSummarySheet(sheet, teachingSupportConfig, group.rows);
    });
    substituteAttributeSheets.forEach(function (entry) {
      var group = entry.group;
      var sheet = entry.sheet;
      var period = getPeriod(data.periods, 'publicSub', opts.reportMonth);
      var titleCell = firstTitleCell(sheet, substituteAttributeConfig.columns);
      titleCell.value = titleForSheet(sheet, substituteAttributeConfig, opts.reportMonth, period, group.plan);
      var name = sheetName(substituteAttributeConfig, opts.reportMonth, period, group.plan);
      var base = name;
      var suffix = 2;
      while (usedNames[name]) {
        name = (base.slice(0, 28) + '_' + suffix).slice(0, 31);
        suffix += 1;
      }
      usedNames[name] = true;
      sheet.name = name;
      applySummaryHeaderLabels(sheet, substituteAttributeConfig);
      writeSummarySheet(sheet, substituteAttributeConfig, group.rows);
    });
    if (!planSheets.length && typeof workbook.removeWorksheet === 'function') {
      workbook.removeWorksheet(overtimeTemplate.id);
    }
    var baseSheets = baseSheetRefs.filter(function (sheet) {
      return planSheets.every(function (entry) { return entry.sheet !== sheet; })
        && substituteAttributeSheets.every(function (entry) { return entry.sheet !== sheet; });
    });
    if (planSheets.length || teachingSupportSheets.length || substituteAttributeSheets.length || baseSheets.length) {
      var orderedSheets = planSheets.map(function (entry) { return entry.sheet; })
        .concat(substituteAttributeSheets.map(function (entry) { return entry.sheet; }))
        .concat(teachingSupportSheets.map(function (entry) { return entry.sheet; }))
        .concat(baseSheets);
      orderedSheets.forEach(function (sheet, index) {
        sheet.orderNo = index;
      });
    }
  }
  async function loadTemplateBuffer() {
    if (!templateBufferPromise) {
      templateBufferPromise = root.fetch(TEMPLATE_URL + '?t=' + Date.now(), { cache: 'no-cache' })
        .then(function (response) {
          if (!response.ok) throw new Error('無法載入會計範本（HTTP ' + response.status + '）');
          return response.arrayBuffer();
        })
        .catch(function (error) {
          // 失敗時允許下一次匯出重新嘗試。
          templateBufferPromise = null;
          throw error;
        });
    }
    var buffer = await templateBufferPromise;
    return buffer && buffer.slice ? buffer.slice(0) : buffer;
  }

  async function exportWorkbook(opts) {
    opts = opts || {};
    // 確認視窗前已建立過預覽時直接重用，避免確認後再次掃描全校資料。
    var data = opts.preparedData || buildExportData(opts);
    if (data.blocking && data.blocking.length) {
      throw new Error('會計匯出被阻擋：\n' + data.blocking.join('\n'));
    }
    var ExcelJSLib = opts.ExcelJS || root.ExcelJS || (typeof ExcelJS !== 'undefined' ? ExcelJS : null);
    if (!ExcelJSLib) throw new Error('ExcelJS 未載入');
    var buffer = opts.templateBuffer || await loadTemplateBuffer();
    var workbook = new ExcelJSLib.Workbook();
    try {
      await workbook.xlsx.load(buffer.slice ? buffer.slice(0) : buffer);
    } catch (e) {
      throw new Error('會計範本讀取失敗，請重新整理後再試：' + (e && e.message ? e.message : e));
    }
    if (!workbook || !Array.isArray(workbook.worksheets) || workbook.worksheets.length < 6) {
      throw new Error('會計範本缺少六個工作表，請確認 templates/accounting-template.xlsx。');
    }
    if (!data || !data.sheets) {
      throw new Error('會計匯出資料建立失敗，請重新整理資料後再試。');
    }
    populateWorkbook(workbook, opts, data);
    if (workbook.calcProperties) {
      workbook.calcProperties.fullCalcOnLoad = true;
      workbook.calcProperties.forceFullCalc = true;
      workbook.calcProperties.calcMode = 'auto';
    }
    var outputBuffer = await workbook.xlsx.writeBuffer();
    var fileRange = dateRangeFileLabel(getPeriod(data.periods, 'overtime', opts.reportMonth), opts.reportMonth);
    return {
      buffer: outputBuffer,
      fileName: (fileRange + '會計核銷明細.xlsx'),
      summary: data.summary,
      warnings: data.warnings,
      blocking: data.blocking,
      periods: data.periods
    };
  }

  root.ExportAccounting = {
    TEMPLATE_URL: TEMPLATE_URL,
    PERIOD_OPTIONS: PERIOD_OPTIONS,
    defaultPeriodSettings: defaultPeriodSettings,
    loadPeriodSettings: loadPeriodSettings,
    savePeriodSettings: savePeriodSettings,
    dateRangeFileLabel: dateRangeFileLabel,
    reportMonthForPeriod: reportMonthForPeriod,
    monthLabelForPeriod: monthLabelForPeriod,
    titleFromTemplate: titleFromTemplate,
    titleFor: titleFor,
    appendMergedPlanNotes: appendMergedPlanNotes,
    buildExportData: buildExportData,
    exportWorkbook: exportWorkbook
  };
})(window);
