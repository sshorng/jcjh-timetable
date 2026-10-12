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
 * 鐵則：
 * - 只改 value，不動字型（全表純文字、無粗體底線）；Row2 考科列不覆寫（由模板自習預設＋手填考科）
 * - 絕不改 border／格線／欄寬／合併（模板原樣）；寫完刪除下方多餘空白列
 */
import { ExportInvigilation } from './export-invigilation-recovered.js';
import { TemplateBuffer } from './template-buffer.js';
import {
  normalizeExamSubject,
  parsePatrolGrade,
  detectPatrolKind,
  voteSubject,
  sanitizeExamText,
  ILLEGAL_XML_TEST
} from './export-invigilation-subject.js';

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

  function splitNames(raw) {
    return String(raw == null ? '' : raw)
      .split(/[、,，/／|｜\s]+/)
      .map(function (v) { return v.trim(); })
      .filter(Boolean);
  }

  function clonePlain(obj) {
    if (!obj) return null;
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) {
      try { return Object.assign({}, obj); } catch (e2) { return null; }
    }
  }

  // 巡堂分級／科目正規化／非法字元過濾：共用 export-invigilation-subject.js。
  // sanitizeText 為薄轉接，沿用既有呼叫點，避免整檔重改。
  function sanitizeText(v) {
    return sanitizeExamText(v);
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
   * subjectOf: 選配函式，取教師 entries → 任課科目（供考試科目推論；缺則該師不計票）
   * 回傳 { classes, rows, patrolRows, patrolMax, patrolStats, slotExamSubjects }
   */
  function buildClassMatrix(teacherMatrix, periodSpec, expectedClasses, subjectOf) {
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

    // 每節巡堂教師（考試節才填入巡堂列），依分級歸位七／八／九
    var patrolPerSlot = [];
    for (var s0 = 0; s0 < slotCount; s0++) {
      patrolPerSlot.push({ '七': [], '八': [], '九': [], other: [] });
    }

    var subjectOfFn = (typeof subjectOf === 'function') ? subjectOf : function () { return ''; };
    allTeachers.forEach(function (t) {
      if (!t || !t.slots) return;
      if (t.specialEducation) return;
      var teacherName = t.name || t.email || '';
      var teacherSubject = '';
      try { teacherSubject = normalizeExamSubject(subjectOfFn(t), 'class'); } catch (eSubj) { teacherSubject = ''; }
      for (var s = 0; s < slotCount; s++) {
        var slot = t.slots[s];
        if (!slot || typeof slot !== 'object') continue;
        var text = String(slot.text || '').trim();
        if (!text) continue;
        var kind = detectPatrolKind(text);
        if (kind) {
          // 僅考試節收集巡堂；自習節巡堂不需額外巡堂列（與範本一致）
          if (isExamSlot(s)) {
            var bucket = kind === 'plain' ? patrolPerSlot[s].other : patrolPerSlot[s][kind];
            bucket.push({ text: teacherName, changed: !!slot.changed, subject: teacherSubject });
          }
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

    function joinPatrol(list) {
      if (!list || !list.length) return { text: '', changed: false };
      return {
        text: list.map(function (e) { return e.text; }).join('、'),
        changed: list.some(function (e) { return e.changed; })
      };
    }

    function blankCells() {
      var out = [];
      for (var b = 0; b < slotCount; b++) out.push({ text: '', changed: false });
      return out;
    }

    // 分級列（七／八／九）；統計＋每節考試科目投票供匯出提示與 Row2 填寫
    var gradeCells = { '七': blankCells(), '八': blankCells(), '九': blankCells() };
    var overflowPerSlot = [];
    for (var os = 0; os < slotCount; os++) overflowPerSlot.push([]);
    var slotExamSubjects = [];
    for (var es = 0; es < slotCount; es++) slotExamSubjects.push({ subject: '', voters: [], graded: false });
    var gradedSlots = 0;
    var fallbackSlots = 0;
    for (var ps = 0; ps < slotCount; ps++) {
      var buckets = patrolPerSlot[ps];
      var hasGrade = buckets['七'].length + buckets['八'].length + buckets['九'].length > 0;
      if (hasGrade) {
        gradedSlots += 1;
        gradeCells['七'][ps] = joinPatrol(buckets['七']);
        gradeCells['八'][ps] = joinPatrol(buckets['八']);
        gradeCells['九'][ps] = joinPatrol(buckets['九']);
        overflowPerSlot[ps] = buckets.other;
        // 該節考試科目：分級巡堂任課科目投票（只用分級巡堂）
        var votes = [];
        ['七', '八', '九'].forEach(function (gg) {
          buckets[gg].forEach(function (e) {
            if (e && e.subject) votes.push({ grade: gg, teacher: e.text, subject: e.subject });
          });
        });
        var decided = voteSubject(votes.map(function (v) { return v.subject; }));
        slotExamSubjects[ps] = { subject: decided, voters: votes, graded: true };
      } else if (buckets.other.length) {
        // 該節無分級資訊：沿用舊順序填入（相容舊資料），溢出只計數不寫入
        fallbackSlots += 1;
        gradeCells['七'][ps] = joinPatrol(buckets.other.slice(0, 1));
        gradeCells['八'][ps] = joinPatrol(buckets.other.slice(1, 2));
        gradeCells['九'][ps] = joinPatrol(buckets.other.slice(2, 3));
        overflowPerSlot[ps] = buckets.other.slice(3);
      }
    }
    var patrolRows = [
      { grade: '七', cells: gradeCells['七'] },
      { grade: '八', cells: gradeCells['八'] },
      { grade: '九', cells: gradeCells['九'] }
    ];
    // 備用列已取消（巡備1不用）：無分級溢出只計數、不寫入，於匯出提示告知手動補上
    var overflowCells = 0;
    overflowPerSlot.forEach(function (list) {
      list.forEach(function (e) { if (e && e.text) overflowCells += 1; });
    });

    return {
      classes: classes,
      rows: rows,
      patrolRows: patrolRows,
      patrolMax: patrolRows.length,
      patrolPerSlot: patrolPerSlot,
      patrolStats: { gradedSlots: gradedSlots, fallbackSlots: fallbackSlots, overflowCells: overflowCells },
      slotExamSubjects: slotExamSubjects
    };
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
      // 非常備後援（範本已預建 40 列，通常不會走到）：逐屬性複製，避免整包 style 覆寫
      for (var c = 1; c <= DATA_COL_END; c++) {
        try {
          var src = ws.getCell(r - 1, c);
          var dst = ws.getCell(r, c);
          if (!src || !dst) continue;
          if (src.font) { try { dst.font = clonePlain(src.font) || src.font; } catch (eF) {} }
          if (src.fill) { try { dst.fill = clonePlain(src.fill) || src.fill; } catch (eFl) {} }
          if (src.border) { try { dst.border = clonePlain(src.border) || src.border; } catch (eB) {} }
          if (src.alignment) { try { dst.alignment = clonePlain(src.alignment) || src.alignment; } catch (eA) {} }
        } catch (e2) { /* ignore */ }
      }
    }
  }

  function fillClassValues(ws, opts) {
    var classMatrix = opts.classMatrix;
    var dates = opts.dates || [];
    var suffix = opts.suffix || '';
    var layout = opts.layout;

    // 日期：B1（合併 B1:H1 主格）、I1（合併 I1:L1 主格），寫入前過濾非法字元
    try { ws.getCell(1, 2).value = sanitizeText(formatClassDayHeader(dates[0] || '', suffix)) || null; } catch (e1) {}
    try { ws.getCell(1, 9).value = sanitizeText(formatClassDayHeader(dates[1] || dates[0] || '', suffix)) || null; } catch (e2) {}

    // Row2 考試節考科：分級巡堂投票有結論才填入；自習格與無結論留白手填
    var subjectFills = [];
    try {
      var slotSubjects = (classMatrix && classMatrix.slotExamSubjects) || [];
      EXAM_SLOT_INDEXES.forEach(function (s) {
        var info = slotSubjects[s];
        if (!info || !info.subject) return;
        var subjCell = ws.getCell(2, DATA_COL_START + s);
        subjCell.value = sanitizeText(info.subject) || null;
        subjectFills.push({ slot: s, col: DATA_COL_START + s, subject: info.subject, voters: info.voters || [] });
      });
    } catch (eSub) {}

    var actualClasses = (classMatrix && classMatrix.classes) || [];
    var templateClasses = (layout && layout.templateClasses) || [];
    var templatePatrols = (layout && layout.templatePatrols) || [];
    var classCount = actualClasses.length;
    // 巡堂列：分級列對位模板標籤（巡七→七）；無對應分級的標籤留白，無分級溢出不寫入
    var gradeRowByGrade = {};
    (classMatrix.patrolRows || []).forEach(function (pr) {
      if (pr && (pr.grade === '七' || pr.grade === '八' || pr.grade === '九') && !gradeRowByGrade[pr.grade]) {
        gradeRowByGrade[pr.grade] = pr;
      }
    });
    function patrolBlankCells() {
      var out = [];
      for (var bb = 0; bb < SLOTS_PER_BOOK; bb++) out.push({ text: '', changed: false });
      return out;
    }
    function patrolRowHasText(pr) {
      return !!(pr && pr.cells && pr.cells.some(function (c) { return c && c.text; }));
    }
    var rowsToWrite = [];
    templatePatrols.forEach(function (lbl) {
      var g = parsePatrolGrade(lbl);
      if (g && gradeRowByGrade[g]) {
        rowsToWrite.push({ label: lbl, row: gradeRowByGrade[g] });
        gradeRowByGrade[g]._placed = true;
      } else {
        rowsToWrite.push({ label: lbl, row: { cells: patrolBlankCells() } });
      }
    });
    ['七', '八', '九'].forEach(function (g) {
      var r = gradeRowByGrade[g];
      if (r && !r._placed && patrolRowHasText(r)) {
        rowsToWrite.push({ label: '巡' + g, row: r });
        r._placed = true;
      }
    });
    var keepPatrols = Math.max(rowsToWrite.length, templatePatrols.length);
    var neededRows = CLASS_ROW_START + classCount + keepPatrols - 1;
    ensureRowCapacity(ws, neededRows);

    // 班級列（值先過濾非法字元；字型只寫乾淨 font，不動整包 style）
    for (var i = 0; i < classCount; i++) {
      var row = CLASS_ROW_START + i;
      try { ws.getCell(row, 1).value = sanitizeText(actualClasses[i]) || null; } catch (e) {}
      var cells = classMatrix.rows[i] ? classMatrix.rows[i].cells : [];
      for (var s = 0; s < SLOTS_PER_BOOK; s++) {
        var col = DATA_COL_START + s;
        var cell = null;
        try { cell = ws.getCell(row, col); } catch (e3) { continue; }
        var entry = cells[s];
        var text = sanitizeText(entry && entry.text ? entry.text : '');
        cell.value = text || null;
        // 純文字：不加粗體底線，字型沿用模板
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

    // 巡堂列：依 rowsToWrite（分級已對位）寫入
    var patrolStart = CLASS_ROW_START + classCount;
    for (var p = 0; p < rowsToWrite.length; p++) {
      var prow = patrolStart + p;
      var witem = rowsToWrite[p];
      try { ws.getCell(prow, 1).value = sanitizeText(witem.label) || null; } catch (e7) {}
      var prowCells = (witem.row && witem.row.cells) || [];
      for (var s3 = 0; s3 < SLOTS_PER_BOOK; s3++) {
        var pcol = DATA_COL_START + s3;
        var pcell = null;
        try { pcell = ws.getCell(prow, pcol); } catch (e8) { continue; }
        var pentry = prowCells[s3];
        var ptext = sanitizeText(pentry && pentry.text ? pentry.text : '');
        pcell.value = ptext || null;
        // 純文字：不加粗體底線，字型沿用模板
      }
    }
    var usedEnd = patrolStart + keepPatrols - 1;
    // 清除使用範圍外的殘留值（A 欄標籤＋B-L 資料；框線列高保留）。
    // 範本恰好 27 列時此迴圈通常不執行；班級較少等稀疏情況可清掉舊標籤。
    var maxRow = Math.max(
      CLASS_ROW_START + templateClasses.length + templatePatrols.length - 1,
      ws.rowCount || 0
    );
    for (var cr = usedEnd + 1; cr <= maxRow; cr++) {
      try { ws.getCell(cr, 1).value = null; } catch (e10) {}
      for (var cc = DATA_COL_START; cc <= DATA_COL_END; cc++) {
        try { ws.getCell(cr, cc).value = null; } catch (e11) {}
      }
    }

    return { classCount: classCount, patrolCount: keepPatrols, subjectFills: subjectFills };
  }

  /**
   * 列印設定消毒：班級版模板的 horizontalDpi／verticalDpi 為 4294967295（0xFFFFFFFF，
   * 產生器寫入的 -1 遺留值），ExcelJS 會原樣寫回，Excel 桌面版可能跳「已修復」並清空內容。
   * 超出合理範圍一律移除（Excel 缺省即預設 DPI），其餘邊界／方向／縮放保留模板原樣。
   */
  function sanitizePrintSettings(ws) {
    if (!ws || !ws.pageSetup) return;
    try {
      ['horizontalDpi', 'verticalDpi'].forEach(function (k) {
        var v = ws.pageSetup[k];
        if (typeof v === 'number' && (v < 0 || v > 1200 || v === 4294967295)) {
          try { ws.pageSetup[k] = undefined; } catch (eDel) {}
        }
      });
    } catch (e) { /* ignore */ }
  }

  /**
   * 寫出前驗證：把 writeBuffer 結果載回記憶體，確認日期（B1）與首班（A3）都在，
   * 且全表無非法 XML 字元殘留，避免把損毀／空白檔交給使用者下載
   * （Excel 會顯示「已修復」且內容全空）。
   */
  async function verifyWorkbookBuffer(ExcelJSLib, outBuf, expectFirstClass) {
    try {
      var checkWb = new ExcelJSLib.Workbook();
      var bytes = outBuf;
      if (bytes && typeof bytes.slice === 'function') { try { bytes = bytes.slice(0); } catch (eS) {} }
      await checkWb.xlsx.load(bytes);
      var cws = checkWb.worksheets[0];
      if (!cws) return '驗證失敗：讀回後沒有工作表';
      var b1 = null; var a3 = null;
      try { b1 = cws.getCell(1, 2).value; } catch (e1) {}
      try { a3 = cws.getCell(3, 1).value; } catch (e2) {}
      if (b1 == null || String(b1).trim() === '') return '驗證失敗：日期列遺失（B1空白）';
      if (expectFirstClass && (a3 == null || String(a3).trim() === '')) {
        return '驗證失敗：班級列遺失（A3空白，應為' + expectFirstClass + '）';
      }
      // 全表掃描非法字元（sanitize 若有漏網，此處擋下不上傳損毀檔）
      var bad = null;
      try {
        cws.eachRow({ includeEmpty: true }, function (row) {
          if (bad) return;
          row.eachCell({ includeEmpty: true }, function (cell) {
            if (bad) return;
            var v = cell.value;
            if (typeof v === 'string' && ILLEGAL_XML_TEST.test(v)) bad = cell.address;
          });
        });
      } catch (eScan) {}
      if (bad) return '驗證失敗：' + bad + ' 含非法字元';
      return null;
    } catch (eV) {
      return '驗證失敗：' + (eV && eV.message ? eV.message : eV);
    }
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
    // 巡堂任課科目對照（email／姓名雙鍵；供考試科目投票）
    var subjectMap = {};
    (teachers || []).forEach(function (t) {
      if (!t) return;
      var subj = t.subject || t['授課科目'] || t['任課科目'] || '';
      var em = String(t.email || '').trim().toLowerCase();
      var nm = String(t.name || t.teacherName || '').trim();
      if (em) subjectMap['e:' + em] = subj;
      if (nm) subjectMap['n:' + nm] = subj;
    });
    var classMatrix = buildClassMatrix(teacherMatrix, periodSpec, expected, function (t) {
      if (!t) return '';
      var em = String(t.email || '').trim().toLowerCase();
      if (em && subjectMap['e:' + em] != null) return subjectMap['e:' + em];
      var nm = String(t.name || '').trim();
      if (nm && subjectMap['n:' + nm] != null) return subjectMap['n:' + nm];
      return t.subject || '';
    });
    var fillInfo = fillClassValues(ws, {
      classMatrix: classMatrix,
      dates: range.dates,
      suffix: suffix,
      layout: layout
    });
    sanitizePrintSettings(ws);
    try {
      if (layout.templateClasses.length === 0 && ws.name) ws.name = '班級版';
      else if (!ws.name || !String(ws.name).trim()) ws.name = '班級版';
    } catch (eName) {}

    progress('寫入單一 xlsx…', teachers.length, teachers.length);
    await yieldUi();
    var fname = opts.filename
      || ('段考監考表_班級版_' + String(range.dates[0]).replace(/-/g, '') + '.xlsx');
    var outBuf = await wb.xlsx.writeBuffer();
    var verifyError = await verifyWorkbookBuffer(ExcelJSLib, outBuf, (classMatrix.classes || [])[0] || '');
    if (verifyError) {
      try { console.error('[invigilation-class]', verifyError, { bytes: outBuf && outBuf.byteLength }); } catch (eL) {}
      return { ok: false, error: '班級版匯出' + verifyError + '，未下載檔案以免損毀。請截圖 F12 Console 回報' };
    }
    downloadBlob(outBuf, fname);

    var warn = range.warning || '';
    var tip = 'Row2 考科欄（空欄）請依段考範圍手填；自習欄已帶入「自習」。巡堂列僅考試節填值。';
    warn = warn ? (warn + '；' + tip) : tip;
    var pstats = (classMatrix && classMatrix.patrolStats) || null;
    if (pstats) {
      if (pstats.gradedSlots > 0) {
        warn += '巡堂已按七／八／九分級歸位（' + pstats.gradedSlots + ' 節）';
        if (pstats.overflowCells > 0) warn += '；另有 ' + pstats.overflowCells + ' 格無分級未列入，請手動補上';
        warn += '。';
      } else if (pstats.fallbackSlots > 0) {
        warn += '巡堂任務未標註年級，已依原順序填入巡七／八／九（' + pstats.fallbackSlots + ' 節），請核對。';
      }
    }
    // 考試科目推論回報（供核對；格式：10/12第2節填自然）
    var subjectFills = (fillInfo && fillInfo.subjectFills) || [];
    var blankExamSlots = [];
    EXAM_SLOT_INDEXES.forEach(function (s) {
      var hit = null;
      subjectFills.forEach(function (f) { if (f && f.slot === s) hit = f; });
      if (hit) return;
      var spec = (periodSpec && periodSpec[s]) || null;
      if (spec) blankExamSlots.push(String(spec.date).slice(5) + '第' + spec.period + '節');
    });
    if (subjectFills.length) {
      warn += '考科已自動填入：' + subjectFills.map(function (f) {
        var spec = (periodSpec && periodSpec[f.slot]) || null;
        var when = spec ? String(spec.date).slice(5) + '第' + spec.period + '節' : ('第' + (f.slot + 1) + '節');
        var who = (f.voters || []).map(function (v) { return '巡' + v.grade + v.teacher + '(' + v.subject + ')'; }).join('／');
        return when + '填' + f.subject + (who ? '（' + who + '）' : '');
      }).join('；') + '。';
    }
    if (blankExamSlots.length) {
      warn += '以下考試節考科留白請手填：' + blankExamSlots.join('、') + '。';
    }

    return {
      ok: true,
      fileName: fname,
      dayCount: range.dates.length,
      teacherCount: teacherMatrix.total,
      classCount: fillInfo.classCount,
      patrolCount: fillInfo.patrolCount,
      changedMarked: teacherMatrix.changedCount || 0,
      coverage: coverage,
      patrolStats: pstats,
      subjectFills: subjectFills,
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
