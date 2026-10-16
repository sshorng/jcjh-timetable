// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import {
  buildPrintForms,
  buildPrintPreview,
  getPrintCopyKindCounts,
  normalizePrintCopyKinds,
  packPrintForms,
  selectPrintCopies,
  PRINT_COPY_KINDS
} from '../src/modules/print-helper.js';
import { UiHistory } from '../src/modules/ui-history.js';
import { computed, nextTick, reactive, ref, createApp } from 'vue';
import PrintPreviewModal from '../src/components/PrintPreviewModal.vue';

const names = {
  'owner@school.example': '陳小華',
  'invitee@school.example': '王小明'
};
const fixtureContext = {
  getTeacherNameByEmail: email => names[String(email || '').toLowerCase()] || String(email || ''),
  getTeacherJobTitleByEmail: () => '國文教師',
  isAdmin: false
};

const records = [
  {
    id: 'range-1',
    requestId: 'range-1',
    serial: 'SUB-R1',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'invitee@school.example',
    originalTeacherName: '陳小華',
    actualTeacherName: '王小明',
    date: '2026-09-07',
    period: 1,
    className: '802',
    subject: '生活科技',
    reason: '事假'
  },
  {
    id: 'range-2',
    requestId: 'range-2',
    serial: 'SUB-R2',
    type: 'substitution',
    originalTeacherEmail: 'owner@school.example',
    actualTeacherEmail: 'invitee@school.example',
    originalTeacherName: '陳小華',
    actualTeacherName: '王小明',
    date: '2026-09-14',
    period: 2,
    className: '801',
    subject: '健康教育',
    reason: '病假'
  }
];

test('列印聯別：每張分送單據都帶聯別，四種聯都會出現', () => {
  const forms = buildPrintForms(records, records, fixtureContext);
  assert.equal(forms.printCopies.length, forms.printCopyKinds.length,
    '分送單據與聯別必須一對一');
  assert.deepEqual([...new Set(forms.printCopyKinds)].sort(), [...PRINT_COPY_KINDS].sort());
  const counts = getPrintCopyKindCounts(forms);
  // 兩筆分屬不同週、不合併：留存／請假教師／代課教師各兩張，班級各一張。
  assert.equal(counts.retain, 2, '教學組留存聯');
  assert.equal(counts.leave, 2, '請假教師聯');
  assert.equal(counts.substitute, 2, '代課教師聯');
  assert.equal(counts.class, 2, '兩筆各一張班級通知單');
  assert.equal(counts.retain + counts.leave + counts.substitute + counts.class, forms.printCopies.length);
});

