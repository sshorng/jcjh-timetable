import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExportInvigilationClass } from '../src/modules/export-invigilation-class.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('invigilation class export（班級版反轉）', () => {
  assert.equal(typeof ExportInvigilationClass.exportWorkbook, 'function');
  assert.equal(typeof ExportInvigilationClass.buildClassMatrix, 'function');
  assert.equal(ExportInvigilationClass.TEMPLATE_URL, 'templates/invigilation-class-template.xlsx');

  // 日期格式：115年10月12(一)一段
  assert.equal(ExportInvigilationClass.formatClassDayHeader('2026-10-12', '一段'), '115年10月12(一)一段');
  assert.equal(ExportInvigilationClass.formatClassDayHeader('2026-10-13', '一段'), '115年10月13(二)一段');
  assert.equal(ExportInvigilationClass.suffixFromTitle('臺北市立建成國民中學115學年度第一學期第一次段考監考表'), '一段');
  assert.equal(ExportInvigilationClass.suffixFromTitle('第二次段考監考表'), '二段');

  // 反轉：教師->班級
  const teacherMatrix = {
    left: [
      { name: '甲師', email: 'a@x', slots: [{ text: '701', changed: false }, { text: '巡堂', changed: false }, { text: '', changed: false }] },
      { name: '乙師', email: 'b@x', slots: [{ text: '702', changed: true }, { text: '701', changed: false }, { text: '巡堂', changed: false }] }
    ],
    right: []
  };
  // slot1 為考試節（index 1），slot0/2 為自習
  const periodSpec = [{ date: '2026-10-12', period: 1 }, { date: '2026-10-12', period: 2 }, { date: '2026-10-12', period: 3 }];
  const cm = ExportInvigilationClass.buildClassMatrix(teacherMatrix, periodSpec, ['701', '702']);
  assert.deepEqual(cm.classes, ['701', '702']);
  // 701 在 slot0 由甲師、slot1 由乙師
  assert.equal(cm.rows[0].cells[0].text, '甲師');
  assert.equal(cm.rows[0].cells[1].text, '乙師');
  assert.equal(cm.rows[1].cells[0].text, '乙師');
  assert.equal(cm.rows[1].cells[0].changed, true);
  // 巡堂：slot1（考試節）有甲師巡堂 → 無分級時沿用舊順序進分級列首位
  assert.equal(cm.patrolRows.length, 3);
  assert.deepEqual(cm.patrolRows.map(function (r) { return r.grade; }), ['七', '八', '九']);
  assert.equal(cm.patrolRows[0].cells[1].text, '甲師');
  assert.equal(cm.patrolRows[0].cells[0].text, '');
  assert.equal(cm.patrolRows[0].cells[2].text, '');
  assert.equal(cm.patrolStats.fallbackSlots, 1);
  assert.equal(cm.patrolStats.gradedSlots, 0);

  // 範本檔存在且已清空（教師格為空，班級列保留，考科列為自習預設）
  const tplPath = path.join(here, '..', 'public', 'templates', 'invigilation-class-template.xlsx');
  assert.ok(fs.existsSync(tplPath), '班級版範本應存在：' + tplPath);
  assert.ok(fs.statSync(tplPath).size > 4000, '範本大小異常');

  console.log('invigilation class export tests PASS');
});

