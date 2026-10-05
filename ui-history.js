/**
 * ui-history.js — 歷史紀錄篩選／分組／分頁（從 app.js 抽出，2A）
 *
 * Eager 載入（模板綁定，需先於 app.js）。create(deps) 注入 refs／回呼；
 * 顯示文字走 window.UiListHelpers（eager 常駐）。
 */
window.UiHistory = (function () {
  'use strict';
  function create(deps) {
    deps = deps || {};
    var ensureHistoryMonthLoaded = deps.ensureHistoryMonthLoaded;
    var historyLoadingFull = deps.historyLoadingFull;
    var fetchInitialData = deps.fetchInitialData;
    var applyInitialPayload = deps.applyInitialPayload;
    var loadWeeklyData = deps.loadWeeklyData;
    var toLocalDateStr = deps.toLocalDateStr;
    var historyLoadedMonths = deps.historyLoadedMonths;
    var historyFullLoaded = deps.historyFullLoaded;
    var historyMonthLoading = deps.historyMonthLoading;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var fetchHistoryMonth = deps.fetchHistoryMonth;
    var currentSemester = deps.currentSemester;
    var mergeRequestsFromServer = deps.mergeRequestsFromServer;
    var computed = deps.computed;
    var user = deps.user;
    var allSchedules = deps.allSchedules;
    var schoolSwaps = deps.schoolSwaps;
    var isSingleWeek = deps.isSingleWeek;
    var substitutionRecords = deps.substitutionRecords;
    var isAdmin = deps.isAdmin;
    var isStaff = deps.isStaff;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var requestsList = deps.requestsList;
    var isProxySubmitRequest = deps.isProxySubmitRequest || function () { return false; };
    var historyTypeFilter = deps.historyTypeFilter;
    var historySearchQuery = deps.historySearchQuery;
    var historyFilterMode = deps.historyFilterMode;
    var historyFilterDate = deps.historyFilterDate;
    var isHistoryExchangeType = deps.isHistoryExchangeType || function () { return false; };
    var historyPageSize = deps.historyPageSize;
    var historyPage = deps.historyPage;
    var flattenBatchDisplayGroups = deps.flattenBatchDisplayGroups;
    var dashboardScope = deps.dashboardScope || { value: 'today' };
    var myPendingRequests = deps.myPendingRequests || { value: [] };
    var adminPendingRequests = deps.adminPendingRequests || { value: [] };
    var mySentRequests = deps.mySentRequests || { value: [] };
    var currentWeekDates = deps.currentWeekDates || { value: [] };
    var pendingSearchQuery = deps.pendingSearchQuery;
    var myPendingRequests = deps.myPendingRequests;
    var mySentRequests = deps.mySentRequests;
    var adminPendingRequests = deps.adminPendingRequests;
    var pendingMyPendingPage = deps.pendingMyPendingPage;
    var pendingMySentPage = deps.pendingMySentPage;
    var pendingAdminPage = deps.pendingAdminPage;
    var pendingPageSize = deps.pendingPageSize != null ? deps.pendingPageSize : 10;
    var watchFn = deps.watch || function () {};
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var isQuotaDeductFee = deps.isQuotaDeductFee
      || (typeof window !== 'undefined' && window.FeeUtils && window.FeeUtils.isQuotaDeductFee)
      || function () { return false; };

    const filteredHistoryRecords = computed(() => {
      const teacherName = user.value ? String(getTeacherNameByEmail(user.value.email) || '').toLowerCase() : '';
      let filteredRecords = substitutionRecords.value;
      
      // 一般教師只看自己相關；行政可看全校，另保留「我代送」的單
      if (!isAdmin.value && !isStaff.value && teacherName) {
        filteredRecords = substitutionRecords.value.filter(r => {
          const related =
            (r.originalTeacherName && r.originalTeacherName.toLowerCase() === teacherName) ||
            (r.actualTeacherName && r.actualTeacherName.toLowerCase() === teacherName);
          if (related) return true;
          if (isStaff.value && r.requestId) {
            const req = (requestsList.value || []).find(x => x && x.id === r.requestId);
            if (req && isProxySubmitRequest(req)) {
              const proxyName = String(req.proxyByName || '').toLowerCase();
              if (proxyName && proxyName === teacherName) return true;
            }
          }
          return false;
        });
      }

      // 調課 (exchange) 去重：同一 requestId 只留一列
      // 優先保留「請假日」邊（id 以 _2 結尾，或 original＝申請人），避免 _1 目標日當主列造成班科顛倒
      const exchangeBest = {};
      const triangleBest = {};
      const nonExchange = [];
      filteredRecords.forEach(rec => {
        if (!rec) return;
        if (window.UiListHelpers.isTriangleRequest(rec)) {
          const triangleId = String(rec.triangleId || rec.requestId || rec.id || '');
          if (!triangleId || !triangleBest[triangleId]
              || (parseInt(rec.triangleLegIndex, 10) || 0) < (parseInt(triangleBest[triangleId].triangleLegIndex, 10) || 0)) {
            triangleBest[triangleId] = rec;
          }
          return;
        }
        if (rec.type !== 'exchange' && rec.type !== '對調') {
          nonExchange.push(rec);
          return;
        }
        const rid = rec.requestId || rec.id;
        if (!rid) return;
        const prev = exchangeBest[rid];
        if (!prev) {
          exchangeBest[rid] = rec;
          return;
        }
        // 偏好 _2（請假日邊）；否則保留已有
        if (String(rec.id || '').endsWith('_2')) exchangeBest[rid] = rec;
      });
      const dedupedRecords = nonExchange
        .concat(Object.keys(exchangeBest).map(k => exchangeBest[k]))
        .concat(Object.keys(triangleBest).map(k => triangleBest[k]));

      const reqById = {};
      (requestsList.value || []).forEach(x => {
        if (x && x.id) reqById[x.id] = x;
      });
      const peerByRequestId = {};
      (substitutionRecords.value || []).forEach(x => {
        if (!x || !x.requestId || (x.type !== 'exchange' && x.type !== '對調')) return;
        if (!peerByRequestId[x.requestId]) peerByRequestId[x.requestId] = [];
        peerByRequestId[x.requestId].push(x);
      });

      const mapped = dedupedRecords.map(rec => {
        const matchedReq = reqById[rec.requestId];
        const createdAtFull = window.UiListHelpers.getRequestApplicationStamp(matchedReq || rec);
        const createdDate = window.UiListHelpers.formatRequestApplicationDate(matchedReq || rec);

        let leaveDate = rec.date;
        let leavePeriod = rec.period;
        let leaveTeacher = rec.originalTeacherName;
        let subTeacher = rec.actualTeacherName;
        let leaveClassName = rec.className || '';
        let leaveSubject = rec.subject || '';
        let targetDate = '---';
        let targetPeriod = '';
        let targetClassName = '';
        let targetSubject = '';

         if (window.UiListHelpers.isTriangleRequest(rec)) {
           // 三角調歷史列以一條來源→目標關係代表整組，班科永遠取來源教師的原課。
           if (matchedReq) {
             leaveDate = matchedReq.requestDate || leaveDate;
             leavePeriod = matchedReq.requestPeriod != null ? matchedReq.requestPeriod : leavePeriod;
             leaveTeacher = matchedReq.requesterName || leaveTeacher;
             subTeacher = matchedReq.targetTeacherName || subTeacher;
             targetDate = matchedReq.targetDate || rec.date || targetDate;
             targetPeriod = matchedReq.targetPeriod != null ? matchedReq.targetPeriod : (rec.period || targetPeriod);
             leaveClassName = matchedReq.className || rec.className || '';
             leaveSubject = matchedReq.subject || rec.subject || '';
             targetClassName = leaveClassName;
             targetSubject = leaveSubject;
           } else {
             leaveDate = rec.triangleSourceDate || rec.date || leaveDate;
             leavePeriod = rec.triangleSourcePeriod != null ? rec.triangleSourcePeriod : leavePeriod;
             leaveTeacher = rec.actualTeacherName || leaveTeacher;
             subTeacher = rec.originalTeacherName || subTeacher;
             targetDate = rec.date || targetDate;
             targetPeriod = rec.period != null ? rec.period : targetPeriod;
             leaveClassName = rec.className || '';
             leaveSubject = rec.subject || '';
             targetClassName = leaveClassName;
             targetSubject = leaveSubject;
           }
         } else if (rec.type === 'exchange' || rec.type === '對調') {
          const peers = peerByRequestId[rec.requestId] || [];
          // leaveEdge：原異動日（申請人原位置的課）；targetEdge：目標日（受邀人原位置的課）
          let leaveEdge = peers.find(x => String(x.id || '').endsWith('_2')) || null;
          let targetEdge = peers.find(x => String(x.id || '').endsWith('_1')) || null;
          if (!leaveEdge || !targetEdge) {
            peers.forEach(x => {
              if (!x || x.id === (leaveEdge && leaveEdge.id) || x.id === (targetEdge && targetEdge.id)) return;
              if (!leaveEdge) leaveEdge = x;
              else if (!targetEdge) targetEdge = x;
            });
          }
          // 申請單為準（請假／對調人、日期節次）
          if (matchedReq) {
            leaveDate = matchedReq.requestDate || leaveDate;
            leavePeriod = matchedReq.requestPeriod != null ? matchedReq.requestPeriod : leavePeriod;
            leaveTeacher = matchedReq.requesterEmail || leaveTeacher;
            subTeacher = matchedReq.targetTeacherEmail || subTeacher;
            targetDate = matchedReq.targetDate || targetDate;
            targetPeriod = matchedReq.targetPeriod != null ? matchedReq.targetPeriod : targetPeriod;
            // 歷史／申請單欄位維持原始位置，不跟著網頁課表的交換後班科走。
            leaveClassName = matchedReq.className
              || (leaveEdge && (leaveEdge.formClassName || leaveEdge.className))
              || leaveClassName;
            leaveSubject = matchedReq.subject
              || (leaveEdge && (leaveEdge.formSubject || leaveEdge.subject))
              || leaveSubject;
            // 對調班科：受邀人原位置的課＝目標日 edge _1 的表單欄位。
            targetClassName = matchedReq.targetClassName
              || (targetEdge && (targetEdge.formClassName || targetEdge.className))
              || '';
            targetSubject = matchedReq.targetSubject
              || (targetEdge && (targetEdge.formSubject || targetEdge.subject))
              || '';
          } else {
            // 無申請單：用兩邊 edge
            if (leaveEdge) {
              leaveDate = leaveEdge.date;
              leavePeriod = leaveEdge.period;
              leaveTeacher = leaveEdge.originalTeacherName;
              subTeacher = leaveEdge.actualTeacherName;
            }
            if (targetEdge) {
              targetDate = targetEdge.date;
              targetPeriod = targetEdge.period;
              leaveClassName = (leaveEdge && (leaveEdge.formClassName || leaveEdge.className)) || leaveClassName;
              leaveSubject = (leaveEdge && (leaveEdge.formSubject || leaveEdge.subject)) || leaveSubject;
            }
            if (targetEdge) {
              targetClassName = targetEdge.formClassName || targetEdge.className || '';
              targetSubject = targetEdge.formSubject || targetEdge.subject || '';
            }
          }
        }

        return {
          ...rec,
          // 歷史列統一：original＝請假師、actual＝代課／對調師
          originalTeacherName: leaveTeacher || rec.originalTeacherName,
          actualTeacherName: subTeacher || rec.actualTeacherName,
          className: leaveClassName || rec.className,
          subject: leaveSubject || rec.subject,
          serial: matchedReq ? (matchedReq.serial || '---') : '---',
          batchId: (matchedReq && matchedReq.batchId) || rec.batchId || '',
          note: (matchedReq && matchedReq.note) || rec.note || '',
          directApprove: !!(matchedReq && matchedReq.directApprove),
          requesterName: leaveTeacher || rec.originalTeacherName || '',
          targetTeacherName: subTeacher || rec.actualTeacherName || '',
          requestDate: leaveDate,
          requestPeriod: leavePeriod,
          createdAt: createdAtFull,
          createdDate,
          targetDate,
          targetPeriod,
          targetClassName,
          targetSubject
        };
      });
      return window.UiListHelpers.sortRequestListDesc(mapped);
    });
    // 歷史紀錄按週/月篩選
    const getWeekStart = (dateStr) => {
      const d = new Date(dateStr.replace(/-/g, '/'));
      const dow = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return monday.toISOString().slice(0, 10);
    };
    const getMonthStart = (dateStr) => dateStr.slice(0, 7);

    const dateFilteredHistoryRecords = computed(() => {
      let records = filteredHistoryRecords.value;

      if (historyTypeFilter.value !== 'all') {
        records = records.filter(r => {
          const isExchange = isHistoryExchangeType(r);
          return historyTypeFilter.value === 'exchange' ? isExchange : !isExchange;
        });
      }

      // 搜尋：單號／教師／班級／科目／日期／假別
      const q = (historySearchQuery.value || '').trim().toLowerCase();
      if (q) {
        records = records.filter(r => {
          const blob = [
            r.serial, r.requesterName, r.targetTeacherName,
            r.className, r.subject, r.targetClassName, r.targetSubject,
            r.requestDate, r.date, r.targetDate, r.reason, r.note, r.status
          ].map(x => String(x || '').toLowerCase()).join(' ');
          return blob.indexOf(q) >= 0;
        });
      }

      if (historyFilterMode.value === 'all' || !historyFilterDate.value) return records;

      return records.filter(r => {
        // 請假日或對調目標日落在篩選範圍皆算
        const dates = [r.date, r.requestDate, r.targetDate].filter(Boolean).map(String);
        if (historyFilterMode.value === 'day') {
          const d = String(historyFilterDate.value);
          return dates.some(x => x.slice(0, 10) === d.slice(0, 10));
        }
        if (historyFilterMode.value === 'week') {
          const wk = getWeekStart(historyFilterDate.value);
          return dates.some(x => getWeekStart(x) === wk);
        }
        if (historyFilterMode.value === 'month') {
          const mo = getMonthStart(historyFilterDate.value);
          return dates.some(x => getMonthStart(x) === mo);
        }
        return true;
      });
    });
    const historyBatchGroups = computed(() =>
      window.UiListHelpers.buildBatchDisplayGroups(dateFilteredHistoryRecords.value, 'history')
    );
    const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyBatchGroups.value.length / historyPageSize.value)));
    const paginatedHistoryRecords = computed(() => {
      const start = (historyPage.value - 1) * historyPageSize.value;
      return flattenBatchDisplayGroups(
        historyBatchGroups.value.slice(start, start + historyPageSize.value),
        'history'
      );
    });

    const isMutualRec = (r) => {
      if (!r) return false;
      if (isQuotaDeductFee(r.subFee)) return true;
      const f = String(r.subFee || '');
      // 「第8節代課」是第八節的一般代課經費代碼，不代表活動互代。
      return f === '活動公費';
    }
    const personalChanges = computed(() => {
      if (!user.value) return [];
       const email = String(getTeacherNameByEmail(user.value.email) || '').toLowerCase();
      const todayStr = window.DateUtils.getTodayString();
       const relatedRecords = substitutionRecords.value.filter(r =>
         (r.originalTeacherName && r.originalTeacherName.toLowerCase() === email) ||
         (r.actualTeacherName && r.actualTeacherName.toLowerCase() === email)
       );
       const triangleGroups = Object.create(null);
       relatedRecords.forEach(r => {
         if (!window.UiListHelpers.isTriangleRequest(r)) return;
         const key = String(r.triangleId || r.requestId || r.id || '');
         if (!key) return;
         if (!triangleGroups[key]) triangleGroups[key] = [];
         triangleGroups[key].push(r);
       });
       const triangleSummaries = Object.keys(triangleGroups).map(key => {
         const group = triangleGroups[key];
         const outgoing = group.find(r => String(r.actualTeacherName || '').toLowerCase() === email);
         const incoming = group.find(r => String(r.originalTeacherName || '').toLowerCase() === email);
         const base = outgoing || incoming || group[0];
         return base ? Object.assign({}, base, {
           _triangleOutgoing: outgoing || null,
           _triangleIncoming: incoming || null,
           triangleId: key,
           date: (outgoing && outgoing.date) || (incoming && incoming.date) || base.date
         }) : null;
       }).filter(Boolean);
       const records = relatedRecords.filter(r => !window.UiListHelpers.isTriangleRequest(r));
      const exchangePeersByRequestId = Object.create(null);
       substitutionRecords.value.forEach(r => {
        if (!r || r.type !== 'exchange' || !r.requestId) return;
        const key = String(r.requestId);
        if (!exchangePeersByRequestId[key]) exchangePeersByRequestId[key] = [];
        exchangePeersByRequestId[key].push(r);
      });

      // 調課去重：優先保留自己去上課（actualTeacherEmail 是自己）的那一筆
      const deduped = [];
      const seenExchange = new Set();
      
      records.forEach(r => {
        if (r.type === 'exchange') {
           if (r.actualTeacherName && r.actualTeacherName.toLowerCase() === email) {
            deduped.push(r);
            seenExchange.add(r.requestId);
          }
        } else {
          deduped.push(r);
        }
      });
      
       records.forEach(r => {
         if (r.type === 'exchange' && !seenExchange.has(r.requestId)) {
          deduped.push(r);
          seenExchange.add(r.requestId);
         }
       });
       triangleSummaries.forEach(r => deduped.push(r));

      const fmtClassLine = (dateStr, period, className, subject, verb) => {
        const mmdd = window.DateUtils.formatDateMMDD(dateStr);
        const dow = new Date(dateStr.replace(/-/g, '/')).getDay();
        const day = window.DateUtils.getWeekDayText(dow);
        const v = verb != null ? verb : '上';
        return v ? `${mmdd}(${day}) 第${period}節 ${v} ${className}${subject}` : `${mmdd}(${day}) 第${period}節 ${className}${subject}`;
      };

      const fmtPeerSlot = (dateStr, period) => {
        const mmdd = window.DateUtils.formatDateMMDD(dateStr);
        const dow = new Date(dateStr.replace(/-/g, '/')).getDay();
        const day = window.DateUtils.getWeekDayText(dow);
        return `${mmdd}(${day})`;
      };

      /** 是否空堂排班／空堂任務（原＝實＝本人） */
      const isEmptySlotRec = (r) => {
        if (!r) return false;
        if (r.isEmptySlotAssign === true) return true;
        const reason = String(r.reason || '').trim();
        const note = String(r.note || '');
        if (reason === '空堂排班' || note.indexOf('[空堂排班]') >= 0) return true;
         const o = String(r.originalTeacherName || '').toLowerCase();
         const a = String(r.actualTeacherName || '').toLowerCase();
        return !!(o && a && o === a && (reason === '空堂排班' || note.indexOf('空堂') >= 0));
      };
;
      /** 事由是否屬「請假」類（否則用「課務異動／代課」） */
      const isLeaveLikeReason = (reason) => {
        const s = String(reason || '').trim();
        if (!s) return true; // 舊資料缺事由，保守當請假
        if (s === '空堂排班') return false;
        if (s === '合班回原班' || s === '併班上課') return true;
        if (/公假|事假|病假|婚假|喪假|產假|娩假|生理假|家庭照顧|防疫|特休|休假|公差|公出|外出|研習|進修/.test(s)) return true;
        if (/請假/.test(s)) return true;
        return false;
      };

      const list = deduped.map(r => {
        const isPast = r.date < todayStr;
         const isRequester = r.originalTeacherName && r.originalTeacherName.toLowerCase() === email;
         const isTriangle = window.UiListHelpers.isTriangleRequest(r);
         const isSwap = r.type === 'exchange';

        let classLine = '';
        let desc = '';

         if (isTriangle) {
           const outgoing = r._triangleOutgoing || {};
           const incoming = r._triangleIncoming || {};
           const sourceDate = outgoing.triangleSourceDate || outgoing.date || r.triangleSourceDate || r.date;
           const sourcePeriod = outgoing.triangleSourcePeriod != null ? outgoing.triangleSourcePeriod : (outgoing.period != null ? outgoing.period : r.period);
           const targetDate = outgoing.date || r.date;
           const targetPeriod = outgoing.period != null ? outgoing.period : r.period;
           classLine = fmtClassLine(sourceDate, sourcePeriod, outgoing.className || r.className || '', outgoing.subject || r.subject || '', '');
           const targetText = `${fmtPeerSlot(targetDate, targetPeriod)}第${targetPeriod}節`;
           const incomingText = incoming
             ? `原課時段由 ${incoming.actualTeacherName || '其他教師'} 接手 ${incoming.className || ''}${incoming.subject || ''}`
             : '等待其他教師完成閉環';
           desc = `△ 三角調：您的原課移至 ${targetText}；${incomingText}`;
         } else if (isSwap) {
          const peer = (exchangePeersByRequestId[String(r.requestId)] || []).find(x => x.id !== r.id);
          classLine = fmtClassLine(r.date, r.period, r.className, r.subject);
          if (peer) {
            const peerTeacherName = getTeacherNameByEmail(peer.actualTeacherEmail);
            const peerSlot = fmtPeerSlot(peer.date, peer.period);
            desc = `🔄 原${peerSlot}第${peer.period}節 由 ${peerTeacherName}老師上課（${peer.subject}）`;
          } else {
             const otherName = r.actualTeacherName && r.actualTeacherName.toLowerCase() === email
               ? r.originalTeacherName : r.actualTeacherName;
            desc = `🔄 與 ${otherName} 老師調課`;
          }
        } else if (isEmptySlotRec(r)) {
          // 空堂任務：自己排任務進空堂，不是請假代課
          const task = String(r.subject || '').trim() || '空堂任務';
          classLine = fmtClassLine(r.date, r.period, r.className || '', task, '');
          desc = `📌 空堂任務：${task}`;
        } else {
          classLine = fmtClassLine(r.date, r.period, r.className, r.subject, isRequester ? '' : '上');
           const otherSub = r.actualTeacherName || '';
           const otherLeave = r.originalTeacherName || '';
          const reason = String(r.reason || '').trim();
          if (isRequester) {
            if (isMutualRec(r)) {
              desc = `🔁 活動互代／外出，由 ${otherSub} 老師代課`;
            } else if (isLeaveLikeReason(reason)) {
              desc = `🏖️ 請假，由 ${otherSub} 老師代課`;
            } else {
              desc = `📋 課務由 ${otherSub} 老師代課` + (reason ? `（${reason}）` : '');
            }
          } else if (isMutualRec(r)) {
            desc = `🔁 互代：代 ${otherLeave} 老師`;
          } else if (isLeaveLikeReason(reason)) {
            desc = `📝 代課：協助 ${otherLeave} 老師`;
          } else {
            desc = `📝 代課：${otherLeave} 老師` + (reason ? `（${reason}）` : '');
          }
        }

        let statusClass = 'tag-gray';
        let statusText = '已出單';
        if (r.status === 'pending_teacher') { statusClass = 'tag-red'; statusText = '確認中'; }

        return {
          id: r.id,
          requestId: r.requestId,
          date: r.date,
          dayOfWeek: new Date(r.date.replace(/-/g, '/')).getDay(),
          period: r.period,
          classLine,
          desc,
          serial: r.serial || 'SUB',
          isPast,
          statusClass,
          statusText
        };
      });

      // 全校對調不是申請單，依教師在對調來源節次的固定課表補進個人摘要。
      const schoolSwapChanges = [];
      const ownSchedules = (allSchedules.value || []).filter(s =>
        String(s && s.teacherName || '').trim().toLowerCase() === email
      );
      const isPatrolSchedule = (schedule) => {
        if (!schedule) return false;
        if (schedule.isPatrol === true) return true;
        const attr = String(schedule.attr || '').trim();
        const className = String(schedule.className || '').trim();
        const subject = String(schedule.subject || '').trim();
        return attr === '巡堂' || attr.includes('巡堂') || className === '巡堂' || subject === '巡堂';
      };
      if (window.DomainSchoolSwap && ownSchedules.length) {
        const activeSwaps = window.DomainSchoolSwap.normalizeRows(schoolSwaps.value || [])
          .filter(row => row.enabled);
        activeSwaps.forEach(row => {
          const endpoints = [
            { endpoint: 'A', date: row.dateA, period: row.periodA, sourceDate: row.dateB, sourceDay: row.dayB, sourcePeriod: row.periodB },
            { endpoint: 'B', date: row.dateB, period: row.periodB, sourceDate: row.dateA, sourceDay: row.dayA, sourcePeriod: row.periodA }
          ];
          // 只要任一端是巡堂，這位教師整筆對調不套用。
          if (endpoints.some(endpoint => ownSchedules.some(s =>
             parseInt(s.dayOfWeek, 10) === parseInt(endpoint.sourceDay, 10)
               && parseInt(s.period, 10) === parseInt(endpoint.sourcePeriod, 10)
               && (!window.DomainSchedule || !window.DomainSchedule.isActiveOnDate
                 || window.DomainSchedule.isActiveOnDate(s, endpoint.date))
               && isPatrolSchedule(s)
          ))) return;
          endpoints.forEach(endpoint => {
            ownSchedules
              .filter(s => {
                 if (parseInt(s.dayOfWeek, 10) !== parseInt(endpoint.sourceDay, 10)
                     || parseInt(s.period, 10) !== parseInt(endpoint.sourcePeriod, 10)) return false;
                 if (window.DomainSchedule && window.DomainSchedule.isActiveOnDate
                     && !window.DomainSchedule.isActiveOnDate(s, endpoint.date)) return false;
                const attr = String(s.attr || '').trim();
                if (attr === '單週' && !isSingleWeek(endpoint.date)) return false;
                if (attr === '雙週' && isSingleWeek(endpoint.date)) return false;
                if (isPatrolSchedule(s)) return false;
                return !!(String(s.className || '').trim() || String(s.subject || '').trim() || attr);
              })
              .forEach((schedule, index) => {
                const className = String(schedule.className || '').trim();
                const subject = String(schedule.subject || '').trim();
                const attr = String(schedule.attr || '').trim();
                schoolSwapChanges.push({
                  id: `school-swap-${row.id}-${endpoint.endpoint}-${index}`,
                  requestId: '',
                  date: endpoint.date,
                  period: endpoint.period,
                  classLine: fmtClassLine(endpoint.date, endpoint.period, className || (attr === '巡堂' ? '巡堂' : ''), subject, ''),
                  desc: `🔁 全校對調：${row.name}（原${window.DateUtils.formatDateMMDD(endpoint.sourceDate)} ${formatPeriodText(endpoint.sourcePeriod)}）`,
                  serial: row.id || 'SWAP',
                  isPast: endpoint.date < todayStr,
                  statusClass: 'tag-blue',
                  statusText: '全校對調',
                  isSchoolSwap: true
                });
              });
          });
        });
      }

      // 排序：未來的升序，過去的降序
      const allChanges = list.concat(schoolSwapChanges);
      const future = allChanges.filter(x => !x.isPast).sort((a,b) => a.date.localeCompare(b.date) || a.period - b.period);
      const past = allChanges.filter(x => x.isPast).sort((a,b) => b.date.localeCompare(a.date) || b.period - a.period);
      return [...future, ...past].slice(0, 10);
    });

    const matchPendingSearch = (req, q) => {
      if (!q) return true;
      const blob = [
        req.serial, req.requesterName, req.targetTeacherName,
        req.className, req.subject, req.targetClassName, req.targetSubject,
        req.requestDate, req.targetDate, req.reason, req.note, req.status, req.batchId
      ].map(x => String(x || '').toLowerCase()).join(' ');
      return blob.indexOf(q) >= 0;
    };

    const filteredMyPendingRequests = computed(() => {
      const q = (pendingSearchQuery.value || '').trim().toLowerCase();
      if (!q) return myPendingRequests.value || [];
      return (myPendingRequests.value || []).filter(r => matchPendingSearch(r, q));
    });
    const filteredMySentRequests = computed(() => {
      const q = (pendingSearchQuery.value || '').trim().toLowerCase();
      if (!q) return mySentRequests.value || [];
      return (mySentRequests.value || []).filter(r => matchPendingSearch(r, q));
    });
    const filteredAdminPendingRequests = computed(() => {
      const q = (pendingSearchQuery.value || '').trim().toLowerCase();
      if (!q) return adminPendingRequests.value || [];
      return (adminPendingRequests.value || []).filter(r => matchPendingSearch(r, q));
    });

    const paginatedMyPending = computed(() => {
      const s = (pendingMyPendingPage.value - 1) * pendingPageSize;
      return filteredMyPendingRequests.value.slice(s, s + pendingPageSize);
    });
    const sentBatchGroups = computed(() =>
      window.UiListHelpers.buildBatchDisplayGroups(filteredMySentRequests.value, 'sent')
    );
    const adminPendingBatchGroups = computed(() =>
      window.UiListHelpers.buildBatchDisplayGroups(filteredAdminPendingRequests.value, 'admin')
    );
    const paginatedMySent = computed(() => {
      const s = (pendingMySentPage.value - 1) * pendingPageSize;
      return flattenBatchDisplayGroups(sentBatchGroups.value.slice(s, s + pendingPageSize), 'sent');
    });
    const paginatedAdminPending = computed(() => {
      const s = (pendingAdminPage.value - 1) * pendingPageSize;
      return flattenBatchDisplayGroups(adminPendingBatchGroups.value.slice(s, s + pendingPageSize), 'admin');
    });

    const pendingMyPendingTotal = computed(() => Math.max(1, Math.ceil(filteredMyPendingRequests.value.length / pendingPageSize)));
    const pendingMySentTotal = computed(() => Math.max(1, Math.ceil(sentBatchGroups.value.length / pendingPageSize)));
    const pendingAdminTotal = computed(() => Math.max(1, Math.ceil(adminPendingBatchGroups.value.length / pendingPageSize)));

    watchFn(pendingSearchQuery, () => {
      pendingMyPendingPage.value = 1;
      pendingMySentPage.value = 1;
      pendingAdminPage.value = 1;
    });


    const dashboardStats = computed(() => {
      const today = window.DateUtils.getTodayString();
      const weekDates = currentWeekDates.value || [];
      const w0 = weekDates[0] || today;
      const w4 = weekDates[4] || today;
      const inScope = (dateStr) => {
        if (!dateStr) return false;
        if (dashboardScope.value === 'today') return dateStr === today;
        return dateStr >= w0 && dateStr <= w4;
      };

      const myPend = myPendingRequests.value.length;
      const adminPend = isAdmin.value ? adminPendingRequests.value.length : 0;
      const mySentOpen = mySentRequests.value.filter(r =>
        r.status === 'pending_teacher' || r.status === 'pending_admin').length;

      let scopeSubCount = 0;
      let scopePublic = 0;
      let scopeP8 = 0;
      let unprinted = 0;
      substitutionRecords.value.forEach(r => {
        if (!inScope(r.date)) return;
        scopeSubCount += 1;
        if (r.type === 'substitution' && (r.subFee === '公費代課' || r.subFee === '學校移撥' || r.subFee === '活動公費')) {
          scopePublic += 1;
        }
        if (parseInt(r.period) === 8) scopeP8 += 1;
        if (!r.printed) unprinted += 1;
      });

      return {
        myPend, adminPend, mySentOpen,
        scopeSubCount, scopePublic, scopeP8, unprinted,
        label: dashboardScope.value === 'today' ? '今日' : '本週'
      };
    });

