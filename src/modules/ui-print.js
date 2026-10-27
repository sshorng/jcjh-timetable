/**
 * 自 v1 ui-print.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */

/**
 * ui-print.js — 列印／紙本（預覽／單據／紙草稿）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
import { showToast } from '../ui/toast.js';
import DateUtils from '../domain/date-utils.js';
// 課表匯出已遷 ui-report 按需載入（export-lazy.js）；列印輔助維持靜態（預覽為同步路徑）
import {
  generateFormHtml as buildFormHtml,
  printSelectedForms as runPrintSelectedForms,
  buildPrintPreview,
  buildPrintPreviewImageSvg,
  buildHistoryPrintRecords,
  expandPrintRequestsForBatch,
  normalizePrintCopyKinds
} from './print-helper.js';
const UiPrint = (() => {
  function create(deps) {
    deps = deps || {};
    var detailRequest = deps.detailRequest;
    var detailSubRecord = deps.detailSubRecord;
    var isTriangleRequest = deps.isTriangleRequest;
    var isExchangeLikeRequest = deps.isExchangeLikeRequest;
    var callGasApi = deps.callGasApi;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getTeacherSubjectByEmail = deps.getTeacherSubjectByEmail;
    var getTeacherJobTitleByEmail = deps.getTeacherJobTitleByEmail;
    var getWeekDayText = deps.getWeekDayText;
    var allSchedules = deps.allSchedules;
    var isAdmin = deps.isAdmin;
    var getScheduleForDate = deps.getScheduleForDate;
    var selectedRecordIds = deps.selectedRecordIds;
    var substitutionRecords = deps.substitutionRecords;
    var requestsList = deps.requestsList;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var printPreview = deps.printPreview;
    var showPrintPreviewModal = deps.showPrintPreviewModal;
    var printPreviewImageBusy = deps.printPreviewImageBusy;
    var showDetailModal = deps.showDetailModal;
    var showCompareModal = deps.showCompareModal;
    var syncHistorySelectionFromDom = deps.syncHistorySelectionFromDom;
    var buildPaperRecordsForSubmittedRequests = deps.buildPaperRecordsForSubmittedRequests;
    var isCombinedReturnRequest = deps.isCombinedReturnRequest;
    var isCourseAdjustmentOnlyRequest = deps.isCourseAdjustmentOnlyRequest;
    var pendingRequestData = deps.pendingRequestData;
    var defaultSubFeeForReason = deps.defaultSubFeeForReason;
    var batchSlots = deps.batchSlots;
    var decodePaperTimeKey = deps.decodePaperTimeKey;
    var paperPrintDraft = deps.paperPrintDraft;
    var paperSignatureByTeacher = deps.paperSignatureByTeacher;
    var successActionRequests = deps.successActionRequests;
    var openPaperPrintDraftForSubmittedRequests = deps.openPaperPrintDraftForSubmittedRequests;
    var showSuccessModal = deps.showSuccessModal;
    var showTriangleTimetablePreview = deps.showTriangleTimetablePreview;
    var triangleParticipants = deps.triangleParticipants;
    var triangleLegs = deps.triangleLegs;
    var triangleReason = deps.triangleReason;
    var triangleNote = deps.triangleNote;
    var triangleReady = deps.triangleReady;
    var mutualDrafts = deps.mutualDrafts;
    var mutualNote = deps.mutualNote;
    var ensurePrintReady = deps.ensurePrintReady;
    var addEventToCalendar = deps.addEventToCalendar;

const generateFormHtml = (g, currentType) => {
  // R-v2接線：print-helper 靜態 import，常駐可用（v1 需等 script 懶載）
  return buildFormHtml(g, currentType, {
    getTeacherNameByEmail,
    getTeacherSubjectByEmail,
    getTeacherJobTitleByEmail,
    getWeekDayText,
    showToast,
    allSchedules,
    isAdmin: isAdmin.value,
    getScheduleForDate
  });
};

const createPrintContext = (printWin = null, printOptions = {}) => ({
  selectedRecordIds,
  substitutionRecords,
  requestsList,
  callGasApi,
  markLocalPrinted,
  getTeacherNameByEmail,
  getTeacherSubjectByEmail,
  getTeacherJobTitleByEmail,
  getWeekDayText,
  showToast,
  loading,
  isAdmin: isAdmin.value,
  loadingMessage,
  allSchedules,
  getScheduleForDate,
  printWin,
  printRecords: Array.isArray(printOptions.records) ? printOptions.records : null,
  skipMarkPrinted: !!printOptions.skipMarkPrinted,
  // 只印指定聯（未指定＝四種聯全印）
  copyKinds: Array.isArray(printOptions.copyKinds) ? printOptions.copyKinds.slice() : null
});

const ensureExportReady = async () => {
  // 課表匯出已遷 ui-report 按需載入；此 gate 保留相容（恆成功）
};

/**
 * 紙本單據的「代課教師」姓名對照表：管理員版預填姓名，非管理員版留空待簽名。
 * 歷史列印、批次列印（待核准發放／核准後一鍵列印）與紙本草稿共用同一份規則，
 * 只要呼叫端組好紙本紀錄，姓名欄的呈現就不會有兩種結果。
 */
