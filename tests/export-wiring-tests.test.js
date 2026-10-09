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

  // 重 payload 走 export-gates.js 按需載入（首屏減肥），仍是 ESM import()，
  // 不可退回 v1 的 window＋ensure* script 懶載（v2/index.html 沒有這些 loader）。
  const uiPrint = fs.readFileSync(path.join(modDir, 'ui-print.js'), 'utf8');
  const uiReport = fs.readFileSync(path.join(modDir, 'ui-report.js'), 'utf8');
  const uiExport = fs.readFileSync(path.join(modDir, 'ui-export.js'), 'utf8');
  const exportGates = fs.readFileSync(path.join(modDir, 'export-gates.js'), 'utf8');
  const exportLazy = fs.readFileSync(path.join(modDir, 'export-lazy.js'), 'utf8');
  const dataStoreSource = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'data.js'), 'utf8');
  assert.match(uiPrint, /from '\.\/print-helper\.js'/, 'ui-print 應靜態引入 print-helper（同步預覽路徑）');
  assert.doesNotMatch(uiPrint, /export-school-timetable/, 'ui-print 不得再靜態引入課表匯出（已遷 ui-report 按需載入）');
  assert.doesNotMatch(uiReport, /from '\.\/export-school-timetable\.js'/, 'ui-report 不得靜態引入課表匯出');
  assert.doesNotMatch(uiReport, /from '\.\/export-activity-cover\.js'/, 'ui-report 不得靜態引入 activity-cover');
  assert.doesNotMatch(uiReport, /from '\.\/export-invigilation-recovered\.js'/, 'ui-report 不得靜態引入 invigilation');
  assert.match(uiReport, /from '\.\/export-gates\.js'/, 'ui-report 應靜態引用匯出閘門');
  assert.doesNotMatch(uiExport, /from '\.\/export-accounting\.js'/, 'ui-export 不得靜態引入 accounting');
  assert.doesNotMatch(uiExport, /from '\.\/export-activity-cover\.js'/, 'ui-export 不得靜態引入 activity-cover');
  assert.doesNotMatch(uiExport, /from '\.\/export-invigilation-recovered\.js'/, 'ui-export 不得靜態引入 invigilation');
  assert.doesNotMatch(uiExport, /from '\.\/export-period8-accounting\.js'/, 'ui-export 不得靜態引入 period8');
  assert.match(uiExport, /from '\.\/export-gates\.js'/, 'ui-export 應靜態引用匯出閘門');

  // 分包契約：動態 import() 只許寫在 export-gates.js，呼叫端一律靜態引用閘門。
  // 同一檔被「動態＋靜態」混合引用時，Rollup 會警告且不會把模組切出去。
  for (const chunk of ["import('./export-activity-cover.js')", "import('./export-invigilation-recovered.js')",
      "import('./export-accounting.js')", "import('./export-period8-accounting.js')",
      "import('./export-school-timetable.js')"]) {
    assert.match(exportGates, new RegExp(chunk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'export-gates 應按需載入 ' + chunk);
  }
  assert.match(exportLazy, /from '\.\/export-gates\.js'/, 'export-lazy 應只是 export-gates 的轉接層');
  assert.doesNotMatch(exportLazy, /import\('\.\/export-/, '動態載入一律集中在 export-gates，轉接層不得再寫 import()');
  for (const [name, src] of [['ui-report', uiReport], ['ui-export', uiExport], ['stores/data', dataStoreSource]]) {
    assert.doesNotMatch(src, /import\(\s*['"][^'"]*export-(gates|lazy)/, name + ' 不得動態 import 匯出閘門（會破壞分包）');
    assert.match(src, /from '[^']*export-gates\.js'/, name + ' 應靜態引用 export-gates');
  }
  for (const [name, src] of [['ui-print', uiPrint], ['ui-report', uiReport], ['ui-export', uiExport]]) {
    assert.doesNotMatch(src, /window\.Export(ActivityCover|Invigilation|SchoolTimetable|Accounting|Period8Accounting)/, name + ' 不可再讀 window.Export*');
    assert.doesNotMatch(src, /window\.ensureExport/, name + ' 不可再依賴 window.ensureExport* loader');
    assert.doesNotMatch(src, /window\.build(PrintPreview|HistoryPrintRecords|PrintPreviewImageSvg|PrintForms)/, name + ' 不可再讀 window.build*');
    assert.doesNotMatch(src, /window\.generateFormHtml/, name + ' 不可再讀 window.generateFormHtml');
    assert.doesNotMatch(src, /window\.printSelectedForms/, name + ' 不可再讀 window.printSelectedForms');
  }

  // index.html 殼層：GSI＋字型並行載入；樣式改由 src/main.js 引入並交給 Vite 打包
  const shell = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
  assert.match(shell, /accounts\.google\.com\/gsi\/client/, '需載入 GSI 登入庫');
  assert.doesNotMatch(shell, /href="\.\/(style|mobile|onboarding-tour)\.css"/, '殼層不再直連樣式檔（改由 Vite 打包）');
  assert.match(shell, /rel="preconnect"[^>]*fonts\.googleapis\.com/, '字型來源需 preconnect');
  assert.match(shell, /rel="stylesheet"[^>]*fonts\.googleapis\.com\/css2\?/, '字型改由 link 並行載入，不可寫在 CSS 內');
  const mainSource = fs.readFileSync(path.join(here, '..', 'src', 'main.js'), 'utf8');
  assert.match(mainSource, /import '\.\/styles\/style\.css'/, 'main.js 應載入 style.css');
  assert.match(mainSource, /import '\.\/styles\/mobile\.css'/, 'main.js 應載入 mobile.css');
  const styleSource = fs.readFileSync(path.join(here, '..', 'src', 'styles', 'style.css'), 'utf8');
  assert.doesNotMatch(styleSource, /^\s*@import/m, '樣式檔不得再用 @import 造成串行請求');
  assert.doesNotMatch(shell, /cdn\.jsdelivr\.net/, '殼層不應再載入 CDN（改 npm＋懶載）');
  const vendorSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'vendor-libs.js'), 'utf8');
  assert.match(vendorSource, /import\('exceljs'\)/, 'ExcelJS 應動態引入');
  assert.match(vendorSource, /import\('jszip'\)/, 'JSZip 應動態引入');
  assert.doesNotMatch(vendorSource, /import\('xlsx'\)/, 'XLSX 已移除（SheetJS HIGH 漏洞無修補版，改走 ExcelJS）');
  assert.doesNotMatch(vendorSource, /ensureXlsx/, 'ensureXlsx 應一併移除');

  console.log('export wiring tests PASS');
});
