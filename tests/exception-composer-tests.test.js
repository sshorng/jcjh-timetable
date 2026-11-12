// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick, createApp, h } from 'vue';
import ExceptionComposerModal from '../src/components/ExceptionComposerModal.vue';

function mountComposer(overrides = {}) {
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
  Object.assign(props, overrides || {});
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
  // 該格有課者置頂：A 欄 datalist 首位應為 A師（701國文）
  const firstDatalist = el.querySelector('datalist');
  const firstOptions = [...firstDatalist.querySelectorAll('option')].map((o) => o.value);
  expect(firstOptions[0].includes('A師'), '有課者應置頂：' + firstOptions[0]).toBe(true);
  expect(firstOptions[0].includes('704'), '置頂附帶當前（非基礎）班級：' + firstOptions[0]).toBe(true);
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

// 共同操作：填好一組調課（A：09/01 第8節、B：11/02 第2節）
async function fillExchange(el, reason = '測試事由') {
  const texts = [...el.querySelectorAll('input[type="text"]')];
  const dates = [...el.querySelectorAll('input[type="date"]')];
  const selects = [...el.querySelectorAll('select.form-select')];
  setText(texts[0], 'A師');
  setText(texts[1], 'B師');
  setDate(dates[0], '2026-09-01');
  setDate(dates[1], '2026-11-02');
  setSelect(selects[1], '8');
  setSelect(selects[2], '2');
  setText(texts[2], reason);
  for (let i = 0; i < 5; i++) await nextTick();
}

test('composer：B 端當日無基礎課、但已有調入課程時讀當前課程（不判無課）', async () => {
  const { app, el, warnings } = mountComposer({
    // B 師 11/02 第2節：基礎課表沒有這一格，當前課程是調入的英資A英語
    getScheduleForDate: (email, dateStr, period) => {
      if (String(email).toLowerCase() === 'b@school.example'
        && String(dateStr).slice(0, 10) === '2026-11-02' && Number(period) === 2) {
        return { className: '英資A', subject: '英語', isSubstitutionDuty: true, subText: '👤 代課：C師' };
      }
      return null;
    }
  });
  await nextTick();
  await fillExchange(el);
  const html = el.innerHTML;
  expect(html).toContain('英資A');
  expect(html).not.toContain('查無課程');
  expect(html).not.toContain('基礎課程');
  const submitBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('直接核准建單'));
  expect(submitBtn.disabled, '當前課程存在即可送出').toBe(false);
  app.unmount();
  expect(warnings).toEqual([]);
});

test('composer：當前課程只有科目沒有班級（抽離／資優課）仍視為有課', async () => {
  const { app, el, warnings } = mountComposer({
    getScheduleForDate: (email, dateStr, period) => {
      if (String(email).toLowerCase() === 'b@school.example'
        && String(dateStr).slice(0, 10) === '2026-11-02' && Number(period) === 2) {
        return { className: '', subject: '英語資優', attr: '抽離' };
      }
      return null;
    }
  });
  await nextTick();
  await fillExchange(el);
  const html = el.innerHTML;
  expect(html).toContain('英語資優');
  expect(html).not.toContain('查無課程');
  const submitBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('直接核准建單'));
  expect(submitBtn.disabled, '有科目即視為有課').toBe(false);
  app.unmount();
  expect(warnings).toEqual([]);
});

test('composer：真的查無課程時明講查無課程，且不得送出', async () => {
  const { app, el, warnings } = mountComposer({
    getScheduleForDate: () => null
  });
  await nextTick();
  await fillExchange(el);
  const html = el.innerHTML;
  expect(html).toContain('查無課程');
  expect(html).not.toContain('基礎課程');
  const submitBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('直接核准建單'));
  expect(submitBtn.disabled, 'B 端無課應鎖住送出').toBe(true);
  app.unmount();
  expect(warnings).toEqual([]);
});

test('composer：節次下拉的午休排在第4節與第5節之間', async () => {
  const { app, el, warnings } = mountComposer();
  await nextTick();
  const selects = [...el.querySelectorAll('select.form-select')];
  // 版面順序：[0]=類型、[1]=A 節次、[2]=B 節次
  for (const idx of [1, 2]) {
    const labels = [...selects[idx].querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(labels[0], '第一項應為早自習').toBe('早自習');
    expect(labels[labels.length - 1], '最後一項應為第8節').toBe('第8節');
    const lunch = labels.indexOf('午休');
    expect(lunch, '午休應緊接在第4節之後：' + labels.join('／')).toBe(labels.indexOf('第4節') + 1);
    expect(labels[lunch + 1], '午休下一項應為第5節').toBe('第5節');
  }
  app.unmount();
  expect(warnings).toEqual([]);
});