const buildPrintSignatureMap = (records) => {
  const isAdminFlag = !!(isAdmin && typeof isAdmin.value === 'boolean' ? isAdmin.value : isAdmin);
  const map = {};
  (records || []).filter(Boolean).forEach(record => {
    [record.actualTeacherEmail, record.originalTeacherEmail, record.actualTeacherName, record.originalTeacherName]
      .forEach(key => {
        const raw = String(key || '').trim();
        if (!raw) return;
        const name = String((typeof getTeacherNameByEmail === 'function' ? getTeacherNameByEmail(raw) : '') || raw).trim();
        if (name) map[name.toLowerCase()] = isAdminFlag ? name : '';
      });
  });
  return map;
};

const printSelectedForms = async (formType, existingWin = null, printOptions = {}) => {
  const printWin = existingWin || window.open('', '_blank');
  try {
    await ensurePrintReady();
  } catch (e) {
    if (printWin) printWin.close();
    showToast('列印模組載入失敗，請重新整理後再試', 'error');
    return;
  }
  await runPrintSelectedForms(formType, createPrintContext(printWin, printOptions));
};

const openPrintPreview = async (formType = 'Notice', options = {}) => {
  const opts = options || {};
  // R-v2接線：buildPrintPreview 靜態 import，常駐可用
  if (typeof buildPrintPreview !== 'function') {
    showToast('列印預覽模組尚未載入，請重新整理後再試', 'error');
    return false;
  }

  if (loading.value) return false;
  loading.value = true;
  loadingMessage.value = '正在產生列印預覽…';
  try {
    const preview = buildPrintPreview(
      createPrintContext(null, { skipMarkPrinted: !!opts.skipMarkPrinted, copyKinds: opts.copyKinds }),
      {
        records: Array.isArray(opts.records) ? opts.records : undefined,
        allSubs: Array.isArray(opts.allSubs) ? opts.allSubs : undefined,
        copyKinds: opts.copyKinds
      }
    );
    if (!preview || !preview.records || !preview.records.length) {
      showToast('請先勾選歷史紀錄中要列印的單據！', 'warning');
      return false;
    }

    printPreview.value = Object.assign({}, preview, {
      formType,
      source: opts.source || 'selection',
      canPrint: opts.canPrint !== false,
      returnTo: opts.returnTo || '',
      skipMarkPrinted: !!opts.skipMarkPrinted,
      // 保留組單用的紀錄與聯別，讓預覽可切換「只印某一聯」後即時重算。
      allSubs: Array.isArray(opts.allSubs) ? opts.allSubs : undefined,
      copyKinds: preview.copyKinds || [],
      recordIds: (preview.recordIds || preview.records.map(r => String(r.id || ''))).filter(Boolean)
    });
    showPrintPreviewModal.value = true;
    return true;
  } catch (e) {
    console.error('產生列印預覽失敗：', e);
    showToast('產生列印預覽失敗：' + (e && e.message ? e.message : e), 'error');
    return false;
  } finally {
    loading.value = false;
  }
};

