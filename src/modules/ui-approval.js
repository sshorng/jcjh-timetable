import { ref } from 'vue';
/**
 * 自 v1 ui-approval.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import FeeUtils from '../domain/fee-utils.js';
import FieldMap from '../domain/field-map.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';

/**
 * ui-approval.js — 簽核／行政核准／撤回撤銷（方案甲殼瘦身 A）
 * 對外：UiApproval.create(deps)
 */
const UiApproval = (() => {
  function create(deps) {
    var ref = deps.ref;
    var callGasApi = deps.callGasApi;
    var callGasApiWithProgress = deps.callGasApiWithProgress || deps.callGasApi;
    var showToast = deps.showToast;
    var showConfirm = deps.showConfirm;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var getStatusText = deps.getStatusText;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail || function (value) { return value || ''; };
    var bustQuotaLedgerCache = deps.bustQuotaLedgerCache || function () {
      try {
        if (typeof window !== 'undefined' && typeof window.__quotaLedgerCacheBust === 'function') {
          window.__quotaLedgerCacheBust();
        }
      } catch (e) { /* ignore */ }
    };
    var isTriangleRequest = deps.isTriangleRequest || function (request) {
      return !!(request && (request.type === 'triangle' || request.type === '三角調' || request.triangleId));
    };
    var restoreMutualQuotaForRows = deps.restoreMutualQuotaForRows || function () {};
    var optimisticPatchRequestStatus = deps.optimisticPatchRequestStatus;
    var optimisticPatchRequestStatuses = deps.optimisticPatchRequestStatuses || function (updates) {
      (updates || []).forEach(function (u) {
        if (u) optimisticPatchRequestStatus(u.id, u.status);
      });
    };
    var optimisticPatchTriangleGroup = deps.optimisticPatchTriangleGroup || function (request, status) {
      if (request) optimisticPatchRequestStatus(request.id, status);
    };
    var softRefreshInBackground = deps.softRefreshInBackground || function () {};
    var isAdmin2 = deps.isAdmin || { value: false };
    var notificationsSuppressed2 = deps.notificationsSuppressed || { value: false };
    var syncHistorySelectionFromDom = deps.syncHistorySelectionFromDom;
    var substitutionRecords2 = deps.substitutionRecords;
    var requestsList2 = deps.requestsList;
    var getTeacherNameByEmail2 = deps.getTeacherNameByEmail || function (v) { return v || ''; };
    async function sendSelectedBatchNotices() {
      if (!isAdmin2.value) {
        showToast('僅管理員可批次發通知', 'warning');
        return;
      }
      if (notificationsSuppressed2.value) {
        showToast('目前為紙本模式，不寄送通知信', 'info');
        return;
      }
      // 與列印相同：勾選可能只在 DOM，先同步再取 id
      try {
        if (typeof syncHistorySelectionFromDom === 'function') syncHistorySelectionFromDom();
        else {
          const domIds = [];
          document.querySelectorAll('.hist-select-cb:checked').forEach((el) => {
            const id = el.getAttribute('data-rec-id') || el.value;
            if (id) domIds.push(id);
          });
          if (domIds.length) selectedRecordIds.value = domIds;
        }
      } catch (eSync) { /* ignore */ }
      const ids = (selectedRecordIds.value || []).slice();
      if (!ids.length) {
        showToast('請先勾選歷史紀錄', 'warning');
        return;
      }
      // 轉成申請單 ID（調課 id 可能為 xxx_1 / xxx_2；每筆申請只算一次）
      const requestIds = [...new Set(ids.map(id => {
        const rec = (substitutionRecords2.value || []).find(r => r && r.id === id);
        if (rec && rec.requestId) return String(rec.requestId);
        return String(id || '').replace(/_[12]$/, '');
      }).filter(Boolean))];
      if (!requestIds.length) {
        showToast('無法解析申請單 ID', 'warning');
        return;
      }
      // 預覽：核准信寄雙方（申請人＋受邀人）；邀請信只寄受邀人。同人合併後計「約幾封」
      const recipientMap = {}; // email -> { name, roles: Set, n }
      let approvedN = 0;
      let pendingN = 0;
      const addRecipient = (email, name, role) => {
        const em = String(email || '').toLowerCase().trim();
        if (!em || em.indexOf('@') === -1) return;
        if (!recipientMap[em]) recipientMap[em] = { name: name || em, roles: {}, n: 0 };
        if (name && !recipientMap[em].name) recipientMap[em].name = name;
        recipientMap[em].roles[role] = true;
        recipientMap[em].n++;
      };
      requestIds.forEach(rid => {
        const req = (requestsList2.value || []).find(r => r && String(r.id) === String(rid));
        const rec = !req ? (substitutionRecords2.value || []).find(r =>
          r && (String(r.requestId) === String(rid) || String(r.id || '').replace(/_[12]$/, '') === String(rid))
        ) : null;
        const st = String((req && req.status) || (rec && rec.status) || 'approved').toLowerCase();
        const isApproved = !st || st === 'approved';
        const leaveEm = (req && req.requesterEmail) || (rec && rec.originalTeacherEmail) || '';
        const coverEm = (req && req.targetTeacherEmail) || (rec && rec.actualTeacherEmail) || '';
        const leaveName = (req && (req.requesterName || getTeacherNameByEmail2(leaveEm)))
          || getTeacherNameByEmail2(leaveEm) || leaveEm;
        const coverName = (req && (req.targetTeacherName || getTeacherNameByEmail2(coverEm)))
          || getTeacherNameByEmail2(coverEm) || coverEm;
        if (isApproved) {
          approvedN++;
          addRecipient(leaveEm, leaveName, '申請人');
          addRecipient(coverEm, coverName, '受邀人');
        } else {
          pendingN++;
          addRecipient(coverEm, coverName, '受邀人');
        }
      });
      const recipients = Object.keys(recipientMap);
      const mailEst = recipients.length;
      const previewLines = recipients.slice(0, 12).map(em => {
        const g = recipientMap[em];
        const roles = Object.keys(g.roles || {}).join('／');
        return `• ${g.name}${roles ? '（' + roles + '）' : ''}`;
      });
      if (recipients.length > 12) previewLines.push(`…另有 ${recipients.length - 12} 人`);
      const typeTip = approvedN && pendingN
        ? `已核准 ${approvedN} 筆（雙方）＋待簽核 ${pendingN} 筆（僅受邀）`
        : approvedN
          ? `已核准 ${approvedN} 筆（核准信寄雙方）`
          : `待簽核 ${pendingN} 筆（僅寄受邀人）`;
      const ok = await showConfirm(
        `後發通知：${typeTip}\n共 ${requestIds.length} 筆申請 → 約 ${mailEst} 封信（同人合併）\n\n收件人：\n${previewLines.join('\n') || '（依後端）'}\n\n確定寄出？`,
        '批次發通知信'
      );
      if (!ok) return;
      loading.value = true;
      loadingMessage.value = '正在寄送通知…';
      try {
        const res = await callGasApi('sendBatchNotices', { requestIds });
        const mailCount = res && res.mailCount != null ? res.mailCount : mailEst;
        const failed = res && res.failed ? res.failed : 0;
        const found = res && res.found != null ? res.found : requestIds.length;
        showToast(
          failed
            ? `已處理 ${found} 筆，約寄 ${mailCount} 封，失敗 ${failed} 組`
            : `已處理 ${found} 筆申請，約寄出 ${mailCount} 封（雙方／同人合併）`,
          failed ? 'warning' : 'success'
        );
      } catch (e) {
        console.error(e);
        showToast('批次通知失敗：' + (e && e.message ? e.message : String(e)), 'error');
      } finally {
        loading.value = false;
      }
    };

    // 2A：風險旗標＋摘要自 app.js 搬移（以下 deps 由 app 經 create 傳入）
    var isExchangeLikeRequest = deps.isExchangeLikeRequest || function () { return false; };
    var isTriangleRequestLocal = deps.isTriangleRequest || isTriangleRequest;
    var isCombinedReturnRequest = deps.isCombinedReturnRequest
      || (typeof window !== 'undefined' && UiLineTemplate && UiLineTemplate.isCombinedReturnRequest)
      || function () { return false; };
    var formatLeaveClassSlot = deps.formatLeaveClassSlot
      || (typeof window !== 'undefined' && UiLineTemplate && UiLineTemplate.formatLeaveClassSlot)
      || function () { return ''; };
    var formatExchangeClassSlot = deps.formatExchangeClassSlot || function () { return ''; };
    var isLeaveClassRestricted = deps.isLeaveClassRestricted || function () { return false; };
    var isExchangeClassRestricted = deps.isExchangeClassRestricted || function () { return false; };
    var isRequestExchangeRechanged = deps.isRequestExchangeRechanged || function () { return false; };
    var isTimetableOnlyFee = deps.isTimetableOnlyFee
      || (typeof window !== 'undefined' && FeeUtils && FeeUtils.isTimetableOnlyFee)
      || function () { return false; };
    var isQuotaDeductFee = deps.isQuotaDeductFee
      || (typeof window !== 'undefined' && FeeUtils && FeeUtils.isQuotaDeductFee)
      || function () { return false; };
    var lookupTeacher = deps.lookupTeacher || function () { return null; };
    var teachersList = deps.teachersList || { value: [] };
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE
      || (typeof window !== 'undefined' && FeeUtils && FeeUtils.ACTIVITY_PUBLIC)
      || '活動公費';
    // 2A：三角送出自 app.js 搬移（以下 deps 由 app 經 create 傳入）
    var triangleSubmitting = deps.triangleSubmitting;
    var triangleValidation = deps.triangleValidation;
    var triangleReason = deps.triangleReason;
    var onlineSubstitutionEnabled = deps.onlineSubstitutionEnabled;
    var triangleParticipants = deps.triangleParticipants;
    var triangleNote = deps.triangleNote;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var currentSemester = deps.currentSemester;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest || function () {};
    var successActionRequests = deps.successActionRequests;
    var showMatchModal = deps.showMatchModal;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineCopyText = deps.lineCopyText;
    var lineBatchParts = deps.lineBatchParts;
    var showSuccessModal = deps.showSuccessModal;
    var resetTriangleDraft = deps.resetTriangleDraft || function () {};
    var openPaperPrintDraftForSubmittedRequests = deps.openPaperPrintDraftForSubmittedRequests || function () {};
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var successFlowMode = deps.successFlowMode;
    // 2A：併班／空堂排班自 app.js 搬移（以下 deps 由 app 經 create 傳入）
    var activeCell = deps.activeCell;
    var pendingRequestData = deps.pendingRequestData;
    var combinedReturnCandidates = deps.combinedReturnCandidates;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var isMutualCover = deps.isMutualCover;
    var consecAlertsA = deps.consecAlertsA;
    var consecAlertsB = deps.consecAlertsB;
    var matchPreview = deps.matchPreview;
    var showCompareModal = deps.showCompareModal;
    var inputRequestDate = deps.inputRequestDate;
    var currentWeekDates = deps.currentWeekDates;
    var hasScheduleSpecialTag = deps.hasScheduleSpecialTag || function () { return false; };
    var isCombinedClass2 = deps.isCombinedClass || function () { return false; };
    var findCombinedReturnCandidates = deps.findCombinedReturnCandidates || function () { return []; };
    var paperMode = deps.paperMode;
    var ensureDAC = deps.ensureDAC;
    var emptySlotForm = deps.emptySlotForm;
    var emptySlotQuotaZero = deps.emptySlotQuotaZero;
    var isSubmitting = deps.isSubmitting;
    var DAC = deps.DAC;
    var deductMutualQuotaForRows = deps.deductMutualQuotaForRows || function () {};
    var showEmptySlotModal = deps.showEmptySlotModal;
    // 2A：紙本／代送判定＋進度步驟自 app.js 搬移（notificationsSuppressed 由 app 經 deps 傳入）
    var printSelectedForms = deps.printSelectedForms;
    var openPrintPreview = deps.openPrintPreview || printSelectedForms;
    var applyClassViewFromUrl = deps.applyClassViewFromUrl || function () { return false; };
    var resolvePendingClassView = deps.resolvePendingClassView || function () {};
    // 2A：紙本／代送判定＋進度步驟自 app.js 搬移（notificationsSuppressed 由 app 經 deps 傳入）
    var notificationsSuppressed = deps.notificationsSuppressed || { value: false };

    var mySentRequests = deps.mySentRequests;
    var myPendingRequests = deps.myPendingRequests;
    var adminPendingRequests = deps.adminPendingRequests;
    var allPendingRequests = deps.allPendingRequests;
    var requestsList = deps.requestsList;
    var paginatedAdminPending = deps.paginatedAdminPending;
    var selectedRecordIds = deps.selectedRecordIds;
    var activeTab = deps.activeTab;
    var showDetailModal = deps.showDetailModal;
    var detailRequest = deps.detailRequest;
    var detailSubRecord = deps.detailSubRecord;

    var selectedAdminPendingIds = ref([]);
    var lastBatchPrintIds = ref([]);
    var showBatchPrintPrompt = ref(false);

    function findRequestById(id) {
      var direct = requestsList.value.find(function (r) { return r.id === id; });
      if (direct) return direct;
      // 輕量 fallback：資料剛切換時，衍生清單可能比主列表先完成更新。
      return mySentRequests.value.find(function (r) { return r.id === id; }) ||
        myPendingRequests.value.find(function (r) { return r.id === id; }) ||
        adminPendingRequests.value.find(function (r) { return r.id === id; }) ||
        allPendingRequests.value.find(function (r) { return r.id === id; });
    }

    function isAdminPendingSelected(id) {
      // DOM 優先（避免每列讀 ref 觸發依賴追蹤抖動）
      try {
        var el = document.querySelector('.admin-select-cb[data-req-id="' + String(id) + '"]');
        if (el) return !!el.checked;
      } catch (e) { /* ignore */ }
      return selectedAdminPendingIds.value.some(function (selectedId) {
        return String(selectedId) === String(id);
      });
    }

    function readAdminCheckedIds() {
      var ids = [];
      try {
      document.querySelectorAll('.admin-select-cb:checked').forEach(function (el) {
        if (el.disabled) return;
        var id = el.getAttribute('data-req-id') || el.value;
          if (id) ids.push(id);
        });
      } catch (e) { /* ignore */ }
      return ids;
    }

    function syncAdminSelectionFromDom() {
      var checkedIds = readAdminCheckedIds();
      var renderedIds = [];
      try {
        document.querySelectorAll('.admin-select-cb').forEach(function (el) {
          var id = el.getAttribute('data-req-id') || el.value;
          if (id) renderedIds.push(String(id));
        });
      } catch (e) { /* ignore */ }
      var renderedSet = new Set(renderedIds);
      var next = [];
      // 收合批次的子列不在 DOM，保留它們原本的選取狀態。
      (selectedAdminPendingIds.value || []).forEach(function (id) {
        if (!renderedSet.has(String(id)) && next.indexOf(String(id)) < 0) next.push(String(id));
      });
      checkedIds.forEach(function (id) {
        if (next.indexOf(String(id)) < 0) next.push(String(id));
      });
      selectedAdminPendingIds.value = next;
      var selected = new Set(next);
      var pageIds = getAdminPendingPageSelectableIds();
      var pageSelected = pageIds.length > 0 && pageIds.every(function (id) { return selected.has(String(id)); });
      try {
        document.querySelectorAll('.admin-select-all').forEach(function (el) { el.checked = pageSelected; });
      } catch (eHeader) { /* ignore */ }
    }

    function toggleAdminPendingSelect(id) {
      // 相容舊呼叫：改 DOM 再同步
      try {
        var el = document.querySelector('.admin-select-cb[data-req-id="' + String(id) + '"]');
        if (el) el.checked = !el.checked;
      } catch (e) { /* ignore */ }
      syncAdminSelectionFromDom();
    }

    function getAdminPendingPageSelectableIds() {
      var ids = [];
      var seen = Object.create(null);
      var rows = paginatedAdminPending && Array.isArray(paginatedAdminPending.value)
        ? paginatedAdminPending.value
        : [];
      var add = function (row) {
        if (!row || row.id == null) return;
        var id = String(row.id);
        if (!seen[id]) {
          seen[id] = true;
          ids.push(id);
        }
      };
      rows.forEach(function (row) {
        if (row && row.displayKind === 'batch') {
          (row.items || []).forEach(add);
        } else {
          add(row);
        }
      });
      return ids;
    }

    function setAdminPendingSelection(ids, on) {
      var selected = new Set((selectedAdminPendingIds.value || []).map(function (id) { return String(id); }));
      (ids || []).forEach(function (id) {
        var key = String(id);
        if (on) selected.add(key);
        else selected.delete(key);
      });
      selectedAdminPendingIds.value = Array.from(selected);
      var idSet = new Set((ids || []).map(function (id) { return String(id); }));
      try {
        document.querySelectorAll('.admin-select-cb').forEach(function (el) {
          var id = el.getAttribute('data-req-id') || el.value;
          if (!el.disabled && idSet.has(String(id))) el.checked = on;
        });
        var pageIds = getAdminPendingPageSelectableIds();
        var pageSelected = pageIds.length > 0 && pageIds.every(function (id) { return selected.has(String(id)); });
        document.querySelectorAll('.admin-select-all').forEach(function (el) {
          el.checked = pageSelected;
        });
      } catch (e) { /* ignore */ }
    }

    function toggleSelectAllAdminPending(evt) {
      var ids = getAdminPendingPageSelectableIds();
      if (!ids.length) {
        if (evt && evt.target) evt.target.checked = false;
        return;
      }
      var selected = new Set((selectedAdminPendingIds.value || []).map(function (id) { return String(id); }));
      var allOn = ids.every(function (id) { return selected.has(String(id)); });
      var isCheckboxEvent = !!(evt && evt.target && evt.target.type === 'checkbox');
      var on = isCheckboxEvent ? !!evt.target.checked : !allOn;
      setAdminPendingSelection(ids, on);
    }

    function isAdminBatchGroupSelected(group) {
      var ids = (group && group.items || []).filter(function (row) {
        return row && row.id != null;
      }).map(function (row) { return String(row.id); });
      if (!ids.length) return false;
      var selected = new Set((selectedAdminPendingIds.value || []).map(function (id) { return String(id); }));
      return ids.every(function (id) { return selected.has(id); });
    }

    function toggleAdminBatchGroupSelection(group, evt) {
      var ids = (group && group.items || []).filter(function (row) {
        return row && row.id != null;
      }).map(function (row) { return String(row.id); });
      if (!ids.length) return;
      setAdminPendingSelection(ids, !!(evt && evt.target && evt.target.checked));
    }

    function clearAdminPendingSelection() {
      try {
        document.querySelectorAll('.admin-select-cb, .admin-select-all').forEach(function (el) {
          el.checked = false;
        });
      } catch (e) { /* ignore */ }
      selectedAdminPendingIds.value = [];
    }

    function splitAdminPendingIds(ids) {
      var regularIds = [];
      var triangleIds = [];
      var seenTriangles = Object.create(null);
      (ids || []).forEach(function (id) {
        var request = findRequestById(id);
        if (!request || !isTriangleRequest(request)) {
          regularIds.push(id);
          return;
        }
        var groupKey = String(request.triangleId || request.batchId || request.id || id);
        if (seenTriangles[groupKey]) return;
        seenTriangles[groupKey] = true;
        triangleIds.push(id);
      });
      return { regularIds: regularIds, triangleIds: triangleIds };
    }

    // 單勾：原生已亮；延後同步 ref（按鈕 disabled 用）
    if (typeof document !== 'undefined') {
      document.addEventListener('change', function (evt) {
        var t = evt && evt.target;
        if (!t || !t.classList) return;
        if (t.classList.contains('admin-select-cb')) {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(syncAdminSelectionFromDom);
          } else {
            syncAdminSelectionFromDom();
          }
        }
      }, true);
    }

    async function checkUrlCallback(currentUser) {
      var urlParams = new URLSearchParams(window.location.search);
      var action = urlParams.get('action');
      var id = urlParams.get('id');
      var respStatus = urlParams.get('status');
      var batchId = urlParams.get('batchId');

      if (applyClassViewFromUrl()) {
        resolvePendingClassView();
      }

      if (action === 'respondBatch' && batchId && respStatus) {
        loading.value = true;
        loadingMessage.value = '正在批次簽核回應中...';
        try {
          await respondToBatch(batchId, respStatus === 'agree' ? 'agree' : 'decline');
        } catch (e) {
          console.error('批次簽核連結出錯：', e);
          showToast('批次簽核失敗，請登入系統手動處理！', 'error');
        } finally {
          if (window.location.search) {
            // 清 query 但保留 hash（分頁位置 #records 等）
            window.history.replaceState({}, document.title, window.location.pathname + (window.location.hash || ''));
          }
          loading.value = false;
        }
        return;
      }

      if (action === 'respond' && id && respStatus) {
        loading.value = true;
        loadingMessage.value = '正在通過信件進行線上簽核回應中...';
        try {
           var loginEmail = currentUser.email.toLowerCase();
           var loginName = String(getTeacherNameByEmail(loginEmail) || '').toLowerCase();
           var req = findRequestById(id);
           if (!req) {
             showToast('⚠️ 找不到該申請單，或資料庫尚未同步完成！', 'warning');
           } else if (String(req.targetTeacherName || req.targetTeacherEmail || '').toLowerCase() !== loginName) {
             showToast(
               '⚠️ 簽核失敗！此簽核連結限由 ' + req.targetTeacherName +
               ' 老師點選。您目前登入的帳號是：' + loginEmail,
              'error'
            );
          } else if (req.status !== 'pending_teacher') {
            showToast(
              '⚠️ 此申請單目前狀態為【' + getStatusText(req.status) + '】，無法重複回應。',
              'warning'
            );
          } else {
            var status = respStatus === 'agree' ? 'agree' : 'decline';
         var responseResult = await callGasApi(
           isTriangleRequest(req) ? 'respondTriangleRequest' : 'respondToRequest',
           { requestId: id, response: status }
         );
         if (isTriangleRequest(req)) {
           var triangleStatus = (responseResult && responseResult.groupStatus)
             || (status === 'agree' ? 'pending_teacher' : 'rejected');
           optimisticPatchTriangleGroup(req, triangleStatus, status);
           showToast(
             status === 'agree'
               ? (triangleStatus === 'pending_admin'
                 ? '🎉 三位教師已全部同意，三角調已送交教學組核准。'
                 : '🎉 您已同意三角調，等待其他教師完成同意。')
               : '已拒絕此組三角調，整組不會生效。',
             'success'
           );
         } else {
           showToast(
             respStatus === 'agree'
               ? '🎉 您已成功【同意】此調代課邀請，目前已送交教學組核准出單。'
               : '已拒絕此項調代課邀請。',
             'success'
           );
           optimisticPatchRequestStatus(id, respStatus === 'agree' ? 'pending_admin' : 'rejected');
         }
         if (respStatus !== 'agree') restoreMutualQuotaForRows(req);
            softRefreshInBackground({ delay: 2800 });
          }
        } catch (e) {
          console.error('線上信件簽核出錯：', e);
          showToast('簽核失敗，請登入系統手動處理！', 'error');
        } finally {
          if (window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname + (window.location.hash || ''));
          }
          loading.value = false;
        }
      }
    }

    async function respondToRequest(id, respStatus) {
      loading.value = true;
      loadingMessage.value = '正在處理簽核回應...';
      try {
        var req = findRequestById(id);
        if (!req) {
          showToast('⚠️ 找不到該申請單，請重新整理後再試！', 'warning');
          return;
        }
        if (req.status !== 'pending_teacher') {
          showToast(
            '⚠️ 此申請單目前狀態為【' + getStatusText(req.status) + '】，無法重複回應。',
            'warning'
          );
          return;
        }
        var status = respStatus === 'agree' ? 'agree' : 'decline';
         var responseResult = await callGasApi(
           isTriangleRequest(req) ? 'respondTriangleRequest' : 'respondToRequest',
           { requestId: id, response: status }
         );
         if (isTriangleRequest(req)) {
           var triangleStatus = (responseResult && responseResult.groupStatus)
             || (status === 'agree' ? 'pending_teacher' : 'rejected');
           optimisticPatchTriangleGroup(req, triangleStatus, status);
           showToast(
             status === 'agree'
               ? (triangleStatus === 'pending_admin'
                 ? '🎉 三位教師已全部同意，三角調已送交教學組核准。'
                 : '🎉 您已同意三角調，等待其他教師完成同意。')
               : '已拒絕此組三角調，整組不會生效。',
             'success'
           );
         } else {
           showToast(
             respStatus === 'agree'
               ? '🎉 您已成功【同意】此調代課邀請，目前已送交教學組核准出單。'
               : '已拒絕此項調代課邀請。',
             'success'
           );
           optimisticPatchRequestStatus(id, respStatus === 'agree' ? 'pending_admin' : 'rejected');
         }
         if (respStatus !== 'agree') restoreMutualQuotaForRows(req);
        // 畫面已更新；延後輕量對齊即可
        softRefreshInBackground({ delay: 2800 });
      } catch (e) {
        console.error('簽核出錯：', e);
        showToast('簽核失敗：' + (e && e.message ? e.message : String(e)), 'error');
      } finally {
        loading.value = false;
      }
    }

    async function respondToBatch(batchId, respStatus) {
      if (!batchId) {
        showToast('缺少批次ID', 'warning');
        return;
      }
      var status = respStatus === 'agree' ? 'agree' : 'decline';
      loading.value = true;
      loadingMessage.value = status === 'agree' ? '正在全部同意…' : '正在全部拒絕…';
      try {
        var res = await callGasApi('respondToBatch', { batchId: batchId, response: status });
        var n = (res && res.count) || 0;
        var newStatus = status === 'agree' ? 'pending_admin' : 'rejected';
        var batchPeers = (requestsList.value || []).filter(function (r) {
          return r.batchId === batchId && r.status === 'pending_teacher';
        });
        optimisticPatchRequestStatuses(batchPeers.map(function (r) {
          return { id: r.id, status: newStatus };
        }));
        if (status !== 'agree') {
          restoreMutualQuotaForRows(batchPeers);
        }
        showToast(
          status === 'agree'
            ? '🎉 已全部同意共 ' + (n || '多') + ' 節，已送交教學組核准。'
            : '已全部拒絕共 ' + (n || '多') + ' 節。',
          'success'
        );
        softRefreshInBackground({ delay: 2500 });
      } catch (e) {
        console.error('批次簽核失敗：', e);
        showToast('批次簽核失敗：' + (e && e.message ? e.message : String(e)), 'error');
        throw e;
      } finally {
        loading.value = false;
      }
    }

    async function adminApprove(id, opts) {
      opts = opts || {};
      var silent = !!opts.skipConfirm;
      var req = findRequestById(id);
      if (!req) {
        showToast('找不到此申請單', 'error');
        return;
      }
      var approveNote = '';
      if (!opts.skipConfirm) {
        var riskLine = '';
        try {
          var flags = getApproveRiskFlags(req) || [];
          if (flags.length) {
            riskLine = '\n\n⚠ 風險黃燈：' + flags.map(function (f) { return f.label; }).join('、');
          }
        } catch (eF) { /* ignore */ }
        var result = await showConfirm(
          formatRequestSummary(req) + riskLine + '\n\n請再次核對後按「確認」出單。',
          '核准前核對',
          { withNote: true, notePlaceholder: '行政備註（選填）' }
        );
        if (!result || !result.ok) return;
        approveNote = result.note || '';
      }
      if (!silent) {
        loading.value = true;
        loadingMessage.value = '核准生效並寫入臨時異動中...';
      }
      try {
         var isTriangle = isTriangleRequest(req);
         var isExchange = req.type === 'exchange';
         var finalNote = approveNote || req.note || '';
         await callGasApi('adminApprove', { requestId: id, note: finalNote });
         bustQuotaLedgerCache();
         if (!silent) showToast('核准成功，異動已寫入課表！', 'success');
         if (isTriangle) optimisticPatchTriangleGroup(req, 'approved');
         else optimisticPatchRequestStatus(id, 'approved');
        if (opts.collectPrintIds) {
          if (isExchange) {
            opts.collectPrintIds.push(id + '_1');
            opts.collectPrintIds.push(id + '_2');
          } else {
            opts.collectPrintIds.push(id);
          }
        }
        // 批次核准：只在 batch 結束打一次；單筆延後對齊
        // 核准後課表異動：用 requestsOnly（含已核准列），勿只拉 pending
        if (!opts.skipSoftRefresh) softRefreshInBackground({ delay: 2800, requestsOnly: true });
      } catch (e) {
        console.error('核准出單失敗：', e);
        if (!silent) {
          var errMsg = e && e.message ? String(e.message) : String(e || '未知錯誤');
          await showConfirm('核准出單失敗：\n\n' + errMsg + '\n\n（系統將保持待簽核狀態，請檢查數據後再試。）', '⚠️ 核准失敗警示', { alertOnly: true });
        }
        throw e;
      } finally {
        if (!silent) loading.value = false;
      }
    }

    async function adminReject(id, opts) {
      opts = opts || {};
      var silent = !!opts.skipConfirm;
      var req = findRequestById(id);
      if (!req) {
        showToast('找不到此申請單', 'error');
        return;
      }
      if (!opts.skipConfirm) {
        var ok = await showConfirm(
          formatRequestSummary(req) + '\n\n確定要駁回此申請嗎？',
          '駁回前核對'
        );
        if (!ok) return;
      }
      if (!silent) loading.value = true;
      try {
         var isTriangle = isTriangleRequest(req);
         await callGasApi('adminReject', { requestId: id });
         bustQuotaLedgerCache();
          if (!silent) showToast('已駁回此申請單。', 'info');
         restoreMutualQuotaForRows(req);
         if (isTriangle) optimisticPatchTriangleGroup(req, 'admin_rejected');
         else optimisticPatchRequestStatus(id, 'admin_rejected');
        if (!opts.skipSoftRefresh) softRefreshInBackground({ delay: 2800 });
      } catch (e) {
        console.error(e);
        if (!silent) {
          var errMsg = e && e.message ? String(e.message) : String(e || '未知錯誤');
          await showConfirm('駁回簽核失敗：\n\n' + errMsg, '⚠️ 駁回失敗警示', { alertOnly: true });
        }
        throw e;
      } finally {
        if (!silent) loading.value = false;
      }
    }

    async function batchAdminApprove() {
      // 勾選可能只在 DOM
      try { syncAdminSelectionFromDom(); } catch (eS) { /* ignore */ }
      var ids = selectedAdminPendingIds.value.slice();
      if (!ids.length) {
        showToast('請先勾選要核准的申請單', 'warning');
        return;
      }
      var selectedGroups = splitAdminPendingIds(ids);
      var regularIds = selectedGroups.regularIds;
      var triangleIds = selectedGroups.triangleIds;
      var preview = ids.slice(0, 8).map(function (id) {
        var r = findRequestById(id);
        if (!r) return '• ' + id;
        var flags = [];
        try { flags = (getApproveRiskFlags(r) || []).map(function (f) { return f.label; }); } catch (eG) { /* ignore */ }
        return '• ' + (r.serial || id) + ' ' + r.requesterName + '→' + r.targetTeacherName +
          ' ' + r.requestDate + '第' + r.requestPeriod + '節' +
          (flags.length ? ' ⚠' + flags.join('/') : '');
      }).join('\n');
      var more = ids.length > 8 ? '\n…另有 ' + (ids.length - 8) + ' 筆' : '';
      var riskBlock = '';
      try { riskBlock = formatApproveBatchRiskSummary(ids) || ''; } catch (eR) { /* ignore */ }
      if (!await showConfirm(
        '即將批次核准 ' + ids.length + ' 筆：\n' + preview + more + riskBlock + '\n\n確定全部出單？',
        '批次核准'
      )) return;
      loading.value = true;
      loadingMessage.value = '批次核准中（' + ids.length + ' 筆，請稍候）…';
      var ok = 0;
      var fail = 0;
      var printIds = [];
      try {
        // 後端一次讀表 + 一次 saveRows；失敗則回退逐筆
        if (regularIds.length) {
          var res = await callGasApiWithProgress(
            'adminApproveBatch',
            { requestIds: regularIds },
            '批次核准 ' + regularIds.length + ' 筆'
          );
          bustQuotaLedgerCache();
          var doneIds = (res && res.ids) || regularIds;
          ok += (res && res.count) || doneIds.length;
          var doneReqById = Object.create(null);
          (requestsList.value || []).forEach(function (r) {
            if (r && r.id != null) doneReqById[String(r.id)] = r;
          });
          optimisticPatchRequestStatuses(doneIds.map(function (id) {
            return { id: id, status: 'approved' };
          }));
          doneIds.forEach(function (id) {
            var r = doneReqById[String(id)] || findRequestById(id);
            if (r && (r.type === 'exchange' || r.type === '對調')) {
              printIds.push(id + '_1');
              printIds.push(id + '_2');
            } else {
              printIds.push(id);
            }
          });
          if (res && res.missing) fail += res.missing;
        }
      } catch (batchE) {
        console.warn('adminApproveBatch 失敗，回退逐筆：', batchE);
        for (var i = 0; i < regularIds.length; i++) {
          loadingMessage.value = '批次核准中 ' + (i + 1) + '/' + regularIds.length + '...';
          try {
            await adminApprove(regularIds[i], {
              skipConfirm: true,
              collectPrintIds: printIds,
              skipSoftRefresh: true
            });
            ok++;
          } catch (e) {
            fail++;
            console.error(e);
          }
        }
      }
      for (var ti = 0; ti < triangleIds.length; ti++) {
        loadingMessage.value = '整組三角調核准中 ' + (ti + 1) + '/' + triangleIds.length + '...';
        try {
          await adminApprove(triangleIds[ti], {
            skipConfirm: true,
            collectPrintIds: printIds,
            skipSoftRefresh: true
          });
          ok++;
        } catch (triangleError) {
          fail++;
          console.error(triangleError);
        }
      }
      clearAdminPendingSelection();
      loading.value = false;
      showToast(
        '批次核准完成：成功 ' + ok + ' 筆' + (fail ? '，失敗／缺 ' + fail + ' 筆' : ''),
        fail ? 'warning' : 'success'
      );
      // 整批只對齊一次（核准＝課表異動）
      if (ok > 0) softRefreshInBackground({ delay: 1200, requestsOnly: true });
      if (ok > 0 && printIds.length > 0) {
        lastBatchPrintIds.value = printIds;
        showBatchPrintPrompt.value = true;
      }
    }

    async function printLastBatchNotices() {
      if (!lastBatchPrintIds.value.length) {
        showToast('沒有可列印的批次紀錄', 'warning');
        return;
      }
      selectedRecordIds.value = lastBatchPrintIds.value.slice();
      showBatchPrintPrompt.value = false;
      activeTab.value = 'records';
      await openPrintPreview('Notice');
    }

    function dismissBatchPrintPrompt() {
      showBatchPrintPrompt.value = false;
    }

    async function batchAdminReject() {
      try { syncAdminSelectionFromDom(); } catch (eS) { /* ignore */ }
      var ids = selectedAdminPendingIds.value.slice();
      if (!ids.length) {
        showToast('請先勾選要駁回的申請單', 'warning');
        return;
      }
      var selectedGroups = splitAdminPendingIds(ids);
      var regularIds = selectedGroups.regularIds;
      var triangleIds = selectedGroups.triangleIds;
      if (!await showConfirm('即將批次駁回 ' + ids.length + ' 筆申請，確定？', '批次駁回')) return;
      loading.value = true;
      var ok = 0;
      var fail = 0;
      try {
        if (regularIds.length) {
          var res = await callGasApi('adminRejectBatch', { requestIds: regularIds });
          bustQuotaLedgerCache();
          var doneIds = (res && res.ids) || regularIds;
          ok += (res && res.count) || doneIds.length;
          var doneReqById = Object.create(null);
          (requestsList.value || []).forEach(function (r) {
            if (r && r.id != null) doneReqById[String(r.id)] = r;
          });
          doneIds.forEach(function (id) {
            var r = doneReqById[String(id)] || findRequestById(id);
            if (r) restoreMutualQuotaForRows(r);
          });
          optimisticPatchRequestStatuses(doneIds.map(function (id) {
            return { id: id, status: 'admin_rejected' };
          }));
          if (res && res.missing) fail += res.missing;
        }
      } catch (batchE) {
        console.warn('adminRejectBatch 失敗，回退逐筆：', batchE);
        for (var i = 0; i < regularIds.length; i++) {
          loadingMessage.value = '批次駁回中 ' + (i + 1) + '/' + regularIds.length + '...';
          try {
            await adminReject(regularIds[i], { skipConfirm: true, skipSoftRefresh: true });
            ok++;
          } catch (e) {
            fail++;
          }
        }
      }
      for (var tj = 0; tj < triangleIds.length; tj++) {
        loadingMessage.value = '整組三角調駁回中 ' + (tj + 1) + '/' + triangleIds.length + '...';
        try {
          await adminReject(triangleIds[tj], { skipConfirm: true, skipSoftRefresh: true });
          ok++;
        } catch (triangleError) {
          fail++;
          console.error(triangleError);
        }
      }
      clearAdminPendingSelection();
      loading.value = false;
      showToast(
        '批次駁回完成：成功 ' + ok + ' 筆' + (fail ? '，失敗 ' + fail + ' 筆' : ''),
        fail ? 'warning' : 'info'
      );
      if (ok > 0) softRefreshInBackground({ delay: 1200 });
    }

    async function cancelRequest(id) {
      if (!await showConfirm('確定要撤回此申請單嗎？')) return;
      loading.value = true;
      try {
        var reqBefore = findRequestById(id);
        await callGasApi('cancelRequest', { requestId: id });
        bustQuotaLedgerCache();
        showToast('已成功撤回！', 'success');
        if (reqBefore) restoreMutualQuotaForRows(reqBefore);
         if (isTriangleRequest(reqBefore)) optimisticPatchTriangleGroup(reqBefore, 'cancelled');
         else optimisticPatchRequestStatus(id, 'cancelled');
        showDetailModal.value = false;
        if (detailRequest.value && detailRequest.value.id === id) {
          detailRequest.value = null;
          detailSubRecord.value = null;
        }
        softRefreshInBackground({ delay: 2500 });
      } catch (e) {
        console.error(e);
        showToast('撤回失敗：' + e.message, 'error');
      } finally {
        loading.value = false;
      }
    }

    async function deleteSubstitutionRecord(subId, requestId) {
      if (!await showConfirm('確定要撤銷此筆異動並還原課表嗎？')) return;
      loading.value = true;
      loadingMessage.value = '還原課表中...';
      try {
        var reqId = (requestId && requestId !== 'N/A') ? requestId : String(subId).replace(/_[12]$/, '');
        var reqBefore = findRequestById(reqId);
        await callGasApi('deleteSubstitutionRecord', { id: subId, requestId: requestId });
        bustQuotaLedgerCache();
        showToast('已成功撤銷，課表已恢復原狀！', 'success');
        if (reqBefore) restoreMutualQuotaForRows(reqBefore);
         if (isTriangleRequest(reqBefore)) optimisticPatchTriangleGroup(reqBefore, 'cancelled');
         else optimisticPatchRequestStatus(reqId, 'cancelled');
        softRefreshInBackground({ delay: 2000, requestsOnly: true });
      } catch (e) {
        console.error('撤銷失敗：', e);
        showToast('撤銷失敗：' + e.message, 'error');
      } finally {
        loading.value = false;
      }
    }

    // 2A：以下紙本判定＋進度步驟自 app.js verbatim 搬移（僅 notificationsSuppressed 走 deps）
    function isPaperFlowValue(value) {
      if (value === true || value === 1) return true;
      const normalized = String(value == null ? '' : value).trim().toLowerCase();
      return normalized === 'true' || normalized === '1' || normalized === '是' || normalized === '紙本';
    }

    /** 舊申請可能沒有紙本欄位；紙本作業期間的待處理單仍視為紙本流程。 */
    function isPaperFlowRequest(request) {
      if (!request) return false;
      if (isPaperFlowValue(request.paperFlow)) return true;
      // 紙本模式下，非代申請的待處理單仍應使用紙本通知格式。
      const pendingPaperStatus = request.status === 'pending_admin' || request.status === 'pending_teacher';
      if (notificationsSuppressed.value && pendingPaperStatus
          && !isProxySubmitRequest(request)) return true;
      if (request.paperFlowSpecified === true) return false;
      if (Object.prototype.hasOwnProperty.call(request, '紙本流程')) {
        return isPaperFlowValue(request['紙本流程']);
      }
      return !!(notificationsSuppressed.value && pendingPaperStatus && !isProxySubmitRequest(request));
    }

    function isProxySubmitRequest(r) {
      if (!r) return false;
      if (r.isProxySubmit === true) return true;
      if (r.proxyByName) return true;
      const note = String(r.note || '');
      return note.indexOf('[行政代申請') >= 0;
    }

    function getRequestProgressSteps(req) {
      // 線上流程：受邀 → 教學組 → 出單；紙本流程不顯示不存在的「對方同意」階段。
      const status = (req && req.status) || 'pending_teacher';
      const name = (req && req.targetTeacherName) || '受邀人';
      const isPaperFlow = isPaperFlowRequest(req);
      const isProxyFlow = isProxySubmitRequest(req);
      const isNoTeacherApprovalFlow = isPaperFlow || isProxyFlow;
      const createdStamp = req && req.createdAt ? String(req.createdAt).trim() : '';
      const updatedStamp = req && req.updatedAt ? String(req.updatedAt).trim() : '';
      // 完成步驟下方顯示用：有時分則 MM/DD HH:mm，否則 MM/DD
      const formatProgressAt = (stamp) => {
        if (!stamp) return '';
        const raw = String(stamp).trim().replace('T', ' ').replace(/\//g, '-');
        const m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[ ]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
        if (m) {
          const md = `${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
          if (m[4] != null) return `${md} ${m[4].padStart(2, '0')}:${m[5]}`;
          return md;
        }
        if (raw.length >= 16) return raw.slice(5, 16).replace('-', '/');
        if (raw.length >= 10) return raw.slice(5, 10).replace('-', '/');
        return raw;
      };
      const createdAtLabel = formatProgressAt(createdStamp);
      const updatedAtLabel = formatProgressAt(updatedStamp);
      // updated 明顯晚於 created 才當成「後續動作時間」（同意／核准）
      const hasLaterUpdate = !!(updatedStamp && createdStamp && updatedStamp !== createdStamp
        && String(updatedStamp) > String(createdStamp));
      const noteStr = String((req && req.note) || '');
      const isDirectApprove = status === 'approved' && (
        req.directApprove === true ||
        noteStr.indexOf('[直接核准]') >= 0 ||
        noteStr.indexOf('行政直接核准') >= 0 ||
        (req.skipTeacherConfirm === true)
      );

      if (isDirectApprove || (status === 'approved' && req && req.forceDirectProgress)) {
        const atDirect = updatedAtLabel || createdAtLabel;
        return {
          steps: [
            { key: 'admin', label: '教學組直接核准', short: '直接核准', done: true, current: false, fail: false, at: atDirect },
            { key: 'done', label: '已出單生效', short: '出單', done: true, current: false, fail: false, at: atDirect }
          ],
          active: 1,
          failed: false,
          summary: '教學組直接核准出單，課表已更新',
          overdue: false,
          overdueHint: ''
        };
      }

      const steps = isNoTeacherApprovalFlow
        ? [
          { key: 'admin', label: '等教學組核准', short: '行政' },
          { key: 'done', label: '已出單生效', short: '出單' }
        ]
        : [
          { key: 'invite', label: `等 ${name} 同意`, short: '受邀' },
          { key: 'admin', label: '等教學組核准', short: '行政' },
          { key: 'done', label: '已出單生效', short: '出單' }
        ];
      let active = 0;
      let summary = '';
      let overdue = false;
      let overdueHint = '';

      // 逾時起算：教師階段＝送出日(createdAt)；行政階段＝進入行政日(updatedAt，通常為對方同意時間)
      const parseAgeDays = (stamp) => {
        if (!stamp) return 0;
        const t = new Date(String(stamp).replace(/-/g, '/'));
        if (isNaN(t.getTime())) return 0;
        return (Date.now() - t.getTime()) / (1000 * 60 * 60 * 24);
      };
      const createdAgeDays = parseAgeDays(req && req.createdAt)
        || parseAgeDays(req && req.requestDate);
      let adminWaitAgeDays = 0;
      if (updatedStamp) {
        const uAge = parseAgeDays(updatedStamp);
        const cAge = parseAgeDays(createdStamp);
        if (!createdStamp || uAge + 0.02 < cAge) {
          adminWaitAgeDays = uAge;
        }
      }

      if (status === 'pending_teacher') {
        active = 0;
        summary = isPaperFlow
          ? '目前：紙本通知已送出，等待教學組核准出單'
          : (isProxyFlow
            ? '目前：已代送申請，等待教學組核准出單'
            : `目前：等待 ${name} 老師線上同意`);
        if (createdAgeDays >= 2) {
          overdue = true;
          overdueHint = isNoTeacherApprovalFlow
            ? `已超過 ${Math.floor(createdAgeDays)} 天待行政核准`
            : `已超過 ${Math.floor(createdAgeDays)} 天未回覆，可再傳 LINE 或改請他人`;
        }
      } else if (status === 'pending_admin') {
        active = isNoTeacherApprovalFlow ? 0 : 1;
        summary = isPaperFlow
          ? '目前：紙本通知已送出，等待教學組核准出單'
          : (isProxyFlow
            ? '目前：已代送申請，等待教學組核准出單'
            : '目前：對方已同意，等待教學組核准出單');
        if (adminWaitAgeDays >= 2) {
          overdue = true;
          overdueHint = `已超過 ${Math.floor(adminWaitAgeDays)} 天待行政核准`;
        }
      } else if (status === 'approved') {
        active = isNoTeacherApprovalFlow ? 1 : 2;
        summary = '已核准生效，課表已更新';
      } else if (status === 'rejected') {
        return {
          steps: [{ key: 'rej', label: `${name} 已拒絕`, short: '拒絕', done: true, fail: true, current: false, at: updatedAtLabel || createdAtLabel }],
          active: 0, failed: true, failLabel: '已拒絕',
          summary: `${name} 老師已拒絕此邀請`,
          overdue: false, overdueHint: ''
        };
      } else if (status === 'admin_rejected') {
        return {
          steps: [{ key: 'rej', label: '教學組已駁回', short: '駁回', done: true, fail: true, current: false, at: updatedAtLabel || createdAtLabel }],
          active: 0, failed: true, failLabel: '已駁回',
          summary: '教學組已駁回此申請',
          overdue: false, overdueHint: ''
        };
      } else if (status === 'cancelled' || status === 'withdrawn') {
        const lab = status === 'withdrawn' ? '已撤回' : '已取消';
        return {
          steps: [{ key: 'can', label: lab, short: lab, done: true, fail: true, current: false, at: updatedAtLabel || createdAtLabel }],
          active: 0, failed: true, failLabel: lab,
          summary: lab,
          overdue: false, overdueHint: ''
        };
      }
      return {
        steps: steps.map((st, i) => {
          const done = i < active || (i === active && status === 'approved');
          const current = i === active && status !== 'approved';
          let at = '';
          if (done) {
            if (st.key === 'invite') {
              // 已完成受邀：pending_admin 時 updated≈同意時間；approved 時難還原，改標送出時間
              if (status === 'pending_admin' && (hasLaterUpdate || updatedAtLabel)) {
                at = updatedAtLabel || createdAtLabel;
              } else {
                at = createdAtLabel;
              }
            } else if (st.key === 'admin' || st.key === 'done') {
              // 核准／出單：優先更新時間，否則送出時間
              at = (status === 'approved' ? (updatedAtLabel || createdAtLabel) : (updatedAtLabel || createdAtLabel));
            }
          }
          return { ...st, done, current, fail: false, at };
        }),
        active,
        failed: false,
        summary,
        overdue,
        overdueHint
      };
    }

    // 2A：三角送出自 app.js 搬移（deps 見上方）
    async function submitTriangleRequest() {
      if (triangleSubmitting.value) return;
      const validation = triangleValidation.value;
      if (!validation || !validation.ok) {
        showToast((validation && validation.errors && validation.errors[0]) || '請先完成三角調選擇', 'warning');
        return;
      }
      const reason = String(triangleReason.value || '').trim() || '請假';
      const trianglePaperFlow = !onlineSubstitutionEnabled.value;
      const participants = triangleParticipants.value;
      const triangleId = `tri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const serial = `TRI${Math.floor(1000 + Math.random() * 9000)}`;
      const legs = validation.legs.map((leg, index) => {
        const source = participants[index];
        const target = participants[(index + 1) % participants.length];
        return Object.assign({}, leg, {
          sourceTeacherEmail: source.email,
          targetTeacherEmail: target.email,
          note: triangleNote.value
        });
      });
      triangleSubmitting.value = true;
      loading.value = true;
      loadingMessage.value = '正在送出三角調整組…';
      try {
         const result = await callGasApi('submitTriangleRequest', {
          triangleId,
           serial,
           legs,
           reason,
           note: triangleNote.value,
           skipNotify: trianglePaperFlow
         });
         const ids = result && Array.isArray(result.ids) ? result.ids : [];
        const actualTrianglePaperFlow = result && result.paperFlow != null
          ? !!result.paperFlow
          : trianglePaperFlow;
        const triangleStatus = actualTrianglePaperFlow ? 'pending_admin' : 'pending_teacher';
        const triangleConsentStatus = actualTrianglePaperFlow ? 'paper_pending' : 'pending';
        const frontRows = legs.map((leg, index) => sheetRequestToFront({
          '學期代號': currentSemester.value,
          '申請單ID': ids[index] || `${triangleId}_${index + 1}`,
          '單號': `${serial}-${index + 1}`,
          '批次ID': triangleId,
           '狀態': triangleStatus,
           '紙本流程': actualTrianglePaperFlow ? 'TRUE' : 'FALSE',
           paperFlow: actualTrianglePaperFlow,
          '申請人姓名': leg.sourceTeacher,
          '受邀人姓名': leg.targetTeacher,
          '班級': leg.sourceCourse.className,
          '科目': leg.sourceCourse.subject,
          '異動日期': leg.sourceSlot.date,
          '異動星期': leg.sourceSlot.day,
          '異動節次': leg.sourceSlot.period,
          '異動類型': 'triangle',
          '對調目標日期': leg.targetSlot.date,
          '對調目標星期': leg.targetSlot.day,
          '對調目標節次': leg.targetSlot.period,
          '對調目標班級': leg.targetCourse.className,
          '對調目標科目': leg.targetCourse.subject,
          '三角調ID': triangleId,
          '三角腳次': index + 1,
           '三角同意狀態': triangleConsentStatus,
           '三角組狀態': triangleStatus,
          '經費來源': '無',
          '請假事由': reason,
          '備註': triangleNote.value
        }));
        frontRows.forEach((row) => optimisticUpsertRequest(row));
        successActionRequests.value = frontRows;
        softRefreshInBackground({ delay: 2500 });
         if (actualTrianglePaperFlow) {
           showMatchModal.value = false;
           hasLineTemplate.value = false;
           lineCopyText.value = '';
           lineBatchParts.value = [];
           showSuccessModal.value = false;
           resetTriangleDraft();
          // openPrintPreview 需要 loading 已解除，才能像一般紙本流程一樣直接開啟列印預覽。
          loading.value = false;
          await openPaperPrintDraftForSubmittedRequests(frontRows);
          showToast('三角調申請已建立，請列印後由三位教師簽名，再交教學組核審。', 'success', 6000);
          return;
        }
        successModalTitle.value = '🎉 三角調申請已送出';
        successModalMessage.value = `三角調（${serial}）已建立，三位教師都同意後才會送交教學組核准。系統已寄出各自的簽核邀請。`;
        successFlowMode.value = 'normal';
        lineBatchParts.value = frontRows.map((row) => ({
          name: row.targetTeacherName,
          count: 1,
          text: UiLineTemplate.buildTriangleLineText(row, frontRows)
        }));
        lineCopyText.value = '';
        hasLineTemplate.value = lineBatchParts.value.length > 0;
        resetTriangleDraft();
        showMatchModal.value = false;
        showSuccessModal.value = true;
      } catch (error) {
        console.error('三角調送出失敗：', error);
        showToast('三角調送出失敗：' + (error && error.message ? error.message : error), 'error');
      } finally {
        loading.value = false;
        triangleSubmitting.value = false;
      }
    }

    const startCombinedReturn = () => {
      const cell = activeCell.value || {};
      const classData = cell.classData || {};
      const className = String(classData.className || '').trim();
      const hasCombinedTag = typeof hasScheduleSpecialTag === 'function'
        && hasScheduleSpecialTag(classData, '併班');
      if (!isAdmin2.value) {
        showToast('併班上課僅限教學組建立', 'warning');
        return false;
      }
      if (!cell.teacherEmail || !cell.dayOfWeek || cell.period == null || !className) {
        showToast('請先點選一堂完整的併班課程', 'warning');
        return false;
      }
      if (classData.isPatrol || classData.attr === '巡堂') {
        showToast('巡堂節不適用併班上課', 'warning');
        return false;
      }
      if (!isCombinedClass2(className) && !hasCombinedTag) {
        showToast('此功能僅適用於併班課堂', 'warning');
        return false;
      }
      const candidates = findCombinedReturnCandidates(cell);
      if (!candidates.length) {
        showToast('找不到同節次的其他併班任課教師，請先確認課表資料', 'warning');
        return false;
      }
      combinedReturnCandidates.value = candidates;
      const dateStr = inputRequestDate.value || (currentWeekDates.value[cell.dayOfWeek - 1] || '');
      const timeKey = (DateUtils && DateUtils.encodeTimeKey)
        ? DateUtils.encodeTimeKey(cell.dayOfWeek, cell.period)
        : (String(cell.dayOfWeek) + '-' + String(cell.period));
      pendingRequestData.value = {
        mode: 'substitution',
        specialFlow: (FieldMap && FieldMap.SPECIAL_FLOW_COMBINED_RETURN) || 'combined_return',
        leaveTeacher: cell.teacherEmail,
        subTeacher: candidates.length === 1 ? candidates[0].email : '',
        combinedReturnCandidates: candidates,
        cls: className,
        subject: classData.subject || '',
        date: dateStr,
        timeKey: timeKey,
        reason: '',
        courseAdjustmentOnly: false,
        leaveReasonBeforeCourseAdjustment: '',
        subFee: parseInt(cell.period, 10) === 8 ? PERIOD8_FEE : '',
        dateB: '',
        timeB: '',
        subB: '',
        subBClass: '',
        note: '',
        leaveTimeType: '',
        leaveTimeStart: '',
        leaveTimeEnd: '',
        leaveTime: '',
        submitRequestId: 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        submitSerial: 'SUB' + (1000 + Math.floor(Math.random() * 9000)),
        mutualPreview: false
      };
      isMutualCover.value = false;
      consecAlertsA.value = [];
      consecAlertsB.value = [];
      matchPreview.value = null;
      showMatchModal.value = false;
      showCompareModal.value = true;
      return true;
    };

    async function executeEmptySlotAssign() {
      if (paperMode.value && !isAdmin2.value) {
        showToast('目前為紙本模式，空堂排班不建立線上申請', 'info');
        return;
      }
      if (!isAdmin2.value) {
        showToast('僅教學組可使用空堂排班', 'warning');
        return;
      }
      await ensureDAC();
      const f = emptySlotForm.value;
      const task = String(f.taskName || '').trim();
      if (!task) {
        showToast('請填寫任務名稱（例如：段考巡堂）', 'info');
        return;
      }
      if (!f.teacherEmail || !f.dateStr || !f.period) {
        showToast('缺少日期／節次／老師', 'warning');
        return;
      }
      if (emptySlotQuotaZero.value) {
        const ok = await showConfirm(
          f.teacherName + ' 老師目前折抵額度為 0。\n仍要排入並扣額度？\n（送出後請安排由他人還一節）',
          '額度為 0'
        );
        if (!ok) return;
      }
      if (isSubmitting.value) {
        showToast('送出中，請稍候…', 'info');
        return;
      }
      isSubmitting.value = true;
      loading.value = true;
      loadingMessage.value = '正在送出空堂排班…';
      try {
        const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const serial = 'SUB' + (1000 + Math.floor(Math.random() * 9000));
        const DAC0 = DAC();
        if (!DAC0 || !DAC0.buildEmptySlotPayload) {
          throw new Error('空堂排班模組未載入');
        }
        const built = DAC0.buildEmptySlotPayload({
          date: f.dateStr,
          period: f.period,
          dayOfWeek: f.dayOfWeek,
          teacherEmail: f.teacherEmail,
          teacherName: f.teacherName,
          taskName: task,
          className: String(f.className || '').trim(),
          note: f.note,
          semesterId: currentSemester.value,
          requestId: requestId,
          serial: serial
        });
        await callGasApi('submitRequest', {
          request: built.request,
          directApprove: true,
          skipNotify: true
        });
        optimisticUpsertRequest(sheetRequestToFront(built.newRequest));
        await deductMutualQuotaForRows([built.newRequest]);
        softRefreshInBackground({ delay: 2500 });
        showEmptySlotModal.value = false;
        const qTip = emptySlotQuotaZero.value
          ? '（額度為 0，請安排他人還一節）'
          : '（已扣 1 額度）';
        showToast(
          '已排入「' + task + '」→ ' + f.teacherName + '　'
          + f.dateStr + ' 第' + f.period + '節' + qTip + '　未寄系統信',
          'success'
        );
      } catch (err) {
        console.error('空堂排班失敗：', err);
        showToast('空堂排班失敗：' + (err && err.message ? err.message : String(err)), 'error');
      } finally {
        loading.value = false;
        isSubmitting.value = false;
      }
    };

    // 2A：核准前風險黃燈＋摘要自 app.js 搬移（綁課判定走 deps 注入的包裝）
    function getApproveRiskFlags(req) {
      const flags = [];
      if (!req) return flags;
      const isEx = isExchangeLikeRequest(req);
      const period = parseInt(req.requestPeriod != null ? req.requestPeriod : req.period, 10);
      try {
        if (typeof isLeaveClassRestricted === 'function' && isLeaveClassRestricted(req)) {
          flags.push({ key: 'leave-restricted', label: '原課綁課', level: 'warn' });
        }
        if (isEx && typeof isExchangeClassRestricted === 'function' && isExchangeClassRestricted(req)) {
          flags.push({ key: 'ex-restricted', label: '對調綁課', level: 'warn' });
        }
        if (isEx && typeof isRequestExchangeRechanged === 'function' && isRequestExchangeRechanged(req)) {
          flags.push({ key: 'chain', label: '再異動', level: 'warn' });
        }
      } catch (eR) { /* ignore */ }
      if (period === 8) flags.push({ key: 'p8', label: '第8節', level: 'info' });
       const requestFee = req.subFee || req['經費來源'];
       if (!isEx && isTimetableOnlyFee(requestFee)) {
        flags.push({ key: 'timetable-only', label: '僅課表呈現', level: 'info' });
       } else if (!isEx && isQuotaDeductFee(requestFee)) {
        flags.push({ key: 'quota', label: '扣額度', level: 'info' });
        // soft refresh 合併列可能沒有 FieldMap 的非列舉 Email alias；姓名仍是代課者。
        const quotaTeacherKey = req.targetTeacherName
          || req['受邀人姓名']
          || req.targetTeacherEmail
          || req['受邀人Email'];
        const t = typeof lookupTeacher === 'function'
          ? lookupTeacher(quotaTeacherKey)
          : (teachersList.value || []).find(x =>
              [x.email, x.loginEmail, x.teacherName, x.name].filter(Boolean).some(value =>
                String(value).toLowerCase() === String(quotaTeacherKey || '').toLowerCase()
              )
            );
        const q = t ? (parseFloat(t.mutualQuota) || 0) : 0;
        if (q <= 0) flags.push({ key: 'quota0', label: '額度不足', level: 'danger' });
       } else if (!isEx && (requestFee === '公費代課' || requestFee === '學校移撥' || requestFee === ACTIVITY_PUBLIC_FEE || requestFee === '活動公費')) {
        flags.push({ key: 'public', label: '公費', level: 'info' });
      }
      if (isEx && req.targetDate && req.requestDate && String(req.targetDate) !== String(req.requestDate)) {
        flags.push({ key: 'crossday', label: '跨日', level: 'info' });
      }
      return flags;
    }

    function formatRequestSummary(req) {
      if (!req) return '（無申請資料）';
       const isEx = isExchangeLikeRequest(req);
       const typeLabel = isTriangleRequestLocal(req) ? '三角調' : (isEx ? '調課' : '代課');
      const flags = getApproveRiskFlags(req);
      const risks = flags.map(f => f.label);

       let s = `【${typeLabel}】${req.serial || '—'}\n`;
       s += isCombinedReturnRequest(req)
         ? `申請教師：${req.requesterName || '—'}（核准後回原班）\n`
         : `${req.requesterName || '—'} → ${req.targetTeacherName || '—'}\n`;
      s += `請假：${formatLeaveClassSlot(req)}\n`;
      if (isEx) {
        s += `對調：${formatExchangeClassSlot(req)}\n`;
        s += `經費：無`;
      } else {
        s += `經費：${req.subFee || '—'} · 事由：${req.reason || '—'}`;
      }
      if (req.note) s += `\n備註：${req.note}`;
      if (risks.length) s += `\n⚠ 風險：${risks.join('、')}`;
      return s;
    }

    /** 多筆核准前：彙整黃燈摘要 */
    function formatApproveBatchRiskSummary(ids) {
      const lines = [];
      let warnN = 0;
      (ids || []).forEach(id => {
        const r = (allPendingRequests.value || []).find(x => x.id === id)
          || (adminPendingRequests.value || []).find(x => x.id === id)
          || (requestsList.value || []).find(x => x.id === id);
        if (!r) return;
        const flags = getApproveRiskFlags(r).filter(f => f.level === 'warn' || f.level === 'danger');
        if (!flags.length) return;
        warnN++;
        lines.push(`• ${r.serial || id}：${flags.map(f => f.label).join('、')}`);
      });
      if (!warnN) return '';
      return `\n\n⚠ 風險提醒（${warnN} 筆）：\n${lines.slice(0, 12).join('\n')}${lines.length > 12 ? '\n…另有 ' + (lines.length - 12) + ' 筆' : ''}`;
    }

    return {
      selectedAdminPendingIds: selectedAdminPendingIds,
      lastBatchPrintIds: lastBatchPrintIds,
      showBatchPrintPrompt: showBatchPrintPrompt,
      findRequestById: findRequestById,
      isAdminPendingSelected: isAdminPendingSelected,
      toggleAdminPendingSelect: toggleAdminPendingSelect,
      toggleSelectAllAdminPending: toggleSelectAllAdminPending,
      isAdminBatchGroupSelected: isAdminBatchGroupSelected,
      toggleAdminBatchGroupSelection: toggleAdminBatchGroupSelection,
      clearAdminPendingSelection: clearAdminPendingSelection,
      checkUrlCallback: checkUrlCallback,
      respondToRequest: respondToRequest,
      respondToBatch: respondToBatch,
      adminApprove: adminApprove,
      adminReject: adminReject,
      batchAdminApprove: batchAdminApprove,
      batchAdminReject: batchAdminReject,
      printLastBatchNotices: printLastBatchNotices,
      dismissBatchPrintPrompt: dismissBatchPrintPrompt,
      cancelRequest: cancelRequest,
      deleteSubstitutionRecord: deleteSubstitutionRecord,
      isPaperFlowValue: isPaperFlowValue,
      isPaperFlowRequest: isPaperFlowRequest,
      isProxySubmitRequest: isProxySubmitRequest,
      getRequestProgressSteps: getRequestProgressSteps,
      getApproveRiskFlags: getApproveRiskFlags,
      formatRequestSummary: formatRequestSummary,
      formatApproveBatchRiskSummary: formatApproveBatchRiskSummary,
      submitTriangleRequest: submitTriangleRequest,
      sendSelectedBatchNotices: sendSelectedBatchNotices,
      startCombinedReturn: startCombinedReturn,
      executeEmptySlotAssign: executeEmptySlotAssign
    };
  }

  return { create: create };
})();

export { UiApproval };
