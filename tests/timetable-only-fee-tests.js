#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../field-map.js');
require('../domain-school-swap.js');
require('../date-utils.js');
require('../domain-schedule.js');
require('../domain-class-away.js');
require('../domain-activity-cover.js');
require('../domain-billing.js');
require('../fee-utils.js');
require('../export-accounting.js');
require('../ui-request.js');

const fee = window.FeeUtils.TIMETABLE_ONLY;
assert.equal(fee, '僅課表呈現（不結算）');
assert.equal(window.FeeUtils.isTimetableOnlyFee(fee), true);
assert.equal(window.FeeUtils.isTimetableOnlyFee('僅課表呈現'), true);

const mappedRequest = window.FieldMap.mapRequest({
  '經費來源': fee,
  '異動日期': '2026-07-13',
  '異動節次': 1,
  '異動類型': '代課'
});
assert.equal(mappedRequest.subFee, fee, '新費用值應沿用既有申請欄位保存');

const builtPayload = window.UiSubmitHelpers.buildSubmitPayload({
  pendingRequestData: { value: {
    mode: 'substitution',
    leaveTeacher: 'owner@school.example',
    subTeacher: 'cover@school.example',
    date: '2026-07-13',
    timeKey: '1-1',
    cls: '701',
    subject: '國文',
    reason: '事假',
    subFee: fee,
    leaveTimeType: '全天',
    leaveTimeStart: '08:00',
    leaveTimeEnd: '16:00'
  }},
  currentSemester: { value: '2026-1' },
  getTeacherNameByEmail: value => value === 'owner@school.example' ? '原教師' : '代課教師',
  isAdmin: { value: true },
  directApproveMode: { value: false },
  paperFlow: { value: false },
  isMutualCover: { value: false },
  PERIOD8_FEE: '第8節代課',
  ACTIVITY_PUBLIC_FEE: '活動公費',
  defaultSubFeeForReason: () => '自費代課',
  activeCell: { value: { period: 1 } },
  DAC: () => null
}, 'req_timetable_only', 'SUB-TABLE');
assert.equal(builtPayload.newRequest['經費來源'], fee, '單筆 payload 不得把僅課表費用改成自費');

const aliasPayload = window.UiSubmitHelpers.buildSubmitPayload({
  pendingRequestData: { value: {
    mode: 'substitution', leaveTeacher: 'owner@school.example', subTeacher: 'cover@school.example',
    date: '2026-07-13', timeKey: '1-1', cls: '701', subject: '國文', reason: '事假',
    subFee: '僅課表呈現', leaveTimeType: '全天', leaveTimeStart: '08:00', leaveTimeEnd: '16:00'
  }},
  currentSemester: { value: '2026-1' },
  getTeacherNameByEmail: value => value === 'owner@school.example' ? '原教師' : '代課教師',
  isAdmin: { value: true }, directApproveMode: { value: false }, paperFlow: { value: false },
  isMutualCover: { value: false }, PERIOD8_FEE: '第8節代課', ACTIVITY_PUBLIC_FEE: '活動公費',
  TIMETABLE_ONLY_FEE: fee, defaultSubFeeForReason: () => '自費代課',
  activeCell: { value: { period: 1 } }, DAC: () => null
}, 'req_timetable_alias', 'SUB-ALIAS');
assert.equal(aliasPayload.newRequest['經費來源'], fee, '舊僅課表別名送出時應正規化為正式值');

const scheduleRecord = {
  date: '2026-07-13',
  period: 1,
  className: '701',
  subject: '國文',
  type: 'substitution',
  originalTeacherEmail: 'owner@school.example',
  actualTeacherEmail: 'cover@school.example',
  subFee: fee,
  status: 'approved'
};
const scheduleContext = {
  dateStr: '2026-07-13',
  period: 1,
  dayOfWeek: 1,
  allSchedules: [{
    teacherEmail: 'owner@school.example',
    dayOfWeek: 1,
    period: 1,
    className: '701',
    subject: '國文',
    attr: '一般'
  }],
  periodSubs: [scheduleRecord],
  allSubs: [scheduleRecord],
  helpers: {
    getTeacherNameByEmail: value => value === 'owner@school.example' ? '原教師' : '代課教師',
    getTeacherSubjectByEmail: () => '國文',
    getWeekDayText: () => '一'
  }
};
scheduleContext.scheduleIndex = window.DomainSchedule.buildScheduleIndex(scheduleContext.allSchedules);
const timetableIncoming = window.DomainSchedule.resolveApprovedSchedule(
  Object.assign({}, scheduleContext, { teacherEmail: 'cover@school.example' })
);
const timetableOutgoing = window.DomainSchedule.resolveApprovedSchedule(
  Object.assign({}, scheduleContext, { teacherEmail: 'owner@school.example' })
);
assert.match(timetableIncoming.subText, /僅課表/, '代課者課表應標示僅課表呈現');
assert.match(timetableOutgoing.subText, /僅課表/, '原教師課表應標示僅課表呈現');