const openHistoryPrintPreview = async () => {
  if (typeof syncHistorySelectionFromDom === 'function') syncHistorySelectionFromDom();
  const selectedIds = (selectedRecordIds.value || []).map(id => String(id));
  if (!selectedIds.length) {
    showToast('請先勾選歷史紀錄中要列印的單據！', 'warning');
    return false;
  }

  try {
    await ensurePrintReady();
    if (typeof buildHistoryPrintRecords !== 'function') {
      throw new Error('歷史列印資料轉換模組尚未載入');
    }
    const records = buildHistoryPrintRecords(
      selectedIds,
      substitutionRecords.value || [],
      requestsList.value || [],
      buildPaperRecordsForSubmittedRequests
    );
    if (!records.length) {
      showToast('找不到已勾選紀錄對應的原始申請資料', 'warning');
      return false;
    }

    // 姓名對照表統一由 openPrintPreviewForRecords 補上（管理員預填、非管理員留空待簽名）。
    return await openPrintPreviewForRecords(records, { source: 'history', skipMarkPrinted: false });
  } catch (error) {
    console.error('歷史紀錄列印預覽失敗：', error);
    showToast('產生列印預覽失敗：' + (error && error.message ? error.message : error), 'error');
    return false;
  }
};

/**
 * 列印預覽共用尾端：所有「批次列印」入口（待核准發放、核准後一鍵列印本批、
 * 歷史紀錄預覽列印）組完單後都走這裡，行為完全一致。
 * 入口之間唯一的差別寫在 options：來源標記與是否標記已印。
 */
const openPrintPreviewForRecords = async (records, options = {}) => {
  const opts = options || {};
  const list = (records || []).filter(Boolean);
  if (!list.length) {
    showToast(opts.emptyHint || '請先勾選要列印的單據！', 'warning');
    return false;
  }
  // 紙本紀錄（isPaperDraft）的代課教師欄走 signatureByTeacher 對照表；待核准批次／
  // 核准後批次經 buildPaperRecordsForSubmittedRequests 產生的紀錄本身不帶對照表，
  // 未補會整欄空白。對照規則集中在 buildPrintSignatureMap，各入口只呼叫一次。
  const signatureByTeacher = buildPrintSignatureMap(list);
  const printRecords = list.map(record => Object.assign({}, record, {
    signatureByTeacher: Object.assign({}, signatureByTeacher, record.signatureByTeacher || {})
  }));
  return openPrintPreview('Notice', {
    records: printRecords,
    allSubs: (substitutionRecords.value || []).concat(printRecords),
    source: opts.source || 'selection',
    skipMarkPrinted: opts.skipMarkPrinted === true
  });
};

/**
 * 批次列印共用流程：申請單 → 展開三角調整組三腿 → 轉成紙本紀錄 → 共用尾端。
 * 呼叫端只負責決定「要印哪些申請單」。
 */
const openBatchRequestsPrintPreview = async (requests, options = {}) => {
  const opts = options || {};
  const seeds = (requests || []).filter(Boolean);
  if (!seeds.length) {
    showToast(opts.emptyHint || '請先勾選要預覽列印的申請單', 'warning');
    return false;
  }
  if (typeof buildPaperRecordsForSubmittedRequests !== 'function') {
    showToast('列印資料轉換模組尚未載入，請重新整理後再試', 'error');
    return false;
  }
  // 三角調只勾到其中一腿時自動帶出整組三腿，避免少印教師與課程。
  const expanded = expandPrintRequestsForBatch(seeds, opts.allRequests || (requestsList.value || []));
  const records = buildPaperRecordsForSubmittedRequests(expanded.length ? expanded : seeds);
  return openPrintPreviewForRecords(records, Object.assign({ source: 'batch', skipMarkPrinted: true }, opts));
};

const closePrintPreview = (returnToSource = true) => {
  const returnTo = printPreview.value && printPreview.value.returnTo;
  showPrintPreviewModal.value = false;
  printPreview.value = null;
  printPreviewImageBusy.value = false;
  if (!returnToSource) return;
  if (returnTo === 'detail') showDetailModal.value = true;
  if (returnTo === 'compare') showCompareModal.value = true;
};

