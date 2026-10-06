/**
 * 自 v1 ui-match.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';

/**
 * ui-match.js — 媒合面板（額度包預覽／快取＋媒合名單分頁）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 * 快取狀態（quotaPackCache／debounce／warmId／reqId）已隨函數遷入；
 * window.__quotaPackCacheBust 由本模組 create 時註冊（呼叫端皆有 typeof 守衛）。
 */
const UiMatch = (() => {
  function create(deps) {
    deps = deps || {};
    var batchExchangePreviewSlotKey = deps.batchExchangePreviewSlotKey;
    var compareWeekSelectionA = deps.compareWeekSelectionA;
    var compareWeekSelectionB = deps.compareWeekSelectionB;
    var callGasApi = deps.callGasApi;
    var computed = deps.computed;
    var lookupTeacher = deps.lookupTeacher;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var isAdmin = deps.isAdmin;
    var fetchQuotaSpendPreview = deps.fetchQuotaSpendPreview;
    var pendingRequestData = deps.pendingRequestData;
    var QUOTA_DEDUCT_FEE = deps.QUOTA_DEDUCT_FEE;
    var isPeriod8FeeLocked = deps.isPeriod8FeeLocked;
    var quotaPackPreview = deps.quotaPackPreview;
    var quotaPackError = deps.quotaPackError;
    var quotaPackLoading = deps.quotaPackLoading;
    var matchMode = deps.matchMode;
    var matchDisplayCount = deps.matchDisplayCount;
    var MATCH_PAGE_SIZE = deps.MATCH_PAGE_SIZE;
    var matchSearchQuery = deps.matchSearchQuery;
    var recommendedTeachers = deps.recommendedTeachers;
    var isMutualCover = deps.isMutualCover;
    var recommendedExchangeList = deps.recommendedExchangeList;
    var getWeekDayText = deps.getWeekDayText;
    var formatPeriodText = deps.formatPeriodText;
    var exchangeWeekdayFilter = deps.exchangeWeekdayFilter;
    // R14：媒合抽屜 DOM 簇自 app.js 搬移（以下 deps 由 app 經 create 傳入）
    var activeCell = deps.activeCell;
    var matchShowNoTeacherWarning = deps.matchShowNoTeacherWarning;
    var matchEmptyReasons = deps.matchEmptyReasons;
    var showMatchModal = deps.showMatchModal;
    var getExchangeWeekDates = deps.getExchangeWeekDates;
    var exchangeWeekOffset = deps.exchangeWeekOffset;
    var formatDateMMDD = deps.formatDateMMDD;
    var toLocalDateStr = deps.toLocalDateStr;
    const quotaPackCache = Object.create(null);
    const QUOTA_PACK_CACHE_MS = 180000;
    let quotaPackDebounce = null;
    let quotaPackWarmId = 0;
    let quotaPackReqId = 0;
    try {
      window.__quotaPackCacheBust = function (email) {
        try {
          if (email) { delete quotaPackCache[String(email).toLowerCase().trim()]; return; }
          Object.keys(quotaPackCache).forEach(function (k) { delete quotaPackCache[k]; });
        } catch (e) {}
      };
    } catch (e) {}

const quotaTeacherNameOf = (email) => {
  const em = String(email || '').toLowerCase().trim();
  if (!em) return '';
  try {
    const t = (typeof lookupTeacher === 'function' ? lookupTeacher(em) : null);
    const nm = (t && (t.teacherName || t.name)) || (typeof getTeacherNameByEmail === 'function' ? getTeacherNameByEmail(em) : '') || '';
    return String(nm || '').trim();
  } catch (e) { return ''; }
};

const warmQuotaPackCache = async (email) => {
  const em = String(email || '').toLowerCase().trim();
  if (!em || !isAdmin.value) return;
  const nm = quotaTeacherNameOf(em);
  if (!nm) return;
  const key = nm;
  const hit = quotaPackCache[key];
  if (hit && (Date.now() - hit.ts) < QUOTA_PACK_CACHE_MS) return;
  const myId = ++quotaPackWarmId;
  try {
    let preview = [];
    if (typeof fetchQuotaSpendPreview === 'function') {
      const res = await fetchQuotaSpendPreview({ names: [nm] });
      preview = (res && res.preview) || [];
    } else {
      const res = await callGasApi('getQuotaSpendPreview', { names: [nm] });
      preview = (res && res.preview) || [];
    }
    if (myId !== quotaPackWarmId) return;
    if (preview && preview[0]) quotaPackCache[key] = { ts: Date.now(), preview: preview };
  } catch (e) { /* 預熱失敗不打擾，等正式查詢再報錯 */ }
};

const fetchQuotaPackPreview = () => {
  if (quotaPackDebounce) clearTimeout(quotaPackDebounce);
  quotaPackDebounce = setTimeout(function () { doFetchQuotaPackPreview(); }, 250);
};

const doFetchQuotaPackPreview = async () => {
  const p = pendingRequestData.value;
  if (!p || p.mode !== 'substitution' || p.subFee !== QUOTA_DEDUCT_FEE || isPeriod8FeeLocked.value) {
    quotaPackPreview.value = [];
    quotaPackError.value = '';
    return;
  }
  const em = String(p.subTeacher || '').toLowerCase().trim();
  if (!em) {
    quotaPackPreview.value = [];
    return;
  }
  const nm = quotaTeacherNameOf(em);
  if (!nm) {
    quotaPackPreview.value = [];
    return;
  }
  const key = nm;
  // 快取：同師 3 分鐘內直接用，GAS 冷啟動不用每次等
  const cached = quotaPackCache[key];
  if (cached && (Date.now() - cached.ts) < QUOTA_PACK_CACHE_MS && cached.preview) {
    quotaPackPreview.value = cached.preview;
    const cf = cached.preview[0];
    if (cf && cf.packs && cf.packs.length && !p.quotaPackageId) p.quotaPackageId = cf.fifoPackageId || '';
    quotaPackLoading.value = false;
    return;
  }
  const myId = ++quotaPackReqId;
  quotaPackLoading.value = true;
  quotaPackError.value = '';
  try {
    let preview = [];
    if (typeof fetchQuotaSpendPreview === 'function') {
      const res = await fetchQuotaSpendPreview({ names: [nm] });
      preview = (res && res.preview) || [];
    } else {
      const res = await callGasApi('getQuotaSpendPreview', { names: [nm] });
      preview = (res && res.preview) || [];
    }
    if (myId !== quotaPackReqId) return;
    quotaPackPreview.value = preview;
    // 若尚未選包，預設選 FIFO；無分包明細時清空覆寫，後端以總餘額包（pkg_balance_）寫入
    let first = preview[0];
    if (first && first.packs && first.packs.length) {
      if (!p.quotaPackageId) {
        p.quotaPackageId = first.fifoPackageId || '';
      }
      quotaPackCache[key] = { ts: Date.now(), preview: preview };
    } else {
      // 無分包：清空覆寫，後端送出時以總餘額包（pkg_balance_）寫入
      if (p) p.quotaPackageId = '';
      quotaPackError.value = '';
    }
  } catch (e) {
    if (myId !== quotaPackReqId) return;
    quotaPackError.value = (e && e.message) ? e.message : String(e);
    quotaPackPreview.value = [];
  } finally {
    if (myId === quotaPackReqId) quotaPackLoading.value = false;
  }
};

const quotaPackOptions = computed(() => {
  const first = (quotaPackPreview.value && quotaPackPreview.value[0]) || null;
  return (first && first.packs) || [];
});

const quotaFifoPackageId = computed(() => {
  const first = (quotaPackPreview.value && quotaPackPreview.value[0]) || null;
  return (first && first.fifoPackageId) || '';
});

const quotaSelectedPack = computed(() => {
  const p = pendingRequestData.value || {};
  const want = String(p.quotaPackageId || '').trim();
  const opts = quotaPackOptions.value || [];
  if (!want) return opts.find(o => String(o.packageId) === String(quotaFifoPackageId.value)) || null;
  return opts.find(o => String(o.packageId) === want) || null;
});

const resetQuotaPackOverride = () => {
  const p = pendingRequestData.value;
  if (!p) return;
  p.quotaPackageId = quotaFifoPackageId.value || '';
  p.quotaEventId = '';
  p.quotaEventName = '';
};

const loadMoreMatches = () => {
  const total = matchMode.value === 'exchange'
    ? filteredExchangeList.value.length
    : filteredRecommendedTeachers.value.length;
  matchDisplayCount.value = Math.min(matchDisplayCount.value + MATCH_PAGE_SIZE, total);
};

const filteredRecommendedTeachers = computed(() => {
  const q = matchSearchQuery.value.trim().toLowerCase();
  let list = (recommendedTeachers.value || []).slice();
  if (q) {
    list = list.filter(t => t.name.toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q));
  }
  // 活動互代：額度多／有釋出優先（搜尋後仍維持）
  if (isMutualCover.value) {
    list.sort((a, b) => {
      const qa = typeof a.remainingReleased === 'number' ? a.remainingReleased : (a.mutualQuota || 0);
      const qb = typeof b.remainingReleased === 'number' ? b.remainingReleased : (b.mutualQuota || 0);
      if (qb !== qa) return qb - qa;
      const ra = a.isReleasedByAway ? 1 : 0;
      const rb = b.isReleasedByAway ? 1 : 0;
      if (rb !== ra) return rb - ra;
       return (b.score || 0) - (a.score || 0)
         || (b.subjectMatchRank || 0) - (a.subjectMatchRank || 0)
         || (a.todayPeriodCount || 0) - (b.todayPeriodCount || 0);
    });
  }
  return list;
});

const filteredExchangeList = computed(() => {
  let list = (recommendedExchangeList.value || []).slice();
  const q = String(matchSearchQuery.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter((r) => [
      r.teacherName,
      r.teacherEmail,
      r.className,
      r.subject,
      r.dayOfWeek,
      r.period,
      getWeekDayText(r.dayOfWeek),
      formatPeriodText(r.period)
    ].map(value => String(value == null ? '' : value).toLowerCase()).join(' ').includes(q));
  }
  const day = parseInt(exchangeWeekdayFilter.value, 10);
  if (!day) return list;
  return list.filter(r => parseInt(r.dayOfWeek, 10) === day);
});

const displayedExchangeList = computed(() => {
  const list = filteredExchangeList.value || [];
  return list.slice(0, matchDisplayCount.value);
});

const setBatchExchangePreviewSlot = (slotKey) => {
  const pending = pendingRequestData.value;
  if (!pending || !pending.isExchangeBatch || !Array.isArray(pending.batchSlots)) return false;
  const slot = pending.batchSlots.find(item => String(item.key) === String(slotKey));
  if (!slot) return false;
  const encodeTime = (day, period) => (DateUtils && DateUtils.encodeTimeKey)
    ? DateUtils.encodeTimeKey(day, period)
    : (String(day) + '-' + String(period));
  batchExchangePreviewSlotKey.value = String(slot.key);
  pendingRequestData.value = Object.assign({}, pending, {
    leaveTeacher: slot.teacherEmail,
    subTeacher: slot.subTeacherEmail,
    date: slot.dateStr,
    timeKey: encodeTime(slot.dayOfWeek, slot.period),
    cls: slot.className || '',
    subject: slot.subject || '',
    dateB: slot.targetDate || '',
    timeB: encodeTime(slot.targetDayOfWeek, slot.targetPeriod),
    subBClass: slot.targetClassName || '',
    subB: slot.targetSubject || ''
  });
  compareWeekSelectionA.value = 'source';
  compareWeekSelectionB.value = 'target';
  return true;
};

// R14：媒合抽屜 DOM 簇自 app.js 搬移（列表選取＝純 CSS；JS 只聽 change＋綠格）
let _matchListKey = '';
let _matchPreviewPlain = null;
let _matchNativeBound = false;

const clearMatchHoverDom = () => {
  try {
    document.querySelectorAll('.grid-cell-class.is-match-hover')
      .forEach((el) => { el.classList.remove('is-match-hover'); });
  } catch (e) { /* ignore */ }
};

const paintMatchHoverCell = (day, period) => {
  clearMatchHoverDom();
  if (!activeCell.value || day == null || period == null) return;
  const leaveEm = String(activeCell.value.teacherEmail || '').toLowerCase();
  if (!leaveEm) return;
  try {
    const nodes = document.querySelectorAll(
      '.grid-cell-class[data-tt-email="' + leaveEm + '"][data-tt-day="' + parseInt(day, 10) + '"][data-tt-period="' + parseInt(period, 10) + '"]'
    );
    for (let i = 0; i < nodes.length; i++) nodes[i].classList.add('is-match-hover');
  } catch (e) { /* ignore */ }
};

const syncMatchStateFromRow = (tr) => {
  if (!tr) return;
  const mode = tr.getAttribute('data-match-mode') || 'sub';
  const email = String(tr.getAttribute('data-match-email') || '').toLowerCase();
  if (!email) return;
  if (mode === 'exc') {
    const day = parseInt(tr.getAttribute('data-match-day'), 10);
    const period = parseInt(tr.getAttribute('data-match-period'), 10);
    const key = email + '|' + day + '|' + period;
    _matchListKey = key;
    _matchPreviewPlain = {
      mode: 'exchange',
      email: email,
      name: tr.getAttribute('data-match-name') || '',
      dayOfWeek: day,
      period: period,
      className: tr.getAttribute('data-match-class') || '',
      subject: tr.getAttribute('data-match-subject') || ''
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (_matchListKey === key) paintMatchHoverCell(day, period);
      });
    }
    return;
  }
  _matchListKey = email;
  _matchPreviewPlain = {
    mode: 'substitution',
    email: email,
    name: tr.getAttribute('data-match-name') || '',
    dayOfWeek: activeCell.value ? parseInt(activeCell.value.dayOfWeek, 10) : 0,
    period: activeCell.value ? parseInt(activeCell.value.period, 10) : 0
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (_matchListKey === email) clearMatchHoverDom();
    });
  }
};

