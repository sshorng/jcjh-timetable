import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ExportInvigilation } from '../src/modules/export-invigilation-recovered.js';
import { ExportInvigilationClass } from '../src/modules/export-invigilation-class.js';

// 特教老師契約：
// 1. 整列都是「特教監考」（沒課、特教班、巡堂都算在裡面）。
// 2. 只有他在普通班的課要單獨標出班名，那幾格不併入「特教監考」。
// 3. 純特教（課表上沒有普通班）維持原樣：整列合併成一格「特教監考」。

const D = '2026-12-02';
const D2 = '2026-12-03';
const SPEC = ExportInvigilation.buildPeriodSpec([D, D2]);
const SE_TEACHER = { name: '特教師', email: 'se@school', subject: '特教' };

function cellMap(map) {
  return (email, dateStr, period) => {
    const key = dateStr + '#' + parseInt(period, 10);
    return map[key] ? Object.assign({ teacherEmail: email }, map[key]) : null;
  };
}

function slotTexts(entry) {
  return (entry.slots || []).map(s => String((s && s.text) || ''));
}

test('特教老師兼普通班：整列特教監考，普通班那格單獨標班名', () => {
  const matrix = ExportInvigilation.buildTeacherMatrix(
    [SE_TEACHER], SPEC,
    cellMap({
      [D + '#1']: { className: '特教', subject: '特教' },
      [D + '#2']: { className: '701', subject: '數學' },
      [D + '#3']: { className: '特教', subject: '特教' }
    }),
    38, null, []
  );
  const entry = matrix.left[0];
  assert.equal(entry.specialEducation, true, '仍標記為特教老師（個人表備註用）');
  const texts = slotTexts(entry);
  assert.equal(texts[0], '特教監考', '沒課的節次也算在「特教監考」裡');
  assert.equal(texts[1], '701', '只有普通班的課要單獨標出班名');
  assert.ok(texts.slice(2).every(t => t === '特教監考'), '其餘整列都是「特教監考」');
  assert.deepEqual(entry.specialEducationRuns, [{ start: 0, end: 0 }, { start: 2, end: 10 }],
    '普通班那一格跳過不合併，其餘分段合併');
});

test('特教老師連續兩節特教班＋一節普通班：三種區段各自正確', () => {
  const matrix = ExportInvigilation.buildTeacherMatrix(
    [SE_TEACHER], SPEC,
    cellMap({
      [D + '#1']: { className: '特教', subject: '特教' },
      [D + '#2']: { className: '特教', subject: '特教' },
      [D + '#3']: { className: '702', subject: '國文' }
    }),
    38, null, []
  );
  const entry = matrix.left[0];
  assert.deepEqual(entry.specialEducationRuns, [{ start: 0, end: 1 }, { start: 3, end: 10 }]);
  assert.equal(slotTexts(entry)[2], '702', '普通班那一節不併入特教監考');
  assert.equal(slotTexts(entry)[9], '特教監考', '後段沒課的節次仍算特教監考');
});

test('純特教老師：整列合併成一格「特教監考」，與改版前一致', () => {
  const matrix = ExportInvigilation.buildTeacherMatrix(
    [SE_TEACHER], SPEC,
    cellMap({ [D + '#1']: { className: '特教', subject: '特教' } }),
    38, null, []
  );
  const entry = matrix.left[0];
  assert.equal(entry.specialEducation, true);
  assert.equal(entry.specialEducationRuns, undefined, '純特教走整列合併，不切段');
  const texts = slotTexts(entry);
  assert.equal(texts[0], '特教監考');
  assert.deepEqual(texts.slice(1).filter(Boolean), [], '其餘留白');
});

test('班級版監考表：特教老師的普通班照常算在該班', () => {
  const teacherMatrix = {
    left: [{
      name: SE_TEACHER.name,
      email: SE_TEACHER.email,
      subject: '特教',
      specialEducation: true,
      specialEducationRuns: [{ start: 0, end: 0 }],
      slots: [
        { text: '特教監考', changed: false, specialEducation: true },
        { text: '701', changed: false }
      ]
    }],
    right: []
  };
  const classMatrix = ExportInvigilationClass.buildClassMatrix(
    teacherMatrix, [{ date: D, period: 1 }, { date: D, period: 2 }],
    ['701', '702'], () => '特教'
  );
  const row701 = classMatrix.rows.find(r => r.className === '701');
  const row702 = classMatrix.rows.find(r => r.className === '702');
  assert.equal(row701.cells[1].text, '特教師', '普通班第 2 節要由特教老師監考');
  assert.equal(row701.cells[0].text, '', '特教班那一格不可寫成班級監考');
  assert.equal(row702.cells[1].text, '');
  const texts = classMatrix.rows.flatMap(r => r.cells.map(c => c.text));
  assert.equal(texts.some(t => /特教監考/.test(t)), false, '特教監考字樣不可流入班級版');
});

test('合併：兼普通班依區段合併，純特教整列合併', () => {
  const merges = [];
  const values = {};
  const ws = {
    getCell(row, col) {
      const address = row + ':' + col;
      return {
        address: address,
        get value() { return values[address]; },
        set value(v) { values[address] = v; }
      };
    },
    mergeCellsWithoutStyle(range) { merges.push(range); }
  };
  const matrix = {
    left: [
      {
        name: '兼課特師', specialEducation: true,
        specialEducationRuns: [{ start: 0, end: 0 }, { start: 2, end: 4 }],
        slots: []
      },
      { name: '純特師', specialEducation: true, slots: [] }
    ],
    right: []
  };
  const merged = ExportInvigilation.applySpecialEducationRows(ws, matrix, {
    teacherRowStart: 9, teacherRowEnd: 47
  });
  assert.equal(merged, 3, '兼課特師兩段＋純特師整列');
  assert.deepEqual(merges, ['D9:F9', 'B10:L10'], '單格段不必合併，只合併真正連續的段');
  assert.equal(values['9:2'], '特教監考', '第一段起點要寫標籤');
  assert.equal(values['9:4'], '特教監考', '第二段起點要寫標籤');
  assert.equal(values['10:2'], '特教監考', '純特教整列起點要寫標籤');
});
