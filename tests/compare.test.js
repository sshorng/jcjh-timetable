// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher, TEACHER_ROW } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';
import { useTourStore } from '../src/stores/tour.js';
import { useMutualStore } from '../src/stores/mutual.js';

const LEAVE_ROW = { '學期代號': '115-1', '教師Email': 'leave@school.test', '教師姓名': '李老師', '授課科目': '國文' };
const CANNED_CANDIDATES = {
  success: true,
  candidates: [
    { teacherName: '李老師', subject: '國文', isSameSubject: true, todayPeriodCount: 1, suggestedFee: '自費代課' }
  ]
};

// compare 全鏈（真實 UI 點擊到底）：格子→抽屜→模擬→對照 modal→送出→成功 modal
test('compare：媒合選人對照後送出', async () => {
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
  const written = [];
  const t = await mountAsTeacher({
    meta: META,
    initial: INITIAL,
    onExtraFetch: async (action) => {
      if (action === 'getMatchCandidates') return { ok: true, status: 200, json: async () => CANNED_CANDIDATES };
      if (action === 'submitRequest') {
        written.push(1);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      throw new Error('unexpected network in compare test: ' + action);
    }
  });
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    const tour = useTourStore();
    const mutual = useMutualStore();
    const html = () => t.el.innerHTML;
    const quiet = () => {
      expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
      expect([...new Set(t.warnings)], 'vue warnings').toEqual([]);
    };

    // 1. 點格開抽屜
    const cell = t.el.querySelector('.grid-cell-class[data-tt-day="1"][data-tt-period="1"]');
    expect(cell, '應有週一第1節格子').toBeTruthy();
    cell.click();
    let opened = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (session.showMatchModal === true) { opened = true; break; }
    }
    expect(opened, '媒合抽屜未開').toBe(true);
    quiet();

    // 2. 點候選人「模擬」進對照 modal
    let compared = false;
    for (let i = 0; i < 200; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      const simBtns = [...t.el.querySelectorAll('.match-drawer button')].filter((b) => b.textContent.trim() === '模擬');
      if (simBtns.length && tour.recommendedTeachers.length > 0) {
        simBtns[0].click();
        compared = true;
        break;
      }
    }
    expect(compared, '沒點到模擬鈕').toBe(true);
    let cmpOpened = false;
    // modal 為非同步載入：旗標先亮、元件稍後才掛上，故以「已渲染出 modal 根節點」為準
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (mutual.showCompareModal === true && t.el.querySelector('[data-tour="compare-modal"]')) { cmpOpened = true; break; }
    }
    expect(cmpOpened, '對照 modal 未開 err=' + t.errors.slice(0, 2).join(' || ').slice(0, 600)).toBe(true);
    quiet();

    // 選假別（真實流程：對照 modal 內 v-model pendingRequestData.reason）
    const reasonSel = t.el.querySelector('[data-tour="compare-modal"] select.form-select');
    expect(reasonSel, '應有假別選單').toBeTruthy();
    const hasLeave = [...reasonSel.querySelectorAll('option')].some((o) => o.value === '事假');
    expect(hasLeave, '假別應有事假選項').toBe(true);
    reasonSel.value = '事假';
    reasonSel.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 5; i++) await nextTick();
    expect(mutual.pendingRequestData.reason).toBe('事假');

    // 3. 對照 modal 內送出（data-tour compare-submit-online）
    const submitBtn = t.el.querySelector('[data-tour="compare-submit-online"]');
    expect(submitBtn, '應有線上送出鈕').toBeTruthy();
    submitBtn.click();
    let done = false;
    for (let i = 0; i < 150; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (mutual.showSuccessModal === true) { done = true; break; }
    }
    expect(written.length, '應打一次 submitRequest').toBe(1);
    expect(done, '成功 modal 未開').toBe(true);
    expect(html()).toContain('申請已送出');
    quiet();
  } finally {
    t.cleanup();
  }
}, 120000);
