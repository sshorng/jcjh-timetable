/*
 * 第八節鐘點費核銷清冊匯出
 *
 * 以 templates/period8-accounting-template.xlsx 為版型，
 * 每位有實際支用的教師一列、每個有實際支用的日期一欄，保留原有簽核區。
 */
(function (root) {
  'use strict';

  var TEMPLATE_URL = 'templates/period8-accounting-template.xlsx';
  var templateBufferPromise = null;
  var FEE_8TH = 600;
  var DATA_START_ROW = 4;
  var TEMPLATE_TOTAL_ROW = 36;
  var DATE_START_COL = 3;
  var TEMPLATE_DATE_COUNT = 14;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeDate(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0')
        + '-' + String(value.getDate()).padStart(2, '0');
    }
    var raw = String(value == null ? '' : value).trim().split(/[T ]/)[0].replace(/\//g, '-');
    var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return '';
    return match[1] + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[3]).padStart(2, '0');
  }

  function dateObject(dateStr) {
    var parts = String(dateStr || '').split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function listWeekdays(opts) {
    var billing = root.DomainBilling;
    if (billing && typeof billing.listWeekdaysInRange === 'function') {
      return billing.listWeekdaysInRange(opts.reportStartDate, opts.reportEndDate);
    }
    var start = normalizeDate(opts.reportStartDate);
    var end = normalizeDate(opts.reportEndDate);
    if (!start || !end || start > end) return [];
    var current = dateObject(start);
    var last = dateObject(end);
    var dates = [];
    while (current <= last) {
      var day = current.getDay();
      if (day >= 1 && day <= 5) {
        dates.push(normalizeDate(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function personKey(email, name) {
    var emailKey = String(email || '').trim().toLowerCase();
    if (emailKey) return 'e:' + emailKey;
    return 'n:' + String(name || '').trim().toLowerCase();
  }

  function teacherEmail(teacher) {
    return String(teacher && (teacher.email || teacher.loginEmail || teacher.teacherEmail) || '').trim();
  }

  function teacherName(teacher) {
    return String(teacher && (teacher.name || teacher.teacherName || teacher['教師姓名']) || '').trim();
  }

  function teacherTitle(teacher) {
    return String(teacher && (
      teacher.jobTitle || teacher.title || teacher['職稱'] || teacher['職務'] || teacher.teacherTitle
    ) || '').trim() || '教師';
  }

  function buildExportData(opts) {
    opts = opts || {};
    var dates = (Array.isArray(opts.dates) ? opts.dates : listWeekdays(opts))
      .map(normalizeDate).filter(Boolean);
    var billing = root.DomainBilling;
    var payout = billing && typeof billing.buildPeriod8Payout === 'function'
      ? billing.buildPeriod8Payout(opts)
      : { details: [] };
    var rowsByKey = {};
    var order = [];
    var teacherByKey = {};
    var scheduleKeys = {};
    var teachers = opts.teachers || [];
    var schedules = opts.allSchedules || [];

    teachers.forEach(function (teacher) {
      var email = teacherEmail(teacher);
      var name = teacherName(teacher);
      var key = personKey(email, name);
      if (key !== 'n:') teacherByKey[key] = teacher;
    });

    function addPerson(email, name, fallbackTeacher) {
      var cleanEmail = String(email || '').trim();
      var cleanName = String(name || '').trim();
      var key = personKey(cleanEmail, cleanName);
      if (key === 'n:') return null;
      if (!rowsByKey[key]) {
        var known = teacherByKey[key] || fallbackTeacher || {};
        rowsByKey[key] = {
          key: key,
          email: cleanEmail || teacherEmail(known),
          name: cleanName || teacherName(known) || cleanEmail,
          jobTitle: teacherTitle(known),
          counts: {},
          totalCount: 0,
          details: []
        };
        order.push(key);
      } else if (cleanName && !rowsByKey[key].name) {
        rowsByKey[key].name = cleanName;
      }
      return rowsByKey[key];
    }

    schedules.forEach(function (schedule) {
      if (!schedule || parseInt(schedule.period, 10) !== 8
          || schedule.isPatrol === true
          || String(schedule.attr || schedule['課堂屬性'] || '').trim().indexOf('巡堂') >= 0
          || String(schedule.className || schedule['班級'] || '').trim() === '巡堂'
          || String(schedule.subject || schedule['科目'] || '').trim() === '巡堂') return;
      var email = String(schedule.teacherEmail || schedule['教師Email'] || '').trim();
      var name = String(schedule.teacherName || schedule['教師姓名'] || '').trim();
      if (!email && !name) return;
      var row = addPerson(email, name);
      if (row) scheduleKeys[row.key] = true;
    });

    (payout.details || []).forEach(function (detail) {
      if (!detail || Number(detail.fee) <= 0) return;
      var email = String(detail.actualEmail || '').trim();
      var name = String(detail.actualName || '').trim();
      var row = addPerson(email, name);
      if (!row) return;
      var date = normalizeDate(detail.date);
      if (!date || dates.indexOf(date) < 0) return;
      row.counts[date] = (row.counts[date] || 0) + 1;
      row.details.push(detail);
    });

    var teacherOrder = {};
    teachers.forEach(function (teacher, index) {
      var key = personKey(teacherEmail(teacher), teacherName(teacher));
      if (scheduleKeys[key]) teacherOrder[key] = index;
    });
    order.sort(function (left, right) {
      var leftIndex = teacherOrder[left] === undefined ? Number.MAX_SAFE_INTEGER : teacherOrder[left];
      var rightIndex = teacherOrder[right] === undefined ? Number.MAX_SAFE_INTEGER : teacherOrder[right];
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      return String(rowsByKey[left].name || '').localeCompare(String(rowsByKey[right].name || ''), 'zh-Hant');
    });

    var rows = order.map(function (key) {
      var row = rowsByKey[key];
      row.totalCount = dates.reduce(function (sum, date) { return sum + (Number(row.counts[date]) || 0); }, 0);
      row.amount = row.totalCount * FEE_8TH;
      return row;
    });
    dates = dates.filter(function (date) {
      return rows.some(function (row) { return (Number(row.counts[date]) || 0) > 0; });
    });
    rows = rows.filter(function (row) { return row.totalCount > 0; });
    var rocMonth = String(opts.reportMonth || (dates[0] || '').slice(0, 7)).slice(0, 7).split('-');
    var year = Number(rocMonth[0]);
    var month = Number(rocMonth[1]);
    var rocYear = year > 1911 ? year - 1911 : year;
    var semesterId = String(opts.semesterId || '').trim()
      || (month >= 8 ? rocYear + '-1' : (rocYear - 1) + '-2');
    var monthLabel = String(month || '').replace(/^0/, '');
    var summary = {
      count: rows.length,
      hours: rows.reduce(function (sum, row) { return sum + row.totalCount; }, 0),
      amount: rows.reduce(function (sum, row) { return sum + row.amount; }, 0)
    };
    var warnings = [];
    if (!dates.length) warnings.push('目前結算期間沒有週一至週五日期。');
    if (!rows.length) warnings.push('目前沒有第八節課表教師。');
    return {
      dates: dates,
      rows: rows,
      summary: summary,
      warnings: warnings,
      blocking: [],
      semesterId: semesterId,
      rocYear: rocYear,
      month: month,
      title: '臺北市建成國中' + rocYear + '年' + month + '月第8節鐘點費印領清冊',
      sheetName: rocYear + '.' + monthLabel,
      fileName: '核銷-印領清冊-' + semesterId + ' 第8節鐘點費印領清冊  ' + rocYear + '.' + monthLabel + '月.xlsx'
    };
  }

  function columnLetter(number) {
    var value = Number(number);
    var result = '';
    while (value > 0) {
      var remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function setFormula(cell, expression, result) {
    cell.value = {
      formula: expression,
      result: Number.isFinite(Number(result)) ? Number(result) : 0
    };
  }

  function copyCellStyle(source, target) {
    try { target.style = clone(source.style); } catch (e) { /* ExcelJS may share immutable styles */ }
    if (source.numFmt) target.numFmt = source.numFmt;
    if (source.alignment) target.alignment = clone(source.alignment);
    if (source.border) target.border = clone(source.border);
    if (source.fill) target.fill = clone(source.fill);
    if (source.font) target.font = clone(source.font);
  }

  function copyColumnStyle(sheet, sourceColumn, targetColumn) {
    var source = sheet.getColumn(sourceColumn);
    var target = sheet.getColumn(targetColumn);
    if (source.width) target.width = source.width;
    for (var row = 1; row <= sheet.actualRowCount; row += 1) {
      copyCellStyle(sheet.getCell(row, sourceColumn), sheet.getCell(row, targetColumn));
    }
  }

  function adaptDateColumns(sheet, dateCount) {
    var originalTitleMerge = 'A1:Q1';
    try { sheet.unMergeCells(originalTitleMerge); } catch (e) { /* already unmerged */ }
    var delta = dateCount - TEMPLATE_DATE_COUNT;
    if (delta > 0) {
      var inserts = [];
      for (var i = 0; i < delta; i += 1) inserts.push([]);
      sheet.spliceColumns.apply(sheet, [DATE_START_COL + TEMPLATE_DATE_COUNT, 0].concat(inserts));
      for (var added = 0; added < delta; added += 1) {
        copyColumnStyle(sheet, DATE_START_COL + (added % 5), DATE_START_COL + TEMPLATE_DATE_COUNT + added);
      }
    } else if (delta < 0) {
      sheet.spliceColumns(DATE_START_COL + dateCount, -delta);
    }
    var totalColumn = DATE_START_COL + dateCount;
    try { sheet.mergeCells(1, 1, 1, totalColumn); } catch (eMerge) { /* ignore duplicate merge */ }
    return {
      totalColumn: totalColumn,
      rateColumn: totalColumn + 1,
      amountColumn: totalColumn + 2,
      noteColumn: totalColumn + 3
    };
  }

  function copyRowStyle(sheet, sourceRow, targetRow, lastColumn) {
    var source = sheet.getRow(sourceRow);
    var target = sheet.getRow(targetRow);
    if (source.height) target.height = source.height;
    for (var col = 1; col <= lastColumn; col += 1) {
      copyCellStyle(source.getCell(col), target.getCell(col));
    }
  }

  function clearRow(sheet, rowNumber, lastColumn) {
    for (var col = 1; col <= lastColumn; col += 1) sheet.getCell(rowNumber, col).value = null;
  }

  function applyNoteColumnFit(sheet, noteColumn, startRow, endRow) {
    for (var row = startRow; row <= endRow; row += 1) {
      var cell = sheet.getCell(row, noteColumn);
      var alignment = cell.alignment ? clone(cell.alignment) : {};
      alignment.wrapText = true;
      alignment.shrinkToFit = false;
      cell.alignment = alignment;
      var font = cell.font ? clone(cell.font) : {};
      var fontSize = Number(font.size);
      font.size = Number.isFinite(fontSize) ? Math.max(fontSize, 12) : 12;
      cell.font = font;
    }
  }

  function prepareRows(sheet, rowCount, lastColumn) {
    var totalRow = TEMPLATE_TOTAL_ROW;
    var capacity = totalRow - DATA_START_ROW;
    if (rowCount > capacity) {
      var extra = rowCount - capacity;
      var blanks = [];
      for (var i = 0; i < extra; i += 1) blanks.push([]);
      sheet.insertRows(totalRow, blanks, 'i');
      for (var j = 0; j < extra; j += 1) copyRowStyle(sheet, totalRow - 1, totalRow + j, lastColumn);
      totalRow += extra;
    }
    for (var row = DATA_START_ROW; row < totalRow; row += 1) clearRow(sheet, row, lastColumn);
    clearRow(sheet, totalRow, lastColumn);
    return totalRow;
  }

  function writeWorkbook(workbook, opts, data) {
    var sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('第八節核銷範本缺少工作表。');
    var columns = adaptDateColumns(sheet, data.dates.length);
    var lastColumn = columns.noteColumn;
    var totalRow = prepareRows(sheet, data.rows.length, lastColumn);
    var firstDateColumn = DATE_START_COL;
    var lastDateColumn = DATE_START_COL + data.dates.length - 1;

    sheet.name = data.sheetName.slice(0, 31);
    sheet.getCell(1, 1).value = data.title;
    sheet.getCell(2, 2).value = '日期';
    sheet.getCell(3, 2).value = '星期';
    data.dates.forEach(function (date, index) {
      var col = firstDateColumn + index;
      sheet.getCell(2, col).value = dateObject(date);
      sheet.getCell(3, col).value = ['日', '星期一', '星期二', '星期三', '星期四', '星期五', '六'][dateObject(date).getDay()];
    });
    sheet.getCell(2, columns.totalColumn).value = '總計';
    sheet.getCell(3, columns.totalColumn).value = null;
    sheet.getCell(2, columns.rateColumn).value = '鐘點費';
    sheet.getCell(2, columns.amountColumn).value = '合計金額';
    sheet.getCell(2, columns.noteColumn).value = '備註';

    data.rows.forEach(function (row, index) {
      var rowNumber = DATA_START_ROW + index;
      sheet.getCell(rowNumber, 1).value = row.jobTitle;
      sheet.getCell(rowNumber, 2).value = row.name;
      data.dates.forEach(function (date, dateIndex) {
        sheet.getCell(rowNumber, firstDateColumn + dateIndex).value = Number(row.counts[date]) || 0;
      });
      if (data.dates.length) {
        setFormula(sheet.getCell(rowNumber, columns.totalColumn),
          'SUM(' + columnLetter(firstDateColumn) + rowNumber + ':' + columnLetter(lastDateColumn) + rowNumber + ')',
          row.totalCount);
      } else {
        sheet.getCell(rowNumber, columns.totalColumn).value = 0;
      }
      sheet.getCell(rowNumber, columns.rateColumn).value = FEE_8TH;
      setFormula(sheet.getCell(rowNumber, columns.amountColumn),
        columnLetter(columns.totalColumn) + rowNumber + '*' + columnLetter(columns.rateColumn) + rowNumber,
        row.amount);
      sheet.getCell(rowNumber, columns.noteColumn).value = '';
    });

    for (var col = firstDateColumn; col <= lastDateColumn; col += 1) {
      var dateTotal = data.rows.reduce(function (sum, row) {
        return sum + (Number(row.counts[data.dates[col - firstDateColumn]]) || 0);
      }, 0);
      setFormula(sheet.getCell(totalRow, col),
        'SUM(' + columnLetter(col) + DATA_START_ROW + ':' + columnLetter(col) + (totalRow - 1) + ')',
        dateTotal);
    }
    if (data.dates.length) {
      setFormula(sheet.getCell(totalRow, columns.totalColumn),
        'SUM(' + columnLetter(firstDateColumn) + totalRow + ':' + columnLetter(lastDateColumn) + totalRow + ')',
        data.summary.hours);
    } else {
      sheet.getCell(totalRow, columns.totalColumn).value = 0;
    }
    sheet.getCell(totalRow, columns.rateColumn).value = FEE_8TH;
    setFormula(sheet.getCell(totalRow, columns.amountColumn),
      'SUM(' + columnLetter(columns.amountColumn) + DATA_START_ROW + ':'
        + columnLetter(columns.amountColumn) + (totalRow - 1) + ')',
      data.summary.amount);
    sheet.getCell(totalRow, columns.noteColumn).value = '';
    applyNoteColumnFit(sheet, columns.noteColumn, DATA_START_ROW, totalRow);
    if (workbook.calcProperties) {
      workbook.calcProperties.fullCalcOnLoad = true;
      workbook.calcProperties.forceFullCalc = true;
      workbook.calcProperties.calcMode = 'auto';
    }
  }

  async function loadTemplateBuffer() {
    if (!templateBufferPromise) {
      templateBufferPromise = root.fetch(TEMPLATE_URL + '?t=' + Date.now(), { cache: 'no-cache' })
        .then(function (response) {
          if (!response.ok) throw new Error('無法載入第八節核銷範本（HTTP ' + response.status + '）。');
          return response.arrayBuffer();
        })
        .catch(function (error) {
          templateBufferPromise = null;
          throw error;
        });
    }
    var buffer = await templateBufferPromise;
    return buffer && buffer.slice ? buffer.slice(0) : buffer;
  }

  async function exportWorkbook(opts) {
    opts = opts || {};
    var data = opts.preparedData || buildExportData(opts);
    if (data.blocking && data.blocking.length) throw new Error(data.blocking.join('\n'));
    var ExcelJSLib = opts.ExcelJS || root.ExcelJS || (typeof ExcelJS !== 'undefined' ? ExcelJS : null);
    if (!ExcelJSLib) throw new Error('ExcelJS 未載入。');
    var buffer = opts.templateBuffer || await loadTemplateBuffer();
    var workbook = new ExcelJSLib.Workbook();
    await workbook.xlsx.load(buffer.slice ? buffer.slice(0) : buffer);
    writeWorkbook(workbook, opts, data);
    return {
      buffer: await workbook.xlsx.writeBuffer(),
      fileName: data.fileName,
      summary: data.summary,
      warnings: data.warnings,
      blocking: data.blocking,
      dates: data.dates
    };
  }

  root.ExportPeriod8Accounting = {
    TEMPLATE_URL: TEMPLATE_URL,
    FEE_8TH: FEE_8TH,
    buildExportData: buildExportData,
    exportWorkbook: exportWorkbook
  };
})(window);
