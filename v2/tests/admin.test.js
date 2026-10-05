// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher, clickAndFlush, TEACHER_ROW, CANNED_INITIAL } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';
import { useAdminStore } from '../src/stores/admin.js';

const ADMIN_ROW = { '學期代號': '115-1', '教師Email': 'admin@school.test', '教師姓名': '主任', '授課科目': '數學', '系統角色': 'admin' };
const ADMIN_META = {
  success: true, userRole: 'admin', semesterId: '115-1',
  teachers: [TEACHER_ROW, ADMIN_ROW],
  settings: { allowedHd: 'school.test' }
};
const ADMIN_INITIAL = Object.assign({}, CANNED_INITIAL, {
  userRole: 'admin', scope: 'admin',
  teachers: [TEACHER_ROW, ADMIN_ROW]
});
const CANNED_LEDGER = {
  success: true, email: 'teacher@school.test', name: '王老師', balance: 2, sheetQuota: 3,
  ledger: [{ id: 'l1', time: '2026-08-20 10:00', change: -1, note: '代課扣額' }]
};

// admin 後台：billing 預設頁＋教師管理 subtab＋額度歷程 modal
test('admin：後台渲染＋額度歷程 modal', async () => {
  const t = await mountAsTeacher({
    role: 'admin', email: 'admin@school.test', name: '主任',
    meta: ADMIN_META, initial: ADMIN_INITIAL,
    onExtraFetch: async (action) => {
      if (action === 'getMutualQuotaLedger') return { ok: true, status: 200, json: async () => CANNED_LEDGER };
      throw new Error('unexpected network in admin test: ' + action);
    }
  });
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    const admin = useAdminStore();
    expect(session.userRole).toBe('admin');
    expect(session.isAdmin).toBe(true);
    const html = () => t.el.innerHTML;
    const quiet = () => {
      expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
      expect([...new Set(t.warnings)], 'vue warnings').toEqual([]);
    };

    // 後台 nav 存在（teacher 看不到）
    const navAdmin = t.el.querySelector('[data-tour="nav-admin"]');
    expect(navAdmin, '應有後台 nav').toBeTruthy();
    await clickAndFlush(t.el, '[data-tour="nav-admin"]');
    expect(session.activeTab).toBe('admin');
    expect(html()).toContain('鐘點結算');
    quiet();

    // → 教師管理 subtab
    const teachersBtn = [...t.el.querySelectorAll('button')].find((b) => b.textContent.includes('教師管理'));
    expect(teachersBtn, '應有教師管理 subtab').toBeTruthy();
    teachersBtn.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 300));
    await nextTick();
    expect(session.adminSubTab).toBe('teachers');
    expect(html()).toContain('王老師');
    quiet();

    // 開額度歷程（教師列的 quota 鈕：文字為數字）
    const quotaBtn = [...t.el.querySelectorAll('button')].find((b) => /^\d+$/.test(b.textContent.trim()));
    expect(quotaBtn, '應有額度鈕').toBeTruthy();
    quotaBtn.click();
    let opened = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (admin.showQuotaLedgerModal === true) { opened = true; break; }
    }
    expect(opened, '額度 modal 未開').toBe(true);
    expect(html()).toContain('額度歷程');
    quiet();

    // 關 modal
    const closeBtn = [...t.el.querySelectorAll('.modal-overlay button')].find((b) => b.textContent.trim() === '關閉');
    expect(closeBtn, '應有關閉鈕').toBeTruthy();
    closeBtn.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(admin.showQuotaLedgerModal).toBe(false);
    quiet();
  } finally {
    t.cleanup();
  }
}, 90000);
