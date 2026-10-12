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
  // 巡堂：slot1（考試節）有甲師巡堂 → patrolRows[0] slot1 = 甲師；自習節留白
  assert.equal(cm.patrolRows.length, 1);
  assert.equal(cm.patrolRows[0].cells[1].text, '甲師');
  assert.equal(cm.patrolRows[0].cells[0].text, '');
  assert.equal(cm.patrolRows[0].cells[2].text, '');

  // 範本檔存在且已清空（教師格為空，班級列保留，考科列為自習預設）
  const tplPath = path.join(here, '..', 'public', 'templates', 'invigilation-class-template.xlsx');
  assert.ok(fs.existsSync(tplPath), '班級版範本應存在：' + tplPath);
  assert.ok(fs.statSync(tplPath).size > 4000, '範本大小異常');

  console.log('invigilation class export tests PASS');
});
