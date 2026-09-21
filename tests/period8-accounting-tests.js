#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../date-utils.js');
require('../domain-schedule.js');
require('../domain-class-away.js');
require('../domain-billing.js');
require('../export-period8-accounting.js');

const data = window.ExportPeriod8Accounting.buildExportData({
  reportMonth: '2026-06',
  reportStartDate: '2026-06-01',
  reportEndDate: '2026-06-05',
  teachers: [
    { email: 'owner@x', name: '原任教師', jobTitle: '專任教師' },
    { email: 'cover@x', name: '代課教師', jobTitle: '代理教師' },
    { email: 'zero@x', name: '零節教師', jobTitle: '兼課教師' },
    { email: 'patrol@x', name: '巡堂教師', jobTitle: '行政' }
  ],
  allSchedules: [
    { teacherEmail: 'owner@x', teacherName: '原任教師', dayOfWeek: 1, period: 8, className: '701', subject: '課輔' },
    { teacherEmail: 'owner@x', teacherName: '原任教師', dayOfWeek: 2, period: 8, className: '702', subject: '課輔' },
    { teacherEmail: 'zero@x', teacherName: '零節教師', dayOfWeek: 3, period: 8, className: '703', subject: '課輔', activeFrom: '2026-10-01' },
    { teacherEmail: 'patrol@x', teacherName: '巡堂教師', dayOfWeek: 4, period: 8, className: '巡堂', subject: '巡堂', isPatrol: true }
  ],
  substitutionRecords: [
    {
      date: '2026-06-01', period: 8, className: '701', type: 'substitution', status: 'approved',
      originalTeacherEmail: 'owner@x', actualTeacherEmail: 'cover@x', actualTeacherName: '代課教師',
      subject: '課輔'
    }
  ],
  getTeacherNameByEmail: (email) => ({
    'owner@x': '原任教師',
    'cover@x': '代課教師',
    'zero@x': '零節教師',
    'patrol@x': '巡堂教師'
  }[email] || email),
  isSingleWeek: () => true
});

assert.equal(window.ExportPeriod8Accounting.FEE_8TH, 600);
assert.equal(data.dates.length, 5);
assert.equal(data.summary.hours, 2);
assert.equal(data.summary.amount, 1200);
assert.equal(data.fileName, '核銷-印領清冊-114-2 第8節鐘點費印領清冊  115.6月.xlsx');
assert.equal(data.rows.find((row) => row.name === '原任教師').totalCount, 1);
assert.equal(data.rows.find((row) => row.name === '代課教師').totalCount, 1);
assert.equal(data.rows.find((row) => row.name === '零節教師').totalCount, 0);
assert.equal(data.rows.some((row) => row.name === '巡堂教師'), false);
console.log('period8 accounting tests PASS');