const confirmPrintPreview = async () => {
  const snapshot = printPreview.value;
  if (!snapshot) return;
  if (snapshot.canPrint === false) {
    showToast('調代課申請尚未送出，送出申請後才能列印。', 'warning');
    return;
  }
   if (snapshot.source === 'paperTour') {
     showToast('這是紙本流程教學示範，實際操作請在送出成功後點選「確認列印」。', 'info');
     return;
   }
   showPrintPreviewModal.value = false;
   printPreview.value = null;
  printPreviewImageBusy.value = false;

  if (snapshot.source === 'paperDraft') {
    await printPaperDraft(snapshot.copyKinds || []);
    return;
  }

  selectedRecordIds.value = (snapshot.recordIds || []).slice();
  await printSelectedForms(snapshot.formType || 'Notice', null, {
    skipMarkPrinted: !!snapshot.skipMarkPrinted,
    records: snapshot.records || [],
    copyKinds: snapshot.copyKinds || []
  });
};

/**
 * 預覽中的「只印某一聯」：重新組單並重算預覽（不重打 API、不影響來源資料）。
 * 空陣列＝四種聯全印；['class']＝只印班級通知單。
 */
const setPrintPreviewCopyKinds = (kinds) => {
  const snapshot = printPreview.value;
  if (!snapshot || !snapshot.records || !snapshot.records.length) return false;
  const next = normalizePrintCopyKinds(kinds);
  const allSubs = snapshot.allSubs
    || (substitutionRecords.value || []).concat(snapshot.records);
  try {
    const preview = buildPrintPreview(
      createPrintContext(null, { skipMarkPrinted: !!snapshot.skipMarkPrinted, copyKinds: next }),
      { records: snapshot.records, allSubs, copyKinds: next }
    );
    if (!preview) {
      showToast('沒有可預覽的列印內容', 'warning');
      return false;
    }
    printPreview.value = Object.assign({}, snapshot, preview, {
      allSubs,
      copyKinds: next,
      recordIds: (preview.recordIds || snapshot.recordIds || []).filter(Boolean)
    });
    return true;
  } catch (e) {
    console.error('切換列印聯別失敗：', e);
    showToast('切換列印聯別失敗：' + (e && e.message ? e.message : e), 'error');
    return false;
  }
};

/** 該聯是否在目前勾選中（畫面勾選框用）。 */
const isPrintPreviewCopyKindSelected = (kind) => {
  const list = printPreview.value && printPreview.value.copyKinds;
  if (!Array.isArray(list) || !list.length) return true;
  return list.indexOf(String(kind || '')) >= 0;
};

const getPrintPreviewPngBlob = async () => {
  if (!printPreview.value || typeof buildPrintPreviewImageSvg !== 'function') {
    throw new Error('圖片預覽模組尚未載入');
  }
  const svg = buildPrintPreviewImageSvg(printPreview.value);
  if (!svg) throw new Error('沒有可轉出的預覽內容');
  // Blob URL 內含 foreignObject 時，Chrome 會把 canvas 標成 tainted；data URL 可保留同源圖片輸出能力。
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('瀏覽器無法轉換預覽圖片'));
    image.src = url;
  });
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('預覽圖片尺寸無效');
  }

  let scale = 2;
  const maxDimension = 12000;
  const maxArea = 60000000;
  scale = Math.min(scale, maxDimension / image.naturalWidth, maxDimension / image.naturalHeight);
  scale = Math.min(scale, Math.sqrt(maxArea / (image.naturalWidth * image.naturalHeight)));
  scale = Math.max(1, scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('瀏覽器不支援圖片畫布');
  canvasContext.fillStyle = '#ffffff';
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片輸出失敗')), 'image/png');
  });
};

const getPrintPreviewFileName = () => {
  const stamp = DateUtils.toLocalDateStr(new Date());
  return '調代課單預覽-' + stamp + '.png';
};

const downloadPrintPreviewImage = async () => {
  if (printPreviewImageBusy.value) return;
  if (printPreview.value && printPreview.value.canPrint === false) {
    showToast('調代課申請尚未送出，送出申請後才能下載單據。', 'warning');
    return;
  }
  if (printPreview.value && printPreview.value.source === 'paperTour') {
    showToast('這是紙本流程教學示範，實際操作請在送出成功後下載單據。', 'info');
    return;
  }
  printPreviewImageBusy.value = true;
  try {
    const blob = await getPrintPreviewPngBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getPrintPreviewFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('預覽圖片已下載', 'success');
  } catch (e) {
    console.error('下載預覽圖片失敗：', e);
    showToast('下載圖片失敗：' + (e && e.message ? e.message : e), 'warning');
  } finally {
    printPreviewImageBusy.value = false;
  }
};

