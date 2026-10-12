import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  SUBJECT_MERGE_MAP,
  normalizeExamSubject,
  parsePatrolGrade,
  detectPatrolKind,
  voteSubject,
  sanitizeExamText
} from '../src/modules/export-invigilation-subject.js';
import { ExportInvigilation } from '../src/modules/export-invigilation-recovered.js';
import { ExportInvigilationClass } from '../src/modules/export-invigilation-class.js';

test('invigilation subject（正規化）', () => {
  assert.deepEqual(SUBJECT_MERGE_MAP, { '地理': '社會', '歷史': '社會', '公民': '社會', '英語資優': '英語' });
  assert.equal(normalizeExamSubject('地理'), '社會');
  assert.equal(normalizeExamSubject('歷史'), '社會');
  assert.equal(normalizeExamSubject('公民'), '社會');
  assert.equal(normalizeExamSubject('生物'), '生物');
  assert.equal(normalizeExamSubject('理化'), '理化');
  assert.equal(normalizeExamSubject('自然'), '自然');
  assert.equal(normalizeExamSubject('國文'), '國文');
  assert.equal(normalizeExamSubject('數學'), '數學');
  assert.equal(normalizeExamSubject('英語'), '英語');
  assert.equal(normalizeExamSubject('英語資優'), '英語');
  assert.equal(normalizeExamSubject('生物', 'class'), '自然');
  assert.equal(normalizeExamSubject('理化', 'class'), '自然');
  assert.equal(normalizeExamSubject('自然', 'class'), '自然');
  assert.equal(normalizeExamSubject('國文', 'class'), '國文');
  assert.equal(normalizeExamSubject(''), '');
  assert.equal(normalizeExamSubject(null), '');
  console.log('subject normalize tests PASS');
});

test('invigilation subject（分級判斷）', () => {
  assert.equal(parsePatrolGrade('巡七'), '七');
  assert.equal(parsePatrolGrade('段考巡八'), '八');
  assert.equal(parsePatrolGrade('巡堂(九)'), '九');
  assert.equal(parsePatrolGrade('巡7'), '七');
  assert.equal(parsePatrolGrade('7年級巡堂'), '七');
  assert.equal(parsePatrolGrade('巡堂'), null);
  assert.equal(parsePatrolGrade('巡堂704'), null);
  assert.equal(parsePatrolGrade('701'), null);
  assert.equal(detectPatrolKind('巡七'), '七');
  assert.equal(detectPatrolKind('巡堂'), 'plain');
  assert.equal(detectPatrolKind('巡堂704'), 'plain');
  assert.equal(detectPatrolKind('701'), null);
  assert.equal(detectPatrolKind(''), null);
  console.log('subject grade tests PASS');
});

test('invigilation subject（多數決：平票留白）', () => {
  assert.equal(voteSubject(['自然', '自然', '生物']), '自然');
  assert.equal(voteSubject(['社會', '社會', '社會']), '社會');
  assert.equal(voteSubject(['生物', '理化', '自然']), '');
  assert.equal(voteSubject(['國文']), '國文');
  assert.equal(voteSubject(['', '數學']), '數學');
  assert.equal(voteSubject([]), '');
  assert.equal(voteSubject(['', '']), '');
  console.log('subject vote tests PASS');
});

test('invigilation subject（非法字元清除）', () => {
  const dirty = '王' + String.fromCharCode(11) + '小明' + String.fromCharCode(7);
  assert.equal(sanitizeExamText(dirty), '王小明');
  assert.equal(sanitizeExamText('李大華'), '李大華');
  console.log('subject sanitize tests PASS');
});

test('invigilation subject（教師版矩陣帶科目）', () => {
  const m = ExportInvigilation.buildTeacherMatrix(
    [{ email: 'a@x', name: '甲', subject: '地理' }],
    ExportInvigilation.buildPeriodSpec(['2026-10-12']),
    () => ({ className: '701' }),
    38, null, []
  );
  assert.equal(m.left[0].subject, '地理');
  console.log('teacher matrix subject tests PASS');
});

