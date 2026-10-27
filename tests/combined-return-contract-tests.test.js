import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiApproval } from '../src/modules/ui-approval.js';
import DateUtils from '../src/domain/date-utils.js';

// 併班上課（合班回原班）入口契約：
// 抽屜 MatchDrawerModal 用 UiLineTemplate.hasScheduleSpecialTag 決定是否顯示按鈕，
// startCombinedReturn 過去沒有拿到同一個判定器（deps 未注入就 fallback false），
// 造成「按鈕看得到、按下必跳『此功能僅適用於併班課堂』」。
// 本檔鎖住：單一班級的併班課（如 707 絲竹室內樂）也必須放行。

const candidate = { email: 'lin@example.edu.tw', name: '林衣穎', className: '708', subject: '絲竹室內樂' };

function makeApi({ classData, candidates = [], toasts = [], isCombinedClass }) {
  const ref = (value) => ({ value });
  const refs = {
    activeCell: ref({
      teacherEmail: 'chen@example.edu.tw',
      teacherName: '陳妍聿',
      dayOfWeek: 2,
      period: 3,
      classData
    }),
    inputRequestDate: ref('2026-10-27'),
    pendingRequestData: ref(null),
    combinedReturnCandidates: ref([]),
    showCompareModal: ref(false),
    showMatchModal: ref(true)
  };
  const api = UiApproval.create({
    ref,
    isAdmin: { value: true },
    showToast: (message) => { toasts.push(String(message)); },
    activeCell: refs.activeCell,
    inputRequestDate: refs.inputRequestDate,
    currentWeekDates: ref(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']),
    pendingRequestData: refs.pendingRequestData,
    combinedReturnCandidates: refs.combinedReturnCandidates,
    showCompareModal: refs.showCompareModal,
    showMatchModal: refs.showMatchModal,
    matchPreview: ref(null),
    isMutualCover: ref(false),
    consecAlertsA: ref([]),
    consecAlertsB: ref([]),
    PERIOD8_FEE: '第8節代課',
    isCombinedClass,
    // 刻意不注入 hasScheduleSpecialTag：等同 requests store 現況，
    // 驗證模組自身的預設判定器足以放行單一班級的併班課。
    findCombinedReturnCandidates: () => candidates
  });
  return { api, refs };
}

test('特殊標記＝併班的單一班級課堂，可按併班上課（deps 未注入判定器也要放行）', () => {
  const toasts = [];
  const { api, refs } = makeApi({
    classData: { className: '707', subject: '絲竹室內樂', specialTags: '併班' },
    candidates: [candidate],
    toasts
  });
  assert.equal(api.startCombinedReturn(), true, '應放行併班上課，實際被擋：' + toasts.join(' / '));
  assert.equal(refs.showCompareModal.value, true, '應開啟比較確認視窗');
  assert.equal(refs.combinedReturnCandidates.value.length, 1, '應帶入同節其他併班教師名單');
  assert.equal(refs.pendingRequestData.value.specialFlow, 'combined_return');
  assert.equal(refs.pendingRequestData.value.leaveTeacher, 'chen@example.edu.tw');
});

test('特殊標記寫「合班」視為併班（別名正規化）', () => {
  const toasts = [];
  const { api } = makeApi({
    classData: { className: '707', subject: '絲竹室內樂', specialTags: '合班' },
    candidates: [candidate],
    toasts
  });
  assert.equal(api.startCombinedReturn(), true, '合班應等同併班：' + toasts.join(' / '));
});

test('課堂屬性填併班也視為併班', () => {
  const toasts = [];
  const { api } = makeApi({
    classData: { className: '707', subject: '本土語', attr: '併班' },
    candidates: [candidate],
    toasts
  });
  assert.equal(api.startCombinedReturn(), true, '課堂屬性併班應放行：' + toasts.join(' / '));
});

test('班名為多班（707、708）視為併班', () => {
  const toasts = [];
  const { api } = makeApi({
    classData: { className: '707、708', subject: '絲竹室內樂', specialTags: '' },
    candidates: [candidate],
    toasts,
    isCombinedClass: DateUtils.isCombinedClass
  });
  assert.equal(api.startCombinedReturn(), true, '多班班名應放行：' + toasts.join(' / '));
});

test('非併班課堂：擋下並提示要在課表設特殊標記併班', () => {
  const toasts = [];
  const { api } = makeApi({
    classData: { className: '707', subject: '絲竹室內樂', specialTags: '' },
    candidates: [candidate],
    toasts
  });
  assert.equal(api.startCombinedReturn(), false);
  assert.match(toasts.join(' / '), /特殊標記/, '提示應指出可修正的資料位置');
});

test('同節沒有其他併班任課教師時，提示找不到人', () => {
  const toasts = [];
  const { api } = makeApi({
    classData: { className: '707', subject: '絲竹室內樂', specialTags: '併班' },
    candidates: [],
    toasts
  });
  assert.equal(api.startCombinedReturn(), false);
  assert.match(toasts.join(' / '), /找不到同節次的其他併班任課教師/);
});
