import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  runBackgroundSave,
  dismissSaveBubble,
  getLastSaveBubble
} from '../src/ui/save-bubble.js';

test('save-bubble：本地先寫入 → 背景成功 → 泡泡跳「已儲存」', async () => {
  const state = { value: '舊值' };
  const result = await runBackgroundSave({
    key: 'unit-ok',
    label: '編輯歷史紀錄',
    optimistic: () => {
      const prev = state.value;
      state.value = '新值';
      return prev;
    },
    rollback: (prev) => { state.value = prev; },
    apiCall: async () => ({ success: true }),
    successMessage: '修改已儲存'
  });

  assert.equal(result.ok, true);
  assert.equal(state.value, '新值', '成功後本地寫入應保留');
  const bubble = getLastSaveBubble();
  assert.equal(bubble.state, 'done');
  assert.match(bubble.text, /修改已儲存/);
  assert.match(bubble.text, /編輯歷史紀錄/);
  dismissSaveBubble();
});

test('save-bubble：後端失敗會回滾本地並給可重試的錯誤泡泡', async () => {
  const state = { value: '舊值' };
  const result = await runBackgroundSave({
    key: 'unit-fail',
    label: '教師資料',
    optimistic: () => {
      const prev = state.value;
      state.value = '寫壞了';
      return prev;
    },
    rollback: (prev) => { state.value = prev; },
    apiCall: async () => { throw new Error('GAS 逾時'); }
  });

  assert.equal(result.ok, false);
  assert.equal(state.value, '舊值', '失敗後應回滾到原本的值');
  const bubble = getLastSaveBubble();
  assert.equal(bubble.state, 'error');
  assert.match(bubble.text, /儲存失敗/);
  assert.match(bubble.text, /GAS 逾時/);
  dismissSaveBubble();
});

test('save-bubble：本地寫入就失敗時不打後端', async () => {
  let apiCalled = 0;
  const result = await runBackgroundSave({
    key: 'unit-local-fail',
    label: '空堂事件',
    optimistic: () => { throw new Error('本機資料壞了'); },
    apiCall: async () => { apiCalled += 1; return null; }
  });

  assert.equal(result.ok, false);
  assert.equal(result.local, true);
  assert.equal(apiCalled, 0, '本地寫入失敗不應再打 GAS');
  assert.match(getLastSaveBubble().text, /本機資料壞了/);
  dismissSaveBubble();
});

test('save-bubble：successMessage 可為函式（文字依當下狀態產生）', async () => {
  let detail = '全校';
  await runBackgroundSave({
    key: 'unit-fn-label',
    label: '空堂事件',
    apiCall: async () => { detail = '3 班'; return true; },
    successMessage: () => '空堂事件已儲存（' + detail + '）'
  });

  assert.match(getLastSaveBubble().text, /3 班/);
  dismissSaveBubble();
});