test('invigilation class export（巡堂分級歸位）', () => {
  function slots11(text) {
    // 11 節中只有 index1（C欄）為考試節有值，其餘空白
    return Array.from({ length: 11 }, (_, i) => ({ text: i === 1 ? text : '', changed: i === 1 && !!text }));
  }
  const graded = {
    left: [
      { name: '七師', email: 'a@x', slots: slots11('巡七') },
      { name: '八師', email: 'b@x', slots: slots11('段考巡八') },
      { name: '九師', email: 'c@x', slots: slots11('巡堂(九)') },
      { name: '普師', email: 'd@x', slots: slots11('巡堂') }
    ],
    right: []
  };
  const spec11 = Array.from({ length: 11 }, (_, i) => ({ date: '2026-10-12', period: i + 1 }));
  const gm = ExportInvigilationClass.buildClassMatrix(graded, spec11, ['701']);
  assert.equal(gm.patrolStats.gradedSlots, 1);
  assert.equal(gm.patrolStats.overflowCells, 1);
  assert.equal(gm.patrolRows[0].grade, '七');
  assert.equal(gm.patrolRows[0].cells[1].text, '七師');
  assert.equal(gm.patrolRows[0].cells[1].changed, true);
  assert.equal(gm.patrolRows[0].cells[0].text, '', '自習節巡堂不收集');
  assert.equal(gm.patrolRows[1].cells[1].text, '八師');
  assert.equal(gm.patrolRows[2].cells[1].text, '九師');
  assert.equal(gm.patrolRows[3].grade, null);
  assert.equal(gm.patrolRows[3].cells[1].text, '普師');

  // 分級列對位模板標籤：巡七列應為七師（C欄＝index1）
  const cells = new Map();
  function getCell(r, c) {
    const k = r + ':' + c;
    if (!cells.has(k)) cells.set(k, { value: null, font: null });
    return cells.get(k);
  }
  ExportInvigilationClass.fillClassValues({ getCell, rowCount: 40 }, {
    classMatrix: { classes: ['701'], rows: [{ className: '701', cells: spec11.map(() => ({ text: '', changed: false })) }], patrolRows: gm.patrolRows },
    dates: ['2026-10-12', '2026-10-13'],
    suffix: '一段',
    layout: { templateClasses: ['701'], templatePatrols: ['巡七', '巡八', '巡九'], templateDataEnd: 27 }
  });
  assert.equal(getCell(4, 1).value, '巡七');
  assert.equal(getCell(4, 3).value, '七師');
  assert.equal(getCell(5, 1).value, '巡八');
  assert.equal(getCell(5, 3).value, '八師');
  assert.equal(getCell(6, 1).value, '巡九');
  assert.equal(getCell(6, 3).value, '九師');
  assert.equal(getCell(7, 1).value, '巡備1');
  assert.equal(getCell(7, 3).value, '普師');

  console.log('invigilation class patrol grade tests PASS');
});
test('invigilation class export（非法字元過濾＋乾淨字型）', () => {
  const cells = new Map();
  function getCell(r, c) {
    const k = r + ':' + c;
    if (!cells.has(k)) cells.set(k, { value: null, font: null });
    return cells.get(k);
  }
  const ws = { getCell, rowCount: 40 };
  const classMatrix = {
    classes: ['701'],
    rows: [{ className: '701', cells: Array.from({ length: 11 }, (_, i) => ({ text: i === 0 ? '王\x0b小明\x07' : '李大華', changed: i === 1 })) }],
    patrolRows: [],
    patrolMax: 0
  };
  ExportInvigilationClass.fillClassValues(ws, {
    classMatrix,
    dates: ['2026-10-12', '2026-10-13'],
    suffix: '一段',
    layout: { templateClasses: ['701'], templatePatrols: ['巡七', '巡八', '巡九'], templateDataEnd: 27 }
  });
  assert.equal(getCell(1, 2).value, '115年10月12(一)一段');
  assert.equal(getCell(3, 1).value, '701');
  assert.equal(getCell(3, 2).value, '王小明', '控制字元應被清除');
  assert.equal(getCell(3, 3).value, '李大華');
  assert.equal(getCell(3, 2).font.name, '標楷體');
  assert.equal(getCell(3, 2).font.size, 40);
  assert.equal(getCell(3, 2).font.bold, false);
  assert.equal(getCell(3, 3).font.bold, true);
  assert.equal(getCell(3, 3).font.underline, 'single');
  assert.equal(getCell(3, 2).style, undefined, '不得整包覆寫 style');
  console.log('invigilation class sanitize tests PASS');
});
