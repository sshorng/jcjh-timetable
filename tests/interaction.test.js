// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher, clickAndFlush } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';
import { useMutualStore } from '../src/stores/mutual.js';

// 登入後互動：真實 DOM 點擊切頁（timetable→pending→records）＋開關詳情 modal
test('interaction：切頁＋詳情 modal 全鏈無錯', async () => {
  const t = await mountAsTeacher();
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    const mutual = useMutualStore();
    const html = () => t.el.innerHTML;
    const quiet = () => {
      expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
      expect([...new Set(t.warnings)], 'vue warnings').toEqual([]);
    };

    // timetable 首屏（已登入）
    expect(session.activeTab).toBe('timetable');
    expect(html()).toContain('國文');

    // → pending（r2 待王老師簽核）
    await clickAndFlush(t.el, '[data-tour="nav-pending"]');
    expect(session.activeTab).toBe('pending');
    // pending 列表來自按需載入的 history／approval 模組（首訪多等一拍）
    for (let i = 0; i < 200 && !html().includes('陳老師'); i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(html()).toContain('陳老師');
    quiet();

    // → records：先點「完整學期」載入歷史列
    await clickAndFlush(t.el, '[data-tour="nav-records"]');
    expect(session.activeTab).toBe('records');
    const fullBtn = [...t.el.querySelectorAll('button')].find((b) => b.textContent.trim() === '完整學期');
    expect(fullBtn, '應有完整學期鈕').toBeTruthy();
    fullBtn.click();
    let loaded = false;
    for (let i = 0; i < 100; i++) {
      await nextTick();
      await new Promise((r) => setTimeout(r, 100));
      if (html().includes('李老師') || html().includes('完整學期）')) { loaded = true; break; }
    }
    expect(loaded, '完整學期歷史未載入').toBe(true);
    expect(html()).toContain('李老師');
    quiet();

    // 開詳情 modal（records 列可點：tr.cursor-pointer → showDetailForRecord）
    const row = t.el.querySelector('tr.cursor-pointer');
    expect(row, 'records 應有可點列').toBeTruthy();
    row.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(mutual.showDetailModal).toBe(true);
    expect(html()).toContain('簽核狀態');
    quiet();

    // 關 modal（btn-close 真實點擊）
    const closeBtn = t.el.querySelector('.modal-overlay .btn-close');
    expect(closeBtn, '應有 btn-close').toBeTruthy();
    closeBtn.click();
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((r) => setTimeout(r, 200));
    await nextTick();
    expect(mutual.showDetailModal).toBe(false);
    quiet();

    // 回 timetable
    await clickAndFlush(t.el, '[data-tour="nav-timetable"]');
    expect(session.activeTab).toBe('timetable');
    quiet();
  } finally {
    t.cleanup();
  }
}, 90000);
