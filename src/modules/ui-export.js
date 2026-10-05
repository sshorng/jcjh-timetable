/**
 * 自 v1 ui-export.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DomainBilling from '../domain/domain-billing.js';
import DomainClassAway from '../domain/domain-class-away.js';
import DomainSchedule from '../domain/domain-schedule.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
// R-v2接線：匯出模組改靜態 ESM（v1 走 window＋ensure* script 懶載；
// ExcelJS／JSZip 仍走 CDN 全域，見 v2/index.html）
import { ExportActivityCover } from './export-activity-cover.js';
import { ExportInvigilation } from './export-invigilation-recovered.js';
import ExportAccounting from './export-accounting.js';
import ExportPeriod8Accounting from './export-period8-accounting.js';

/**
 * ui-export.js — 匯出 orchestration（從 app.js 抽出，2A）
 *
 * Eager 載入（模板 @click 綁定，需先於 app.js）。create(deps) 注入 refs／回呼；
 * ExcelJS／範本走 window（ensure* 懶載）；showToast／showConfirm 走全域。
 */
import { showToast, showConfirm } from '../ui/toast.js';
const UiExport = (() => {
  'use strict';
  function create(deps) {
    deps = deps || {};
    var fetchMutualQuotaLedger = deps.fetchMutualQuotaLedger;
    async function ensureBillingReady() {
      if (typeof window.ensureDomainBilling === 'function') {
        await window.ensureDomainBilling();
      }
      if (!DomainBilling) throw new Error('大鐘點模組未載入');
    }
    async function fetchQuotaLedgerHistoryForExport() {
      if (typeof fetchMutualQuotaLedger !== 'function') {
        throw new Error('額度帳本歷程 API 未載入，請重新整理頁面');
      }
      const res = await fetchMutualQuotaLedger({ allTeachers: true, limit: 'all' });
      if (!res || res.success === false || !Array.isArray(res.ledger) || res.historyComplete !== true) {
        throw new Error('無法取得完整額度帳本歷程，為避免數字失真已停止匯出');
      }
      return res.ledger;
    }
    var isCombinedReturnRequest = deps.isCombinedReturnRequest
      || (typeof window !== 'undefined' && UiLineTemplate && UiLineTemplate.isCombinedReturnRequest)
      || function () { return false; };
    var isAdmin = deps.isAdmin;
    var ensureActivityCoverReady = deps.ensureActivityCoverReady;
    var classAwayEvents = deps.classAwayEvents;
    var semesterEndDate = deps.semesterEndDate;
    var classList = deps.classList;
    var requestsList = deps.requestsList;
    var ensureDAC = deps.ensureDAC;
    var mutualLeadEmails = deps.mutualLeadEmails;
    var teachersList = deps.teachersList;
    var allSchedules = deps.allSchedules;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var resolveExchangeTargetCell = deps.resolveExchangeTargetCell;
    var findBaseScheduleSlot = deps.findBaseScheduleSlot;
    var isCourseAdjustmentOnlyRequest = deps.isCourseAdjustmentOnlyRequest;
    var paperFlow = deps.paperFlow;
    var schoolExportStart = deps.schoolExportStart;
    var schoolExportEnd = deps.schoolExportEnd;
    var buildDefaultInvigilationTitle = deps.buildDefaultInvigilationTitle;
    var invigilationExportTitle = deps.invigilationExportTitle;
    var ensureInvigilationExportReady = deps.ensureInvigilationExportReady;
    var schoolExportSelectedEmails = deps.schoolExportSelectedEmails;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var getScheduleForDate = deps.getScheduleForDate;
    var getApprovedScheduleForDate = deps.getApprovedScheduleForDate;
    var accountingExportLoading = deps.accountingExportLoading;
    var reportStartDate = deps.reportStartDate;
    var reportEndDate = deps.reportEndDate;
    var reportWeeksCount = deps.reportWeeksCount;
    var reportMonth = deps.reportMonth;
    var calculateMonthlyReport = deps.calculateMonthlyReport;
    var schoolSwaps = deps.schoolSwaps;
    var substitutionRecords = deps.substitutionRecords;
    var homeroomRecords = deps.homeroomRecords;
    var monthlyReportData = deps.monthlyReportData;
    var isSingleWeek = deps.isSingleWeek;
    var period8ExportLoading = deps.period8ExportLoading;
    var ensurePeriod8Ready = deps.ensurePeriod8Ready;

    const exportActivityCoverWord = async (evArg) => {
      if (!isAdmin.value) {
        showToast('僅管理員可匯出輪值通知單', 'warning');
        return;
      }
      try {
        await ensureActivityCoverReady();
      } catch (e) {
        showToast((e && e.message) || '匯出模組載入失敗', 'error');
        return;
      }
      let ev = evArg && typeof evArg === 'object' && evArg.id != null ? evArg : null;
      if (!ev && evArg) {
        const id = String(evArg || '');
        ev = (classAwayEvents.value || []).find(e => e && String(e.id) === id) || null;
      }
      if (!ev) {
        showToast('請從空堂事件列點「匯出輪值單」', 'warning');
        return;
      }
      const startDate = String(ev.startDate || '').slice(0, 10);
      let endDate = String(ev.endDate || semesterEndDate.value || ev.startDate || '').slice(0, 10);
      if (!startDate) {
        showToast('此事件沒有起日，無法匯出', 'warning');
        return;
      }
      if (!endDate) endDate = startDate;
      const activityName = String(ev.name || '').trim() || '活動';
      const eventId = String(ev.id || '').trim();
      const eventPeriod = DomainClassAway && DomainClassAway.eventPeriod
        ? DomainClassAway.eventPeriod(ev)
        : 'all';
      const awayClasses = DomainClassAway && DomainClassAway.getAwayClassesInRange
        ? DomainClassAway.getAwayClassesInRange(
          startDate,
          endDate,
          [ev],
          semesterEndDate.value,
          { allClasses: classList.value, period: eventPeriod }
        )
        : (ev.classes || []).slice();
      const grade = ExportActivityCover.gradesFromClasses
        ? ExportActivityCover.gradesFromClasses(awayClasses)
        : '';
      // 僅活動互代經費（扣額度／活動公費／第8節代課）；排除一般公費／自費
      const isActFee = (fee, period) => {
        const f = String(fee || '').trim();
        const p = parseInt(period, 10) || 0;
        if (f === '扣額度' || f === '互代不結' || f === '活動公費' || f === '第8節代課') return true;
        if (p === 8 && (!f || f === '計畫經費' || f.indexOf('第8') >= 0)) return true;
        return false;
      };
      const allReqs = (requestsList.value || []).filter((r) => {
        if (!r || r.type === 'exchange') return false;
        const st = String(r.status || '').toLowerCase();
        if (st === 'cancelled' || st === 'rejected' || st === 'admin_rejected' || st === 'withdrawn') return false;
        const p = parseInt(r.requestPeriod != null ? r.requestPeriod : r.period, 10) || 0;
        return isActFee(r.subFee, p);
      });

       // OO＝事件第一天開始時的剩餘未執行堂數；XX＝1～7 扣額度已排（export 內算）。
       // 個人頁會以額度帳本補回事件第一天以前已扣用的數量。
      let demand = 0;
      let teacherDemandRows = [];
      const dac = await ensureDAC();
      if (dac && dac.buildQuotaRecalcRows) {
        try {
          const leaders = [];
          // 帶隊：期間內有活動互代申請的請假端（與面板帶隊近似；無面板時不排除）
          // 發放額度用面板 mutualLeadEmails；匯出從事件無帶隊名單 → 不排除，與「全校釋出」一致
          // 若畫面互代面板有勾帶隊，優先用該名單（與發放額度完全一致）
          try {
            if (mutualLeadEmails && mutualLeadEmails.value && mutualLeadEmails.value.length) {
              mutualLeadEmails.value.forEach((e) => {
                const em = String(e || '').toLowerCase();
                if (em) leaders.push(em);
              });
            }
          } catch (eL) { /* ignore */ }
           const rows = dac.buildQuotaRecalcRows({
            mode: 'add',
            teachers: teachersList.value || [],
             awayClasses,
             startDate,
             endDate,
             startPeriod: ev.startPeriod,
             endPeriod: ev.endPeriod,
             allSchedules: allSchedules.value || [],
             excludeEmails: leaders
           });
           teacherDemandRows = rows || [];
          // 輪值單 OO＝釋出堂數（節），不以額度單位計算
          demand = (rows || []).reduce((sum, r) => {
            if (!r || r.skipped) return sum;
            const slots = r.releasedSlots != null ? parseInt(r.releasedSlots, 10) : 0;
            if (slots > 0) return sum + slots;
            // 後備：若僅有額度 released（1／節）→ 還原堂數
            const earn = parseFloat(r.released) || 0;
            return sum + Math.round(earn);
          }, 0);
         } catch (eRel) { /* ignore */ }
      }

      let ledgerRows;
      try {
        ledgerRows = await fetchQuotaLedgerHistoryForExport();
      } catch (eLedger) {
        showToast(eLedger && eLedger.message ? eLedger.message : '無法取得額度帳本歷程', 'error');
        return;
      }

      // 事件名稱可能只存在額度帳本，申請單備註未必保留；用申請單 ID
      // 補回同一事件的所有代課，避免輪值單只剩一位教師。
      const activityRequestIds = [];
      (ledgerRows || []).forEach((row) => {
        if (!row) return;
        const rowEventId = String(row.eventId || row['事件ID'] || '').trim();
        const rowEventName = String(row.eventName || row['事件名稱'] || '').trim();
        const requestId = String(row.requestId || row['申請單ID'] || '').trim();
        if (!requestId) return;
        const isLegacyEventRow = !rowEventId || rowEventId === 'evt_sub' || rowEventId === 'evt_empty_slot';
        if ((eventId && rowEventId === eventId)
            || (isLegacyEventRow && activityName && rowEventName === activityName)) {
          activityRequestIds.push(requestId);
        }
      });

      const res = await ExportActivityCover.exportWord({
        startDate,
        endDate,
        startPeriod: ev.startPeriod,
        endPeriod: ev.endPeriod,
        activityName,
        grade,
        requests: allReqs,
        demand,
        teachers: teachersList.value || [],
        teacherDemands: teacherDemandRows,
        ledgerRows,
        eventId,
        activityRequestIds,
        activityClasses: awayClasses,
        showAllChanges: true,
        includeCoveredTeacherPages: true,
        getTeacherName: (em) => getTeacherNameByEmail(em),
        onlyActivityFee: true,
        requireActivityHint: true
      });
      if (!res || !res.ok) {
        showToast((res && res.error) || '匯出失敗', 'warning');
        return;
      }
      if (res.warning) showToast(res.warning, 'info');
      const p8 = res.period8Count ? `，第8節附註 ${res.period8Count} 筆` : '';
       const pageTip = res.pageCount != null
         ? `，輪值 ${res.dutyPageCount || 0} 頁、被代課 ${res.coveredPageCount || 0} 頁`
         : '';
       showToast(`已下載：${res.fileName}（釋出 ${res.demand}／扣額度安排 ${res.arranged}／尚有 ${res.remaining}${pageTip}${p8}）`, 'success');
    }

    const buildPaperRecordsForSubmittedRequests = (requests) => {
      const sourceRows = Array.isArray(requests) ? requests : (requests ? [requests] : []);
      const resolvePaperTeacher = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const key = raw.toLowerCase();
        const hit = (teachersList.value || []).find(t => [t.loginEmail, t.email, t.teacherName, t.name]
          .filter(Boolean)
          .some(v => String(v).trim().toLowerCase() === key));
        return hit ? (hit.loginEmail || hit.email || hit.teacherName || hit.name || raw) : raw;
      };
      const getValue = (source, names, fallback = '') => {
        for (const name of names) {
          if (source[name] !== undefined && source[name] !== null && String(source[name]).trim() !== '') {
            return source[name];
          }
        }
        return fallback;
      };
      const resolveSubmittedTargetCourse = (source, targetDate, targetPeriod) => {
        const targetEmail = getValue(source, ['受邀人Email', 'targetTeacherEmail', '受邀人姓名', 'targetTeacherName']);
        const targetDay = getValue(source, ['對調目標星期', 'targetDayOfWeek']);
        let cell = null;
        if (targetEmail && targetPeriod != null && targetPeriod !== '' && typeof resolveExchangeTargetCell === 'function') {
          try {
            cell = resolveExchangeTargetCell(targetEmail, targetDate, targetPeriod, targetDay);
          } catch (e) { /* 課表尚未就緒時改用基礎課表 */ }
        }
        if (cell && (cell.isPending || String(cell.className || '').trim() === '(pending)')) cell = null;
        if (!cell && targetEmail && targetPeriod != null && targetPeriod !== '' && typeof findBaseScheduleSlot === 'function') {
          try {
            let day = targetDay;
            if ((day == null || day === '') && targetDate) {
              const date = new Date(String(targetDate).replace(/-/g, '/'));
              if (!Number.isNaN(date.getTime())) day = date.getDay() === 0 ? 7 : date.getDay();
            }
            cell = findBaseScheduleSlot(targetEmail, day, targetPeriod, targetDate);
          } catch (e2) { /* 課表尚未就緒 */ }
        }
        return cell || {};
      };
      const records = [];
      sourceRows.forEach((source, index) => {
        const requestId = String(getValue(source, ['申請單ID', 'id'], 'paper-' + Date.now() + '-' + index));
        const serial = getValue(source, ['單號', 'serial'], requestId);
        const typeRaw = String(getValue(source, ['異動類型', 'type'], 'substitution')).toLowerCase();
        const isExchange = typeRaw === 'exchange' || typeRaw === '對調' || typeRaw === '調課';
        const original = resolvePaperTeacher(getValue(source, ['申請人Email', 'requesterEmail', '申請人姓名', 'requesterName']));
         const combinedReturn = isCombinedReturnRequest(source);
        const actual = resolvePaperTeacher(getValue(source, ['受邀人Email', 'targetTeacherEmail', '受邀人姓名', 'targetTeacherName']));
        const date = getValue(source, ['異動日期', 'requestDate', 'date']);
        const period = getValue(source, ['異動節次', 'requestPeriod', 'period']);
        const printedRaw = getValue(source, ['是否已印', 'printed']);
        const printed = printedRaw === true || String(printedRaw || '').trim().toLowerCase() === 'true' || String(printedRaw || '').trim() === '1' || String(printedRaw || '').trim() === '是';
        const isTriangle = typeRaw === 'triangle' || typeRaw === '三角調';
         const reasonValue = getValue(source, ['請假事由', 'reason'], '請假');
         const courseAdjustmentOnly = !combinedReturn && isCourseAdjustmentOnlyRequest(Object.assign({}, source, {
           reason: reasonValue,
           courseAdjustmentOnly: getValue(source, ['僅課務調整', 'courseAdjustmentOnly'])
         }));
         const base = {
           reason: reasonValue,
           courseAdjustmentOnly: courseAdjustmentOnly,
          subFee: getValue(source, ['經費來源', 'subFee'], '自費代課'),
          note: getValue(source, ['備註', 'note']),
          printed: printed,
          isPaperDraft: true,
          paperFlow: true,
          requestId: requestId,
          serial: serial,
          batchId: getValue(source, ['批次ID', 'batchId'])
        };
        if (combinedReturn) {
          const isPublicReason = /公假|公差|婚假|喪假|產前|分娩|身心調適/.test(String(reasonValue || '').trim());
          base.subFee = Number(period) === 8
            ? '第8節代課'
            : (isPublicReason ? '公費代課' : '自費代課');
        }
        if (isTriangle) {
           const targetDate = getValue(source, ['對調目標日期', 'targetDate']);
           const targetDay = getValue(source, ['對調目標星期', 'targetDayOfWeek']);
           const targetPeriod = getValue(source, ['對調目標節次', 'targetPeriod']);
           const initiatorName = getValue(source, ['申請人姓名', 'requesterName'], getTeacherNameByEmail(original));
           const sourceDay = getValue(source, ['異動星期', 'requestPeriodDay']);
           const sourceClass = getValue(source, ['班級', 'className']);
           const sourceSubject = getValue(source, ['科目', 'subject']);
           records.push(Object.assign({}, base, {
            id: requestId,
            type: 'triangle',
            triangleId: getValue(source, ['三角調ID', 'triangleId', '批次ID', 'batchId']),
            triangleLegIndex: getValue(source, ['三角腳次', 'triangleLegIndex']),
             originalTeacherEmail: actual,
             actualTeacherEmail: original,
             originalTeacherName: getTeacherNameByEmail(actual),
             actualTeacherName: getTeacherNameByEmail(original),
             triangleInitiatorEmail: original,
             triangleInitiatorName: initiatorName,
             triangleSourceDate: date,
             triangleSourceDayOfWeek: sourceDay,
             triangleSourcePeriod: period,
             triangleTargetDate: targetDate,
             triangleTargetDayOfWeek: targetDay,
             triangleTargetPeriod: targetPeriod,
             date,
             period,
             className: sourceClass,
             subject: sourceSubject,
            formClassName: sourceClass,
            formSubject: sourceSubject
          }));
        } else if (isExchange) {
          const targetDate = getValue(source, ['對調目標日期', 'targetDate']);
          const targetPeriod = getValue(source, ['對調目標節次', 'targetPeriod']);
          const targetCourse = resolveSubmittedTargetCourse(source, targetDate, targetPeriod);
          const targetClass = getValue(source, ['對調目標班級', 'targetClassName'], targetCourse.className || getValue(source, ['班級', 'className']));
          const targetSubject = getValue(source, ['對調目標科目', 'targetSubject'], targetCourse.subject || getValue(source, ['科目', 'subject']));
          records.push(Object.assign({}, base, {
            id: requestId + '_1',
            type: 'exchange',
             originalTeacherEmail: actual,
             actualTeacherEmail: original,
             originalTeacherName: getTeacherNameByEmail(actual),
             actualTeacherName: getTeacherNameByEmail(original),
             date: targetDate,
            period: targetPeriod,
             className: targetClass,
             subject: targetSubject
          }));
          records.push(Object.assign({}, base, {
            id: requestId + '_2',
            type: 'exchange',
             originalTeacherEmail: original,
             actualTeacherEmail: actual,
             originalTeacherName: getTeacherNameByEmail(original),
             actualTeacherName: getTeacherNameByEmail(actual),
             date: date,
            period: period,
             className: getValue(source, ['班級', 'className']),
             subject: getValue(source, ['科目', 'subject'])
          }));
        } else {
          records.push(Object.assign({}, base, {
            id: requestId,
            type: 'substitution',
            originalTeacherEmail: original,
            actualTeacherEmail: actual,
            date: date,
            period: period,
            className: getValue(source, ['班級', 'className']),
            subject: getValue(source, ['科目', 'subject']),
            specialFlow: combinedReturn ? 'combined_return' : '',
             leaveTimeType: courseAdjustmentOnly ? '' : getValue(source, ['請假時間類型', 'leaveTimeType']),
             leaveTime: courseAdjustmentOnly ? '' : getValue(source, ['請假時間', 'leaveTime', 'timeRange'])
          }));
        }
      });
      return records.filter(r => r.originalTeacherEmail && r.actualTeacherEmail && r.date && r.period != null);
    }

    const exportInvigilationWorkbook = async () => {
      if (!isAdmin.value) {
        showToast('僅管理員可匯出監考表', 'warning');
        return;
      }
      if (!schoolExportStart.value || !schoolExportEnd.value) {
        showToast('請先選擇起迄日期', 'warning');
        return;
      }
      const defaultTitle = buildDefaultInvigilationTitle();
      const titleResult = await showConfirm(
        '將匯出「全校監考表 × 每人一份」。\n請確認或修改標題後按確認匯出。',
        '匯出監考表',
        {
          withNote: true,
          noteLabel: '監考表標題',
          notePlaceholder: defaultTitle,
          noteDefault: defaultTitle
        }
      );
      if (!titleResult || !titleResult.ok) return;
      const title = (titleResult.note || '').trim() || defaultTitle;
      invigilationExportTitle.value = title;

      try {
        await ensureInvigilationExportReady();
      } catch (e) {
        showToast('匯出模組載入失敗：' + (e && e.message ? e.message : e), 'error');
        return;
      }
      // 主表＋分發皆以下方勾選為準；未勾選不列入主表；已勾選即使無課也保留空白列
      const selectedSet = {};
      (schoolExportSelectedEmails.value || []).forEach(e => {
        selectedSet[String(e || '').toLowerCase()] = 1;
      });
      const teachers = (teachersList.value || []).filter(t => t && t.email && selectedSet[String(t.email || '').toLowerCase()]);
      if (!teachers.length) {
        showToast('請在下方勾選要匯出的教師（至少一位）', 'warning');
        return;
      }
      let recipients = teachers.slice();
         loading.value = true;
         loadingMessage.value = '產生監考表中…';
         try {
           let ledgerRows;
           try {
             ledgerRows = await fetchQuotaLedgerHistoryForExport();
           } catch (eLedger) {
             showToast(eLedger && eLedger.message ? eLedger.message : '無法取得額度帳本歷程', 'error');
             return;
           }
           // dayOfWeek：系統課表為 1=一…7=日；同時備援 Date.getDay()(0=日)
        const getCellFn = (email, dateStr, period, dayOfWeek) => {
          let cell = null;
          if (typeof getScheduleForDate === 'function') {
            cell = getScheduleForDate(email, dateStr, period, dayOfWeek);
          } else if (typeof getApprovedScheduleForDate === 'function') {
            cell = getApprovedScheduleForDate(email, dateStr, period, dayOfWeek);
          }
          // 若空，改試 JS getDay（0=日）再查一次
          if (!cell && dateStr) {
            const d = new Date(String(dateStr).replace(/-/g, '/') + (String(dateStr).indexOf('T') >= 0 ? '' : ''));
            const gd = !Number.isNaN(d.getTime()) ? d.getDay() : null;
            if (gd != null && gd !== dayOfWeek) {
              if (typeof getScheduleForDate === 'function') {
                cell = getScheduleForDate(email, dateStr, period, gd);
              } else if (typeof getApprovedScheduleForDate === 'function') {
                cell = getApprovedScheduleForDate(email, dateStr, period, gd);
              }
            }
          }
          // 仍空：直接掃基礎課表補巡堂（attr／班／科＝巡堂）
          if (!cell && Array.isArray(allSchedules.value)) {
            const em = String(email || '').toLowerCase();
            const p = parseInt(period, 10);
            const dow = parseInt(dayOfWeek, 10);
            const hit = allSchedules.value.find((s) => {
              if (!s || String(s.teacherEmail || '').toLowerCase() !== em) return false;
               if (parseInt(s.period, 10) !== p) return false;
               if (parseInt(s.dayOfWeek, 10) !== dow) return false;
               if (DomainSchedule && DomainSchedule.isActiveOnDate
                   && !DomainSchedule.isActiveOnDate(s, dateStr)) return false;
               const a = String(s.attr || '').trim();
              const cn = String(s.className || '').trim();
              const sub = String(s.subject || '').trim();
              return a === '巡堂' || a.indexOf('巡堂') >= 0 || cn === '巡堂' || sub === '巡堂';
            });
            if (hit) {
              cell = {
                className: '巡堂',
                subject: '巡堂',
                attr: '巡堂',
                isPatrol: true,
                teacherEmail: email,
                dayOfWeek: dayOfWeek,
                period: period
              };
            }
          }
          return cell;
        };
        const res = await ExportInvigilation.exportWorkbook({
          title: title,
          startDate: schoolExportStart.value,
          endDate: schoolExportEnd.value,
          teachers: teachers,
          recipients: recipients,
          getCell: getCellFn,
           requests: requestsList.value || [],
           ledgerRows: ledgerRows,
           ledgerHistoryComplete: true,
           allSchedules: allSchedules.value || [],
           classNames: classList.value || [],
           onProgress: (p) => {
            if (p && p.message) loadingMessage.value = p.message;
          }
        });
        if (!res || !res.ok) {
          showToast((res && res.error) || '匯出失敗', 'warning');
          return;
        }
        if (res.warning) showToast(res.warning, 'info');
        showToast(
          '已下載：' + res.fileName
          + '（表內 ' + res.teacherCount + ' 人 × 分發 ' + res.copyCount + ' 份 × '
          + res.dayCount + ' 日；異動 '
          + (res.changedMarked != null ? res.changedMarked : '?')
          + ' 格、基礎巡堂 '
          + (res.patrolCount != null ? res.patrolCount : '?') + ' 格）',
          'success'
        );
      } catch (err) {
        console.error(err);
        showToast('監考表匯出失敗：' + (err && err.message ? err.message : err), 'error');
      } finally {
        loading.value = false;
      }
    }

    const exportSubFeeToExcel = async () => {
      if (accountingExportLoading.value) return;
      accountingExportLoading.value = true;
      try {
        const readyTasks = [ensureBillingReady()];
        // R-v2接線：ExportAccounting 靜態 import 常駐；ExcelJS 走 CDN 全域
        if (typeof window.ensureExcelJS === 'function') readyTasks.push(window.ensureExcelJS());
        await Promise.all(readyTasks);
        if (!ExportAccounting || !ExportAccounting.buildExportData || !ExportAccounting.exportWorkbook) {
          throw new Error('會計匯出模組未載入');
        }
        const start = String(reportStartDate.value || '').trim();
        const end = String(reportEndDate.value || '').trim();
        const weeks = reportWeeksCount.value;
        if (!weeks || start > end) {
          showToast('請先設定有效的結算起日與迄日。', 'warning');
          return;
        }
        const period = { start, end };
        const exportMonth = ExportAccounting.reportMonthForPeriod
          ? ExportAccounting.reportMonthForPeriod(reportMonth.value, period)
          : reportMonth.value || start.slice(0, 7);
        reportMonth.value = exportMonth;
        await calculateMonthlyReport();
        const exportOpts = {
          reportMonth: exportMonth,
          reportStartDate: start,
          reportEndDate: end,
          reportWeeksCount: weeks,
          periods: period,
          teachers: teachersList.value,
          allSchedules: allSchedules.value,
          schoolSwaps: schoolSwaps.value,
          substitutionRecords: substitutionRecords.value,
          homeroomRecords: homeroomRecords.value,
          monthlyReportRows: monthlyReportData.value,
          getTeacherNameByEmail,
          classAwayEvents: classAwayEvents.value,
          semesterEndDate: semesterEndDate.value,
          isSingleWeek
        };
        const preview = ExportAccounting.buildExportData(exportOpts);
        const summaryLines = preview.summary.map((item) => item.label + '：' + item.count + ' 筆／'
          + Number(item.hours || 0).toLocaleString() + ' 節／NT$ ' + Number(item.amount || 0).toLocaleString());
        const blockingLines = (preview.blocking || []).length
          ? '\n\n無法匯出：\n' + preview.blocking.map((w) => '⛔ ' + w).join('\n')
          : '';
        const warningLines = (preview.warnings || []).length
          ? '\n\n匯出前提示：\n' + preview.warnings.map((w) => '⚠️ ' + w).join('\n')
          : '';
        const message = '將套用上方結算日期區間下載單一 Excel：\n\n結算區間：' + start + '～' + end
          + '\n自動計算：' + weeks + ' 週\n\n' + summaryLines.join('\n')
          + blockingLines + warningLines + '\n\n扣勞健保與實際金額欄位會留白。';
        const confirmed = await showConfirm(message, '匯出會計版六類 Excel');
        if (!confirmed) return;
        if (preview.blocking && preview.blocking.length) {
          showToast('請先補齊超鐘點經費來源，才能匯出會計 Excel。', 'warning');
          return;
        }
        if (ExportAccounting.savePeriodSettings) {
          ExportAccounting.savePeriodSettings(exportMonth, period);
        }
        const result = await ExportAccounting.exportWorkbook(Object.assign({}, exportOpts, {
          preparedData: preview
        }));
        const blob = new Blob([result.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { document.body.removeChild(link); } catch (e) { /* ignore */ }
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }, 1200);
        showToast('已下載：' + result.fileName, 'success');
      } catch (e) {
        console.error(e);
        showToast('會計版 Excel 匯出失敗：' + (e.message || e), 'error');
      } finally {
        accountingExportLoading.value = false;
      }
    }

    const exportPeriod8Accounting = async () => {
      if (period8ExportLoading.value) return;
      period8ExportLoading.value = true;
      try {
        const readyTasks = [ensurePeriod8Ready()];
        // R-v2接線：ExportPeriod8Accounting 靜態 import 常駐；ExcelJS 走 CDN 全域
        if (typeof window.ensureExcelJS === 'function') readyTasks.push(window.ensureExcelJS());
        await Promise.all(readyTasks);
        if (!ExportPeriod8Accounting || !ExportPeriod8Accounting.buildExportData
            || !ExportPeriod8Accounting.exportWorkbook) {
          throw new Error('第八節核銷匯出模組未載入');
        }
        const start = String(reportStartDate.value || '').trim();
        const end = String(reportEndDate.value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
          showToast('請先設定有效的第八節核銷起日與迄日。', 'warning');
          return;
        }
        const exportOpts = {
          reportMonth: String(reportMonth.value || start.slice(0, 7)),
          reportStartDate: start,
          reportEndDate: end,
          teachers: teachersList.value,
          allSchedules: allSchedules.value,
          substitutionRecords: substitutionRecords.value,
          classAwayEvents: classAwayEvents.value,
          semesterEndDate: semesterEndDate.value,
          getTeacherNameByEmail,
          isSingleWeek
        };
        const preview = ExportPeriod8Accounting.buildExportData(exportOpts);
        const warningLines = (preview.warnings || []).length
          ? '\n\n匯出前提示：\n' + preview.warnings.map((warning) => '⚠️ ' + warning).join('\n')
          : '';
        const message = '將下載第八節鐘點費核銷清冊：\n\n結算區間：' + start + '～' + end
          + '\n教師列數：' + preview.summary.count + ' 列（僅列實際支用教師）'
          + '\n應發節數：' + preview.summary.hours + ' 節'
          + '\n應發金額：NT$ ' + Number(preview.summary.amount || 0).toLocaleString()
          + '\n單價：NT$ 600／節' + warningLines;
        if (!await showConfirm(message, '匯出第八節核銷清冊')) return;
        const result = await ExportPeriod8Accounting.exportWorkbook(Object.assign({}, exportOpts, {
          preparedData: preview
        }));
        const blob = new Blob([result.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { document.body.removeChild(link); } catch (e) { /* ignore */ }
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        }, 1200);
        showToast('已下載：' + result.fileName, 'success');
      } catch (e) {
        console.error(e);
        showToast('第八節核銷清冊匯出失敗：' + (e.message || e), 'error');
      } finally {
        period8ExportLoading.value = false;
      }
    }

    return {
      ensureBillingReady: ensureBillingReady,
      fetchQuotaLedgerHistoryForExport: fetchQuotaLedgerHistoryForExport,
      exportActivityCoverWord: exportActivityCoverWord,
      buildPaperRecordsForSubmittedRequests: buildPaperRecordsForSubmittedRequests,
      exportInvigilationWorkbook: exportInvigilationWorkbook,
      exportSubFeeToExcel: exportSubFeeToExcel,
      exportPeriod8Accounting: exportPeriod8Accounting
    };
  }
  return { create: create };
})();

export { UiExport };