const loadHistoryMonth = async (monthStr, opts) => {
  opts = opts || {};
  if (!user.value) return;
  let ym = String(monthStr || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    const d = historyFilterDate.value || toLocalDateStr(new Date());
    ym = String(d).slice(0, 7);
  }
  const already = historyLoadedMonths.value.indexOf(ym) >= 0 || historyFullLoaded.value;
  if (already && !opts.force) {
    historyFilterMode.value = 'month';
    if (!String(historyFilterDate.value || '').startsWith(ym)) {
      historyFilterDate.value = ym + '-15';
    }
    historyPage.value = 1;
    return;
  }
  historyMonthLoading.value = true;
  if (!opts.silent) {
    loading.value = true;
    loadingMessage.value = '載入 ' + ym + ' 歷史中...';
  }
  try {
    if (!fetchHistoryMonth) throw new Error('請更新 gas-api 後重新整理（或先部署 code.gs）');
    const res = await fetchHistoryMonth({
      semesterId: currentSemester.value,
      month: ym
    });
    const n = mergeRequestsFromServer((res && res.requests) || []);
    if (historyLoadedMonths.value.indexOf(ym) < 0) {
      historyLoadedMonths.value = historyLoadedMonths.value.concat([ym]);
    }
    historyFilterMode.value = 'month';
    if (!String(historyFilterDate.value || '').startsWith(ym)) {
      historyFilterDate.value = ym + '-15';
    }
    historyPage.value = 1;
    if (!opts.silent) showToast('已合併 ' + ym + ' 共 ' + n + ' 筆', 'success');
  } catch (e) {
    console.error(e);
    if (!opts.silent) showToast('載入月份歷史失敗：' + (e.message || e), 'error');
  } finally {
    historyMonthLoading.value = false;
    if (!opts.silent) loading.value = false;
  }
};

