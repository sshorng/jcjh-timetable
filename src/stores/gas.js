import { defineStore } from 'pinia';
import { nextTick } from 'vue';
import { GasApi } from '../api/gas-client.js';
import { showToast } from '../ui/toast.js';
import { useSessionStore } from './session.js';

/** v2 stores/gas.js — GAS 傳輸客戶端單例（取代 v1 setup 內 `GasApi.createClient`）。
 * 19 個成員全數回傳，供各 store 經解構／內聯取用（template 不直绑，故不在 712 名單）。
 */
export const useGasStore = defineStore('gas', () => {
  const {
    callGasApi, fetchInitialData, fetchMetaData, fetchPublicClassData,
    fetchPendingOnly, fetchRequestsDelta, fetchHistoryMonth, fetchMatchCandidates,
    fetchMutualQuotaLedger, fetchQuotaSpendPreview,
    decodeJwt, isTokenExpired, isTokenExpiringSoon,
    formatError, clearSWR, cancelAll, parseAllowedHd, isEmailDomainAllowed, DEFAULT_ALLOWED_HD
  } = GasApi.createClient({
    // 注意：跨 store 讀值不用 .value（Pinia setup store 已 unwrap，直接就是值本身）
    getApiUrl: () => useSessionStore().gasApiUrl,
    getSemesterId: () => useSessionStore().currentSemester,
    refreshIdToken: () => useSessionStore().refreshGoogleIdToken(),
    // B：過期只清 user，不 reload；回登入頁後由 setupGoogleSignInUi 重畫按鈕
    onAuthExpired: () => {
      useSessionStore().user = null;
      try {
        if (!useSessionStore().user) {
          useSessionStore().gsiButtonReady = false;
          nextTick(() => useSessionStore().setupGoogleSignInUi());
        }
      } catch (e) { /* ignore */ }
    },
    showToast
  });
  return {
    callGasApi, fetchInitialData, fetchMetaData, fetchPublicClassData,
    fetchPendingOnly, fetchRequestsDelta, fetchHistoryMonth, fetchMatchCandidates,
    fetchMutualQuotaLedger, fetchQuotaSpendPreview,
    decodeJwt, isTokenExpired, isTokenExpiringSoon,
    formatError, clearSWR, cancelAll, parseAllowedHd, isEmailDomainAllowed, DEFAULT_ALLOWED_HD
  };
});
