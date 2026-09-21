#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../date-utils.js');
require('../domain-schedule.js');
require('../domain-class-away.js');
require('../domain-billing.js');

const roster = window.DomainBilling.buildPeriod8ClassRoster({
  dates: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'],
  classNames: ['701', '702', '703', '704', '英資701', '巡堂'],
  allSchedules: [
    { teacherEmail: 'owner@x', teacherName: '原任教師', dayOfWeek: 1, period: 8, className: '701', subject: '課輔' },
    { teacherEmail: 'owner@x', teacherName: '原任教師', dayOfWeek: 2, period: 8, className: '702', subject: '課輔' },
    { teacherEmail: 'patrol@x', teacherName: '巡堂人員', dayOfWeek: 1, period: 8, className: '704', subject: '巡堂', attr: '巡堂' }
  ],
  substitutionRecords: [
    {
      id: 'sub-1', requestId: 'req-1', date: '2026-09-21', period: 8, className: '701',
      type: 'substitution', status: 'approved', originalTeacherEmail: 'owner@x',
      actualTeacherEmail: 'cover@x', actualTeacherName: '代課教師', subject: '課輔'
    },
    {
      id: 'exchange-1', requestId: 'req-2', date: '2026-09-22', period: 8, className: '702',
      type: 'exchange', status: 'approved', originalTeacherEmail: 'owner@x',
      actualTeacherEmail: 'exchange@x', actualTeacherName: '調入教師', subject: '課輔'
    }
  ],
  getTeacherNameByEmail: (email) => ({
    'owner@x': '原任教師',
    'cover@x': '代課教師',
    'exchange@x': '調入教師'
  }[email] || email),
  isSingleWeek: () => true
});

assert.deepEqual(roster.dates, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
assert.deepEqual(roster.rows.map((row) => row.className), ['701', '702', '703', '704', '英資701']);
assert.equal(roster.rows.find((row) => row.className === '701').cells['2026-09-21'][0].teacherName, '代課教師');
assert.equal(roster.rows.find((row) => row.className === '701').cells['2026-09-21'][0].status, 'substitution');
assert.equal(roster.rows.find((row) => row.className === '702').cells['2026-09-22'][0].teacherName, '調入教師');
assert.equal(roster.rows.find((row) => row.className === '702').cells['2026-09-22'][0].status, 'exchange');
assert.deepEqual(roster.rows.find((row) => row.className === '704').cells, {});
console.log('period8 roster tests PASS');
