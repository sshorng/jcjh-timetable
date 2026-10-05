import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExportActivityCover } from '../src/modules/export-activity-cover.js';
import { ExportInvigilation } from '../src/modules/export-invigilation-recovered.js';
import { ExportSchoolTimetable } from '../src/modules/export-school-timetable.js';
import {
  generateFormHtml,
  printSelectedForms,
  buildPrintPreview,
  buildPrintPreviewImageSvg,
  buildHistoryPrintRecords
} from '../src/modules/print-helper.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.join(here, '..', 'src', 'modules');

test('export wiring（v2 接線迴歸）', () => {
  // 曾經是 bundle 孤兒（無人 import）：匯出子系統在瀏覽器根本跑不起來。
  // 此測試鎖定靜態接線，避免重蹈覆轍。
  assert.equal(typeof ExportActivityCover.exportWord, 'function', '輪值通知單 exportWord 應可達');
  assert.equal(typeof ExportActivityCover.gradesFromClasses, 'function', 'gradesFromClasses 應可達');
  assert.equal(typeof ExportInvigilation.exportWorkbook, 'function', '監考表 exportWorkbook 應可達');
  assert.equal(typeof ExportSchoolTimetable.exportWord, 'function', '課表 exportWord 應可達');
  assert.equal(typeof ExportSchoolTimetable.thisWeekRange, 'function', 'thisWeekRange 應可達');
  for (const fn of [generateFormHtml, printSelectedForms, buildPrintPreview, buildPrintPreviewImageSvg, buildHistoryPrintRecords]) {
    assert.equal(typeof fn, 'function', 'print-helper 應匯出可用函式');
  }

  // 呼叫端必須走靜態 import，不可再依賴 v1 的 window＋ensure* script 懶載
  //（v2/index.html 沒有這些 loader）。
  const uiPrint = fs.readFileSync(path.join(modDir, 'ui-print.js'), 'utf8');
  const uiReport = fs.readFileSync(path.join(modDir, 'ui-report.js'), 'utf8');
  const uiExport = fs.readFileSync(path.join(modDir, 'ui-export.js'), 'utf8');
  assert.match(uiPrint, /from '\.\/print-helper\.js'/, 'ui-print 應靜態引入 print-helper');
  assert.match(uiPrint, /from '\.\/export-school-timetable\.js'/, 'ui-print 應靜態引入 export-school-timetable');
  assert.match(uiReport, /from '\.\/export-school-timetable\.js'/, 'ui-report 應靜態引入 export-school-timetable');
  assert.match(uiReport, /from '\.\/export-activity-cover\.js'/, 'ui-report 應靜態引入 export-activity-cover');
  assert.match(uiReport, /from '\.\/export-invigilation-recovered\.js'/, 'ui-report 應靜態引入 export-invigilation');
  assert.match(uiExport, /from '\.\/export-activity-cover\.js'/, 'ui-export 應靜態引入 export-activity-cover');
  assert.match(uiExport, /from '\.\/export-invigilation-recovered\.js'/, 'ui-export 應靜態引入 export-invigilation');
  for (const [name, src] of [['ui-print', uiPrint], ['ui-report', uiReport], ['ui-export', uiExport]]) {
    assert.doesNotMatch(src, /window\.Export(ActivityCover|Invigilation|SchoolTimetable|Accounting|Period8Accounting)/, name + ' 不可再讀 window.Export*');
    assert.doesNotMatch(src, /window\.ensureExport/, name + ' 不可再依賴 window.ensureExport* loader');
    assert.doesNotMatch(src, /window\.build(PrintPreview|HistoryPrintRecords|PrintPreviewImageSvg|PrintForms)/, name + ' 不可再讀 window.build*');
    assert.doesNotMatch(src, /window\.generateFormHtml/, name + ' 不可再讀 window.generateFormHtml');
    assert.doesNotMatch(src, /window\.printSelectedForms/, name + ' 不可再讀 window.printSelectedForms');
  }

  // index.html 殼層：GSI＋CSS＋第三方庫 CDN（版本與 v1 一致）
  const shell = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  assert.match(shell, /accounts\.google\.com\/gsi\/client/, '需載入 GSI 登入庫');
  assert.match(shell, /href="\.\/style\.css"/, '需載入 style.css');
  assert.match(shell, /href="\.\/mobile\.css"/, '需載入 mobile.css');
  assert.match(shell, /exceljs@4\.4\.0/, '需載入 ExcelJS CDN');
  assert.match(shell, /jszip@3\.10\.1/, '需載入 JSZip CDN');
  assert.match(shell, /xlsx@0\.18\.5/, '需載入 XLSX CDN');

  console.log('export wiring tests PASS');
});
