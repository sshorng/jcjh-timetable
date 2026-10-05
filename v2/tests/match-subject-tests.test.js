import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const here = path.dirname(fileURLToPath(import.meta.url));

test('match subject tests（後端合約，v1/v2 共用）', () => {
  const source = fs.readFileSync(path.join(here, '..', '..', 'code.gs'), 'utf8');
  const start = source.indexOf('function parseSubjectsServer_');
  const end = source.indexOf('function buildRequestsDelta_', start);
  assert.ok(start >= 0 && end > start, 'match subject helpers must remain discoverable');

  const teachers = [
    { '教師Email': 'leave@school.example', '教師姓名': '請假教師', '授課科目': '國文' },
    { '教師Email': 'primary@school.example', '教師姓名': '主要科教師', '授課科目': '輔導' },
    { '教師Email': 'secondary@school.example', '教師姓名': '第二科教師', '授課科目': '國文' },
    { '教師Email': 'schedule-only@school.example', '教師姓名': '課表第二科', '授課科目': '國文' }
  ];
  const schedules = [
    { '教師Email': 'leave@school.example', '教師姓名': '請假教師', '星期': 1, '節次': 2, '班級': '701', '科目': '國文' },
    { '教師Email': 'secondary@school.example', '教師姓名': '第二科教師', '星期': 2, '節次': 3, '班級': '901', '科目': '輔導' },
    { '教師Email': 'schedule-only@school.example', '教師姓名': '課表第二科', '星期': 2, '節次': 4, '班級': '901', '科目': '輔導' }
  ];

  const context = {
    getSemesterTeachersCached_: () => teachers,
    getSemesterSchedulesCached_: () => schedules,
    buildNameKeyDirectory_: () => ({}),
    nameKeyEmailForName_: () => '',
    getActiveSchoolSwapRows_: () => [],
    getSemesterRequestsCached_: () => ({ rows: [] }),
    scheduleActiveOnDate_: () => true,
    resolveSchoolSwapSlotForTeacher_: (rows, date, day, period) => ({ dayOfWeek: day, period: period }),
    Object,
    String,
    Number,
    Array,
    Math,
    parseInt,
    isNaN
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context, { filename: 'code.gs.match-subject' });

  assert.deepEqual(
    Array.from(context.parseSubjectsServer_('國文；輔導')),
    ['國文', '輔導'],
    'server parser should accept Chinese semicolons'
  );

  const result = context.buildMatchCandidates_('2026-1', {
    leaveEmail: 'leave@school.example',
    dateStr: '2026-09-03',
    dayOfWeek: 1,
    period: 1,
    myCourse: '輔導',
    myDomain: '國文',
    myClass: '701',
    limit: 40
  });
  const primary = result.candidates.find(t => t.teacherName === '主要科教師');
  const secondary = result.candidates.find(t => t.teacherName === '第二科教師');
  const scheduleOnly = result.candidates.find(t => t.teacherName === '課表第二科');
  assert.equal(result.demandDomain, '輔導', 'schedule subjects should be known domains');
  assert.equal(primary.isSameSubject, true, 'primary subject teacher should match');
  assert.equal(primary.isPrimarySubject, true, 'primary subject teacher should be marked primary');
  assert.equal(secondary.isSameSubject, true, 'teacher roster subject plus schedule subject should match');
  // 多科請假邏輯：leaveDomains=['國文']，第二科教師名單主科「國文」命中，isPrimarySubject=true 是正確的
  assert.equal(secondary.isPrimarySubject, true, 'secondary teacher roster subject matches leaveDomains primary, so isPrimarySubject is true');
  assert.equal(scheduleOnly.isSameSubject, true, 'schedule-only secondary subject should match');
  assert.ok(
    primary.isSameSubject && secondary.isSameSubject,
    'both primary and secondary teachers should be isSameSubject'
  );

  teachers.push(
    { '教師Email': 'yingrui@school.example', '教師姓名': '曾瀅芮', '授課科目': '英語資優、英語' },
    { '教師Email': 'eng@school.example', '教師姓名': '英語教師', '授課科目': '英語' },
    { '教師Email': 'eng-gifted@school.example', '教師姓名': '英語資優教師', '授課科目': '英語資優' },
    { '教師Email': 'special@school.example', '教師姓名': '特教教師', '授課科目': '特教' },
    { '教師Email': 'math@school.example', '教師姓名': '數學教師', '授課科目': '數學' }
  );
  schedules.push(
    { '教師Email': 'yingrui@school.example', '教師姓名': '曾瀅芮', '星期': 3, '節次': 0, '班級': '8英資A', '科目': '專題探究' }
  );

  const resultYingRui = context.buildMatchCandidates_('2026-1', {
    leaveEmail: 'yingrui@school.example',
    dateStr: '2026-09-02',
    dayOfWeek: 3,
    period: 0,
    myCourse: '專題探究',
    myDomain: '英語資優、英語',
    myClass: '8英資A',
    limit: 40
  });
  const candEng = resultYingRui.candidates.find(t => t.teacherName === '英語教師');
  const candEngGifted = resultYingRui.candidates.find(t => t.teacherName === '英語資優教師');
  const candSpecial = resultYingRui.candidates.find(t => t.teacherName === '特教教師');
  const candMath = resultYingRui.candidates.find(t => t.teacherName === '數學教師');

  assert.equal(resultYingRui.demandDomain, '英語資優', 'generic course 專題探究 should not hijack demand domain');
  assert.ok(candEng && candEng.isSameSubject === true, '英語教師 should match second subject of leave teacher');
  assert.ok(candEngGifted && candEngGifted.isSameSubject === true, '英語資優教師 should be considered same subject');
  assert.ok(candSpecial && candSpecial.isSameSubject === false, '特教教師 must NEVER be marked same subject for 英語/英語資優');
  assert.ok(candMath && candMath.isSameSubject === false, '數學教師 should not be same subject for 英語資優');
  assert.ok(
    resultYingRui.candidates.indexOf(candEngGifted) < resultYingRui.candidates.indexOf(candEng),
    'exact 英語資優 teacher should precede generic 英語 teacher'
  );

  // ── 多科請假教師：leaveDomains 含多科，候選人命中任一即算同科 ──
  // 情境模擬：課表格子科目「資優英語」（非標準名），請假教師同時教「英語資優、英語科」
  // 丁于珊授課科目為「英語科」，應被標記同科；數學教師不應標記同科。
  teachers.push(
    { '教師Email': 'ding@school.example', '教師姓名': '丁于珊', '授課科目': '英語科' },
    { '教師Email': 'multi-leave@school.example', '教師姓名': '多科請假師', '授課科目': '英語資優' }
  );
  // 丁于珊這節空堂（無課表列）；數學教師這節也空
  const resultMultiSubject = context.buildMatchCandidates_('2026-1', {
    leaveEmail: 'multi-leave@school.example',
    dateStr: '2026-09-04',
    dayOfWeek: 4,
    period: 3,
    myCourse: '資優英語',
    myDomain: '英語資優、英語科',
    myClass: '8英資B',
    limit: 40
  });
  const candDing = resultMultiSubject.candidates.find(t => t.teacherName === '丁于珊');
  const candMathAgain = resultMultiSubject.candidates.find(t => t.teacherName === '數學教師');
  assert.ok(candDing, '丁于珊 should appear in candidates');
  assert.equal(candDing.isSameSubject, true, '丁于珊（英語科）should be 同科 when leave teacher has 英語資優、英語科');
  assert.ok(!candMathAgain || candMathAgain.isSameSubject === false, '數學教師 should not be 同科 for 英語 leave teacher');

  const sameSlotTeachers = [
    { '教師Email': 'swap-a@school.example', '教師姓名': 'A老師', '授課科目': '國文' },
    { '教師Email': 'swap-b@school.example', '教師姓名': 'B老師', '授課科目': '數學' },
    { '教師Email': 'swap-c@school.example', '教師姓名': 'C老師', '授課科目': '英文' },
    { '教師Email': 'swap-d@school.example', '教師姓名': 'D老師', '授課科目': '自然' }
  ];
  const sameSlotSchedules = [
    { '教師Email': 'swap-a@school.example', '教師姓名': 'A老師', '星期': 1, '節次': 2, '班級': '701', '科目': '國文' },
    { '教師Email': 'swap-b@school.example', '教師姓名': 'B老師', '星期': 1, '節次': 2, '班級': '802', '科目': '數學' },
    { '教師Email': 'swap-c@school.example', '教師姓名': 'C老師', '星期': 1, '節次': 2, '班級': '903', '科目': '英文' }
  ];
  const sameSlotRequest = {
    '申請單ID': 'same-period-approved',
    '狀態': 'approved',
    '異動類型': 'exchange',
    '特殊流程': 'admin_same_period_exchange',
    '申請人Email': 'swap-a@school.example',
    '受邀人Email': 'swap-b@school.example',
    '異動日期': '2026-09-07',
    '異動節次': 2,
    '班級': '701',
    '科目': '國文',
    '對調目標日期': '2026-09-07',
    '對調目標節次': 2,
    '對調目標班級': '802',
    '對調目標科目': '數學'
  };
  const sameSlotContext = Object.assign({}, context, {
    getSemesterTeachersCached_: () => sameSlotTeachers,
    getSemesterSchedulesCached_: () => sameSlotSchedules,
    getActiveSchoolSwapRows_: () => [],
    getSemesterRequestsCached_: () => ({ rows: [sameSlotRequest] }),
    _dayFromDateStr_: () => 1
  });
  vm.createContext(sameSlotContext);
  vm.runInContext(source.slice(start, end), sameSlotContext, { filename: 'code.gs.same-period-exchange' });
  const sameSlotCandidates = sameSlotContext.buildMatchCandidates_('115-1', {
    leaveEmail: 'swap-c@school.example',
    dateStr: '2026-09-07',
    dayOfWeek: 1,
    period: 2,
    myCourse: '英文',
    myDomain: '英文',
    myClass: '903',
    limit: 40
  }).candidates;
  assert.ok(!sameSlotCandidates.some(candidate => candidate.teacherEmail === 'swap-a@school.example'), '同節互換後 A 老師仍有調入課，不可被媒合成空堂');
  assert.ok(!sameSlotCandidates.some(candidate => candidate.teacherEmail === 'swap-b@school.example'), '同節互換後 B 老師仍有調入課，不可被媒合成空堂');

  console.log('match subject tests PASS');

});
