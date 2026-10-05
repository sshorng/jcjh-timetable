import { test, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from '../src/stores/session.js';

test('session store：預設＋角色切換（v1 真實 API）', () => {
  setActivePinia(createPinia());
  const s = useSessionStore();
  expect(s.user).toBe(null);
  expect(s.userRole).toBe('teacher');
  expect(s.isAdmin).toBe(false);
  expect(s.currentSemester).toBe('114-1');
  s.userRole = 'admin';
  expect(s.isAdmin).toBe(true);
  s.userRole = 'teacher';
  expect(s.isAdmin).toBe(false);
});
