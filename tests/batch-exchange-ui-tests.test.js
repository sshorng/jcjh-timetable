import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UiBatchPanel } from '../src/modules/ui-activity.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function ref(value) {
  return { value };
}

test('batch exchange ui tests（v1 移植）', () => {
  const batchFlowMode = ref('substitution');
  const batchAssignMode = ref('same');
  const batchSlots = ref([]);
  const deps = {
    computed(fn) {
      return { get value() { return fn(); } };
    },
    showToast() {},
    isMutualCover: ref(false),
    batchSlots,
    batchSelectMode: ref(true),
    batchFlowMode,
    batchAssignMode,
    batchActiveSlotKey: ref(''),
    exchangeWeekOffset: ref(0),
    exchangeWeekdayFilter: ref(0),
    matchSearchQuery: ref(''),
    matchDisplayCount: ref(10),
    matchPreview: ref(null),
    activeCell: ref(null),
    inputRequestDate: ref(''),
    recommendedTeachers: ref([]),
    matchShowNoTeacherWarning: ref(false),
    matchEmptyReasons: ref(null),
    batchSubTeacher: ref(''),
    batchReason: ref(''),
    batchSubFee: ref('自費代課'),
    batchNote: ref(''),
    showBatchConfirmModal: ref(false),
    showMatchModal: ref(false),
    showCompareModal: ref(false),
    matchMode: ref('substitution')
  };

  const panel = UiBatchPanel.create(deps);
  panel.setBatchFlowMode('exchange');
  assert.equal(batchAssignMode.value, 'perSlot', '批次調課應預設逐組指定');

  panel.setBatchAssignMode('same');
  assert.equal(batchAssignMode.value, 'perSlot', '批次調課不可切回同一人全調');

  const slot = {
    key: 'teacher@example.com|2026-10-07|1',
    teacherEmail: 'teacher@example.com',
    teacherName: '測試教師',
    dateStr: '2026-10-07',
    dayOfWeek: 3,
    period: 1,
    className: '904',
    subject: '國文'
  };
  batchSlots.value = [slot];
  deps.exchangeWeekdayFilter.value = 3;
  deps.matchSearchQuery.value = '先前的搜尋';
  panel.selectBatchSlotForMatch(slot.key);
  assert.equal(deps.exchangeWeekdayFilter.value, 0, '切換調課組別時清除前一組星期篩選');
  assert.equal(deps.matchSearchQuery.value, '', '切換調課組別時清除前一組搜尋字詞');

  panel.setBatchFlowMode('substitution');
  assert.equal(batchAssignMode.value, 'same', '切回批次代課仍保留原本預設');

  // v1 讀 index.html／app.js；v2 樣板在 src/App.vue（殼層見 v2/index.html）
  // 媒合抽屜／對照 modal 已抽為 components（模板聚合見 composition.test.js）
  const html = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
  const matchHtml = fs.readFileSync(path.join(here, '..', 'src', 'components', 'MatchDrawerModal.vue'), 'utf8');
  const compareHtml = fs.readFileSync(path.join(here, '..', 'src', 'components', 'CompareModal.vue'), 'utf8');
  const submitSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-submit.js'), 'utf8');
  // 2A：申請欄位檢查已移至 ui-homeroom.js
  const homeroomSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-homeroom.js'), 'utf8');
  assert.doesNotMatch(html, /同一人全調/, '批次調課介面不再顯示同一人全調選項');
  assert.match(html, /batchSelectMode \? '批次' : '📦 批次處理'/, '啟用時用短標籤與顏色表示，未啟用時顯示批次處理');
  assert.match(html, /class="batch-operation-picker" role="group" aria-label="批次處理方式"/, '三種批次操作應以單一控制群組呈現');
  assert.match(html, /action-buttons-wrap timetable-toolbar-actions/, '課表工具列具有統一按鈕外觀');
  assert.match(html, /class="btn btn-sm batch-operation-type"[\s\S]*?batchFlowMode === 'substitution'[\s\S]*?代課/, '代課模式提供明確選取狀態');
  assert.match(html, /class="btn btn-sm batch-operation-type"[\s\S]*?batchFlowMode === 'exchange'[\s\S]*?調課/, '調課模式提供明確選取狀態');
  assert.match(html, /v-if="isAdmin"[\s\S]*?data-tour="mutual-btn"/, '管理員仍可使用活動互代按鈕');
  assert.ok(
    html.indexOf('@click="isScheduleEditMode = !isScheduleEditMode"') > html.indexOf('data-tour="mutual-btn"'),
    '編輯基礎課表按鈕維持在工具列最右側'
  );
  assert.match(matchHtml, /選為本組/, '批次調課候選按鈕應清楚標示配對動作');
  assert.match(matchHtml, /match-op-pair-horizontal[\s\S]*?previewBatchCandidate\('substitution', t\.email\)[\s\S]*?模擬[\s\S]*?指定此節/, '批次代課模擬與指定按鈕水平排列');
  assert.match(matchHtml, /match-op-pair-horizontal[\s\S]*?previewBatchCandidate\('exchange', r\.teacherEmail[\s\S]*?模擬[\s\S]*?選為本組/, '批次調課模擬與配對按鈕水平排列');
  assert.match(compareHtml, /pendingRequestData\.isBatchCandidatePreview[\s\S]*?返回批次候選/, '預覽模式只提供返回候選，不顯示送出按鈕');
  assert.match(compareHtml, /batch-exchange-preview-switch[\s\S]*?setBatchExchangePreviewSlot\(s\.key\)[\s\S]*?template v-if="isCrossWeekExchange"/, '批次調課預覽可切換配對組別並顯示課表');
  assert.match(compareHtml, /batch-exchange-preview-switch[\s\S]*?<\/details>\s*<!-- 批次節次摘要 -->/, '課表預覽後仍保留批次申請摘要');
  assert.doesNotMatch(html, /逐組指定對調教師與對方課堂|逐組選定對調教師與對方課堂；已配對/, '批次調課抽屜不顯示重複的逐組配對說明');
  assert.match(matchHtml, /type="button" class="btn btn-primary btn-sm-compact" @click\.stop\.prevent="prepCompare\('exchange'/, '選為本組按鈕不可觸發表單預設送出');
  assert.doesNotMatch(html, /目前配對：/, '批次調課媒合區不再顯示佔空間的目前配對摘要');
  assert.match(matchHtml, /class="match-filter-area"[\s\S]*?<div v-if="!activeCell\.dayOfWeek"/, '一般媒合篩選區分支應由有效的 v-if 開始');
  assert.match(submitSource, /const isPeriod8FeeLocked = computed\(\(\) => \{\s*const pending = pendingRequestData\.value;\s*if \(!pending \|\| pending\.mode !== 'substitution'\)/, '第8節經費計算可處理空的申請資料');
  assert.match(submitSource, /const hasSubTeacherConflict = computed\(\(\) => \{\s*const pending = pendingRequestData\.value;\s*if \(!pending \|\| pending\.mode !== 'substitution'\)/, '代課衝堂計算可處理空的申請資料');
  assert.match(homeroomSource, /const isRequestValid = computed\(\(\) => \{\s*const pending = pendingRequestData\.value;\s*if \(!inputRequestDate\.value \|\| !pending\)/, '申請欄位檢查可處理空的申請資料');
  assert.match(submitSource, /if \(pending\.isBatch && pending\.mode === 'exchange'\)\s*\{\s*return getWeekDatesForCompare\(pending\.date/, '批次調課左側課表依目前配對組別週次顯示');
  assert.match(submitSource, /if \(pending\.isExchangeBatch\) return pending\.subTeacher/, '批次調課右側課表依目前配對組別切換教師');

  // v2 尚無 style.css／mobile.css（App.vue 無 <style> 段）：v1 的三個樣式斷言此處不移植，
  // 待樣式層移植後補回（膠囊按鈕／抽屜捲動／手機 90vh）。

  console.log('batch exchange UI tests PASS');
});
