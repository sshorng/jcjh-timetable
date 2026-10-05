import { test, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const appSrc = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
const script = appSrc.slice(appSrc.indexOf('<script setup>'), appSrc.indexOf('</script>'));
function boundNames() {
  const out = new Set();
  for (const m of script.matchAll(/const \{([^}]*)\} = /g)) {
    for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(x[1]);
  }
  return out;
}
const RET = ["getMatchSlotDateMMDD","user","userRole","loading","loadingMessage","activeTab","setActiveTab","isSimulating","originalUser","avatarSrc","handleAvatarError","dataUpdatedLabel","dataRefreshing","softSyncing","manualRefreshData","visibleTimetableTeachers","ttPage","ttPageSize","ttTotalPages","ttNeedPager","changeTtPage","requestWindowInfo","historyFullLoaded","historyLoadingFull","historyLoadedMonths","historyMonthLoading","loadHistoryMonth","setHistoryFilterMode","setHistoryTypeFilter","ensureHistoryMonthLoaded","loadFullSemesterHistory","reloadWindowedHistory","selectedMobileDay","isMobile","checkMobile","initMobileDay","currentSemester","availableSemesters","currentSemesterName","semestersList","showSemesterModal","semesterModalMode","semesterForm","currentWeekDates","compareWeekDatesA","compareWeekDatesB","compareWeekSelectionA","compareWeekSelectionB","compareDisplayDatesA","compareDisplayDatesB","setCompareWeekSelection","batchCompareWeekIndex","batchCompareWeekTotal","batchCompareWeekSlotCount","shiftBatchCompareWeek","batchExchangePreviewSlotKey","setBatchExchangePreviewSlot","isCrossWeekExchange","getExchangeEndpointText","selectedWeekDate","currentWeekNumber","classList","classSchedules","selectedClass","classReadonlyMode","classViewerReadonly","selectClassForView","getClassReadonlyLink","copyClassReadonlyLink","searchQuery","selectedSubject","timetableDisplayMode","teachersList","allSchedules","schoolSwaps","substitutionRecords","homeroomRecords","requestsList","mySentRequests","myPendingRequests","adminPendingRequests","allPendingRequests","matchMode","activeCell","inputRequestDate","recommendedTeachers","recommendationLoading","trianglePickB","trianglePickC","triangleNote","triangleReason","triangleSubmitting","triangleCandidates","triangleCandidateB","triangleCandidateCList","triangleCandidateC","triangleParticipants","triangleLegs","trianglePreviewRows","trianglePreviewWeekDates","triangleTimetablePreview","triangleValidation","triangleReady","formatTriangleSlot","openTriangleTimetablePreview","submitTriangleRequest","batchSelectMode","batchFlowMode","batchSlots","showBatchConfirmModal","batchSubTeacher","batchReason","batchSubFee","batchNote","isMutualCover","toggleMutualCover","setMutualCover","MUTUAL_COVER_FEE","ACTIVITY_PUBLIC_FEE","QUOTA_DEDUCT_FEE","PERIOD8_FEE","TIMETABLE_ONLY_FEE","mutualAwayClasses","mutualActivityStart","mutualActivityEnd","mutualActivityStartPeriod","mutualActivityEndPeriod","mutualActivityPeriodMode","mutualActivityPeriods","setMutualActivityPeriodBoundary","setMutualActivityThisWeek","setMutualActivityPeriodMode","toggleMutualActivityPeriod","isMutualActivityPeriodSelected","toggleMutualAwayClass","selectAwayGrade","mutualCoverStats","mutualLeadEmails","toggleMutualLead","isMutualLead","onMutualLeadChipClick","jumpToTeacherTimetable","mutualSkipNotify","directApproveSkipNotify","mutualNote","mutualDrafts","getMutualDraftAt","removeMutualDraft","clearMutualDrafts","clearMutualPanel","assignMutualDraftFromMatch","previewMutualDraft","submitAllMutualDrafts","recalculateMutualQuotasFromActivity","persistMutualPanelDraft","isAwayClassCell","batchAssignMode","batchActiveSlotKey","isBatchMatchFlow","isBatchExchangeFlow","isBatchPerSlotMode","batchAssignedCount","batchAllSlotsAssigned","batchActiveSlot","batchCompareViewEmail","batchCompareSubGroups","setBatchCompareViewEmail","resolveCompareBEmail","setBatchAssignMode","setBatchFlowMode","selectBatchSlotForMatch","assignBatchSlotSub","clearBatchSlotSub","prepBatchPerSlotCompare","prepBatchExchangeCompare","toggleBatchSelectMode","clearBatchSlots","isBatchSlotSelected","openBatchMatch","prepBatchCompare","executeBatchSubmit","matchSearchQuery","matchDisplayCount","matchShowNoTeacherWarning","matchEmptyReasons","filteredRecommendedTeachers","displayedRecommendedTeachers","exchangeTeacherEmail","exchangeTeacherClasses","exchangePeriodId","exchangeTargetDate","exchangeWeekOffset","exchangeWeekdayFilter","exchangeWeekdayOptions","setExchangeWeekdayFilter","filteredExchangeList","showCompareModal","showTriangleTimetablePreview","showMatchModal","pendingRequestData","combinedReturnCandidates","askFirstLineText","askFirstLineDraft","selectedRecordIds","showDevDropdown","devTeacherQuery","filteredDevTeachers","paperPrintDraft","paperSignatureByTeacher","openPaperPrintDraftFromCompare","openPaperPrintForRequest","openPaperPrintMutualDrafts","openTrianglePaperPreview","printPaperDraft","openPaperDraftPreview","showPrintPreviewModal","printPreview","printPreviewImageBusy","openPrintPreview","openHistoryPrintPreview","closePrintPreview","confirmPrintPreview","copyPrintPreviewImage","downloadPrintPreviewImage","showDetailModal","consecAlertsA","consecAlertsB","detailRequest","detailSubRecord","showLineMessageModal","lineMessageTitle","lineMessageText","openLineMessageEditor","copyEditedLineMessage","sendEditedLineMessage","showSuccessModal","successModalTitle","successModalMessage","successFlowMode","successActionRequests","lineCopyText","hasLineTemplate","lineBatchParts","openSuccessPrintPreview","addSuccessToCalendar","copyLineMessage","sendLineMessage","copyLineBatchPart","sendLineBatchPart","copyLineMessageForRequest","addToGoogleCalendar","downloadIcsCalendar","addEventToCalendar","printSingleRequest","showDetailForRecord","getTargetSubject","getTargetClassAndSubject","getOriginalRequestSubject","getOriginalRequestClass","getOriginalTargetSubject","getOriginalTargetClass","getTriangleGroupRequests","adminSubTab","showImportTeachersModal","teacherExcelData","teacherExcelHeaders","teacherMappingFields","teacherImportPreview","runTeacherImportPreview","handleTeacherExcelChange","importTeachersBatch","isScheduleEditMode","showScheduleEditModal","scheduleForm","showTeacherModal","teacherModalMode","teacherForm","showOvertimePlanModal","overtimePlanTeacher","overtimePlanRows","overtimePlanPeriodEnd","overtimePlanUsesFixedSlots","showTeacherExpenseAuditModal","teacherExpenseAuditRows","teacherExpenseAuditSummary","openTeacherExpenseAuditModal","normalizeTeacherExpenseData","showQuotaLedgerModal","quotaLedgerLoading","quotaLedgerTeacher","quotaLedgerRows","openQuotaLedger","closeQuotaLedger","quotaTypeClass","showQuotaAdjustModal","quotaAdjustSaving","quotaAdjustForm","quotaAdjustPreview","openManualQuotaAdjust","closeManualQuotaAdjust","saveManualQuotaAdjust","showEmptySlotModal","emptySlotForm","emptySlotQuotaZero","openEmptySlotAssign","openEmptySlotFromDetail","closeEmptySlotModal","executeEmptySlotAssign","reportMonth","reportStartDate","reportEndDate","reportWeeksCount","monthlyReportData","monthlyReportLoading","monthlyReportTotals","shiftReportPeriod","accountingPeriod","accountingExportLoading","period8Loading","period8ExportLoading","excelData","excelHeaders","mappingFields","importPreview","runImportPreview","downloadScheduleTemplate","downloadCurrentSchedules","directApproveMode","onlineSubstitutionEnabled","paperMode","paperFlow","notificationsSuppressed","setOnlineSubstitutionEnabled","googleClientId","gasApiUrl","saveClientSettings","isSubFeeLockedToSelf","isPeriod8FeeLocked","quotaDeductPreview","quotaDeductInsufficient","switchQuotaDeductToSelfPay","hasSubTeacherConflict","quotaPackPreview","quotaPackLoading","quotaPackError","quotaPackOptions","quotaFifoPackageId","quotaSelectedPack","fetchQuotaPackPreview","resetQuotaPackOverride","isAdmin","isStaff","canViewAllTimetables","canStaffProxySubmit","canStartSecondSubFromDetail","isProxySubmitActive","isProxySubmitGranted","proxySubmitEnabled","proxySubmitEnabledBy","proxySubmitEnabledAt","setProxySubmitEnabled","proxySubmitEmails","proxyGrantQuery","proxyGrantCandidateTeachers","proxyGrantedTeachers","isProxySubmitEmailGranted","toggleProxySubmitEmail","clearAllProxySubmitEmails","persistProxySubmitEmails","proxyTargetEmail","proxyTargetName","proxyTargetQuery","showProxyTargetDropdown","filteredProxyTeachers","setProxyTarget","clearProxyTarget","canOperateOnTeacherEmail","ensureProxyTargetForTeacher","userRoleText","subjectsList","filteredTeachers","displayTimetableTeachers","pendingCount","myInviteCount","adminTodoCount","hasQuickTodo","quickTodoSentOpen","allTeachersList","teachersListDetails","accountingPlanOptions","getExpensePlanSummary","isExpensePlanSlotConfig","pendingHomeroomRecords","homeroomAssignSelections","homeroomRecordsLoading","getHomeroomCoverCandidates","loadHomeroomRecords","assignHomeroomTeacher","homeroomTeachersList","onHomeroomInputSelect","onManualCoverTeacherInput","showManualHomeroomModal","homeroomStatusFilter","manualHomeroomForm","openManualHomeroomModal","onManualHomeroomLeaveTeacherChange","currentMonthHomeroomRecords","currentMonthHomeroomFeeTotal","currentMonthHomeroomAssignedCount","currentMonthHomeroomPendingCount","saveManualHomeroomRecord","deleteHomeroomRecord","matchPreview","exchangeTeachersList","myTeacherProfile","isRequestValid","isHistoryExchangeType","filteredHistoryRecords","formatRequestApplicationDate","dateFilteredHistoryRecords","paginatedHistoryRecords","historyTotalPages","historyFilterMode","historyTypeFilter","historyFilterDate","historySearchQuery","historyPage","historyPageSize","pendingSearchQuery","getLeaveTimeDefaults","getLeaveTimePresetRange","setLeaveTimePreset","updatePendingLeaveTime","toggleCourseAdjustmentOnly","showHistoryEditModal","historyEditForm","leaveReasonOptions","onLeaveReasonChange","defaultSubFeeForReason","pendingMyPendingPage","pendingMySentPage","pendingAdminPage","paginatedMyPending","paginatedMySent","paginatedAdminPending","pendingMyPendingTotal","pendingMySentTotal","pendingAdminTotal","filteredAdminPendingRequests","isBatchGroupExpanded","toggleBatchGroup","getBatchGroupSlotSummary","getBatchGroupTeacherSummary","getBatchGroupStatusText","getBatchGroupStatusClass","isAdminPendingPageFullySelected","personalChanges","recommendedExchangeList","displayedExchangeList","loginWithGoogle","logout","gsiButtonReady","gsiButtonError","gsiLoggingIn","reloadGsiLoginButton","changeWeek","getPeriodTimeSpan","getWeekDayText","formatDateMMDD","timetablePeriods","getPeriodLabel","formatPeriodText","isLunchPeriod","getPeriodClass","formatClassName","isCombinedClass","getScheduleSpecialTags","hasScheduleSpecialTag","isTimetablePullout","isTimetableRestricted","getClassCellClassForDate","getClassCellClassForClass","getScheduleForDate","weekScheduleGrid","cellFromGrid","handleCellClick","handleClassCellClick","handlePeriod8CellClick","isMatchSourceCell","isMatchSourceEntry","isMatchHoverCell","isMatchHoverEntry","selectMatchPreviewSub","selectMatchPreviewExchange","clearMatchPreview","closeMatchModal","isMatchPreviewSelected","selectedClassDate","selectedClassWeekDates","classWeekNumber","classSubstitutionMap","classChangeSummary","getClassChangeTypeLabel","changeClassWeek","goToClassThisWeek","period8WeekDate","period8WeekDates","period8WeekNumber","changePeriod8Week","goToPeriod8ThisWeek","period8RosterRows","period8CellsFor","period8StatusLabel","prepCompare","previewBatchCandidate","closeCompareModal","startCombinedReturn","getCompareCellText","getCompareCellClass","executeSubmitRequest","isSubmitting","getStatusText","changeMatchMode","respondToRequest","respondToBatch","adminApprove","adminReject","cancelRequest","deleteSubstitutionRecord","loadMoreMatches","isTriangleRequest","isExchangeLikeRequest","triangleCandidateSearch","triangleCandidateDisplayCount","triangleCandidateOptions","triangleCandidateCOptions","triangleCandidateCReadyCount","triangleCandidateBOptions","triangleCandidateBReadyCount","displayedTriangleBOptions","displayedTriangleCOptions","triangleCandidateIsRestricted","selectTriangleCandidateB","selectTriangleCandidateC","loadMoreTriangleCandidates","formatRequestSummary","formatLeaveClassSlot","formatExchangeClassSlot","formatQuickTodoTitle","formatHistoryLeaveSlot","formatHistoryExchangeSlot","getRequestRiskTags","getRequestTypeTags","getApproveRiskFlags","formatApproveBatchRiskSummary","isHistoryLeaveRechanged","isHistoryExchangeRechanged","isRequestLeaveRechanged","isRequestExchangeRechanged","getCellPlainStatus","getRequestProgressSteps","isPaperFlowRequest","isLeaveClassRestricted","isExchangeClassRestricted","isHistoryLeaveRestricted","isHistoryExchangeRestricted","dashboardScope","dashboardStats","selectedAdminPendingIds","isAdminPendingSelected","toggleAdminPendingSelect","toggleSelectAllAdminPending","clearAdminPendingSelection","isAdminBatchGroupSelected","toggleAdminBatchGroupSelection","batchAdminApprove","batchAdminReject","openBatchPendingPrintPreview","lastBatchPrintIds","showBatchPrintPrompt","printLastBatchNotices","dismissBatchPrintPrompt","closeSuccessGoPending","closeSuccessGoRecords","closeSuccessStayTimetable","closeSuccessCopyLine","openScheduleEditModal","saveScheduleCell","clearScheduleCell","updateTeacherBaseHours","fillFixedOvertimeFromCurrentSchedule","fillFixedOvertimeForAllTeachers","pickScheduleAttr","normalizeScheduleFormFlags","getScheduleAttrLabel","getOvertimeExpenseSourceOptions","openOvertimePlanModal","saveOvertimePlan","openAddTeacherModal","openEditTeacherModal","saveTeacher","deleteTeacher","handleFileChange","getMappingLabel","importSchedules","migrateNameKeySchema","toggleSelectAllRecords","isHistoryRecordSelected","isHistoryBatchGroupSelected","toggleHistoryBatchGroupSelection","loadTeacherClassesForExchange","printSelectedForms","sendSelectedBatchNotices","calculateMonthlyReport","exportReportToExcel","exportSubFeeToExcel","exportPeriod8Accounting","schoolExportStart","schoolExportEnd","schoolExportIncludeWeekend","schoolExportOnlyChanged","schoolExportSelectedEmails","schoolExportTeacherFilter","filteredSchoolExportTeachers","isSchoolExportTeacherSelected","toggleSchoolExportTeacher","selectAllSchoolExportTeachers","clearSchoolExportTeachers","setSchoolExportThisWeek","exportSchoolTimetableWord","exportActivityCoverWord","invigilationExportTitle","exportInvigilationWorkbook","devSwitchUser","restoreAdmin","getTeacherNameByEmail","getTeacherSubjectByEmail","getTeacherIdentityTooltip","getTeacherTimetableHours","getRealTeacherName","startSecondSub","getTeacherJobTitleByEmail","isHomeroomTeacher","getSubjectStyle","getClassBadgeStyle","formatMoney","changeHistoryPage","openHistoryEditModal","saveHistoryEdit","onHistoryEditReasonChange","onHistoryEditTypeChange","onHistoryEditPeriodChange","onHistoryEditDateChange","changePendingPage","openAddSemesterModal","openEditSemesterModal","saveSemester","deleteSemester","setDefaultSemester","toLocalDateStr","isSingleWeek","semesterStartDate","classAwayEvents","semesterEndDate","activeAwayBanner","isClassAwayOnDate","getClassAwayEventName","showClassAwayModal","classAwayModalMode","classAwayPeriodOptions","classAwayForm","openAddClassAwayModal","openEditClassAwayModal","toggleClassAwayFormClass","isClassAwayFormClassSelected","selectClassAwayGrade","toggleClassAwayPeriod","isClassAwayPeriodSelected","selectClassAwayPeriodRange","setClassAwayPeriodBoundary","setClassAwayPeriodMode","clearClassAwayPeriods","isClassAwayFullDaySelected","classAwayPeriodLabel","classAwayDailyPeriodLabel","classAwayBoundaryPeriodLabel","isClassAwayRangeEvent","saveClassAwayEvent","deleteClassAwayEvent","schoolSwapRows","showSchoolSwapModal","schoolSwapModalMode","schoolSwapSaving","schoolSwapForm","schoolSwapWeekdayText","openAddSchoolSwapModal","openEditSchoolSwapModal","saveSchoolSwap","deleteSchoolSwap","mutualImportableEvents","mutualImportEventId","applyClassAwayEventById","applyClassAwayToMutualPanel","showOnboarding","onboardingStep","onboardingSteps","startOnboarding","nextOnboardingStep","prevOnboardingStep","skipOnboarding","tourDemoInvite","tourDemoInviteRespond"];
test('composition：712 綁定全數可達', () => {
  const bound = boundNames();
  const missing = RET.filter((n) => !bound.has(n));
  expect(missing).toEqual([]);
});
test('composition：映射名皆為其 store 實際回傳成員', () => {
  const appmap = JSON.parse(fs.readFileSync(path.join(here, '__appmap.json'), 'utf8'));
  const storeReturns = JSON.parse(fs.readFileSync(path.join(here, '__storeReturns.json'), 'utf8'));
  const bad = [];
  for (const n of RET) {
    const o = appmap[n];
    if (!o) { bad.push(n + '(無映射)'); continue; }
    if (o.startsWith('pure:')) continue;
    if (!(storeReturns[o] || []).includes(n)) bad.push(n + '(store ' + o + ' 未回傳)');
  }
  expect(bad).toEqual([]);
});
test('composition：模板用到的 store 成員全數有綁（防 not defined on instance）', () => {
  const tpl = appSrc.slice(0, appSrc.indexOf('<script setup>'));
  const tplUsed = new Set();
  const stripQ = (s) => s.replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
  for (const m of tpl.matchAll(/v-[a-z-]+(?:=[^\s>]+)?="([^"]*)"|:([a-zA-Z][\w-]*)(?:\.[a-z]+)*="([^"]*)"|@[\w.-]+="([^"]*)"|\{\{\s*([\s\S]*?)\s*\}\}/g)) {
    const expr = stripQ([m[1], m[3], m[4], m[5]].find((x) => x !== undefined) || '');
    for (const x of expr.matchAll(/(?<![.\w$])([A-Za-z_][A-Za-z0-9_]*)/g)) tplUsed.add(x[1]);
  }
  const bound = boundNames();
  const storeReturns = JSON.parse(fs.readFileSync(path.join(here, '__storeReturns.json'), 'utf8'));
  const known = new Set();
  for (const s of Object.keys(storeReturns)) for (const n of storeReturns[s]) known.add(n);
  const bad = [...tplUsed].filter((n) => known.has(n) && !bound.has(n));
  expect(bad).toEqual([]);
});
test('composition：stores 無 null／undefined 成員（storeToRefs 全量迭代前提）', async () => {
  setActivePinia(createPinia());
  const { toRaw } = await import('vue');
  const bad = [];
  const mods0 = {};
  mods0.session = await import('../src/stores/session.js');
  mods0.data = await import('../src/stores/data.js');
  mods0.timetable = await import('../src/stores/timetable.js');
  mods0.match = await import('../src/stores/match.js');
  mods0.submit = await import('../src/stores/submit.js');
  mods0.requests = await import('../src/stores/requests.js');
  mods0.history = await import('../src/stores/history.js');
  mods0.backoffice = await import('../src/stores/backoffice.js');
  mods0.admin = await import('../src/stores/admin.js');
  mods0.output = await import('../src/stores/output.js');
  mods0.interaction = await import('../src/stores/interaction.js');
  mods0.homeroom = await import('../src/stores/homeroom.js');
  mods0.mutual = await import('../src/stores/mutual.js');
  mods0.tour = await import('../src/stores/tour.js');
  const apis0 = [];
  apis0.push(['session', mods0.session.useSessionStore()]);
  apis0.push(['data', mods0.data.useDataStore()]);
  apis0.push(['timetable', mods0.timetable.useTimetableStore()]);
  apis0.push(['match', mods0.match.useMatchStore()]);
  apis0.push(['submit', mods0.submit.useSubmitStore()]);
  apis0.push(['requests', mods0.requests.useRequestsStore()]);
  apis0.push(['history', mods0.history.useHistoryStore()]);
  apis0.push(['backoffice', mods0.backoffice.useBackofficeStore()]);
  apis0.push(['admin', mods0.admin.useAdminStore()]);
  apis0.push(['output', mods0.output.useOutputStore()]);
  apis0.push(['interaction', mods0.interaction.useInteractionStore()]);
  apis0.push(['homeroom', mods0.homeroom.useHomeroomStore()]);
  apis0.push(['mutual', mods0.mutual.useMutualStore()]);
  apis0.push(['tour', mods0.tour.useTourStore()]);
  for (const [name, store] of apis0) {
    for (const k of Object.keys(toRaw(store))) {
      const v = toRaw(store)[k];
      if (v === null || v === undefined) bad.push(name + '.' + k);
    }
  }
  expect(bad).toEqual([]);
}, 30000);
test('composition：14 stores 實例化＋factory 接線', async () => {
  setActivePinia(createPinia());
  const mods = {};
  mods.session = await import('../src/stores/session.js');
  mods.data = await import('../src/stores/data.js');
  mods.timetable = await import('../src/stores/timetable.js');
  mods.match = await import('../src/stores/match.js');
  mods.submit = await import('../src/stores/submit.js');
  mods.requests = await import('../src/stores/requests.js');
  mods.history = await import('../src/stores/history.js');
  mods.backoffice = await import('../src/stores/backoffice.js');
  mods.admin = await import('../src/stores/admin.js');
  mods.output = await import('../src/stores/output.js');
  mods.interaction = await import('../src/stores/interaction.js');
  mods.homeroom = await import('../src/stores/homeroom.js');
  mods.mutual = await import('../src/stores/mutual.js');
  mods.tour = await import('../src/stores/tour.js');
  mods.gas = await import('../src/stores/gas.js');
  const apis = [];
  apis.push(['session', mods.session.useSessionStore()]);
  apis.push(['data', mods.data.useDataStore()]);
  apis.push(['timetable', mods.timetable.useTimetableStore()]);
  apis.push(['match', mods.match.useMatchStore()]);
  apis.push(['submit', mods.submit.useSubmitStore()]);
  apis.push(['requests', mods.requests.useRequestsStore()]);
  apis.push(['history', mods.history.useHistoryStore()]);
  apis.push(['backoffice', mods.backoffice.useBackofficeStore()]);
  apis.push(['admin', mods.admin.useAdminStore()]);
  apis.push(['output', mods.output.useOutputStore()]);
  apis.push(['interaction', mods.interaction.useInteractionStore()]);
  apis.push(['homeroom', mods.homeroom.useHomeroomStore()]);
  apis.push(['mutual', mods.mutual.useMutualStore()]);
  apis.push(['tour', mods.tour.useTourStore()]);
  apis.push(['gas', mods.gas.useGasStore()]);
  for (const [name, store] of apis) {
    expect(store, name + ' 空 store').toBeTruthy();
  }
  // factory 接線證明：每座 getApi 跑一次（含 ensureUiAdminApi／getMutualPanelApi）
  const FACTORY_CALLS = {"session":["getProxyApi","getAuthApi"],"data":["getDataApi","getSyncApi"],"timetable":["getCalendarApi","getTimetableApi","getClassViewApi","getSchoolSwapApi","getScheduleApi"],"match":["getMatchApi"],"submit":["getSubmitApi"],"requests":["getApprovalApi"],"history":["getHistoryApi"],"backoffice":["getBackofficeApi"],"admin":["ensureUiAdminApi"],"output":["getExportApi","getReportApi","getPrintApi"],"interaction":["getInteractApi"],"homeroom":["getHomeroomApi"],"mutual":["getMutualPanelApi"],"tour":["getTourApi"]};
  for (const [name, store] of apis) {
    for (const fn of FACTORY_CALLS[name] || []) {
      expect(typeof store[fn], name + '.' + fn).toBe('function');
      const t0 = Date.now();
      await Promise.race([
        (async () => store[fn]())(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('HANG: ' + name + '.' + fn)), 8000))
      ]);
      console.log('factory ok', name + '.' + fn, Date.now() - t0 + 'ms');
    }
  }
}, 60000);