const setHistoryFilterMode = (mode) => {
  historyFilterMode.value = mode;
  historyPage.value = 1;
  // 本日／本週／本月：對齊篩選日期到今天（可再改 date 輸入）
  if (mode === 'day' || mode === 'week' || mode === 'month') {
    if (!historyFilterDate.value) {
      historyFilterDate.value = toLocalDateStr(new Date());
    }
    if (mode === 'day') {
      historyFilterDate.value = toLocalDateStr(new Date());
    }
  }
  if (mode === 'month') {
    ensureHistoryMonthLoaded(String(historyFilterDate.value || '').slice(0, 7));
  }
};

const setHistoryTypeFilter = (type) => {
  const next = ['all', 'substitution', 'exchange'].includes(type) ? type : 'all';
  historyTypeFilter.value = next;
  historyPage.value = 1;
};

const loadFullSemesterHistory = async () => {
  if (!user.value) return;
  historyLoadingFull.value = true;
  loading.value = true;
  loadingMessage.value = '載入完整學期歷史中（可能較慢）...';
  try {
    const res = await fetchInitialData({
      semesterId: currentSemester.value,
      force: true,
      historyAll: true
    });
    applyInitialPayload(res);
    historyFullLoaded.value = true;
    showToast('已載入完整學期申請紀錄', 'success');
  } catch (e) {
    console.error(e);
    showToast('載入完整歷史失敗：' + (e.message || e), 'error');
  } finally {
    historyLoadingFull.value = false;
    loading.value = false;
  }
};

