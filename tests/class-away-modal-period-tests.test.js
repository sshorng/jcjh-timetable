// @vitest-environment happy-dom
// 空堂事件規則卡：節次必須能各自點選（曾因 :disabled 鎖死全部變灰）
import { test, expect } from 'vitest';
import { createApp, nextTick, reactive } from 'vue';
import ClassAwayModal from '../src/components/ClassAwayModal.vue';

const PERIOD_OPTIONS = [
  { value: '0', label: '早自習' },
  { value: '1', label: '第1節' }, { value: '2', label: '第2節' },
  { value: '3', label: '第3節' }, { value: '4', label: '第4節' },
  { value: '45', label: '午休' },
  { value: '5', label: '第5節' }, { value: '6', label: '第6節' },
  { value: '7', label: '第7節' }, { value: '8', label: '第8節' }
];

function makeRule(patch) {
  return Object.assign({
    scope: 'classes',
    classes: ['802'],
    classesText: '802',
    subjectsText: '',
    periodMode: 'daily',
    periods: ['all'],
    startPeriod: '0',
    endPeriod: '8',
    billingRule: 'keep',
    expanded: true,
    pickerOpen: false
  }, patch || {});
}

function mountModal(form) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const app = createApp(ClassAwayModal, {
    classAwayForm: form,
    classAwayModalMode: 'add',
    classAwayPeriodOptions: PERIOD_OPTIONS,
    classList: ['802', '805', '806'],
    subjectOptions: [],
    saveClassAwayEvent: () => {},
    'onUpdate:classAwayForm': (next) => {
      Object.keys(next).forEach((key) => { form[key] = next[key]; });
    }
  });
  app.mount(el);
  return { app, el };
}

async function flush() {
  for (let i = 0; i < 4; i++) await nextTick();
}

function periodInputs(el) {
  return Array.from(el.querySelectorAll('.cae-period-grid input[type="checkbox"]'));
}

function toggle(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new Event('change'));
}

test('規則卡節次可各自點選，全部勾滿才記為全部節次', async () => {
  const form = reactive({
    date: '2026-11-20',
    endDate: '2026-11-20',
    subjectsText: '',
    billingRule: 'keep',
    note: '',
    rules: [makeRule()]
  });
  const { app, el } = mountModal(form);
  await flush();

  let inputs = periodInputs(el);
  expect(inputs.length).toBe(PERIOD_OPTIONS.length);
  // 預設全部節次：全勾，且每一格都能點（舊版這裡全部 disabled）
  expect(inputs.every((input) => input.checked)).toBe(true);
  expect(inputs.some((input) => input.disabled)).toBe(false);

  // 取消第3節：只影響那一格
  toggle(inputs[3], false);
  await flush();
  expect(form.rules[0].periods).toEqual(['0', '1', '2', '4', '45', '5', '6', '7', '8']);
  inputs = periodInputs(el);
  expect(inputs[3].checked).toBe(false);
  expect(inputs[2].checked).toBe(true);
  expect(inputs[4].checked).toBe(true);
  expect(inputs.every((input) => input.disabled)).toBe(false);

  // 再取消午休：兩格都掉，其餘不動
  toggle(inputs[5], false);
  await flush();
  expect(form.rules[0].periods).toEqual(['0', '1', '2', '4', '5', '6', '7', '8']);

  // 補回第3節與午休：全部勾滿即收斂回 all
  inputs = periodInputs(el);
  toggle(inputs[3], true);
  await flush();
  inputs = periodInputs(el);
  toggle(inputs[5], true);
  await flush();
  expect(form.rules[0].periods).toEqual(['all']);
  expect(periodInputs(el).every((input) => input.checked)).toBe(true);

  app.unmount();
});

test('多規則時各卡節次互不干擾', async () => {
  const form = reactive({
    date: '2026-11-20',
    endDate: '2026-11-20',
    subjectsText: '',
    billingRule: 'keep',
    note: '',
    rules: [makeRule(), makeRule({ scope: 'all', classes: [], classesText: '' })]
  });
  const { app, el } = mountModal(form);
  await flush();

  const grids = Array.from(el.querySelectorAll('.cae-period-grid'));
  expect(grids.length).toBe(2);

  const firstGrid = grids[0].querySelectorAll('input[type="checkbox"]');
  const secondGrid = grids[1].querySelectorAll('input[type="checkbox"]');
  toggle(firstGrid[1], false);
  await flush();

  expect(form.rules[0].periods).toEqual(['0', '2', '3', '4', '45', '5', '6', '7', '8']);
  expect(form.rules[1].periods).toEqual(['all']);

  toggle(secondGrid[8], false);
  await flush();
  expect(form.rules[0].periods).toEqual(['0', '2', '3', '4', '45', '5', '6', '7', '8']);
  expect(form.rules[1].periods).toEqual(['0', '1', '2', '3', '4', '45', '5', '6', '8']);

  app.unmount();
});
