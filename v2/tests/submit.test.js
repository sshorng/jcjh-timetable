// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher, TEACHER_ROW } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';
import { useMutualStore } from '../src/stores/mutual.js';
import { useSubmitStore } from '../src/stores/submit.js';

const LEAVE_ROW = { '學期代號': '115-1', '教師Email': 'leave@school.test', '教師姓名': '李老師', '授課科目': '國文' };

// 送出全鏈：teacher 自請假→同事代課，validate→組裝→submitRequest（打樁）→成功 modal＋樂觀寫入
test('submit：送出代課申請全鏈', async () => {
  const _today = new Date();
  const todayStr = _today.getFullYear() + '-' + String(_today.getMonth() + 1).padStart(2, '0') + '-' + String(_today.getDate()).padStart(2, '0');
  const todayWeek = (_today.getDay() + 6) % 7 + 1;
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
    onExtraFetch: async (action, body) => {
      if (action === 'submitRequest') {
        written.push(body);
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      throw new Error('unexpected network in submit test: ' + action);
    }
  });
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    const mutual = useMutualStore();
    const submit = useSubmitStore();
    // 種 mimick 媒合產出的 pending（班級課表無 Email 時以姓名為鍵，見 v1 class-timetable-admin-tests）
    mutual.pendingRequestData = {
      mode: 'substitution',
      leaveTeacher: '王老師',
      subTeacher: 'leave@school.test',
      cls: '701',
      subject: '國文',
      date: todayStr,
      timeKey: todayWeek + '-5',
      reason: '事假',
      subFee: '自費代課',
      leaveTimeType: '全天',
      leaveTimeStart: '08:00',
      leaveTimeEnd: '16:00',
      submitRequestId: '',
      submitSerial: ''
    };
    await submit.executeSubmitRequest();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 300));
    await nextTick();
    expect(written.length, '應打一次 submitRequest').toBe(1);
    expect(mutual.showSuccessModal).toBe(true);
    expect(mutual.successModalTitle).toContain('送出');
    // 樂觀寫入：requestsList 多一筆
    expect(session.requestsList.length).toBeGreaterThan(0);
    const html = () => t.el.innerHTML;
    expect(html()).toContain('申請已送出');
    const quiet = () => {
      expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
      expect([...new Set(t.warnings)], 'vue warnings').toEqual([]);
    };
    quiet();
    // 關成功 modal
    mutual.showSuccessModal = false;
    await nextTick();
    quiet();
  } finally {
    t.cleanup();
  }
}, 90000);
