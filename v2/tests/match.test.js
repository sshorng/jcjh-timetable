// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher, TEACHER_ROW } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';
import { useTourStore } from '../src/stores/tour.js';

const LEAVE_ROW = { '學期代號': '115-1', '教師Email': 'leave@school.test', '教師姓名': '李老師', '授課科目': '國文' };
const CANNED_CANDIDATES = {
  success: true,
  candidates: [
    { teacherName: '李老師', subject: '國文', isSameSubject: true, todayPeriodCount: 1, suggestedFee: '自費代課' }
  ]
};

// 媒合鏈：點空堂格子→媒合抽屜開→推薦名單渲染→關閉
test('match：空堂格媒合抽屜＋推薦渲染', async () => {
  const META = {
    success: true, userRole: 'teacher', semesterId: '115-1',
    teachers: [TEACHER_ROW, LEAVE_ROW],
    settings: { allowedHd: 'school.test' }
  };
  const INITIAL = {
    success: true, userRole: 'teacher', scope: 'teacher', semesterId: '115-1',
    semesters: [{ '學期代號': '115-1', '是否預設': 'TRUE' }],
    teachers: [TEACHER_ROW, LEAVE_ROW],
    classNames: ['701'],
    schedules: [
      { '課表ID': 's1', '教師Email': 'teacher@school.test', '教師姓名': '王老師', '星期': 1, '節次': 1, '班級': '701', '科目': '國文' }
    ],
    schoolSwaps: [],
    homeroomRecords: [],
    requests: []
  };
  const t = await mountAsTeacher({
    meta: META,
    initial: INITIAL,
    onExtraFetch: async (action) => {
      if (action === 'getMatchCandidates') return { ok: true, status: 200, json: async () => CANNED_CANDIDATES };
      throw new Error('unexpected network in match test: ' + action);
    }
  });
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    const tour = useTourStore();
    const html = () => t.el.innerHTML;
    const quiet = () => {
      expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
      expect([...new Set(t.warnings)], 'vue warnings').toEqual([]);
    };
    expect(session.activeTab).toBe('timetable');

    // 點王老師週一第1節有課格（姓名鍵自點→開媒合；空堂格走空堂排班不開抽屜）
    const cell = t.el.querySelector('.grid-cell-class[data-tt-day="1"][data-tt-period="1"]');
    expect(cell, '應有週二第2節格子').toBeTruthy();
    cell.click();
    let opened = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (session.showMatchModal === true) { opened = true; break; }
    }
    expect(opened, '媒合抽屜未開').toBe(true);
    // 等推薦寫入
    let hasRec = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (html().includes('match-drawer') && tour.recommendedTeachers.length > 0) { hasRec = true; break; }
    }
    expect(hasRec, '推薦名單未渲染').toBe(true);
    expect(html()).toContain('李老師');
    quiet();

    // 關抽屜
    const closeBtn = t.el.querySelector('.match-drawer .btn-close');
    expect(closeBtn, '應有關閉鈕').toBeTruthy();
    closeBtn.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(session.showMatchModal).toBe(false);
    quiet();
  } finally {
    t.cleanup();
  }
}, 90000);
