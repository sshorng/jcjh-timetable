import assert from 'node:assert/strict';
import { test } from 'vitest';
import FieldMap from '../src/domain/field-map.js';
import { UiSchedule } from '../src/modules/ui-schedule.js';

const refOf = (value) => ({ value });

// 教師名單：科目與社群是兩個獨立維度；社群可多個（「、」分隔）。
const teachers = [
  { loginEmail: 'a@school.example', name: '雙語甲', teacherName: '雙語甲', subject: '國文', communities: '雙語社群、閱讀社群' },
  { loginEmail: 'b@school.example', name: '雙語乙', teacherName: '雙語乙', subject: '英文', communities: '雙語社群' },
  { loginEmail: 'c@school.example', name: '閱讀丙', teacherName: '閱讀丙', subject: '國文', communities: '閱讀社群' },
  { loginEmail: 'd@school.example', name: '一般丁', teacherName: '一般丁', subject: '國文', communities: '' }
];

const buildScheduleApi = (selectedCommunityValue, selectedSubjectValue) => UiSchedule.create({
  computed: (fn) => ({ get value() { return fn(); } }),
  user: refOf({ email: 'admin@school.example' }),
  getTeacherNameByEmail: (email) => (email === 'admin@school.example' ? '管理員' : ''),
  canViewAllTimetables: refOf(true),
  teachersList: refOf(teachers),
  lookupTeacher: (email) => teachers.find(t => t.loginEmail === email) || null,
  parseTeacherSubjects: (raw) => String(raw || '').split(/[、,，/／|｜\s]+/).map(s => s.trim()).filter(Boolean),
  parseTeacherCommunities: (raw) => String(raw || '').split(/[、,，/／|｜\s]+/).map(s => s.trim()).filter(Boolean),
  searchQuery: refOf(''),
  selectedSubject: refOf(selectedSubjectValue),
  selectedCommunity: refOf(selectedCommunityValue),
  isMutualCover: refOf(false),
  classDirectory: refOf([]),
  classScheduleRows: refOf([]),
  period8Ready: refOf(false),
  allSchedules: refOf([]),
  substitutionRecords: refOf([]),
  classAwayEvents: refOf([]),
  semesterEndDate: refOf(''),
  isSingleWeek: () => true,
  parseScheduleClasses: (raw) => String(raw || '').split(/[、,，/／|｜\s]+/).filter(Boolean),
  selectedClass: refOf(''),
  classReadonlyMode: refOf(false),
  userRole: refOf('admin'),
  classViewSchoolSwaps: refOf([]),
  schoolSwaps: refOf([]),
  selectedWeekDate: refOf('2026-11-17'),
  toLocalDateStr: (d) => new Date(d).toISOString().slice(0, 10),
  getClassAwayEventName: () => ''
});

test('社群篩選與科目正交（教師名單社群標籤）', () => {
  // mapTeacher：社群獨立於科目，且原樣保留多值
  const mapped = FieldMap.mapTeacher({
    '教師Email': 'a@school.example',
    '教師姓名': '雙語甲',
    '授課科目': '國文',
    '社群': '雙語社群、閱讀社群'
  });
  assert.equal(mapped.subject, '國文');
  assert.equal(mapped.communities, '雙語社群、閱讀社群');
  assert.equal(mapped.jobTitle, '');
  // 寫回 Sheets 時社群落獨立欄位，不併入授課科目
  const sheetRow = FieldMap.teacherToSheet(mapped, 'S1');
  assert.equal(sheetRow['社群'], '雙語社群、閱讀社群');
  assert.equal(sheetRow['授課科目'], '國文');

  // 只選社群（科目停在「我的課表」）：跨科目列出該社群全部教師
  const communityOnly = buildScheduleApi('雙語社群', 'mine').filteredTeachers.value;
  assert.deepEqual(communityOnly.map(t => t.name), ['雙語甲', '雙語乙']);
  // 該社群沒有「一般丁」與「閱讀丙」
  assert.ok(!communityOnly.some(t => t.name === '一般丁' || t.name === '閱讀丙'));

  // 全部社群 = 不加限制，科目「全部教師」時全校都在
  const allTeachers = buildScheduleApi('all', 'all').filteredTeachers.value;
  assert.equal(allTeachers.length, teachers.length);

  // 科目＋社群同時指定＝交集（國文 ∩ 雙語社群）
  const both = buildScheduleApi('雙語社群', '國文').filteredTeachers.value;
  assert.deepEqual(both.map(t => t.name), ['雙語甲']);

  // 只選科目：社群不參與，國文三人都在（含未分類社群的丁）
  const subjectOnly = buildScheduleApi('all', '國文').filteredTeachers.value;
  assert.deepEqual(subjectOnly.map(t => t.name), ['雙語甲', '閱讀丙', '一般丁']);

  // 社群不在名單內：沒有結果，且不會把「自己」硬塞回清單
  const unknownCommunity = buildScheduleApi('雙語社群X', 'all').filteredTeachers.value;
  assert.deepEqual(unknownCommunity, []);
});
