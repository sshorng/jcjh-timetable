/**
 * 段考監考表匯出
 *
 * 流程：模板 load → 填文字成底稿 → writeBuffer 凍結
 * 每人：load(底稿) → 分發／額度 → 重套字型 → 併入 xlsx
 *
 * 鐵則：
 * - 只改 value；R3–R8 不寫
 * - 絕不改 border／格線／中線／欄寬／合併（模板格線原樣）
 * - 字型用完整 style 寫回（拆 ExcelJS 共用 styleId），否則改一格 font 會整欄灰底變粗體底線
 * - 粗體底線：僅代課、調課、加課（空堂排班）
 * - 一般班、基礎巡堂：有字、不粗、不底
 * - writeBuffer→load 後只重套字型（不碰格線）
 */
window.ExportInvigilation = (function () {
  var TEMPLATE_URL = 'templates/invigilation-template.xlsx';
  var DAY_ZH = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  var TEACHER_ROW_START = 9;
  var TEACHER_SLOTS_FALLBACK = 38;
  var EXAM_SLOTS_PER_SIDE = 11; // 第一天 7 節＋第二天 4 節
  var SPECIAL_EDUCATION_LABEL = '特教監考';
  var BLANK_CELL_MARK = '\u200B';
  var NOTE5_RE = /【[^】]*未執行的[^】]*共\s*[_\d]*\s*節，本次段考已安排\s*[_\d]*\s*節，尚有\s*[_\d]*\s*節，未執行節數將會累計於本學年度】/;
  var _templateBuf = null;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseDate(dateStr) {
    var s = String(dateStr || '').trim().slice(0, 10);
    if (!s) return null;
    var d = new Date(s.indexOf('T') >= 0 ? s : s + 'T00:00:00');
    if (Number.isNaN(d.getTime())) d = new Date(s.replace(/-/g, '/'));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function normalizeScheduleDate(value) {
    if (value === undefined || value === null || value === '') return '';
    if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
      return value.getFullYear() + '-' + pad2(value.getMonth() + 1) + '-' + pad2(value.getDate());
    }
    var raw = String(value).trim().split(/[T ]/)[0].replace(/\//g, '-');
    var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    var year = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var day = parseInt(match[3], 10);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function scheduleDateField(schedule, names) {
    var source = schedule || {};
    for (var i = 0; i < names.length; i++) {
      if (source[names[i]] !== undefined && source[names[i]] !== null && source[names[i]] !== '') {
        return source[names[i]];
      }
    }
    return '';
  }

  function isScheduleActiveOnDate(schedule, dateStr) {
    if (!dateStr) return true;
    if (window.DomainSchedule && typeof window.DomainSchedule.isActiveOnDate === 'function') {
      try { return window.DomainSchedule.isActiveOnDate(schedule, dateStr); } catch (e) { /* use fallback */ }
    }
    var date = normalizeScheduleDate(dateStr);
    if (!date) return false;
    var rawFrom = scheduleDateField(schedule, [
      '啟用起日', '啟用開始日', 'activeFrom', 'activationStartDate', 'effectiveStartDate'
    ]);
    var rawTo = scheduleDateField(schedule, [
      '啟用迄日', '啟用結束日', 'activeTo', 'activationEndDate', 'effectiveEndDate'
    ]);
    var from = normalizeScheduleDate(rawFrom);
    var to = normalizeScheduleDate(rawTo);
    if (rawFrom && !from) return false;
    if (rawTo && !to) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return !from || !to || from <= to;
  }

  function formatDayHeader(dateStr) {
    var d = parseDate(dateStr);
    if (!d) return String(dateStr || '');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + (DAY_ZH[d.getDay()] || '') + ')';
  }

  function dayOfWeekMon1(dateStr) {
    var d = parseDate(dateStr);
    if (!d) return 0;
    var wd = d.getDay();
    return wd === 0 ? 7 : wd;
  }

  function listWorkdays(startStr, endStr) {
    var start = parseDate(startStr);
    var end = parseDate(endStr);
    if (!start || !end) return { dates: [], error: '請選擇考試起迄日期' };
    if (end < start) return { dates: [], error: '迄日不可早於起日' };
    var dates = [];
    var cur = new Date(start.getTime());
    var guard = 0;
    while (cur <= end && guard < 14) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        dates.push(
          cur.getFullYear() + '-' + pad2(cur.getMonth() + 1) + '-' + pad2(cur.getDate())
        );
      }
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    if (!dates.length) return { dates: [], error: '期間內無平日' };
    if (dates.length > 2) {
      return { dates: dates.slice(0, 2), warning: '模板為雙日版面，已取前 2 個平日' };
    }
    return { dates: dates };
  }

  function buildPeriodSpec(dates) {
    var d0 = dates[0];
    var d1 = dates[1] || dates[0];
    var spec = [];
    var p;
    for (p = 1; p <= 7; p++) spec.push({ date: d0, period: p });
    for (p = 1; p <= 4; p++) spec.push({ date: d1, period: p });
    return spec;
  }

  function isEmptySlotAssignCell(cell) {
    if (!cell) return false;
    if (cell.isEmptySlotAssign === true) return true;
    var rec = cell.subRecord || null;
    if (rec && rec.isEmptySlotAssign === true) return true;
    var reason = String((rec && rec.reason) || '').trim();
    if (reason === '空堂排班') return true;
    var note = String((rec && rec.note) || '');
    return note.indexOf('[空堂排班]') >= 0;
  }

  function normText(v) {
    return String(v == null ? '' : v).replace(/[\u3000\s]+/g, '').trim();
  }

  function isPatrolWord(v) {
    var s = normText(v);
    return s === '巡堂' || s.indexOf('巡堂') === 0;
  }

  /**
   * 基礎巡堂（從寬）：isPatrol／attr／班／科 含「巡堂」
   */
  function isBasePatrol(cell) {
    if (!cell) return false;
    if (cell.isPatrol === true) return true;
    if (window.DomainSchedule && window.DomainSchedule.isPatrolCell) {
      try {
        if (window.DomainSchedule.isPatrolCell(cell)) return true;
      } catch (eP) { /* ignore */ }
    }
    if (window.DomainSchedule && window.DomainSchedule.isPatrolAttr
        && window.DomainSchedule.isPatrolAttr(cell.attr)) return true;
    if (isPatrolWord(cell.attr)) return true;
    if (isPatrolWord(cell.className)) return true;
    if (isPatrolWord(cell.subject)) return true;
    return false;
  }

  /**
   * 異動＝isEmptySlotAssign／isSubstitutionDuty → changed=true
   * 基礎巡堂 → 固定寫「巡堂」、changed=false
   */
  function cellTextFromSchedule(cell) {
    if (!cell) return { text: '', changed: false };
    if (cell.isSubstituted) return { text: '', changed: false };

    var emptyAssign = isEmptySlotAssignCell(cell);
    var cn = String(cell.className || '').trim();
    var subj = String(cell.subject || '').trim();
    var attr = String(cell.attr || '').trim();
    var patrol = isBasePatrol(cell);

    if (/特殊考場/.test(cn + subj + attr)) return { text: '', changed: false };
    if (/^請假$|^公假$/.test(subj) || /^請假$|^公假$/.test(cn)) {
      return { text: '', changed: false };
    }

    if (emptyAssign) {
      return { text: (subj || cn || '巡堂'), changed: true };
    }
    if (cell.isSubstitutionDuty) {
      var dutyText = '';
      if (cn && !isPatrolWord(cn)) dutyText = cn;
      else if (subj && !isPatrolWord(subj)) dutyText = subj;
      else if (patrol) dutyText = '巡堂';
      else dutyText = cn || subj || '';
      if (!dutyText) return { text: '', changed: false };
      return { text: dutyText, changed: true };
    }

    // 基礎巡堂：一定要有字
    if (patrol || isPatrolWord(cn) || isPatrolWord(subj) || isPatrolWord(attr)) {
      return { text: '巡堂', changed: false };
    }
    if (cn) return { text: cn, changed: false };
    if (subj) return { text: subj, changed: false };
    return { text: '', changed: false };
  }

  /** 純物件字型（每次 new，避免 styles 池共用） */
  function plainFont(bold, withUnderline) {
    return {
      name: '標楷體',
      size: 15,
      bold: !!bold,
      italic: false,
      underline: withUnderline ? 'single' : false
    };
  }

  function clonePlain(obj) {
    if (!obj) return null;
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) {
      try { return Object.assign({}, obj); } catch (e2) { return null; }
    }
  }

  function setCellFontPreservingStyle(cell, fontSpec) {
    if (!cell) return;
    var style = clonePlain(cell.style) || {};
    style.font = clonePlain(fontSpec) || fontSpec;
    cell.style = style;
  }

  function setCellFontSizePreservingStyle(cell, size) {
    if (!cell) return;
    var font = clonePlain(cell.font)
      || clonePlain(cell.style && cell.style.font)
      || {};
    font.size = size;
    setCellFontPreservingStyle(cell, font);
  }

  /**
   * 動態字型：
   * Pass1：左右 11 節全部格 → 一般字型（拆共用 style）
   * Pass2：matrix.changed → 粗體底線
   */
  function applyChangeFonts(ws, matrix, layout) {
    if (!ws || !layout) return 0;
    var slots = layout.slots;
    var rowStart = layout.teacherRowStart;
    var rowEnd = layout.teacherRowEnd;
    var dataStarts = [2, 14];
    var di, idx, s, row, cell;
    var marked = 0;

    // Pass 1：只替換字型，保留模板原有邊框、底色、對齊與數字格式。
    for (di = 0; di < dataStarts.length; di++) {
      for (idx = 0; idx < slots; idx++) {
        row = rowStart + idx;
        if (row > rowEnd) break;
        for (s = 0; s < 11; s++) {
          var colN = dataStarts[di] + s;
          cell = ws.getCell(row, colN);
           setCellFontPreservingStyle(cell, plainFont(false, false));
        }
      }
    }

    if (matrix) {
      function markSide(list, dataColStart) {
        if (!list) return;
        for (idx = 0; idx < slots; idx++) {
          row = rowStart + idx;
          if (row > rowEnd) break;
          var t = list[idx];
          if (!t || !t.slots) continue;
          for (s = 0; s < 11; s++) {
            var slot = t.slots[s];
            if (!slot || typeof slot !== 'object' || !slot.changed) continue;
            var txt = String(slot.text || '').trim();
            if (!txt) continue;
            var colM = dataColStart + s;
            cell = ws.getCell(row, colM);
            if (cell.value == null || String(cell.value).trim() === '') {
              cell.value = txt;
            }
            setCellFontPreservingStyle(cell, plainFont(true, true));
            marked += 1;
          }
        }
      }
      markSide(matrix.left, 2);
      markSide(matrix.right, 14);
    }

    return marked;
  }

  function detectLayout(ws) {
    var tipRow = null;
    var noteRow = null;
    var r;
    for (r = 40; r <= 60; r++) {
      var v = ws.getCell(r, 1).value;
      if (v == null) continue;
      var s = String(v);
      if (!tipRow && s.indexOf('提醒') >= 0) tipRow = r;
      if (!noteRow && s.indexOf('備註') === 0) noteRow = r;
    }
    if (!tipRow) tipRow = 47;
    if (!noteRow) noteRow = tipRow + 1;
    var teacherRowEnd = tipRow - 1;
    if (teacherRowEnd < TEACHER_ROW_START) {
      teacherRowEnd = TEACHER_ROW_START + TEACHER_SLOTS_FALLBACK - 1;
    }
    var slots = teacherRowEnd - TEACHER_ROW_START + 1;
    if (slots < 1 || slots > 60) slots = TEACHER_SLOTS_FALLBACK;
    return {
      teacherRowStart: TEACHER_ROW_START,
      teacherRowEnd: teacherRowEnd,
      slots: slots,
      tipRow: tipRow,
      noteRow: noteRow
    };
  }

  function countEmptySlotQuotaUsed(requests, email, startDate, endDate, teacher) {
    var teacherKeys = [email, teacher && teacher.email, teacher && teacher.loginEmail,
      teacher && teacher.name, teacher && teacher.teacherName]
      .map(function (value) { return String(value || '').trim().toLowerCase(); })
      .filter(Boolean);
    var a = String(startDate || '').slice(0, 10);
    var b = String(endDate || '').slice(0, 10);
    var n = 0;
    (requests || []).forEach(function (r) {
      if (!r || String(r.status || '').toLowerCase() !== 'approved') return;
      var fee = String(r.subFee || '');
      if (fee !== '扣額度' && fee !== '互代不結') return;
      var targetKeys = [r.targetTeacherEmail, r.actualTeacherEmail, r.targetTeacherName,
        r['受邀人Email'], r['受邀人姓名']]
        .map(function (value) { return String(value || '').trim().toLowerCase(); })
        .filter(Boolean);
      if (!targetKeys.some(function (key) { return teacherKeys.indexOf(key) >= 0; })) return;
      var reason = String(r.reason || r['請假事由'] || '').trim();
      var note = String(r.note || r['備註'] || '');
      if (!(reason === '空堂排班' || note.indexOf('[空堂排班]') >= 0 || r.isEmptySlotAssign)) return;
      var d = String(r.requestDate || r.date || r['異動日期'] || '').slice(0, 10);
      if (a && d < a) return;
      if (b && d > b) return;
      n += 1;
    });
    return n;
  }

  function buildExamQuotaStats(opts) {
    opts = opts || {};
    var fallbackRemain = parseFloat(opts.teacher && opts.teacher.mutualQuota);
    if (Number.isNaN(fallbackRemain)) fallbackRemain = 0;
    var fallbackUsed = countEmptySlotQuotaUsed(
      opts.requests, opts.email || (opts.teacher && opts.teacher.email), opts.startDate, opts.endDate, opts.teacher
    );
    var fallback = {
      before: Math.max(0, fallbackRemain + fallbackUsed),
      used: fallbackUsed,
      remaining: Math.max(0, fallbackRemain),
      hasHistory: false,
      hasExamSpend: false
    };
    if (!Array.isArray(opts.ledgerRows)
        || !window.DomainActivityCover
        || typeof window.DomainActivityCover.buildLedgerExamStats !== 'function') {
      return fallback;
    }
    var stats = window.DomainActivityCover.buildLedgerExamStats({
      ledgerRows: opts.ledgerRows,
      teacher: opts.teacher,
      requests: opts.requests,
      rangeDates: opts.rangeDates,
      startDate: opts.startDate,
      endDate: opts.endDate
    });
    // 完整帳本中沒有該師列，代表沒有實際扣款；不可再把巡堂申請回退算成額度使用。
    // 未標記為完整歷程時，保留舊資料的申請單回退計算。
    return stats && (stats.hasHistory || opts.ledgerHistoryComplete === true) ? stats : fallback;
  }

  function getExcelJS() {
    return window.ExcelJS || (typeof ExcelJS !== 'undefined' ? ExcelJS : null);
  }

  async function loadTemplateBuffer() {
    if (_templateBuf) return _templateBuf;
    var res = await fetch(TEMPLATE_URL + '?t=' + Date.now(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('無法載入監考表模板');
    _templateBuf = await res.arrayBuffer();
    return _templateBuf;
  }

  function setVal(cell, val) {
    if (!cell) return;
    try {
      var m = String(cell.address || '').match(/([A-Z]+)(\d+)/i);
      if (m) {
        var rn = parseInt(m[2], 10);
        // R3–R8 含考科列 B4–X6：匯出不覆寫（由主表手填、分發表公式連動）
        if (rn >= 3 && rn <= 8) return;
      }
    } catch (e) { /* ignore */ }
    cell.value = (val === '' || val === undefined) ? null : val;
  }

  var MASTER_SHEET_NAME = '監考表';

  /**
   * 分發表：A1:X47 公式連動主表「監考表」
   * 合併區只在左上角主儲存格寫公式；只改 value，不碰樣式
   */
  function linkMasterRange(ws, masterName) {
    if (!ws) return 0;
    var src = String(masterName || MASTER_SHEET_NAME).replace(/'/g, "''");
    var linked = 0;

    function isMergedFollower(cell) {
      if (!cell || !cell.isMerged || !cell.master) return false;
      return cell.master.address && cell.master.address !== cell.address;
    }

    var r;
    var c;
    for (r = 1; r <= 47; r++) {
      for (c = 1; c <= 24; c++) {
        var cell = ws.getCell(r, c);
        if (!cell || isMergedFollower(cell)) continue;
        var addr = cell.address || (columnName(c) + r);
        var ref = "'" + src + "'!" + addr;
        // 空白來源保持空白，避免 Excel 將跨表空白引用顯示成 0。
        cell.value = { formula: 'IF(' + ref + '="","",' + ref + ')' };
        linked += 1;
      }
    }
    return linked;
  }

  function columnName(n) {
    var out = '';
    var value = n;
    while (value > 0) {
      var rem = (value - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      value = Math.floor((value - 1) / 26);
    }
    return out;
  }

  function isSpecialEducationTeacher(teacher) {
    if (!teacher) return false;
    var jobTitle = String(
      teacher.jobTitle || teacher.job || teacher['職務'] || teacher['職稱'] || ''
    ).trim();
    var subject = String(
      teacher.subject || teacher['授課科目'] || teacher['任課科目'] || ''
    ).trim();
    return /特教/.test(jobTitle) || /特教/.test(subject);
  }

  function mergeWithoutStyle(ws, range) {
    if (!ws || !range) return;
    try {
      if (typeof ws.mergeCellsWithoutStyle === 'function') {
        ws.mergeCellsWithoutStyle(range);
      } else {
        ws.mergeCells(range);
      }
    } catch (eMerge) { /* already merged or unsupported */ }
  }

  function applySpecialEducationRows(ws, matrix, layout) {
    if (!ws || !matrix || !layout) return 0;
    var merged = 0;

    function mergeSide(list, dataColStart) {
      (list || []).forEach(function (teacher, index) {
        if (!teacher || !teacher.specialEducation) return;
        var row = layout.teacherRowStart + index;
        if (row > layout.teacherRowEnd) return;
        var start = columnName(dataColStart) + row;
        var end = columnName(dataColStart + EXAM_SLOTS_PER_SIDE - 1) + row;
        var anchor = ws.getCell(row, dataColStart);
        if (anchor) anchor.value = SPECIAL_EDUCATION_LABEL;
        mergeWithoutStyle(ws, start + ':' + end);
        merged += 1;
      });
    }

    mergeSide(matrix.left, 2);
    mergeSide(matrix.right, 14);
    return merged;
  }

  /**
   * 部分試算表檢視器不繪製完全空白儲存格的模板格線。
   * 只在教師資料區放入不可見字元，絕不建立或修改 border。
   */
  function ensureBlankGridCells(ws, layout) {
    if (!ws || !layout) return 0;
    var rowStart = layout.teacherRowStart;
    var rowEnd = layout.teacherRowEnd;
    var marked = 0;
    var r;
    var c;
    for (r = rowStart; r <= rowEnd; r++) {
      for (c = 1; c <= 24; c++) {
        var cell = ws.getCell(r, c);
        if (!cell) continue;
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
        if (cell.value == null || cell.value === '') {
          cell.value = BLANK_CELL_MARK;
          marked += 1;
        }
      }
    }
    return marked;
  }

  function teacherIdentityKeys(teacher) {
    return [
      teacher && teacher.email,
      teacher && teacher.loginEmail,
      teacher && teacher.teacherEmail,
      teacher && teacher.name,
      teacher && teacher.teacherName
    ].map(function (value) {
      return String(value || '').trim().toLowerCase();
    }).filter(Boolean);
  }

  function teachersMatch(a, b) {
    var left = teacherIdentityKeys(a);
    var right = teacherIdentityKeys(b);
    return left.some(function (value) { return right.indexOf(value) >= 0; });
  }

  /** 個人分發頁：只標示收件教師所在的半邊整列，黑白列印仍可辨識。 */
  function highlightRecipientRow(ws, matrix, layout, recipient) {
    if (!ws || !matrix || !layout || !recipient) return false;
    var sides = [
      { list: matrix.left || [], nameCol: 1, dataColStart: 2 },
      { list: matrix.right || [], nameCol: 13, dataColStart: 14 }
    ];
    var placement = null;
    var sideIndex;
    var teacherIndex;
    for (sideIndex = 0; sideIndex < sides.length && !placement; sideIndex++) {
      var side = sides[sideIndex];
      for (teacherIndex = 0; teacherIndex < side.list.length; teacherIndex++) {
        if (teachersMatch(recipient, side.list[teacherIndex])) {
          placement = {
            nameCol: side.nameCol,
            dataColStart: side.dataColStart,
            index: teacherIndex
          };
          break;
        }
      }
    }
    if (!placement) return false;

    var row = layout.teacherRowStart + placement.index;
    if (row > layout.teacherRowEnd) return false;
    var endCol = placement.dataColStart + EXAM_SLOTS_PER_SIDE - 1;
    var blackEdge = function () {
      return { style: 'thick', color: { argb: 'FF000000' } };
    };
    var col;
    for (col = placement.nameCol; col <= endCol; col++) {
      var cell = ws.getCell(row, col);
      if (!cell) continue;
      var style = clonePlain(cell.style) || {};
      var border = clonePlain(style.border) || {};
      border.top = blackEdge();
      border.bottom = blackEdge();
      if (col === placement.nameCol) border.left = blackEdge();
      if (col === endCol) border.right = blackEdge();
      style.border = border;

      if (col === placement.nameCol) {
        style.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6E6E6' },
          bgColor: { argb: 'FFE6E6E6' }
        };
        var font = clonePlain(style.font) || clonePlain(cell.font) || {};
        font.bold = true;
        font.size = 16;
        style.font = font;
      }
      cell.style = style;
    }
    return true;
  }

  function buildTeacherMatrix(teachers, periodSpec, getCell, slotsPerSide, onProgress, allSchedules) {
    var cap = slotsPerSide || TEACHER_SLOTS_FALLBACK;
    var cache = Object.create(null);
    var baseList = allSchedules || [];

    // 基礎課表索引：email|dow|period → 巡堂課表列；查詢時再依日期判斷有效性。
    var basePatrolMap = Object.create(null);
    baseList.forEach(function (s) {
      if (!s) return;
      var teacherEmail = s.teacherEmail || s['教師Email'] || s.teacherName || s['教師姓名'];
      if (!teacherEmail) return;
      var a = String(s.attr || '').trim();
      var cn = String(s.className || '').trim();
      var sub = String(s.subject || '').trim();
      var isP = a === '巡堂' || a.indexOf('巡堂') >= 0 || cn === '巡堂' || sub === '巡堂'
        || a.indexOf('巡') === 0 || cn.indexOf('巡') === 0 || sub.indexOf('巡') === 0;
      if (!isP) return;
      var key = String(teacherEmail).toLowerCase()
        + '|' + parseInt(s.dayOfWeek != null ? s.dayOfWeek : s['星期'], 10)
        + '|' + parseInt(s.period != null ? s.period : s['節次'], 10);
      if (!basePatrolMap[key]) basePatrolMap[key] = [];
      basePatrolMap[key].push(s);
    });

    function hasBasePatrolAt(em, dateStr, period, day) {
      var key = String(em || '').toLowerCase() + '|' + parseInt(day, 10) + '|' + parseInt(period, 10);
      return (basePatrolMap[key] || []).some(function (schedule) {
        return isScheduleActiveOnDate(schedule, dateStr);
      });
    }

    function getCached(em, d, p, day) {
      if (!getCell) return null;
      var k = String(em || '').toLowerCase() + '|' + d + '|' + p;
      if (Object.prototype.hasOwnProperty.call(cache, k)) return cache[k];
      var cell = getCell(em, d, p, day);
      // A stale getter result must not bring a terminated course into the selected exam range.
      if (cell && !isScheduleActiveOnDate(cell, d)) cell = null;
      // 備援：getCell 漏掉巡堂時，用基礎課表補
      if (!cell || (!cell.isPatrol && !isPatrolWord(cell.attr)
          && !isPatrolWord(cell.className) && !isPatrolWord(cell.subject)
          && !cell.isSubstitutionDuty && !isEmptySlotAssignCell(cell))) {
        if (hasBasePatrolAt(em, d, p, day) && (!cell || !cell.isSubstituted)) {
          cell = Object.assign({}, cell || {}, {
            isPatrol: true,
            attr: '巡堂',
            className: (cell && cell.className) || '巡堂',
            subject: '巡堂'
          });
        }
      }
      cache[k] = cell;
      return cache[k];
    }

    var patrolCount = 0;
    var changedCount = 0;

    function mapOne(t, idx, tot) {
      if (onProgress && (idx === 0 || (idx + 1) % 10 === 0 || idx === tot - 1)) {
        try { onProgress(idx + 1, tot); } catch (e) { /* ignore */ }
      }
      var slots = [];
      var s;
      if (isSpecialEducationTeacher(t)) {
        slots.push({ text: SPECIAL_EDUCATION_LABEL, changed: false });
        for (s = 1; s < EXAM_SLOTS_PER_SIDE; s++) {
          slots.push({ text: '', changed: false });
        }
        return {
          name: t.name || t.email || '',
          email: t.email,
          specialEducation: true,
          slots: slots
        };
      }

      for (s = 0; s < EXAM_SLOTS_PER_SIDE; s++) {
        var sp = periodSpec[s];
        var day = dayOfWeekMon1(sp.date);
        var raw = getCached(t.email, sp.date, sp.period, day);
        var slot = cellTextFromSchedule(raw);
        // 雙重保險：基礎巡堂一定寫「巡堂」
        if (!slot || (!slot.changed && (!slot.text || !String(slot.text).trim()))) {
          if (hasBasePatrolAt(t.email, sp.date, sp.period, day)
              || (raw && (raw.isPatrol || isPatrolWord(raw.attr)
                || isPatrolWord(raw.className) || isPatrolWord(raw.subject)))) {
            slot = { text: '巡堂', changed: false };
          }
        }
        if (!slot) slot = { text: '', changed: false };
        if (slot.text === '巡堂' && !slot.changed) patrolCount += 1;
        if (slot.changed) changedCount += 1;
        slots.push(slot);
      }
      return { name: t.name || t.email || '', email: t.email, slots: slots };
    }

    var all = (teachers || []).slice();
    var mapped = all.map(function (t, i) { return mapOne(t, i, all.length); });
    var canDetermineCourse = typeof getCell === 'function' || baseList.length > 0;
    var included = canDetermineCourse
      ? mapped.filter(function (teacher) {
        if (teacher.specialEducation) return true;
        return (teacher.slots || []).some(function (slot) {
          return slot && String(slot.text || '').trim() !== '';
        });
      })
      : mapped;
    var half = Math.min(Math.ceil(included.length / 2), cap);
    var shown = included.slice(0, cap * 2);
    return {
      left: shown.slice(0, half),
      right: shown.slice(half),
      includedTeachers: included,
      truncated: included.length > cap * 2,
      total: included.length,
      shown: shown.length,
      patrolCount: patrolCount,
      changedCount: changedCount
    };
  }

  function splitCoverageClassNames(raw) {
    if (window.DateUtils && typeof window.DateUtils.parseCombinedClasses === 'function') {
      return window.DateUtils.parseCombinedClasses(raw);
    }
    if (Array.isArray(raw)) {
      return raw.map(function (value) { return String(value || '').trim(); }).filter(Boolean);
    }
    return String(raw == null ? '' : raw)
      .split(/[、,，/／|｜\s]+/)
      .map(function (value) { return value.trim(); })
      .filter(Boolean);
  }

  function isPhysicalClassName(value) {
    var name = String(value || '').trim();
    if (!name) return false;
    // 英資、數資、特教等是課務上的虛擬分組，不是段考監考的實體班級。
    if (/英資|英語資優|數資|數理資優|資優|特教|抽離/.test(name)) return false;
    return !/^(巡堂|巡[一二三四五六七八九0-9]+|特殊考場|請假|公假|空堂任務|專題探究|專題|走讀|閱讀|閱讀素養|彈性|彈性課程|校訂|校訂課程|班會|週會|班週會|社團|社團活動|自主學習|自習|早自習|午休|導師時間)$/.test(name);
  }

  function collectCoverageClassNames(values, baseSchedules, periodSpec) {
    var result = [];
    var seen = Object.create(null);

    function add(raw) {
      splitCoverageClassNames(raw).forEach(function (value) {
        var name = String(value || '').trim();
        if (!isPhysicalClassName(name) || seen[name]) return;
        seen[name] = true;
        result.push(name);
      });
    }

    (values || []).forEach(add);
    if (result.length) return result;

    // When no class directory is available, derive the expected physical classes
    // from courses that are active on at least one selected exam slot.
    (baseSchedules || []).forEach(function (schedule) {
      if (!schedule || isBasePatrol(schedule)) return;
      var day = parseInt(schedule.dayOfWeek != null ? schedule.dayOfWeek : schedule['星期'], 10);
      var period = parseInt(schedule.period != null ? schedule.period : schedule['節次'], 10);
      var selected = (periodSpec || []).some(function (spec) {
        return day === dayOfWeekMon1(spec.date)
          && period === parseInt(spec.period, 10)
          && isScheduleActiveOnDate(schedule, spec.date);
      });
      if (selected) add(schedule.className != null ? schedule.className : schedule['班級']);
    });
    return result;
  }

  /** 每一個考試日／節次，每個實體班級必須恰好出現一次。 */
  function validateClassCoverage(matrix, periodSpec, classNames, baseSchedules) {
    var expected = collectCoverageClassNames(classNames, baseSchedules, periodSpec);
    if (!expected.length) {
      return { ok: true, skipped: true, expected: [], missing: [], duplicates: [] };
    }
    var expectedSet = Object.create(null);
    expected.forEach(function (name) { expectedSet[name] = true; });
    var missing = [];
    var duplicates = [];
    var sides = [matrix && matrix.left || [], matrix && matrix.right || []];
    var slots = periodSpec || [];

    slots.forEach(function (spec, slotIndex) {
      var counts = Object.create(null);
      var assignedTo = Object.create(null);
      sides.forEach(function (side) {
        (side || []).forEach(function (teacher) {
          var slot = teacher && teacher.slots ? teacher.slots[slotIndex] : null;
          var text = slot && typeof slot === 'object' ? slot.text : slot;
          splitCoverageClassNames(text).forEach(function (name) {
            if (!expectedSet[name]) return;
            counts[name] = (counts[name] || 0) + 1;
            if (!assignedTo[name]) assignedTo[name] = [];
            var teacherName = teacher.name || teacher.email || '';
            if (teacherName && assignedTo[name].indexOf(teacherName) < 0) {
              assignedTo[name].push(teacherName);
            }
          });
        });
      });

      var missingHere = expected.filter(function (name) { return !counts[name]; });
      if (missingHere.length) {
        missing.push({ date: spec.date, period: spec.period, classNames: missingHere });
      }
      var duplicateHere = expected.filter(function (name) { return counts[name] > 1; }).map(function (name) {
        return {
          className: name,
          count: counts[name],
          teachers: assignedTo[name] || []
        };
      });
      if (duplicateHere.length) {
        duplicates.push({ date: spec.date, period: spec.period, classes: duplicateHere });
      }
    });

    return {
      ok: missing.length === 0 && duplicates.length === 0,
      skipped: false,
      expected: expected,
      missing: missing,
      duplicates: duplicates
    };
  }

  function formatCoverageError(coverage) {
    var lines = ['監考表班級檢查未通過，已停止匯出。'];
    var maxItems = 8;
    if (coverage && coverage.missing && coverage.missing.length) {
      lines.push('缺少：' + coverage.missing.slice(0, maxItems).map(function (item) {
        return formatDayHeader(item.date) + '第' + item.period + '節 ' + item.classNames.join('、');
      }).join('；'));
      if (coverage.missing.length > maxItems) lines.push('缺少項目另有 ' + (coverage.missing.length - maxItems) + ' 組');
    }
    if (coverage && coverage.duplicates && coverage.duplicates.length) {
      lines.push('重複：' + coverage.duplicates.slice(0, maxItems).map(function (item) {
        return formatDayHeader(item.date) + '第' + item.period + '節 '
          + item.classes.map(function (entry) {
            return entry.className + '（' + entry.count + ' 人）';
          }).join('、');
      }).join('；'));
      if (coverage.duplicates.length > maxItems) lines.push('重複項目另有 ' + (coverage.duplicates.length - maxItems) + ' 組');
    }
    return lines.join('　');
  }

  function fillMasterValues(ws, opts) {
    var layout = opts.layout;
    var matrix = opts.matrix;
    var dates = opts.dates;
    var title = opts.title;
    var slots = layout.slots;
    var rowStart = layout.teacherRowStart;
    var rowEnd = layout.teacherRowEnd;

    if (title) setVal(ws.getCell(1, 1), title);

    var d0 = formatDayHeader(dates[0] || '');
    var d1 = formatDayHeader(dates[1] || dates[0] || '');
    setVal(ws.getCell(2, 2), d0);
    setVal(ws.getCell(2, 9), d1);
    setVal(ws.getCell(2, 14), d0);
    setVal(ws.getCell(2, 21), d1);

    function fillSide(list, nameCol, dataColStart) {
      var idx;
      for (idx = 0; idx < slots; idx++) {
        var row = rowStart + idx;
        if (row > rowEnd) break;
        var t = list[idx];
        setVal(ws.getCell(row, nameCol), t ? (t.name || null) : null);
        var s;
        for (s = 0; s < 11; s++) {
          var slot = t && t.slots ? t.slots[s] : null;
          var text = '';
          if (slot && typeof slot === 'object') text = slot.text || '';
          else if (typeof slot === 'string') text = slot;
          setVal(ws.getCell(row, dataColStart + s), text || null);
        }
      }
    }
    fillSide(matrix.left || [], 1, 2);
    fillSide(matrix.right || [], 13, 14);

  }

  function personalizeValues(ws, layout, recipientName, before, used, remain) {
    var noteRow = (layout && layout.noteRow) || 48;
    if (recipientName) {
      var label = '教師：' + recipientName;
      var headerLabel = '&L&B&16&U' + label;
      try {
        if (!ws.headerFooter) ws.headerFooter = {};
        ws.headerFooter.oddHeader = headerLabel;
        ws.headerFooter.evenHeader = headerLabel;
      } catch (eH) { /* ignore */ }
      var labelCell = ws.getCell(1, 25);
      setVal(labelCell, label);
      var labelFont = clonePlain(labelCell.font)
        || clonePlain(labelCell.style && labelCell.style.font)
        || {};
      labelFont.size = 16;
      labelFont.bold = true;
      labelFont.underline = 'single';
      setCellFontPreservingStyle(labelCell, labelFont);
    }
    var noteCell = ws.getCell(noteRow, 1);
    var noteText = noteCell.value;
    if (noteText == null) return;
    noteText = String(noteText);
    var bracket = (
      '【未執行的課務共' + before + '節，本次段考已安排' + used
      + '節，尚有' + remain + '節，未執行節數將會累計於本學年度】'
    );
    if (NOTE5_RE.test(noteText)) noteText = noteText.replace(NOTE5_RE, bracket);
    else if (/【[^】]*未執行[^】]*】/.test(noteText)) {
      noteText = noteText.replace(/【[^】]*未執行[^】]*】/, bracket);
    }
    // 模板第 48 列沿用原列高；替換後文字稍長，僅縮小字型，框線與列高不動。
    var noteFont = clonePlain(noteCell.font)
      || clonePlain(noteCell.style && noteCell.style.font)
      || {};
    if (!noteFont.size || noteFont.size >= 18) setCellFontSizePreservingStyle(noteCell, 17);
    setVal(noteCell, noteText);
  }

  /**
   * 套用模板工作表尺寸與列屬性。
   */
  function copySheetDimensions(srcSheet, targetSheet) {
    if (!srcSheet || !targetSheet) return;

    if (srcSheet.columns) {
      srcSheet.columns.forEach(function (col, idx) {
        if (!col || col.width == null) return;
        try { targetSheet.getColumn(idx + 1).width = col.width; } catch (eW) {}
      });
    }

    srcSheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
      var targetRow = targetSheet.getRow(rowNumber);
      if (row.height != null) targetRow.height = row.height;
      try {
        if (row.hidden != null) targetRow.hidden = row.hidden;
        if (row.outlineLevel != null) targetRow.outlineLevel = row.outlineLevel;
      } catch (eRow) { /* ignore unsupported row metadata */ }
    });
  }

  function normalizePrintArea(area) {
    if (!area) return '';
    if (Array.isArray(area)) area = area.join(',');
    return String(area)
      .split(',')
      .map(function (part) {
        return part.trim().replace(/^(?:'[^']+'|[^!]+)!/, '');
      })
      .filter(Boolean)
      .join(',');
  }

  function copyPrintSettings(srcSheet, targetSheet) {
    if (!srcSheet || !targetSheet) return;
    var sourceSetup = srcSheet.pageSetup || {};
    var setup = clonePlain(sourceSetup) || {};
    var area = normalizePrintArea(sourceSetup.printArea || srcSheet.printArea);
    if (area) setup.printArea = area;
    // 每個工作表固定縮成單頁，其他紙張、方向、邊界沿用範例模板。
    setup.fitToPage = true;
    setup.fitToWidth = 1;
    setup.fitToHeight = 1;
    targetSheet.pageSetup = setup;
    if (area) {
      try { targetSheet.printArea = area; } catch (eArea) { /* pageSetup 已保留 */ }
    }
  }

  function copySheetValuesAndStyles(srcSheet, targetSheet, dimensionSource) {
    if (!srcSheet || !targetSheet) return;

    copySheetDimensions(dimensionSource || srcSheet, targetSheet);
    if (srcSheet.properties) targetSheet.properties = clonePlain(srcSheet.properties);
    if (srcSheet.views) targetSheet.views = clonePlain(srcSheet.views);
    if (srcSheet.headerFooter) targetSheet.headerFooter = clonePlain(srcSheet.headerFooter);
    copyPrintSettings(dimensionSource || srcSheet, targetSheet);

    srcSheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
      var targetRow = targetSheet.getRow(rowNumber);

      row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
        var targetCell = targetRow.getCell(colNumber);
        targetCell.value = cell.value;
        targetCell.style = clonePlain(cell.style) || {};
      });
    });

    if (srcSheet.model && srcSheet.model.merges) {
      srcSheet.model.merges.forEach(function (range) {
        try {
          if (typeof targetSheet.mergeCellsWithoutStyle === 'function') {
            targetSheet.mergeCellsWithoutStyle(range);
          } else {
            targetSheet.mergeCells(range);
          }
        } catch (eM) {}
      });
    }
  }

  function yieldUi() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { setTimeout(resolve, 0); });
      } else setTimeout(resolve, 0);
    });
  }

  function downloadBlob(buffer, filename) {
    var blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (e1) {}
      try { URL.revokeObjectURL(url); } catch (e2) {}
    }, 1500);
  }

  async function exportWorkbook(opts) {
    opts = opts || {};
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    function progress(msg, cur, total) {
      if (!onProgress) return;
      try { onProgress({ message: msg, current: cur || 0, total: total || 0 }); } catch (e) {}
    }

    var ExcelJSLib = getExcelJS();
    if (!ExcelJSLib) return { ok: false, error: 'ExcelJS 未載入，請重新整理' };

    var range = listWorkdays(opts.startDate, opts.endDate);
    if (!range.dates || !range.dates.length) {
      return { ok: false, error: range.error || '日期無效' };
    }
    var teachers = (opts.teachers || []).filter(function (t) { return t && t.email; });
    if (!teachers.length) return { ok: false, error: '無教師名單' };

    var recipients = opts.recipients && opts.recipients.length
      ? opts.recipients
      : teachers.slice();
    var total = recipients.length;

    var periodSpec = buildPeriodSpec(range.dates);
    var title = (opts.title && String(opts.title).trim())
      || '臺北市立建成國民中學114學年度第一學期第一次段考監考表';

    progress('載入模板…', 0, total);
    _templateBuf = null;
    var tplBuf = await loadTemplateBuffer();
    var masterWb = new ExcelJSLib.Workbook();
    await masterWb.xlsx.load(tplBuf.slice(0));
    var master = masterWb.worksheets[0];
    if (!master) return { ok: false, error: '模板沒有工作表' };
    var layout = detectLayout(master);

    progress('讀取課表…', 0, total);
    await yieldUi();
    var matrix = buildTeacherMatrix(
      teachers, periodSpec, opts.getCell, layout.slots,
      function (c, t) { progress('讀取課表 ' + c + '／' + t + '…', c, t); },
      opts.allSchedules || []
    );
    var coverage = validateClassCoverage(
      matrix,
      periodSpec,
      opts.classNames || [],
      opts.allSchedules || []
    );
    if (!coverage.ok) {
      return { ok: false, error: formatCoverageError(coverage), coverage: coverage };
    }
    var includedTeachers = matrix.includedTeachers || [];
    recipients = recipients.filter(function (recipient) {
      return includedTeachers.some(function (teacher) { return teachersMatch(recipient, teacher); });
    });
    if (!recipients.length) return { ok: false, error: '選取的教師在考試期間沒有課務' };
    total = recipients.length;

    progress('寫入全校文字…', 0, total);
    await yieldUi();
    fillMasterValues(master, {
      title: title,
      dates: range.dates,
      matrix: matrix,
      layout: layout
    });

    progress('產生底稿…', 0, total);
    await yieldUi();
    var masterBuf = await masterWb.xlsx.writeBuffer();

    // 第一張固定「監考表」：全校內容、不分發、不折抵；B4:X6 手填考科
    progress('建立主表「監考表」…', 0, total);
    await yieldUi();
    var outWb = new ExcelJSLib.Workbook();
    await outWb.xlsx.load(masterBuf.slice(0));
    var masterSheet = outWb.worksheets[0];
    if (!masterSheet) return { ok: false, error: '底稿讀取失敗' };
    copySheetDimensions(master, masterSheet);
    copyPrintSettings(master, masterSheet);
    masterSheet.name = MASTER_SHEET_NAME;
    // 第一張表也要套用字型與處理合併；setCellFontPreservingStyle 只替換字型，框線沿用模板。
    var lastMarked = applyChangeFonts(masterSheet, matrix, layout);
    applySpecialEducationRows(masterSheet, matrix, layout);
    ensureBlankGridCells(masterSheet, layout);

    var usedNames = {};
    usedNames[MASTER_SHEET_NAME] = 1;
    var i;

    for (i = 0; i < total; i++) {
      var rec = recipients[i];
      var em = String(rec.email || '').toLowerCase();
      var name = rec.name || em || ('教師' + (i + 1));
      var sheetName = String(name).replace(/[\\\/\?\*\[\]]/g, '').slice(0, 28) || ('T' + i);
      if (usedNames[sheetName]) sheetName = sheetName.slice(0, 26) + '_' + i;
      usedNames[sheetName] = 1;

      var quotaStats = buildExamQuotaStats({
        ledgerRows: opts.ledgerRows,
        teacher: rec,
        email: em,
        requests: opts.requests,
        rangeDates: range.dates,
        startDate: range.dates[0],
        endDate: range.dates[range.dates.length - 1],
        ledgerHistoryComplete: opts.ledgerHistoryComplete === true
      });

      if (i === 0 || (i + 1) % 5 === 0 || i === total - 1) {
        progress('分發工作表 ' + (i + 1) + '／' + total + '…', i + 1, total);
        await yieldUi();
      }

      var tempWb = new ExcelJSLib.Workbook();
      await tempWb.xlsx.load(masterBuf.slice(0));
      var tempSheet = tempWb.worksheets[0];
      if (!tempSheet) return { ok: false, error: '底稿讀取失敗' };
      tempSheet.name = sheetName;
      applyChangeFonts(tempSheet, matrix, layout);
      highlightRecipientRow(tempSheet, matrix, layout, rec);
      personalizeValues(
        tempSheet,
        layout,
        name,
        quotaStats.before,
        quotaStats.used,
        quotaStats.remaining
      );

      try {
        var targetSheet = outWb.addWorksheet(sheetName);
        copySheetValuesAndStyles(tempSheet, targetSheet, master);
        applySpecialEducationRows(targetSheet, matrix, layout);
        ensureBlankGridCells(targetSheet, layout);
        // 分發頁 A1:X47 公式連動「監考表」；A48 保留個人額度備註。
        linkMasterRange(targetSheet, MASTER_SHEET_NAME);
      } catch (eMove) {
        return {
          ok: false,
          error: '合併工作表失敗：' + (eMove && eMove.message ? eMove.message : eMove)
        };
      }
    }

    if (!outWb || !outWb.worksheets.length) {
      return { ok: false, error: '沒有可匯出的工作表' };
    }

    progress('寫入單一 xlsx…', total, total);
    await yieldUi();
    // 讓 Excel 開檔時重算分發頁的跨工作表公式。
    if (outWb.calcProperties) outWb.calcProperties.fullCalcOnLoad = true;
    var fname = opts.filename
      || ('段考監考表_' + String(range.dates[0]).replace(/-/g, '') + '.xlsx');
    var outBuf = await outWb.xlsx.writeBuffer();
    downloadBlob(outBuf, fname);

    var warn = range.warning || '';
    if (matrix.truncated) {
      var tip = '教師 ' + matrix.total + ' 人，表內列出前 ' + matrix.shown + ' 人。';
      warn = warn ? (warn + '；' + tip) : tip;
    }
    var masterTip = '第1張「監考表」可填 B4:X6 考科；各分發表 A1:X47 已公式連動，A48 保留個人額度備註。';
    warn = warn ? (warn + '；' + masterTip) : masterTip;

    return {
      ok: true,
      fileName: fname,
      dayCount: range.dates.length,
      teacherCount: matrix.total,
      copyCount: total,
      sheetCount: total + 1,
      changedMarked: lastMarked,
      patrolCount: matrix.patrolCount || 0,
      coverage: coverage,
      warning: warn,
      dates: range.dates
    };
  }

  return {
    TEMPLATE_URL: TEMPLATE_URL,
    listWorkdays: listWorkdays,
    buildPeriodSpec: buildPeriodSpec,
    cellTextFromSchedule: cellTextFromSchedule,
    countEmptySlotQuotaUsed: countEmptySlotQuotaUsed,
    buildExamQuotaStats: buildExamQuotaStats,
    buildTeacherMatrix: buildTeacherMatrix,
    validateClassCoverage: validateClassCoverage,
    isSpecialEducationTeacher: isSpecialEducationTeacher,
    applySpecialEducationRows: applySpecialEducationRows,
    ensureBlankGridCells: ensureBlankGridCells,
    normalizePrintArea: normalizePrintArea,
    copyPrintSettings: copyPrintSettings,
    applyChangeFonts: applyChangeFonts,
    highlightRecipientRow: highlightRecipientRow,
    personalizeValues: personalizeValues,
    linkMasterRange: linkMasterRange,
    exportWorkbook: exportWorkbook,
    loadTemplateBuffer: loadTemplateBuffer
  };
})();