/** radio change：列表已由瀏覽器著色，這裡只同步狀態＋綠格 */
const onMatchRadioChange = (evt) => {
  const t = evt && evt.target;
  if (!t || !t.classList || !t.classList.contains('match-pick-radio')) return;
  if (!t.checked) return;
  const tr = t.closest('tr.match-row');
  if (!tr) return;
  syncMatchStateFromRow(tr);
};

const clearMatchRadios = () => {
  try {
    document.querySelectorAll('.match-drawer .match-pick-radio:checked')
      .forEach((r) => { r.checked = false; });
  } catch (e) { /* ignore */ }
};

const bindMatchNativeSelect = () => {
  if (_matchNativeBound) return;
  _matchNativeBound = true;
  // 只聽 change（在瀏覽器勾選並 paint 之後）
  document.addEventListener('change', onMatchRadioChange, true);
};
const unbindMatchNativeSelect = () => {
  if (!_matchNativeBound) return;
  _matchNativeBound = false;
  document.removeEventListener('change', onMatchRadioChange, true);
};

const selectMatchPreviewSub = () => {};
const selectMatchPreviewExchange = () => {};

const clearMatchPreview = () => {
  clearMatchRadios();
  _matchListKey = '';
  _matchPreviewPlain = null;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(clearMatchHoverDom);
  }
};
const closeMatchModal = () => {
  clearMatchPreview();
  matchShowNoTeacherWarning.value = false;
  matchEmptyReasons.value = null;
  showMatchModal.value = false;
};