const copyPrintPreviewImage = async () => {
  if (printPreviewImageBusy.value) return;
  if (printPreview.value && printPreview.value.canPrint === false) {
    showToast('調代課申請尚未送出，送出申請後才能複製單據。', 'warning');
    return;
  }
  if (printPreview.value && printPreview.value.source === 'paperTour') {
    showToast('這是紙本流程教學示範，實際操作請在送出成功後複製單據。', 'info');
    return;
  }
  if (!navigator.clipboard || typeof window.ClipboardItem !== 'function') {
    showToast('目前瀏覽器不支援複製圖片，請改用下載圖片', 'warning');
    return;
  }
  printPreviewImageBusy.value = true;
  try {
    const blob = await getPrintPreviewPngBlob();
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    showToast('預覽圖片已複製，可直接貼到文件或訊息', 'success');
  } catch (e) {
    console.error('複製預覽圖片失敗：', e);
    showToast('複製圖片失敗，請改用下載圖片', 'warning');
  } finally {
    printPreviewImageBusy.value = false;
  }
};

const buildPaperDraftRecords = (meta = {}) => {
  const p = pendingRequestData.value || {};
  const root = meta.requestId || ('PAPER' + Date.now());
  const serialRoot = meta.serial || root;
  const combinedReturn = isCombinedReturnRequest(p);
   const courseAdjustmentOnly = !combinedReturn && isCourseAdjustmentOnlyRequest(p);
  const common = {
    type: p.mode || 'substitution',
    reason: p.reason || '請假',
    subFee: combinedReturn
      ? (typeof defaultSubFeeForReason === 'function'
        ? defaultSubFeeForReason(p.reason)
        : (p.subFee || '自費代課'))
      : (p.subFee || '無'),
    note: p.note || '',
    printed: false,
    isPaperDraft: true,
    requestId: root,
    batchId: p.isBatch ? (meta.batchId || p.submitBatchId || root) : '',
    paperFlow: !!meta.submitted
  };
  if (p.isBatch) {
    return (batchSlots.value || []).map((slot, index) => {
      const subEmail = slot.subTeacherEmail || p.subTeacher || '';
      return Object.assign({}, common, {
        id: root + '-' + (index + 1),
        serial: serialRoot + '-' + (index + 1),
        originalTeacherEmail: slot.teacherEmail,
        actualTeacherEmail: subEmail,
        date: slot.dateStr,
        period: slot.period,
        className: slot.className,
        subject: slot.subject,
         leaveTimeType: courseAdjustmentOnly ? '' : (p.leaveTimeType || ''),
         leaveTime: courseAdjustmentOnly ? '' : (p.leaveTime || '')
      });
    }).filter(r => r.originalTeacherEmail && r.actualTeacherEmail && r.date);
  }
  if (p.mode === 'exchange') {
    const timeA = decodePaperTimeKey(p.timeKey);
    const timeB = decodePaperTimeKey(p.timeB);
    return [
      Object.assign({}, common, {
         id: root + '_1',
         serial: serialRoot,
         originalTeacherEmail: p.subTeacher,
         actualTeacherEmail: p.leaveTeacher,
         originalTeacherName: getTeacherNameByEmail(p.subTeacher),
         actualTeacherName: getTeacherNameByEmail(p.leaveTeacher),
         date: p.dateB,
         period: timeB.period,
          className: p.subBClass || p.cls,
          subject: p.subB || p.subject
      }),
      Object.assign({}, common, {
         id: root + '_2',
         serial: serialRoot,
         originalTeacherEmail: p.leaveTeacher,
         actualTeacherEmail: p.subTeacher,
         originalTeacherName: getTeacherNameByEmail(p.leaveTeacher),
         actualTeacherName: getTeacherNameByEmail(p.subTeacher),
         date: p.date,
         period: timeA.period,
          className: p.cls || p.subBClass,
          subject: p.subject || p.subB
      })
    ].filter(r => r.originalTeacherEmail && r.actualTeacherEmail && r.date && r.period != null);
  }
  return [Object.assign({}, common, {
    id: root,
    serial: serialRoot,
    originalTeacherEmail: p.leaveTeacher,
     actualTeacherEmail: p.subTeacher,
    date: p.date,
    period: decodePaperTimeKey(p.timeKey).period,
    className: p.cls,
    subject: p.subject,
    specialFlow: p.specialFlow || '',
     leaveTimeType: courseAdjustmentOnly ? '' : (p.leaveTimeType || ''),
     leaveTime: courseAdjustmentOnly ? '' : (p.leaveTime || '')
  })].filter(r => r.originalTeacherEmail && r.actualTeacherEmail && r.date && r.period != null);
};