test('invigilation subject（教師版 B4:X6 按年級填入）', () => {
  function slots11(text) {
    return Array.from({ length: 11 }, (_, i) => ({ text: i === 1 ? text : '', changed: false }));
  }
  const matrix = {
    left: [
      { name: '七師', email: 'a@x', subject: '地理', slots: slots11('巡七') },
      { name: '八師', email: 'b@x', subject: '理化', slots: slots11('巡八') },
      { name: '九師', email: 'c@x', subject: '自然', slots: slots11('巡九') },
      { name: '普師', email: 'd@x', subject: '國文', slots: slots11('巡堂') }
    ],
    right: []
  };
  const cells = new Map();
  function getCell(r, c) {
    const k = r + ':' + c;
    if (!cells.has(k)) cells.set(k, { value: null });
    return cells.get(k);
  }
  const res = ExportInvigilation.fillExamSubjects({ getCell }, matrix, ExportInvigilation.buildPeriodSpec(['2026-10-12', '2026-10-13']));
  assert.equal(res.fills.length, 3);
  // 七年級列 Row4：地理→社會；左右兩區同步
  assert.equal(getCell(4, 3).value, '社會');
  assert.equal(getCell(4, 15).value, '社會');
  // 八年級列 Row5：理化獨立；九年級列 Row6：自然獨立
  assert.equal(getCell(5, 3).value, '理化');
  assert.equal(getCell(6, 3).value, '自然');
  // 自習節欄（B欄）不碰；無分級巡堂不進考科格
  assert.equal(getCell(4, 2).value, null);
  assert.equal(res.unplaced, 1);
  console.log('teacher exam subject tests PASS');
});

test('invigilation subject（教師版英語資優併英語）', () => {
  function slots11(text) {
    return Array.from({ length: 11 }, (_, i) => ({ text: i === 1 ? text : '', changed: false }));
  }
  const matrix = {
    left: [
      { name: '七師', email: 'a@x', subject: '英語資優', slots: slots11('巡七') },
      { name: '八師', email: 'b@x', subject: '英語', slots: slots11('巡八') },
      { name: '九師', email: 'c@x', subject: '英語', slots: slots11('巡九') }
    ],
    right: []
  };
  const cells = new Map();
  function getCell(r, c) {
    const k = r + ':' + c;
    if (!cells.has(k)) cells.set(k, { value: null });
    return cells.get(k);
  }
  const res = ExportInvigilation.fillExamSubjects({ getCell }, matrix, ExportInvigilation.buildPeriodSpec(['2026-10-12', '2026-10-13']));
  assert.equal(res.fills.length, 3);
  assert.equal(getCell(4, 3).value, '英語');
  assert.equal(getCell(5, 3).value, '英語');
  assert.equal(getCell(6, 3).value, '英語');
  console.log('teacher gifted english tests PASS');
});

test('invigilation subject（班級版 Row2 投票填入）', () => {
  function slots11(text) {
    return Array.from({ length: 11 }, (_, i) => ({ text: i === 1 ? text : '', changed: false }));
  }
  const teacherMatrix = {
    left: [
      { name: '七師', email: 'a@x', slots: slots11('巡七') },
      { name: '八師', email: 'b@x', slots: slots11('巡八') },
      { name: '九師', email: 'c@x', slots: slots11('巡九') }
    ],
    right: []
  };
  const subjects = { '七師': '地理', '八師': '歷史', '九師': '公民' };
  const spec11 = Array.from({ length: 11 }, (_, i) => ({ date: '2026-10-12', period: i + 1 }));
  const cm = ExportInvigilationClass.buildClassMatrix(teacherMatrix, spec11, ['701'], (t) => subjects[t.name] || '');
  assert.equal(cm.slotExamSubjects[1].subject, '社會');
  assert.equal(cm.slotExamSubjects[1].voters.length, 3);
  assert.equal(cm.slotExamSubjects[0].subject, '');
  // 七生物八理化九自然：班級版合併為自然
  const subjects2 = { '七師': '生物', '八師': '理化', '九師': '自然' };
  const cm2 = ExportInvigilationClass.buildClassMatrix(teacherMatrix, spec11, ['701'], (t) => subjects2[t.name] || '');
  assert.equal(cm2.slotExamSubjects[1].subject, '自然');
  // Row2 寫入 C2（index1）
  const cells = new Map();
  function getCell(r, c) {
    const k = r + ':' + c;
    if (!cells.has(k)) cells.set(k, { value: null, font: null });
    return cells.get(k);
  }
  const fillInfo = ExportInvigilationClass.fillClassValues({ getCell, rowCount: 27 }, {
    classMatrix: cm,
    dates: ['2026-10-12', '2026-10-13'],
    suffix: '一段',
    layout: { templateClasses: ['701'], templatePatrols: ['巡七', '巡八', '巡九'], templateDataEnd: 27 }
  });
  assert.equal(getCell(2, 3).value, '社會');
  assert.equal(getCell(2, 2).value, null, '自習格不碰');
  assert.equal(fillInfo.subjectFills.length, 1);
  assert.equal(fillInfo.subjectFills[0].subject, '社會');
  console.log('class exam subject tests PASS');
});