const getMatchSlotDateMMDD = (dayOfWeek) => {
  if (!dayOfWeek) return '';
  const dates = getExchangeWeekDates();
  if (dates && dates[dayOfWeek - 1]) {
    const baseStr = dates[dayOfWeek - 1];
    const offset = parseInt(exchangeWeekOffset.value, 10) || 0;
    if (offset === 0) return formatDateMMDD(baseStr);
    const d = new Date(String(baseStr).replace(/-/g, '/'));
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + offset * 7);
      return formatDateMMDD(toLocalDateStr(d));
    }
    return formatDateMMDD(baseStr);
  }
  return '';
};

    return {
      quotaTeacherNameOf: quotaTeacherNameOf,
      warmQuotaPackCache: warmQuotaPackCache,
      fetchQuotaPackPreview: fetchQuotaPackPreview,
      doFetchQuotaPackPreview: doFetchQuotaPackPreview,
      quotaPackOptions: quotaPackOptions,
      quotaFifoPackageId: quotaFifoPackageId,
      quotaSelectedPack: quotaSelectedPack,
      resetQuotaPackOverride: resetQuotaPackOverride,
      loadMoreMatches: loadMoreMatches,
      filteredRecommendedTeachers: filteredRecommendedTeachers,
      filteredExchangeList: filteredExchangeList,
      displayedExchangeList: displayedExchangeList,      setBatchExchangePreviewSlot: setBatchExchangePreviewSlot,
      clearMatchHoverDom: clearMatchHoverDom,
      paintMatchHoverCell: paintMatchHoverCell,
      syncMatchStateFromRow: syncMatchStateFromRow,
      clearMatchRadios: clearMatchRadios,
      bindMatchNativeSelect: bindMatchNativeSelect,
      unbindMatchNativeSelect: unbindMatchNativeSelect,
      selectMatchPreviewSub: selectMatchPreviewSub,
      selectMatchPreviewExchange: selectMatchPreviewExchange,
      clearMatchPreview: clearMatchPreview,
      closeMatchModal: closeMatchModal,
      getMatchSlotDateMMDD: getMatchSlotDateMMDD,

    };
  }
  return { create: create };
})();

export { UiMatch };
