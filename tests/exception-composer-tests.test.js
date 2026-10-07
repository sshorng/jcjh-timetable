// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick, createApp, h } from 'vue';
import ExceptionComposerModal from '../src/components/ExceptionComposerModal.vue';

function mountComposer() {
  const warnings = [];
  const sent = [];
  const props = {
    teachersList: [
      { email: 'a@school.example', name: 'A師', subject: '國文' },
      { email: 'b@school.example', name: 'B師', subject: '數學' }
    ],
    allSchedules: [
      { teacherEmail: 'a@school.example', dayOfWeek: 2, period: 8, className: '701', subject: '國文' },
      { teacherEmail: 'b@school.example', dayOfWeek: 2, period: 8, className: '703', subject: '數學' }
    ],
    getScheduleForDate: (email, dateStr, period) => {
      // A 週二第八節當前已是調入後的 704英文（基礎仍是 701國文）
      if (String(email).toLowerCase() === 'a@school.example'
        && String(dateStr).slice(0, 10) === '2026-09-01' && Number(period) === 8) {
        return { className: '704', subject: '英文', isPending: true, pendingText: '⇄ 調至 09/03 第8節' };
      }
      return null;
    },
    getTeacherNameByEmail: (e) => ({ 'a@school.example': 'A師', 'b@school.example': 'B師' }[String(e || '').toLowerCase()] || e),
    submitAdminException: async (payload) => { sent.push(payload); return { ok: true, results: [] }; }
  };
  const app = createApp({ render: () => h(ExceptionComposerModal, props) });
  app.config.warnHandler = (msg) => { warnings.push(String(msg)); };
  const el = document.createElement('div');
  document.body.appendChild(el);
  app.mount(el);
  return { app, el, warnings, sent };
}

function setText(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setDate(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

test('composer：輸入篩選解析教師＋顯示當前（非基礎）課程', async () => {
  const { app, el, warnings } = mountComposer();
  await nextTick();
  const texts = [...el.querySelectorAll('input[type="text"]')];
  const dates = [...el.querySelectorAll('input[type="date"]')];
  const selects = [...el.querySelectorAll('select.form-select')];
  // 版面順序：[kind, aText? no—aText 是 text] selects=[kind, aPeriod, bPeriod]
  setText(texts[0], 'A師');
  setText(texts[1], 'B師');
  setDate(dates[0], '2026-09-01');
  setDate(dates[1], '2026-09-01');
  setSelect(selects[1], '8');
  setSelect(selects[2], '8');
  setText(texts[2], '測試事由');
  for (let i = 0; i < 5; i++) await nextTick();
  const html = el.innerHTML;
  // A 格顯示當前課（704英文），而非基礎課（701國文）
  expect(html).toContain('704');
  expect(html).toContain('英文');
  // 送出鈕應啟用（結構完整＋事由已填）
  const submitBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('直接核准建單'));
  expect(submitBtn, '應有送出鈕').toBeTruthy();
  expect(submitBtn.disabled, '表單完整應可送').toBe(false);
  app.unmount();
  expect(warnings).toEqual([]);
});

test('composer：打錯名字送不出', async () => {
  const { app, el, warnings } = mountComposer();
  await nextTick();
  const texts = [...el.querySelectorAll('input[type="text"]')];
  setText(texts[0], '不存在的人');
  setText(texts[2], '測試事由');
  for (let i = 0; i < 3; i++) await nextTick();
  console.log('DEBUG textN=' + el.querySelectorAll('input[type="text"]').length
    + ' dateN=' + el.querySelectorAll('input[type="date"]').length
    + ' selectN=' + el.querySelectorAll('select').length
    + ' btnN=' + el.querySelectorAll('button').length);
  const submitBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('直接核准建單'));
  expect(submitBtn.disabled, '教師解析失敗應鎖住送出').toBe(true);
  app.unmount();
  expect(warnings).toEqual([]);
});
