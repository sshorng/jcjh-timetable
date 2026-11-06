import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import ExportAccounting from '../src/modules/export-accounting.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(here, '..', 'public', 'templates', 'accounting-template.xlsx');
const period = { start: '2026-07-01', end: '2026-07-31' };

// 職稱欄可能出現「教支人員-臺灣台語」，預設 12 級會在窄欄折行，匯出時固定縮到 10 級。
test('會計匯出的職稱欄字級為 10', async () => {
  const out = await ExportAccounting.exportWorkbook({
    reportMonth: '2026-07',
    reportWeeksCount: 1,
    periods: { overtime: period, adjunct: period },
    ExcelJS,
    templateBuffer: fs.readFileSync(templatePath),
    teachers: [
      { email: 'support-b@x', name: '教支乙', subject: '本土語', jobTitle: '教支人員-臺灣台語', baseHours: 0, expensePlan: '本土語' },
      { email: 'support-a@x', name: '教支甲', subject: '本土語', jobTitle: '教支人員-臺灣台語', baseHours: 0, expensePlan: '本土語' },
      { email: 'adjunct@x', name: '一般兼課', jobTitle: '兼課教師', baseHours: 0, expensePlan: '計畫A' }
    ],
    allSchedules: [
      { teacherEmail: 'support-b@x', teacherName: '教支乙', dayOfWeek: 2, period: 1, className: '701', attr: '一般', specialTags: '超鐘點' },
      { teacherEmail: 'support-a@x', teacherName: '教支甲', dayOfWeek: 3, period: 1, className: '801', attr: '一般', specialTags: '超鐘點' }
    ],
    substitutionRecords: [],
    monthlyReportRows: [
      { email: 'support-b@x', name: '教支乙', expensePlan: '本土語', weeklyOvertime: 2, scheduledOvertime: 2, expensePlanAllocations: [{ source: '本土語', rawHours: 2, weeklyHours: 2, grossHours: 2, deduction: 0, actualHours: 2 }] },
      { email: 'support-a@x', name: '教支甲', expensePlan: '本土語', weeklyOvertime: 1, scheduledOvertime: 1, expensePlanAllocations: [{ source: '本土語', rawHours: 1, weeklyHours: 1, grossHours: 1, deduction: 0, actualHours: 1 }] },
      { email: 'adjunct@x', name: '一般兼課', expensePlan: '計畫A', weeklyOvertime: 1, scheduledOvertime: 1, expensePlanAllocations: [{ source: '計畫A', rawHours: 1, weeklyHours: 1, grossHours: 1, deduction: 0, actualHours: 1 }] }
    ]
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(out.buffer);

  const checkedCells = [];
  workbook.eachSheet((sheet) => {
    if (String(sheet.getCell(2, 2).value || '').trim() !== '職稱') return;
    for (let row = 3; row <= sheet.rowCount; row += 1) {
      const cell = sheet.getCell(row, 2);
      const value = String(cell.value == null ? '' : cell.value).trim();
      // 只檢查真正的教師職稱；「合計」「製表人」這類版面標籤不在此列。
      if (!/教支|兼課/.test(value)) continue;
      checkedCells.push({ sheet: sheet.name, row, value, size: Number(cell.font && cell.font.size), fontName: cell.font && cell.font.name });
    }
  });

  assert.ok(checkedCells.length >= 3, '應檢查到教支與兼課的職稱儲存格');
  checkedCells.forEach((item) => {
    assert.equal(item.size, 10, `「${item.sheet}」第 ${item.row} 列職稱「${item.value}」應為 10 級字`);
    assert.equal(item.fontName, '標楷體', `「${item.sheet}」第 ${item.row} 列職稱應保留範本字體`);
  });

  const teachingSupportSheet = workbook.worksheets.find(sheet => /教支人員/.test(String(sheet.name || '')));
  assert.ok(teachingSupportSheet, '應產出教支人員分表');
  assert.equal(String(teachingSupportSheet.getCell(3, 2).value || '').trim(), '教支人員-臺灣台語',
    '教支分表的職稱應原樣保留語言別');
});
