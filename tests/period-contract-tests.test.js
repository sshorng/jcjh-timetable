import assert from 'node:assert';
import { test } from 'vitest';
import DateUtils from '../src/domain/date-utils.js';
import { ExportSchoolTimetable } from '../src/modules/export-school-timetable.js';

test('period contract tests（v1 移植）', () => {
  const expectedPeriods = [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
  assert.deepStrictEqual(DateUtils.getTimetablePeriods(), expectedPeriods);
  assert.strictEqual(DateUtils.parsePeriod('早自習'), 0);
  assert.strictEqual(DateUtils.parsePeriod('午休'), 45);
  assert.strictEqual(DateUtils.decodeTimeKey('2-0').period, 0);
  assert.strictEqual(DateUtils.decodeTimeKey('2-45').period, 45);
  assert.strictEqual(DateUtils.formatPeriodText(0), '早自習');
  assert.strictEqual(DateUtils.formatPeriodText(45), '午休');

  const calls = [];
  const matrix = ExportSchoolTimetable.buildMatrix({
    teachers: [{ email: 'teacher@example.com', name: '測試教師' }],
    dates: ['2026-08-17'],
    getCell(email, dateStr, period) {
      calls.push(period);
      return period === 0 || period === 45 ? { className: '701' } : null;
    }
  });

  assert.deepStrictEqual(calls, expectedPeriods);
  assert.strictEqual(matrix.rows.length, 1);
  assert.strictEqual(matrix.rows[0].cells.length, expectedPeriods.length);
  assert.strictEqual(matrix.rows[0].cells[0].text, '701');
  assert.strictEqual(matrix.rows[0].cells[5].text, '701');
  assert.strictEqual(ExportSchoolTimetable.formatDateHeader('2026-08-17'), '08/17(一)');

  console.log('period contract tests PASS');

});
