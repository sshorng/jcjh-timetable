/**
 * 段考監考表（班級版）匯出
 *
 * 版式來源：115-1 第一次段考監考表-教師.xlsx（班級 x 節次）
 *   Row1: B1:H1 第一天日期（合併）、I1:L1 第二天日期（合併）
 *   Row2: A2=年級，B2-L2 考科（自習為預設，空為待手填考科）
 *   ColA: 701-908 + 巡七/巡八/巡九
 *   B-L: 該班該節監考教師（巡堂列僅考試節有值，自習節留白）
 *
 * 資料來源與既有監考表共用：
 *   teacherMatrix = ExportInvigilation.buildTeacherMatrix(...)
 *   coverage = ExportInvigilation.validateClassCoverage(...)
 * 再反轉為 班級 -> 教師（含巡堂列）。
 *
 * 鐵則（沿用既有）：
 * - 只改 value；Row2 考科列不覆寫（由模板自習預設＋手填考科）
 * - 絕不改 border／格線／欄寬／合併（模板原樣）
 * - 異動（代課／調課／空堂排班）粗體底線，其餘有字不粗不底
 */
import { ExportInvigilation } from './export-invigilation-recovered.js';
import { TemplateBuffer } from './template-buffer.js';

const ExportInvigilationClass = (() => {
  var TEMPLATE_URL = 'templates/invigilation-class-template.xlsx';
  var DAY_ZH = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  // 與範本一致：第一天 7 節＋第二天 4 節＝11 欄（B-L）
  var SLOTS_PER_BOOK = 11;
  // 考試節（0-based slot index）：C,E,G,J,L → 1,3,5,8,10
  // 其餘為自習監看節，巡堂列留白。
  var EXAM_SLOT_INDEXES = [1, 3, 5, 8, 10];
  var CLASS_ROW_START = 3;
  var DATA_COL_START = 2; // B
  var DATA_COL_END = 12; // L

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

  function rocYear(gregorianYear) {
    var y = parseInt(gregorianYear, 10);
    return Number.isNaN(y) ? '' : String(y - 1911);
  }

  function suffixFromTitle(title) {
    var t = String(title || '');
    if (t.indexOf('第三次') >= 0 || t.indexOf('三段') >= 0) return '三段';
    if (t.indexOf('第二次') >= 0 || t.indexOf('二段') >= 0) return '二段';
    if (t.indexOf('第一次') >= 0 || t.indexOf('一段') >= 0) return '一段';
    return '';
  }

  /**
   * 範本格式：115年10月12(一)一段（注意：日後無「日」字，與附檔一致）
   * suffix 為一段／二段／三段（由標題推斷；無則不加）
   */
  function formatClassDayHeader(dateStr, suffix) {
    var d = parseDate(dateStr);
    if (!d) return String(dateStr || '');
    var base = rocYear(d.getFullYear()) + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '(' + (DAY_ZH[d.getDay()] || '') + ')';
    return suffix ? base + suffix : base;
  }

  function isExamSlot(slotIndex) {
    return EXAM_SLOT_INDEXES.indexOf(slotIndex) >= 0;
  }

  function normText(v) {
    return String(v == null ? '' : v).replace(/[　\s]+/g, '').trim();
  }

  function splitNames(raw) {
    return String(raw == null ? '' : raw)
      .split(/[、,，/／|｜\s]+/)
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  function isPatrolText(text) {
    var s = normText(text);
    return s === '巡堂' || s.indexOf('巡堂') === 0;
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

  function getExcelJS() {
    if (typeof window !== 'undefined' && window.ExcelJS) return window.ExcelJS;
    if (typeof ExcelJS !== 'undefined') return ExcelJS;
    if (typeof globalThis !== 'undefined' && globalThis.ExcelJS) return globalThis.ExcelJS;
    return null;
  }

  async function loadTemplateBuffer() {
    if (!TemplateBuffer || typeof TemplateBuffer.load !== 'function') {
      throw new Error('template-buffer.js 尚未載入');
    }
    return TemplateBuffer.load(TEMPLATE_URL, '無法載入監考表（班級版）模板');
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

  /**
   * 反轉 teacherMatrix → classMatrix
   * teacherMatrix: { left:[{name,email,slots:[{text,changed}...]}], right:[...] }
   * 回傳 { classes:[names], rows:[{ className, cells:[{text,changed}...] }], patrolRows:[...], patrolMax }
   */
  function buildClassMatrix(teacherMatrix, periodSpec, expectedClasses) {
    var allTeachers = [].concat((teacherMatrix && teacherMatrix.left) || [], (teacherMatrix && teacherMatrix.right) || []);
    var slotCount = (periodSpec && periodSpec.length) || SLOTS_PER_BOOK;
    var classes = (expectedClasses || []).slice();
    var classIndex = Object.create(null);
    classes.forEach(function (name, i) { classIndex[name] = i; });

    var rows = classes.map(function (name) {
      var cells = [];
      for (var s = 0; s < slotCount; s++) cells.push({ text: '', changed: false });
      return { className: name, cells: cells };
    });

    // 每節巡堂教師（考試節才填入巡堂列）
    var patrolPerSlot = [];
    for (var s0 = 0; s0 < slotCount; s0++) patrolPerSlot.push([]);

    allTeachers.forEach(function (t) {
      if (!t || !t.slots) return;
      if (t.specialEducation) return;
      var teacherName = t.name || t.email || '';
      for (var s = 0; s < slotCount; s++) {
        var slot = t.slots[s];
        if (!slot || typeof slot !== 'object') continue;
        var text = String(slot.text || '').trim();
        if (!text) continue;
        if (isPatrolText(text)) {
          // 僅考試節收集巡堂；自習節巡堂不需額外巡堂列（與範本一致）
          if (isExamSlot(s)) patrolPerSlot[s].push({ text: teacherName, changed: !!slot.changed });
          continue;
        }
        splitNames(text).forEach(function (cls) {
          if (!Object.prototype.hasOwnProperty.call(classIndex, cls)) return;
          var cell = rows[classIndex[cls]].cells[s];
          if (cell.text) {
            // 重複（理論上已被 coverage 擋下）；保留第一位，串接備查
            cell.text = cell.text + '、' + teacherName;
            cell.changed = cell.changed || !!slot.changed;
          } else {
            cell.text = teacherName;
            cell.changed = !!slot.changed;
          }
        });
      }
    });

    var patrolMax = patrolPerSlot.reduce(function (m, list) { return Math.max(m, list.length); }, 0);
    var patrolRows = [];
    for (var p = 0; p < patrolMax; p++) {
      var cells = [];
      for (var s2 = 0; s2 < slotCount; s2++) {
        if (!isExamSlot(s2)) {
          cells.push({ text: '', changed: false });
        } else {
          var entry = patrolPerSlot[s2][p];
          cells.push(entry ? { text: entry.text, changed: !!entry.changed } : { text: '', changed: false });
        }
      }
      patrolRows.push({ className: '', cells: cells });
    }

    return { classes: classes, rows: rows, patrolRows: patrolRows, patrolMax: patrolMax, patrolPerSlot: patrolPerSlot };
  }

  function detectClassLayout(ws) {
    // 讀取範本 A3 以下：數字班級列＋巡堂列
    var classLabels = [];
    var patrolLabels = [];
    var r = CLASS_ROW_START;
    var guard = 0;
    while (guard < 60) {
      var v = null;
      try { v = ws.getCell(r, 1).value; } catch (e) { break; }
      if (v == null || String(v).trim() === '') break;
      var s = String(v).trim();
      if (/^巡/.test(s)) patrolLabels.push(s);
      else classLabels.push(s);
      r += 1;
      guard += 1;
      // 範本巡堂後即結束；若遇到空列則停
      if (r > 60) break;
    }
    // 若讀不到（測試用假表），回退為空
    return {
      classRowStart: CLASS_ROW_START,
      templateClasses: classLabels,
      templatePatrols: patrolLabels,
      templateDataEnd: r - 1
    };
  }

  function ensureRowCapacity(ws, neededRows) {
    // 範本固定 25 列（22 班＋3 巡）；若班級數不同，增補列並沿用上一列高
    var currentMax = ws.rowCount || ws.max_row || 27;
    if (neededRows <= currentMax) return;
    for (var r = currentMax + 1; r <= neededRows; r++) {
      var row = ws.getRow(r);
      try {
        var prev = ws.getRow(r - 1);
        if (prev && prev.height != null) row.height = prev.height;
        else row.height = 90;
      } catch (e) { /* ignore */ }
      // 複製上一列樣式（框線／字型／對齊）到新增列，避免無框線
      for (var c = 1; c <= DATA_COL_END; c++) {
        try {
          var src = ws.getCell(r - 1, c);
          var dst = ws.getCell(r, c);
          if (src && src.style) dst.style = clonePlain(src.style) || {};
        } catch (e2) { /* ignore */ }
      }
    }
  }

  function fillClassValues(ws, opts) {
    var classMatrix = opts.classMatrix;
    var dates = opts.dates || [];
    var suffix = opts.suffix || '';
    var layout = opts.layout;

    // 日期：B1（合併 B1:H1 主格）、I1（合併 I1:L1 主格）
    try { ws.getCell(1, 2).value = formatClassDayHeader(dates[0] || '', suffix) || null; } catch (e1) {}
    try { ws.getCell(1, 9).value = formatClassDayHeader(dates[1] || dates[0] || '', suffix) || null; } catch (e2) {}

    // Row2 考科列不覆寫（模板自習預設＋手填考科，與既有 R3-R8 規則一致）

    var actualClasses = (classMatrix && classMatrix.classes) || [];
    var templateClasses = (layout && layout.templateClasses) || [];
    var templatePatrols = (layout && layout.templatePatrols) || [];
    var classCount = actualClasses.length;
    var patrolCount = (classMatrix && classMatrix.patrolRows ? classMatrix.patrolRows.length : 0);
    // 至少保留模板巡堂列數，避免版式縮水
    var keepPatrols = Math.max(patrolCount, templatePatrols.length);
    var neededRows = CLASS_ROW_START + classCount + keepPatrols - 1;
    ensureRowCapacity(ws, neededRows);

    // 班級列
    for (var i = 0; i < classCount; i++) {
      var row = CLASS_ROW_START + i;
      try { ws.getCell(row, 1).value = actualClasses[i]; } catch (e) {}
      var cells = classMatrix.rows[i] ? classMatrix.rows[i].cells : [];
      for (var s = 0; s < SLOTS_PER_BOOK; s++) {
        var col = DATA_COL_START + s;
        var cell = null;
        try { cell = ws.getCell(row, col); } catch (e3) { continue; }
        var entry = cells[s];
        var text = entry && entry.text ? entry.text : '';
        cell.value = text || null;
        // 異動粗體底線；其餘確保不粗不底（保留模板字型大小）
        try {
          var font = clonePlain(cell.font) || clonePlain(cell.style && cell.style.font) || {};
          if (entry && entry.changed && text) {
            font.bold = true;
            font.underline = 'single';
          } else {
            font.bold = false;
            font.underline = false;
          }
          setCellFontPreservingStyle(cell, font);
        } catch (e4) {}
      }
    }
    // 模板班級列多於實際時，清空多餘列
    for (var ti = classCount; ti < templateClasses.length; ti++) {
      var erow = CLASS_ROW_START + ti;
      try { ws.getCell(erow, 1).value = null; } catch (e5) {}
      for (var sc = DATA_COL_START; sc <= DATA_COL_END; sc++) {
        try { ws.getCell(erow, sc).value = null; } catch (e6) {}
      }
    }

    // 巡堂列
    var patrolStart = CLASS_ROW_START + classCount;
    var patrolLabels = templatePatrols.slice();
    while (patrolLabels.length < keepPatrols) {
      patrolLabels.push('巡' + (patrolLabels.length + 1));
    }
    for (var p = 0; p < keepPatrols; p++) {
      var prow = patrolStart + p;
      try { ws.getCell(prow, 1).value = patrolLabels[p] || ('巡' + (p + 1)); } catch (e7) {}
      var prowCells = (classMatrix.patrolRows[p] && classMatrix.patrolRows[p].cells) || [];
      for (var s3 = 0; s3 < SLOTS_PER_BOOK; s3++) {
        var pcol = DATA_COL_START + s3;
        var pcell = null;
        try { pcell = ws.getCell(prow, pcol); } catch (e8) { continue; }
        var pentry = prowCells[s3];
        var ptext = pentry && pentry.text ? pentry.text : '';
        pcell.value = ptext || null;
        try {
          var pfont = clonePlain(pcell.font) || clonePlain(pcell.style && pcell.style.font) || {};
          if (pentry && pentry.changed && ptext) {
            pfont.bold = true;
            pfont.underline = 'single';
          } else {
            pfont.bold = false;
            pfont.underline = false;
          }
          setCellFontPreservingStyle(pcell, pfont);
        } catch (e9) {}
      }
    }
    // 清掉模板殘留的多餘列（例如實際班級較少時原巡堂位置殘留）
    var usedEnd = patrolStart + keepPatrols - 1;
    var templateEnd = CLASS_ROW_START + templateClasses.length + templatePatrols.length - 1;
    for (var cr = usedEnd + 1; cr <= Math.max(templateEnd, ws.rowCount || 0); cr++) {
      // 只清資料區，不動列高框線
      var aval = null;
      try { aval = ws.getCell(cr, 1).value; } catch (e10) { continue; }
      if (aval == null || String(aval).trim() === '') {
        var allEmpty = true;
        for (var cc = DATA_COL_START; cc <= DATA_COL_END; cc++) {
          try {
            var vv = ws.getCell(cr, cc).value;
            if (vv != null && String(vv).trim() !== '') { allEmpty = false; break; }
          } catch (e11) {}
        }
        if (allEmpty) continue;
      }
      // 超出使用範圍的殘留列：若超出模板原始範圍才清，避免誤清
      if (cr > templateEnd) {
        try { ws.getCell(cr, 1).value = null; } catch (e12) {}
        for (var c2 = DATA_COL_START; c2 <= DATA_COL_END; c2++) {
          try { ws.getCell(cr, c2).value = null; } catch (e13) {}
        }
      }
    }

    return { classCount: classCount, patrolCount: keepPatrols };
  }

  function copySheetDimensions(srcSheet, targetSheet) {
    if (!srcSheet || !targetSheet) return;
    if (srcSheet.columns) {
      srcSheet.columns.forEach(function (col, idx) {
        if (!col || col.width == null) return;
        try { targetSheet.getColumn(idx + 1).width = col.width; } catch (eW) {}
      });
    }
    try {
      srcSheet.eachRow({ includeEmpty: true }, function (row, rowNumber) {
        var targetRow = targetSheet.getRow(rowNumber);
        if (row.height != null) targetRow.height = row.height;
      });
    } catch (eR) {}
  }

  function copyPrintSettings(srcSheet, targetSheet) {
    if (!srcSheet || !targetSheet) return;
    try {
      var sourceSetup = srcSheet.pageSetup || {};
      var setup = clonePlain(sourceSetup) || {};
      targetSheet.pageSetup = setup;
    } catch (e) {}
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

    var range = ExportInvigilation.listWorkdays(opts.startDate, opts.endDate);
    if (!range.dates || !range.dates.length) {
      return { ok: false, error: range.error || '日期無效' };
    }
    var teachers = (opts.teachers || []).filter(function (t) { return t && t.email; });
    if (!teachers.length) return { ok: false, error: '無教師名單' };

    var periodSpec = ExportInvigilation.buildPeriodSpec(range.dates);
    var suffix = suffixFromTitle(opts.title || '');

    progress('載入班級版模板…', 0, teachers.length);
    if (TemplateBuffer) TemplateBuffer.clear(TEMPLATE_URL);
    var tplBuf = await loadTemplateBuffer();
    var wb = new ExcelJSLib.Workbook();
    await wb.xlsx.load(tplBuf.slice(0));
    var ws = wb.worksheets[0];
    if (!ws) return { ok: false, error: '模板沒有工作表' };
    var layout = detectClassLayout(ws);

    progress('讀取課表…', 0, teachers.length);
    await yieldUi();
    // 沿用既有教師矩陣（含空堂排班／巡堂／特教／虛擬班邏輯），再反轉為班級版
    var teacherMatrix = ExportInvigilation.buildTeacherMatrix(
      teachers, periodSpec, opts.getCell, 38,
      function (c, t) { progress('讀取課表 ' + c + '／' + t + '…', c, t); },
      opts.allSchedules || []
    );
    var coverage = ExportInvigilation.validateClassCoverage(
      teacherMatrix,
      periodSpec,
      opts.classNames || [],
      opts.allSchedules || []
    );
    if (!coverage.ok) {
      var lines = ['監考表（班級版）班級檢查未通過，已停止匯出。'];
      var maxItems = 8;
      if (coverage.missing && coverage.missing.length) {
        lines.push('缺少：' + coverage.missing.slice(0, maxItems).map(function (item) {
          return String(item.date).slice(5) + '第' + item.period + '節 ' + item.classNames.join('、');
        }).join('；'));
      }
      if (coverage.duplicates && coverage.duplicates.length) {
        lines.push('重複：' + coverage.duplicates.slice(0, maxItems).map(function (item) {
          return String(item.date).slice(5) + '第' + item.period + '節 '
            + item.classes.map(function (e) { return e.className + '（' + e.count + '人）'; }).join('、');
        }).join('；'));
      }
      return { ok: false, error: lines.join('　'), coverage: coverage };
    }
    var expected = coverage.expected && coverage.expected.length
      ? coverage.expected.slice()
      : (layout.templateClasses.length ? layout.templateClasses.slice() : []);

    progress('寫入班級監考表…', 0, teachers.length);
    await yieldUi();
    var classMatrix = buildClassMatrix(teacherMatrix, periodSpec, expected);
    var fillInfo = fillClassValues(ws, {
      classMatrix: classMatrix,
      dates: range.dates,
      suffix: suffix,
      layout: layout
    });
    copySheetDimensions(ws, ws);
    copyPrintSettings(ws, ws);
    try {
      if (layout.templateClasses.length === 0 && ws.name) ws.name = '班級版';
      else if (!ws.name || !String(ws.name).trim()) ws.name = '班級版';
    } catch (eName) {}

    progress('寫入單一 xlsx…', teachers.length, teachers.length);
    await yieldUi();
    var fname = opts.filename
      || ('段考監考表_班級版_' + String(range.dates[0]).replace(/-/g, '') + '.xlsx');
    var outBuf = await wb.xlsx.writeBuffer();
    downloadBlob(outBuf, fname);

    var warn = range.warning || '';
    var tip = 'Row2 考科欄（空欄）請依段考範圍手填；自習欄已帶入「自習」。巡堂列僅考試節填值。';
    warn = warn ? (warn + '；' + tip) : tip;

    return {
      ok: true,
      fileName: fname,
      dayCount: range.dates.length,
      teacherCount: teacherMatrix.total,
      classCount: fillInfo.classCount,
      patrolCount: fillInfo.patrolCount,
      changedMarked: teacherMatrix.changedCount || 0,
      coverage: coverage,
      warning: warn,
      dates: range.dates
    };
  }

  return {
    TEMPLATE_URL: TEMPLATE_URL,
    EXAM_SLOT_INDEXES: EXAM_SLOT_INDEXES,
    formatClassDayHeader: formatClassDayHeader,
    suffixFromTitle: suffixFromTitle,
    buildClassMatrix: buildClassMatrix,
    detectClassLayout: detectClassLayout,
    fillClassValues: fillClassValues,
    exportWorkbook: exportWorkbook,
    loadTemplateBuffer: loadTemplateBuffer
  };
})();

export { ExportInvigilationClass };
