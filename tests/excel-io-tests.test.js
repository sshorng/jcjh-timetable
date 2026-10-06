import assert from 'node:assert/strict';
import { test } from 'vitest';
import ExcelJS from 'exceljs';
import { readFirstSheetRows, excelSerialToDate } from '../src/modules/excel-io.js';

test('excel-io：序列轉日期（取代舊 SSF.parse_date_code）', () => {
  const d = excelSerialToDate(44927);
  assert.ok(d instanceof Date);
  assert.equal(d.getUTCFullYear(), 2023);
  assert.equal(d.getUTCMonth(), 0);
  assert.equal(d.getUTCDate(), 1);
  assert.equal(excelSerialToDate(0), null);
  assert.equal(excelSerialToDate(-5), null);
  assert.equal(excelSerialToDate('text'), null);
});

test('excel-io：讀取往返（首列欄位名、缺值補空、全空列略過）', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('s1');
  ws.addRow(['教師姓名', '星期', '節次']);
  ws.addRow(['王小明', 1, 2]);
  ws.addRow(['李美華', 3, null]);
  ws.addRow([null, null, null]);
  const buf = await wb.xlsx.writeBuffer();
  const rows = await readFirstSheetRows(buf);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { '教師姓名': '王小明', '星期': 1, '節次': 2 });
  assert.deepEqual(rows[1], { '教師姓名': '李美華', '星期': 3, '節次': '' });
});

test('excel-io：日期格以 Date 物件回傳（下游 normalizeScheduleDateImport 吃 Date）', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('s1');
  ws.addRow(['啟用起日']);
  ws.addRow([new Date(Date.UTC(2026, 8, 1))]);
  const buf = await wb.xlsx.writeBuffer();
  const rows = await readFirstSheetRows(buf);
  assert.equal(rows.length, 1);
  assert.ok(rows[0]['啟用起日'] instanceof Date);
  console.log('excel-io tests PASS');
});
