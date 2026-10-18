// @vitest-environment happy-dom
// 重現：單列列印預覽選部分聯，確認列印是否只印所選。
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ref, nextTick, createApp, h } from 'vue';
import { UiPrint } from '../src/modules/ui-print.js';
import PrintPreviewModal from '../src/components/PrintPreviewModal.vue';

const names = {
  'owner@school.example': '陳小華',
  'invitee@school.example': '王小明'
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
  }
];

function makeApi() {
  const printPreview = ref(null);
  const showPrintPreviewModal = ref(false);
  const api = UiPrint.create({
    getTeacherNameByEmail: email => names[String(email || '').toLowerCase()] || String(email || ''),
    getTeacherSubjectByEmail: () => '',
    getTeacherJobTitleByEmail: () => '國文教師',
    getWeekDayText: () => '',
    allSchedules: ref([]),
    isAdmin: ref(false),
    getScheduleForDate: () => null,
    selectedRecordIds: ref([]),
    substitutionRecords: ref(records.slice()),
    requestsList: ref([]),
    loading: ref(false),
    loadingMessage: ref(''),
    printPreview,
    showPrintPreviewModal,
    printPreviewImageBusy: ref(false),
    showDetailModal: ref(false),
    showCompareModal: ref(false),
    detailRequest: ref(null),
    detailSubRecord: ref(null),
    paperPrintDraft: ref(null),
    paperSignatureByTeacher: ref({}),
    isTriangleRequest: () => false,
    isExchangeLikeRequest: () => false,
    ensurePrintReady: async () => {},
    callGasApi: async () => ({}),
    syncHistorySelectionFromDom: () => {}
  });
  return { api, printPreview, showPrintPreviewModal };
}

test('單列列印：預覽只勾班級聯，確認列印只印班級聯', async () => {
  document.body.innerHTML = '<div id="toast-container"></div>';
  const { api, printPreview, showPrintPreviewModal } = makeApi();

  // 等同歷史列「列印此筆通知單」按鈕：printSingleRequest({ recordId: row.id }, 'Notice')
  // （printSingleRequest 本身不回傳值，以 modal 是否開啟為準）
  await api.printSingleRequest({ recordId: 'range-1' }, 'Notice');
  assert.equal(showPrintPreviewModal.value, true, '單列應能開啟列印預覽');
  assert.deepEqual(printPreview.value.copyKinds, [], '初始為全印');
  assert.equal(printPreview.value.copyKindOptions.length, 4);

  // 使用者在預覽下拉只留班級聯。
  api.setPrintPreviewCopyKinds(['class']);
  assert.deepEqual(printPreview.value.copyKinds, ['class'], '選擇應寫入預覽狀態');
  assert.match(printPreview.value.documentHtml, /班級：802/);
  assert.doesNotMatch(printPreview.value.documentHtml, /教學組留存/);

  // 攔截 window.open，擷取實際送印的 HTML。
  const writes = [];
  const realOpen = window.open;
  window.open = () => ({
    document: { open() {}, write(html) { writes.push(String(html)); }, close() {} },
    close() {},
    focus() {},
    print() {}
  });
  try {
    await api.confirmPrintPreview();
  } finally {
    window.open = realOpen;
  }
  assert.equal(writes.length, 1, '應實際送印一次');
  assert.match(writes[0], /班級：802/, '應印出班級聯');
  assert.doesNotMatch(writes[0], /教學組留存/, '不應印出留存聯');
  assert.doesNotMatch(writes[0], /請假教師：/, '不應印出請假教師聯');
  assert.doesNotMatch(writes[0], /代課\/調課教師：/, '不應印出代課教師聯');
});

test('單列列印：真實 modal 點選聯別，選擇應寫入預覽狀態', async () => {
  document.body.innerHTML = '<div id="toast-container"></div>';
  const { api, printPreview, showPrintPreviewModal } = makeApi();
  await api.printSingleRequest({ recordId: 'range-1' }, 'Notice');
  assert.equal(showPrintPreviewModal.value, true);

  // 比照 App.vue：以同一個 printPreview ref 綁定 modal。
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    setup() {
      return () =>
        h(PrintPreviewModal, {
          printPreview: printPreview.value,
          printPreviewImageBusy: false,
          closePrintPreview: () => {},
          copyPrintPreviewImage: () => {},
          downloadPrintPreviewImage: () => {},
          confirmPrintPreview: () => {},
          // 比照 output store：非同步轉發到同一實例。
          setPrintPreviewCopyKinds: (...args) => api.setPrintPreviewCopyKinds(...args),
          isPrintPreviewCopyKindSelected: (...args) => api.isPrintPreviewCopyKindSelected(...args)
        });
    }
  });
  app.mount(host);
  await nextTick();

  // 展開下拉，取消「教學組留存」。
  host.querySelector('.print-preview-kind-toggle').dispatchEvent(new Event('click'));
  await nextTick();
  const box = [...host.querySelectorAll('.print-preview-kind-chip input')]
    .find(input => input.value === 'retain');
  assert.ok(box, '應有教學組留存勾選框');
  box.checked = false;
  box.dispatchEvent(new Event('change'));
  await nextTick();

  assert.deepEqual(
    printPreview.value.copyKinds,
    ['leave', 'substitute', 'class'],
    'modal 點選應寫入真實預覽狀態'
  );
  assert.match(
    host.querySelector('.print-preview-kind-toggle').textContent,
    /3／4 種/,
    '摘要應更新為 3／4 種'
  );
  app.unmount();
  host.remove();
});

test('待核准單列（paperDraft）：預覽只勾班級聯，確認列印只印班級聯', async () => {
  document.body.innerHTML = '<div id="toast-container"></div>';
  const { api, printPreview, showPrintPreviewModal } = makeApi();

  // 等同待核准發放列的「列印通知」按鈕：openPaperPrintForRequest(row)
  // 走 paperDraft 預覽 → 確認列印 → printPaperDraft。
  const opened = await api.openPaperPrintDraft(records.slice(), { canPrint: true });
  assert.equal(opened, true, '待核准單列應能開啟紙本預覽');
  assert.equal(showPrintPreviewModal.value, true);
  assert.equal(printPreview.value.source, 'paperDraft');
  assert.deepEqual(printPreview.value.copyKinds, [], '初始為全印');

  api.setPrintPreviewCopyKinds(['class']);
  assert.deepEqual(printPreview.value.copyKinds, ['class']);
  assert.match(printPreview.value.documentHtml, /班級：802/);
  assert.doesNotMatch(printPreview.value.documentHtml, /教學組留存/);

  const writes = [];
  const realOpen = window.open;
  window.open = () => ({
    document: { open() {}, write(html) { writes.push(String(html)); }, close() {} },
    close() {},
    focus() {},
    print() {}
  });
  try {
    await api.confirmPrintPreview();
  } finally {
    window.open = realOpen;
  }
  assert.equal(writes.length, 1, '應實際送印一次');
  assert.match(writes[0], /班級：802/, '應印出班級聯');
  assert.doesNotMatch(writes[0], /教學組留存/, '不應印出留存聯');
  assert.doesNotMatch(writes[0], /請假教師：/, '不應印出請假教師聯');
  assert.doesNotMatch(writes[0], /代課\/調課教師：/, '不應印出代課教師聯');
});