const regularRows = window.DomainBilling.buildMonthlyReportRows({
  teachers: [
    { email: 'owner@school.example', name: '原教師', baseHours: 0 },
    { email: 'cover@school.example', name: '代課教師', baseHours: 0 }
  ],
  allSchedules: [{
    teacherEmail: 'owner@school.example',
    dayOfWeek: 1,
    period: 1,
    className: '701',
    attr: '一般',
    specialTags: '超鐘點'
  }],
  substitutionRecords: [{
    date: '2026-07-13',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'cover@school.example',
    subFee: fee,
    status: 'approved'
  }],
  reportMonth: '2026-07',
  reportWeeksCount: 1
});
const ownerRow = regularRows.find(row => row.email === 'owner@school.example');
const coverRow = regularRows.find(row => row.email === 'cover@school.example');
assert.equal(ownerRow.selfPaidDeduction, 0, '僅課表呈現不得扣原教師自費鐘點');
assert.equal(ownerRow.publicOvertimeUsed, 0, '僅課表呈現不得扣原教師公費鐘點');
assert.equal(coverRow.pubSubCount, 0, '僅課表呈現不得支付代課公費');
assert.equal(coverRow.selfSubCount, 0, '僅課表呈現不得支付代課自費');

const period8MonthlyRows = window.DomainBilling.buildMonthlyReportRows({
  teachers: [
    { email: 'owner@school.example', name: '原教師', baseHours: 0 },
    { email: 'cover@school.example', name: '代課教師', baseHours: 0 }
  ],
  allSchedules: [{
    teacherEmail: 'owner@school.example',
    dayOfWeek: 1,
    period: 8,
    className: '701',
    attr: '一般'
  }],
  substitutionRecords: [{
    date: '2026-07-13',
    period: 8,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'cover@school.example',
    subFee: fee,
    status: 'approved'
  }],
  reportMonth: '2026-07',
  reportStartDate: '2026-07-13',
  reportEndDate: '2026-07-13',
  reportWeeksCount: 1
});
assert.equal(
  period8MonthlyRows.reduce((sum, row) => sum + (row.period8SubCount || 0), 0),
  0,
  '月報第8節不得因僅課表呈現產生給付節數'
);

const period8 = window.DomainBilling.buildPeriod8Payout({
  reportMonth: '2026-07',
  allSchedules: [{
    teacherEmail: 'owner@school.example',
    dayOfWeek: 1,
    period: 8,
    className: '701',
    attr: '一般'
  }],
  substitutionRecords: [{
    date: '2026-07-13',
    period: 8,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'cover@school.example',
    subFee: fee,
    status: 'approved'
  }],
  getTeacherNameByEmail: value => value
});
assert.equal(period8.byEmail.owner, undefined, '僅課表呈現不得產生第8節原教師給付');
assert.equal(period8.byEmail.cover, undefined, '僅課表呈現不得產生第8節代課給付');

const workbook = window.DomainBilling.buildSubFeeExcelWorkbook({
  reportMonth: '2026-07',
  substitutionRecords: [{
    date: '2026-07-13',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherName: '原教師',
    actualTeacherName: '代課教師',
    subFee: fee,
    status: 'approved'
  }]
});
assert.equal(workbook.pubAoa.length, 2, '僅課表呈現不得列入公付清冊');
assert.equal(workbook.selfAoa.length, 2, '僅課表呈現不得列入自付清冊');

const exportData = window.ExportAccounting.buildExportData({
  reportMonth: '2026-07',
  reportWeeksCount: 1,
  periods: { period: { start: '2026-07-01', end: '2026-07-31' } },
  teachers: [{ email: 'owner@school.example', name: '原教師', baseHours: 0 }],
  allSchedules: [{
    teacherEmail: 'owner@school.example',
    dayOfWeek: 1,
    period: 1,
    className: '701',
    attr: '一般',
    specialTags: '超鐘點'
  }],
  substitutionRecords: [{
    date: '2026-07-13',
    period: 1,
    className: '701',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'cover@school.example',
    subFee: fee,
    status: 'approved'
  }]
});
assert.equal(exportData.sheets.publicSub.length, 0, '僅課表呈現不得進會計公付代課表');
assert.equal(exportData.sheets.selfSub.length, 0, '僅課表呈現不得進會計自付代課表');

console.log('timetable-only fee tests PASS');