const buildTrianglePaperDraftRecords = () => {
  const participants = triangleParticipants.value || [];
  const legs = triangleLegs.value || [];
  if (participants.length !== 3 || legs.length !== 3 || participants.some(participant => !participant)) return [];
  const requestId = 'TRI-PREVIEW-' + Date.now();
  const serial = requestId;
  return legs.map((leg, index) => {
    const source = participants[index];
    const target = participants[(index + 1) % participants.length];
    return {
      id: `${requestId}_${index + 1}`,
      requestId,
      triangleId: requestId,
      triangleLegIndex: index + 1,
      serial,
      type: 'triangle',
      reason: triangleReason.value || '請假',
      subFee: '無',
      note: triangleNote.value || '',
      isPaperDraft: true,
      printed: false,
      originalTeacherEmail: target.email,
      originalTeacherName: target.teacherName,
      actualTeacherEmail: source.email,
      actualTeacherName: source.teacherName,
      triangleInitiatorEmail: participants[0].email,
      triangleInitiatorName: participants[0].teacherName,
      triangleSourceDate: leg.sourceSlot.date,
      triangleSourceDayOfWeek: leg.sourceSlot.day,
      triangleSourcePeriod: leg.sourceSlot.period,
      triangleTargetDate: leg.targetSlot.date,
      triangleTargetDayOfWeek: leg.targetSlot.day,
      triangleTargetPeriod: leg.targetSlot.period,
      date: leg.sourceSlot.date,
      period: leg.sourceSlot.period,
      className: source.course.className,
      subject: source.course.subject,
      formClassName: source.course.className,
      formSubject: source.course.subject
    };
  });
};

const openPaperPrintDraft = (records, options = {}) => {
  const list = records || buildPaperDraftRecords();
  if (!list.length) {
    showToast('請先完成媒合模擬並選擇代課／調課教師', 'warning');
    return false;
  }
  paperPrintDraft.value = {
    records: list,
    returnTo: options.returnTo || '',
    canPrint: options.canPrint === true,
    source: options.source || 'paperDraft'
  };
  paperSignatureByTeacher.value = buildPrintSignatureMap(list);
  return openPaperDraftPreview();
};

const openPaperPrintForRequest = (request) => {
  if (!request) return false;
  const batchId = String(request.batchId || '').trim();
  const triangleId = String(request.triangleId || batchId).trim();
  const rows = isTriangleRequest(request) && triangleId
    ? (requestsList.value || []).filter(r => r && isTriangleRequest(r)
      && String(r.triangleId || r.batchId || '').trim() === triangleId)
    : [];
  return openPaperPrintDraftForSubmittedRequests(rows.length ? rows : [request]);
};

const openTrianglePaperPreview = () => {
  if (!triangleReady.value) {
    showToast('請先選定可完成的 B、C，才能預覽調課單', 'warning');
    return false;
  }
  const records = buildTrianglePaperDraftRecords();
  if (!records.length) {
    showToast('目前沒有可預覽的三角調課單', 'warning');
    return false;
  }
  showTriangleTimetablePreview.value = false;
  return openPaperPrintDraft(records, { canPrint: false, source: 'triangleDraft' });
};

