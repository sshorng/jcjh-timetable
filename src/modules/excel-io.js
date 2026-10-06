/**
 * excel-io.js — .xlsx 讀寫共用層（ExcelJS 唯一出入口）。
 *
 * 背景：xlsx（SheetJS 0.18.5）有 HIGH 等級原型污染＋ReDoS 且上游無修補版，
 * 讀寫統一遷至已依賴的 ExcelJS；vendor-libs.js 不再提供 XLSX。
 */
import { ensureExcelJS } from './vendor-libs.js';

/** ExcelJS cell 值正規化為純值（對齊舊 XLSX sheet_to_json 語意） */
function plainCellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if ('result' in value) return plainCellValue(value.result);
  if (Array.isArray(value.richText)) return value.richText.map(function (p) { return (p && p.text) || ''; }).join('');
  if (typeof value.text === 'string') {
    if (value.hyperlink) return value.text;
    return value.text;
  }
  return '';
}

/** Excel 1900 日期序列轉 Date（UTC，避免時區漂移；取代舊 XLSX.SSF.parse_date_code） */
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || !isFinite(serial) || serial <= 0 || serial > 2958465) return null;
  var ms = Math.round((serial - 25569) * 86400 * 1000);
  var d = new Date(ms);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 讀上傳檔第一個工作表 → 物件陣列（首列為欄位名、缺值補 ''、全空列略過）。
 * @param {ArrayBuffer} buffer 檔案內容
 */
async function readFirstSheetRows(buffer) {
  var ExcelJS = await ensureExcelJS();
  var workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  var sheet = workbook.worksheets[0];
  if (!sheet) return [];
  var headers = [];
  var rows = [];
  sheet.eachRow({ includeEmpty: false }, function (row, rowNumber) {
    var values = [];
    var width = Math.max(row.cellCount, headers.length);
    for (var c = 1; c <= width; c++) values.push(plainCellValue(row.getCell(c).value));
    if (rowNumber === 1) {
      headers = values.map(function (v) { return String(v === '' ? '' : v); });
      return;
    }
    var isEmpty = values.every(function (v) { return v === '' || v === null || v === undefined; });
    if (isEmpty) return;
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = (i < values.length && values[i] !== undefined) ? values[i] : ''; });
    rows.push(obj);
  });
  return rows;
}

/** 觸發瀏覽器下載（blob＋a.click，沿用既有匯出寫法） */
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  try {
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
}

/**
 * 物件陣列 → 多工作表 .xlsx 下載（欄位順序取首列鍵序）。
 * @param {Array<{name:string, rows:Object[]}>} sheets
 * @param {string} filename
 */
async function downloadJsonSheets(sheets, filename) {
  var ExcelJS = await ensureExcelJS();
  var workbook = new ExcelJS.Workbook();
  (sheets || []).forEach(function (sheet) {
    var ws = workbook.addWorksheet(String(sheet.name || 'Sheet1').slice(0, 31));
    var rows = sheet.rows || [];
    if (!rows.length) return;
    var keys = Object.keys(rows[0]);
    ws.columns = keys.map(function (k) { return { header: k, key: k }; });
    rows.forEach(function (r) {
      var out = {};
      keys.forEach(function (k) { out[k] = (r[k] === undefined || r[k] === null) ? '' : r[k]; });
      ws.addRow(out);
    });
  });
  var buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }), filename);
}

export { readFirstSheetRows, downloadJsonSheets, plainCellValue, excelSerialToDate };