test('列印聯別：只勾選一聯時只印該聯', () => {
  const forms = buildPrintForms(records, records, fixtureContext);

  const retainOnly = packPrintForms(forms, { copyKinds: ['retain'] });
  assert.match(retainOnly, /教學組留存/);
  assert.doesNotMatch(retainOnly, /請假教師：/);
  assert.doesNotMatch(retainOnly, /代課\/調課教師：/);
  assert.doesNotMatch(retainOnly, /班級：/);

  const classOnly = packPrintForms(forms, { copyKinds: ['class'] });
  assert.equal((classOnly.match(/official-audience-label(?=\s|")/g) || []).length, 2,
    '只印班級通知單時應有兩張');
  assert.match(classOnly, /班級：802/);
  assert.doesNotMatch(classOnly, /教學組留存/);

  const teacherOnly = packPrintForms(forms, { copyKinds: ['leave', 'substitute'] });
  assert.match(teacherOnly, /請假教師：陳小華/);
  assert.match(teacherOnly, /代課\/調課教師：王小明/);
  assert.doesNotMatch(teacherOnly, /教學組留存/);
  assert.doesNotMatch(teacherOnly, /班級：/);
});

test('列印聯別：未指定時維持四種聯全印（既有行為不變）', () => {
  const forms = buildPrintForms(records, records, fixtureContext);
  const all = packPrintForms(forms);
  assert.equal((all.match(/official-audience-label(?=\s|")/g) || []).length, 8);
  assert.deepEqual(normalizePrintCopyKinds([]), [], '空選擇＝全印');
  assert.deepEqual(normalizePrintCopyKinds(null), []);
  assert.deepEqual(normalizePrintCopyKinds('class'), ['class']);
  assert.deepEqual(normalizePrintCopyKinds(['class', 'retain', 'bogus']), ['retain', 'class'],
    '未知聯別丟棄並固定回傳順序');
  assert.equal(selectPrintCopies(forms, []).length, 8);
});

test('列印聯別：預覽可只顯示單一聯並回報張數', () => {
  const ctx = Object.assign({}, fixtureContext, {
    selectedRecordIds: { value: records.map(record => record.id) },
    substitutionRecords: { value: records }
  });
  const full = buildPrintPreview(ctx, { records, allSubs: records });
  assert.equal(full.copyCount, 8);
  assert.equal(full.pageCount, 4);
  assert.deepEqual(full.copyKinds, [], '未指定＝全印');
  assert.equal(full.copyKindOptions.length, PRINT_COPY_KINDS.length);
  assert.match(full.documentHtml, /教學組留存/);
  assert.match(full.documentHtml, /班級：802/);

  const classOnly = buildPrintPreview(ctx, { records, allSubs: records, copyKinds: ['class'] });
  assert.equal(classOnly.copyCount, 2);
  assert.equal(classOnly.pageCount, 1);
  assert.deepEqual(classOnly.copyKinds, ['class']);
  assert.match(classOnly.documentHtml, /班級：802/);
  assert.doesNotMatch(classOnly.documentHtml, /教學組留存/);
  // 各聯別張數不受目前選擇影響，畫面才能顯示可勾選的總量。
  assert.equal(classOnly.copyKindOptions.find(option => option.kind === 'retain').count, 2);
});

test('歷史紀錄：日期區間明確篩選（起訖互換自動對調）', () => {
  const state = {
    historyFilterMode: ref('all'),
    historyTypeFilter: ref('all'),
    historySearchQuery: ref(''),
    historyFilterDate: ref('2026-09-07'),
    historyRangeStart: ref(''),
    historyRangeEnd: ref(''),
    historyPage: ref(1),
    historyPageSize: ref(20),
    isHistoryExchangeType: () => false,
    ensureHistoryMonthLoaded: () => {},
    toLocalDateStr: () => '2026-09-30',
    user: ref({ email: 'owner@school.example' }),
    isAdmin: ref(true),
    isStaff: ref(false),
    substitutionRecords: ref(records.slice()),
    requestsList: ref([]),
    getTeacherNameByEmail: email => names[String(email || '').toLowerCase()] || String(email || '')
  };
  const api = UiHistory.create(Object.assign({ computed, watch: () => {} }, state));
  // showToast 需要 toast 容器；此處只需驗證回傳值，不看畫面。
  document.body.innerHTML = '<div id="toast-container"></div>';

  assert.equal(api.dateFilteredHistoryRecords.value.length, 2, '全部模式不過濾');

  assert.equal(api.setHistoryRangeFilter('2026-09-08', '2026-09-30'), true);
  assert.equal(state.historyFilterMode.value, 'range');
  assert.deepEqual(api.dateFilteredHistoryRecords.value.map(r => r.id), ['range-2'],
    '區間只留區間內的紀錄');

  assert.equal(api.setHistoryRangeFilter('2026-09-01', '2026-09-07'), true);
  assert.deepEqual(api.dateFilteredHistoryRecords.value.map(r => r.id), ['range-1']);

  // 起日大於迄日時自動對調，仍應查得到資料。
  assert.equal(api.setHistoryRangeFilter('2026-09-30', '2026-09-01'), true);
  assert.equal(state.historyRangeStart.value, '2026-09-01');
  assert.equal(state.historyRangeEnd.value, '2026-09-30');
  assert.equal(api.dateFilteredHistoryRecords.value.length, 2);

  // 只填起日＝迄日不限。
  assert.equal(api.setHistoryRangeFilter('2026-09-08', ''), true);
  assert.deepEqual(api.dateFilteredHistoryRecords.value.map(r => r.id), ['range-2']);

  // 跨月區間需補載涵蓋的所有月份（補載最多 24 個月，避免跨學年一次打太多請求）。
  assert.equal(api.setHistoryRangeFilter('2026-08-25', '2026-10-05'), true);
  assert.deepEqual(api.getHistoryRangeMonths(), ['2026-08', '2026-09', '2026-10']);

  assert.equal(api.setHistoryRangeFilter('', ''), false, '起訖皆空視為未設定');
  assert.deepEqual(api.getHistoryRangeMonths(), [], '未設定區間時不補載月份');
});

test('歷史紀錄：日期欄位移除後，本日/本週/本月固定以今天為基準', () => {
  const today = '2026-10-16';
  const state = {
    historyFilterMode: ref('all'),
    historyTypeFilter: ref('all'),
    historySearchQuery: ref(''),
    historyFilterDate: ref('2020-01-01'),
    historyRangeStart: ref(''),
    historyRangeEnd: ref(''),
    historyPage: ref(1),
    historyPageSize: ref(20),
    isHistoryExchangeType: () => false,
    toLocalDateStr: () => today,
    user: ref({ email: 'owner@school.example' }),
    isAdmin: ref(true),
    isStaff: ref(false),
    substitutionRecords: ref(records.slice()),
    requestsList: ref([]),
    getTeacherNameByEmail: email => names[String(email || '').toLowerCase()] || String(email || '')
  };
  const loaded = [];
  const api = UiHistory.create(Object.assign({
    computed,
    watch: () => {},
    ensureHistoryMonthLoaded: ym => loaded.push(ym)
  }, state));

  ['day', 'week', 'month'].forEach(mode => {
    state.historyFilterDate.value = '2020-01-01';
    api.setHistoryFilterMode(mode);
    assert.equal(state.historyFilterMode.value, mode);
    assert.equal(state.historyFilterDate.value, today,
      mode + ' 的基準日應重設為今天，不可沿用舊值');
    assert.equal(state.historyPage.value, 1, mode + ' 應回到第一頁');
  });

  // 只有本月需要補載該月資料。
  assert.ok(loaded.includes('2026-10'), '本月應補載今天所在月份');
});

test('歷史紀錄：月份預載不得改動使用者篩選狀態', () => {
  const state = {
    historyFilterMode: ref('range'),
    historyTypeFilter: ref('all'),
    historySearchQuery: ref(''),
    historyFilterDate: ref('2026-10-16'),
    historyRangeStart: ref('2026-09-01'),
    historyRangeEnd: ref('2026-09-30'),
    historyPage: ref(3),
    historyPageSize: ref(20),
    historyLoadedMonths: ref(['2026-09']),
    historyFullLoaded: ref(false),
    historyMonthLoading: ref(false),
    isHistoryExchangeType: () => false,
    toLocalDateStr: () => '2026-10-16',
    user: ref({ email: 'owner@school.example' }),
    isAdmin: ref(true),
    isStaff: ref(false),
    substitutionRecords: ref(records.slice()),
    requestsList: ref([]),
    getTeacherNameByEmail: email => names[String(email || '').toLowerCase()] || String(email || '')
  };
  const api = UiHistory.create(Object.assign({
    computed,
    watch: () => {},
    ensureHistoryMonthLoaded: () => {},
    fetchHistoryMonth: () => new Promise(() => {})
  }, state));

  // 已載入該月時應直接返回，且不得動篩選模式／基準日／頁碼。
  api.loadHistoryMonth('2026-09');
  assert.equal(state.historyFilterMode.value, 'range', '預載不應把區間模式改成本月');
  assert.equal(state.historyFilterDate.value, '2026-10-16', '預載不應移動基準日');
  assert.equal(state.historyPage.value, 3, '預載不應重設頁碼');
});

test('畫面接線：預覽可勾選聯別、歷史可選日期區間', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const previewModal = fs.readFileSync(
    path.join(here, '..', 'src', 'components', 'PrintPreviewModal.vue'), 'utf8');
  const app = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
  const store = fs.readFileSync(path.join(here, '..', 'src', 'stores', 'mutual.js'), 'utf8');

  // 列印預覽：四種聯的勾選框＋全選，點擊走 setPrintPreviewCopyKinds 重算。
  assert.match(previewModal, /printPreview\.copyKindOptions/);
  assert.match(previewModal, /isPrintPreviewCopyKindSelected\(option\.kind\)/);
  assert.match(previewModal, /要印的聯別/);
  assert.match(app, /:set-print-preview-copy-kinds="setPrintPreviewCopyKinds"/);
  assert.match(app, /:is-print-preview-copy-kind-selected="isPrintPreviewCopyKindSelected"/);

  // 歷史紀錄：區間模式有起訖日期輸入與套用按鈕。
  assert.match(app, /setHistoryFilterMode\('range'\)/);
  assert.match(app, /v-model="historyRangeStart"/);
  assert.match(app, /v-model="historyRangeEnd"/);
  assert.match(app, /@click="applyHistoryRangeFilter"/);
  assert.match(store, /const historyRangeStart = ref\(''\)/);
  assert.match(store, /const historyRangeEnd = ref\(''\)/);
});

/**
 * 聯別勾選列的實際行為：copyKinds 空陣列代表「四種聯全印」，
 * 取消勾選必須是「從全選中移除」，不能反過來變成「只選這一聯」。
 */
async function mountKindBar(copyKinds, options = {}) {
  // happy-dom 的 iframe 掛載時會真的 document.write(srcdoc) 而拋 insertBefore；
  // documentHtml 留空即可跳過載入，驗證範圍只需聯別勾選列。
  const state = reactive({
    recordCount: 2, staffFormCount: 2, classCopyCount: 2, pageCount: 1, copyCount: 2,
    documentHtml: '', formsHtml: '', copyKinds,
    copyKindOptions: [
      { kind: 'retain', label: '教學組留存', count: 1 },
      { kind: 'leave', label: '請假教師', count: 1 },
      { kind: 'substitute', label: '代課/調課教師', count: 1 },
      { kind: 'class', label: '班級通知單', count: 2 }
    ],
    canPrint: true
  });
  const applied = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp(PrintPreviewModal, {
    printPreview: state,
    printPreviewImageBusy: false,
    closePrintPreview: () => {},
    copyPrintPreviewImage: () => {},
    downloadPrintPreviewImage: () => {},
    confirmPrintPreview: () => {},
    // 模擬真實行為：套用選擇後更新來源，元件要能讀到最新狀態。
    setPrintPreviewCopyKinds: (kinds) => { applied.push(kinds.slice()); state.copyKinds = kinds; },
    // 空集合＝全印，與 ui-print.js 相同語意。
    isPrintPreviewCopyKindSelected: (kind) => !Array.isArray(state.copyKinds)
      || !state.copyKinds.length
      || state.copyKinds.indexOf(kind) >= 0,
    ...options.props
  });
  app.mount(host);
  await nextTick();
  const boxes = [...host.querySelectorAll('.print-preview-kind-chip input')];
  const clickKind = async (kind) => {
    const box = boxes.find(input => input.value === kind);
    assert.ok(box, '找不到聯別勾選框：' + kind);
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    await nextTick();
  };
  return {
    applied, clickKind, boxes, host,
    last: () => applied[applied.length - 1],
    unmount: () => {
      app.unmount();
      host.remove();
    }
  };
}

test('聯別勾選列：從全印取消勾選是「移除」而非「反轉」', async () => {
  // 重現回報的問題：只留班級聯時不該再印出教學組留存聯。
  const bar = await mountKindBar([]);
  assert.equal(bar.applied.length, 0, '初始不應送出選擇');
  await bar.clickKind('retain');
  assert.deepEqual(bar.last(), ['leave', 'substitute', 'class'], '取消教學組留存＝移除該聯');
  await bar.clickKind('leave');
  assert.deepEqual(bar.last(), ['substitute', 'class']);
  await bar.clickKind('substitute');
  assert.deepEqual(bar.last(), ['class'], '最後應只剩班級通知單，不得出現教學組留存聯');
  bar.unmount();
});

test('聯別勾選列：重新勾選可加回，最後一聯不可取消', async () => {
  const bar = await mountKindBar([]);
  await bar.clickKind('retain');
  await bar.clickKind('leave');
  await bar.clickKind('substitute');
  assert.deepEqual(bar.last(), ['class']);
  // 取消最後一聯會被還原，避免印出空白。
  await bar.clickKind('class');
  assert.deepEqual(bar.last(), ['class']);
  // 加回其他聯。
  await bar.clickKind('retain');
  assert.deepEqual(bar.last(), ['retain', 'class']);
  // 全選按鈕（在自己的 host 內查詢，避免抓到其他測試的殘留 DOM）。
  const allBtn = [...bar.host.querySelectorAll('.print-preview-kind-bar button')]
    .find(btn => btn.textContent.includes('全選'));
  assert.ok(allBtn, '應有全選按鈕');
  assert.equal(allBtn.disabled, false, 'canPrint 時全選按鈕不應被停用');
  allBtn.dispatchEvent(new Event('click'));
  await nextTick();
  assert.deepEqual(bar.last(), ['retain', 'leave', 'substitute', 'class']);
  bar.unmount();
});

test('聯別勾選列：已指定選擇時只影響該聯', async () => {
  const bar = await mountKindBar(['class']);
  await bar.clickKind('retain');
  assert.deepEqual(bar.last(), ['retain', 'class']);
  await bar.clickKind('retain');
  assert.deepEqual(bar.last(), ['class'], '再取消一次應回到只剩班級聯');
  bar.unmount();
});