const openPaperPrintMutualDrafts = () => {
  const root = 'PAPER-MUTUAL-' + Date.now();
  const records = (mutualDrafts.value || []).map((d, index) => ({
    id: root + '-' + index,
    serial: root,
    requestId: root,
    type: 'substitution',
    originalTeacherEmail: d.leaveEmail,
    actualTeacherEmail: d.subEmail,
    date: d.dateStr,
    period: d.period,
    className: d.className,
    subject: d.subject,
    subFee: d.fee || '活動公費',
    reason: '公假',
    note: d.note || mutualNote.value || '',
    isPaperDraft: true,
    printed: false
  }));
  return openPaperPrintDraft(records, { canPrint: false });
};

const printPaperDraft = async (copyKinds) => {
  const draft = paperPrintDraft.value;
  if (!draft || !draft.records || !draft.records.length) return;
  if (draft.source === 'paperTour') {
    showToast('這是紙本流程教學示範，未建立真實申請單。', 'info');
    return;
  }
  if (draft.canPrint !== true) {
    showToast('調代課申請尚未送出，送出申請後才能列印。', 'warning');
    return;
  }
  const signatureMap = isAdmin.value ? Object.assign({}, paperSignatureByTeacher.value) : {};
  const ids = draft.records.map((r, index) => String(r.id || ('paper-' + Date.now() + '-' + index)));
  const records = draft.records.map((r, index) => Object.assign({}, r, {
    id: ids[index],
    signatureByTeacher: signatureMap
  }));
  const previous = substitutionRecords.value;
  substitutionRecords.value = previous.concat(records);
  selectedRecordIds.value = ids.slice();
  try {
    await printSelectedForms('Notice', null, { skipMarkPrinted: true, records, copyKinds: normalizePrintCopyKinds(copyKinds) });
  } finally {
    substitutionRecords.value = previous;
    selectedRecordIds.value = [];
    paperPrintDraft.value = null;
    paperSignatureByTeacher.value = {};
  }
};

const openPaperDraftPreview = async () => {
  const draft = paperPrintDraft.value;
  if (!draft || !draft.records || !draft.records.length) {
    showToast('目前沒有可預覽的紙本單據', 'warning');
    return false;
  }
  const signatureMap = isAdmin.value ? Object.assign({}, paperSignatureByTeacher.value) : {};
  const records = draft.records.map((record, index) => Object.assign({}, record, {
    id: String(record.id || ('paper-preview-' + Date.now() + '-' + index)),
    signatureByTeacher: signatureMap
  }));
  return openPrintPreview('Notice', {
    records,
    allSubs: (substitutionRecords.value || []).concat(records),
    source: draft.source || 'paperDraft',
    canPrint: draft.canPrint === true,
    returnTo: draft.returnTo || '',
    skipMarkPrinted: true
  });
};

const openSuccessPrintPreview = () => {
  const requests = (successActionRequests.value || []).filter(Boolean);
  if (!requests.length) {
    showToast('目前沒有可列印的申請單', 'warning');
    return false;
  }
  showSuccessModal.value = false;
  return openPaperPrintDraftForSubmittedRequests(requests);
};

const addSuccessToCalendar = () => {
  const request = (successActionRequests.value || [])[0];
  if (!request) {
    showToast('目前沒有可加入行事曆的申請單', 'warning');
    return;
  }
  addEventToCalendar(request);
};