const reloadWindowedHistory = async () => {
  historyFullLoaded.value = false;
  historyLoadedMonths.value = [];
  try {
    await loadWeeklyData({ force: true, silent: false });
    showToast('已恢復近兩週資料視窗', 'info');
  } catch (e) {
    showToast('恢復資料視窗失敗：' + (e && e.message ? e.message : e), 'error');
  }
};

    return {
      filteredHistoryRecords: filteredHistoryRecords,
      getWeekStart: getWeekStart,
      getMonthStart: getMonthStart,
      dateFilteredHistoryRecords: dateFilteredHistoryRecords,
      historyBatchGroups: historyBatchGroups,
      historyTotalPages: historyTotalPages,
      paginatedHistoryRecords: paginatedHistoryRecords,
      dashboardStats: dashboardStats,
      personalChanges: personalChanges,
      isMutualRec: isMutualRec,
      matchPendingSearch: matchPendingSearch,
      filteredMyPendingRequests: filteredMyPendingRequests,
      filteredMySentRequests: filteredMySentRequests,
      filteredAdminPendingRequests: filteredAdminPendingRequests,
      paginatedMyPending: paginatedMyPending,
      sentBatchGroups: sentBatchGroups,
      adminPendingBatchGroups: adminPendingBatchGroups,
      paginatedMySent: paginatedMySent,
      paginatedAdminPending: paginatedAdminPending,
      pendingMyPendingTotal: pendingMyPendingTotal,
      pendingMySentTotal: pendingMySentTotal,
      pendingAdminTotal: pendingAdminTotal,
      loadHistoryMonth: loadHistoryMonth,
      setHistoryFilterMode: setHistoryFilterMode,
      setHistoryTypeFilter: setHistoryTypeFilter,
      loadFullSemesterHistory: loadFullSemesterHistory,
      reloadWindowedHistory: reloadWindowedHistory,

    };
  }
  return { create: create };
})();
