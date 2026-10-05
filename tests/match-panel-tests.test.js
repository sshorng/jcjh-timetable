import assert from 'node:assert/strict';
import { test } from 'vitest';
import path from 'node:path';
import { UiMatch } from '../src/modules/ui-match.js';

test('match panel tests（v1 移植）', () => {
  /**
   * UiMatch 媒合面板測試（2A：額度包預覽／快取＋媒合名單分頁）
   *
   * - create 回傳 12 件 API（含 6 computed）
   * - 額度包選包邏輯（FIFO 預設／手動覆寫／重置）
   * - 媒合名單分頁（loadMoreMatches 按 MATCH_PAGE_SIZE 累加）
   * - window.__quotaPackCacheBust 由 create 註冊
   */

  const ref = (v) => ({ value: v });
  const computed = (fn) => ({ get value() { return fn(); } });


  assert.ok(UiMatch, 'UiMatch 應掛載');

  const deps = {
    computed,
    lookupTeacher: () => null, getTeacherNameByEmail: () => '',
    isAdmin: ref(false), fetchQuotaSpendPreview: async () => [],
    pendingRequestData: ref({ mode: 'substitution' }),
    QUOTA_DEDUCT_FEE: '扣額度', isPeriod8FeeLocked: ref(false),
    quotaPackPreview: ref([
      { fifoPackageId: 'pkg1', packs: [{ packageId: 'pkg1', packageName: '甲包' }, { packageId: 'pkg2', packageName: '乙包' }] },
    ]),
    quotaPackError: ref(''), quotaPackLoading: ref(false),
    matchMode: ref('substitution'), matchDisplayCount: ref(2), MATCH_PAGE_SIZE: 2,
    matchSearchQuery: ref(''),
    recommendedTeachers: ref([
      { email: 'a@x', name: '陳小華', subject: '國文' },
      { email: 'b@x', name: '王小明', subject: '英文' },
      { email: 'c@x', name: '林小美', subject: '數學' },
    ]),
    isMutualCover: ref(false), recommendedExchangeList: ref([]),
    getWeekDayText: () => '', formatPeriodText: (p) => String(p),
    exchangeWeekdayFilter: ref(0),
    // R14：媒合抽屜 DOM 簇 deps（測試樁；DOM 相關呼叫皆有 try 守衛）
    activeCell: ref(null), matchShowNoTeacherWarning: ref(false), matchEmptyReasons: ref(null),
    showMatchModal: ref(false), getExchangeWeekDates: () => [], exchangeWeekOffset: ref(0),
    formatDateMMDD: (s) => String(s || ''), toLocalDateStr: (d) => '2026-09-07',
  };
  const api = UiMatch.create(deps);
  assert.equal(typeof window.__quotaPackCacheBust, 'function', 'bust 應由 create 註冊');

  const EXPECTED = ['quotaTeacherNameOf', 'warmQuotaPackCache', 'fetchQuotaPackPreview', 'doFetchQuotaPackPreview', 'quotaPackOptions', 'quotaFifoPackageId', 'quotaSelectedPack', 'resetQuotaPackOverride', 'loadMoreMatches', 'filteredRecommendedTeachers', 'filteredExchangeList', 'displayedExchangeList', 'clearMatchHoverDom', 'paintMatchHoverCell', 'syncMatchStateFromRow', 'clearMatchRadios', 'bindMatchNativeSelect', 'unbindMatchNativeSelect', 'selectMatchPreviewSub', 'selectMatchPreviewExchange', 'clearMatchPreview', 'closeMatchModal', 'getMatchSlotDateMMDD'];
  for (const k of EXPECTED) assert.ok(api[k], '缺少 ' + k);

  // 選包：預設 FIFO 首包
  assert.equal([...api.quotaPackOptions.value].length, 2);
  assert.equal(api.quotaFifoPackageId.value, 'pkg1');
  assert.equal(api.quotaSelectedPack.value.packageId, 'pkg1', '未覆寫時選 FIFO 首包');
  // 名單分頁
  assert.equal([...api.filteredRecommendedTeachers.value].length, 3);
  api.loadMoreMatches();
  assert.equal(deps.matchDisplayCount.value, 3, '累加但不超過總數');
  // 搜尋過濾
  deps.matchSearchQuery.value = '小明';
  assert.equal([...api.filteredRecommendedTeachers.value].length, 1);
  deps.matchSearchQuery.value = '';

  // R14：抽屜 DOM 簇（無 DOM 環境下應靜默不拋）
  api.clearMatchHoverDom();
  api.paintMatchHoverCell(1, 2);
  api.syncMatchStateFromRow(null);
  api.clearMatchRadios();
  api.clearMatchPreview();
  deps.showMatchModal.value = true;
  api.closeMatchModal();
  assert.equal(deps.showMatchModal.value, false, '關抽屜應收旗標');
  assert.equal(deps.matchShowNoTeacherWarning.value, false);
  assert.equal(api.getMatchSlotDateMMDD(0), '', '空星期回空字串');

  console.log('match panel tests PASS（23 API＋選包＋分頁＋抽屜 DOM 簇）');

});