const printSingleRequest = async (req, formType = 'Notice') => {
  const records = substitutionRecords.value || [];
  const detailRecord = req && detailRequest.value && showDetailModal.value
    && (req === detailRequest.value || String(req.id) === String(detailRequest.value.id))
    ? detailSubRecord.value
    : null;
  const requestedRecordId = req && (req.recordId || req.substitutionRecordId)
    || (detailRecord && detailRecord.id);
  let seedRecord = requestedRecordId
    ? records.find(record => String(record.id) === String(requestedRecordId))
    : null;
  if (!seedRecord && req && req.id) {
    seedRecord = records.find(record => String(record.id) === String(req.id))
      || records.find(record => String(record.requestId) === String(req.id));
  }

  let targetIds = [];
  const triangleId = (req && (req.triangleId || req.batchId))
    || (seedRecord && (seedRecord.triangleId || seedRecord.batchId));
  if (seedRecord && isTriangleRequest(seedRecord) && triangleId) {
    targetIds = records
      .filter(r => r && r.triangleId && String(r.triangleId) === String(triangleId))
      .map(r => r.id);
  } else if (seedRecord && isExchangeLikeRequest(seedRecord)) {
    const requestId = String(seedRecord.requestId || '').trim();
    targetIds = requestId
      ? records.filter(r => r && isExchangeLikeRequest(r) && String(r.requestId || '').trim() === requestId).map(r => r.id)
      : [seedRecord.id];
  } else if (seedRecord) {
    // 一般批次每一列都是獨立申請，單列列印不得依 requestId 展開整批。
    targetIds = [seedRecord.id];
  } else if (req && isTriangleRequest(req) && triangleId) {
    targetIds = records
      .filter(r => r && r.triangleId && String(r.triangleId) === String(triangleId))
      .map(r => r.id);
  }
  if (targetIds.length === 0 && detailSubRecord.value) {
    targetIds = [detailSubRecord.value.id];
  }
  if (targetIds.length === 0) {
    showToast("⚠️ 找不到該筆核准的代課明細，無法執行列印。", "error");
    return;
  }
  const prevSelected = [...selectedRecordIds.value];
  selectedRecordIds.value = targetIds;
  try {
    const targetRecords = (substitutionRecords.value || []).filter(record => targetIds.includes(record.id));
    const returnTo = showDetailModal.value ? 'detail' : '';
    await openPrintPreview(formType, { records: targetRecords, returnTo });
  } finally {
    selectedRecordIds.value = prevSelected;
  }
};

const markLocalPrinted = (ids) => {
  const idSet = new Set((ids || []).map(id => String(id)));
  const reqIds = new Set();
  idSet.forEach(id => {
    reqIds.add(String(id).replace(/_[12]$/, ''));
  });
  if (requestsList.value && requestsList.value.length) {
    requestsList.value = requestsList.value.map(r => {
      if (r && r.id && reqIds.has(String(r.id))) {
        return Object.assign({}, r, { printed: true });
      }
      return r;
    });
  }
  if (substitutionRecords.value && substitutionRecords.value.length) {
    substitutionRecords.value = substitutionRecords.value.map(rec => {
      if (!rec) return rec;
      const rid = String(rec.requestId || rec.id || '').replace(/_[12]$/, '');
      if (idSet.has(String(rec.id)) || reqIds.has(rid)) {
        return Object.assign({}, rec, { printed: true });
      }
      return rec;
    });
  }
};

    return {
      generateFormHtml: generateFormHtml,
      createPrintContext: createPrintContext,
      ensureExportReady: ensureExportReady,
      printSelectedForms: printSelectedForms,
      openPrintPreview: openPrintPreview,
      openHistoryPrintPreview: openHistoryPrintPreview,
      openBatchRequestsPrintPreview: openBatchRequestsPrintPreview,
      closePrintPreview: closePrintPreview,
      confirmPrintPreview: confirmPrintPreview,
      setPrintPreviewCopyKinds: setPrintPreviewCopyKinds,
      isPrintPreviewCopyKindSelected: isPrintPreviewCopyKindSelected,
      getPrintPreviewPngBlob: getPrintPreviewPngBlob,
      getPrintPreviewFileName: getPrintPreviewFileName,
      downloadPrintPreviewImage: downloadPrintPreviewImage,
      copyPrintPreviewImage: copyPrintPreviewImage,
      buildPaperDraftRecords: buildPaperDraftRecords,
      buildTrianglePaperDraftRecords: buildTrianglePaperDraftRecords,
      openPaperPrintDraft: openPaperPrintDraft,
      openPaperPrintForRequest: openPaperPrintForRequest,
      openTrianglePaperPreview: openTrianglePaperPreview,
      openPaperPrintMutualDrafts: openPaperPrintMutualDrafts,
      printPaperDraft: printPaperDraft,
      openPaperDraftPreview: openPaperDraftPreview,
      openSuccessPrintPreview: openSuccessPrintPreview,
      addSuccessToCalendar: addSuccessToCalendar,      printSingleRequest: printSingleRequest,
      markLocalPrinted: markLocalPrinted,
      openPrintPreviewForRecords: openPrintPreviewForRecords,

    };
  }
  return { create: create };
})();

export { UiPrint };
