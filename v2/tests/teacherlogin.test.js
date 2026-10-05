// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick } from 'vue';
import { mountAsTeacher } from './helpers/teacher-login.js';
import { useSessionStore } from '../src/stores/session.js';

// teacher 登入後主畫面：假 JWT（免簽，decodeJwt 只拆 payload）→ preflight → loadWeeklyData 全鏈
test('teacherlogin：登入後課表主畫面渲染', async () => {
  const t = await mountAsTeacher();
  try {
    expect(t.loginOk, '登入鏈未完成（seen=' + t.seen.join(',') + ')').toBe(true);
    const session = useSessionStore();
    expect(session.userRole).toBe('teacher');
    await nextTick();
    await new Promise((r) => setTimeout(r, 300));
    await nextTick();
    const html = t.el.innerHTML;
    expect(html).not.toContain('login-title');
    expect(html).toContain('國文');
    expect(t.errors, 'vue errors:\n' + t.errors.join('\n')).toEqual([]);
    expect([...new Set(t.warnings)]).toEqual([]);
  } finally {
    t.cleanup();
  }
}, 90000);
