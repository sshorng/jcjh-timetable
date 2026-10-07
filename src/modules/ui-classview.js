/**
 * 自 v1 ui-classview.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import DomainSchedule from '../domain/domain-schedule.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';

/**
 * ui-classview.js — 班級課表視圖（從 app.js 抽出，2A）
 *
 * Eager 載入（模板綁定，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
const UiClassView = (() => {
  'use strict';
  function create(deps) {
    deps = deps || {};
    var computed = deps.computed;
    var isTriangleRequest = deps.isTriangleRequest
      || (typeof window !== 'undefined' && UiListHelpers && UiListHelpers.isTriangleRequest)
      || function () { return false; };
    var isCombinedReturnRequest = deps.isCombinedReturnRequest
      || (typeof window !== 'undefined' && UiLineTemplate && UiLineTemplate.isCombinedReturnRequest)
      || function () { return false; };
    var requestsList = deps.requestsList;
    var allPendingRequests = deps.allPendingRequests;
    var isExchangeLikeRequest = deps.isExchangeLikeRequest;
    var substitutionRecords = deps.substitutionRecords;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var classViewSchedules = deps.classViewSchedules;
    var selectedClass = deps.selectedClass;
    var selectedClassWeekDates = deps.selectedClassWeekDates;
    var classSubstitutionRows = deps.classSubstitutionRows;
    var formatDateMMDD = deps.formatDateMMDD;
    var isQuotaDeductFee = deps.isQuotaDeductFee;
    var formatPeriodText = deps.formatPeriodText;
    var classUsesPublicData = deps.classUsesPublicData;
    var classViewSchoolSwaps = deps.classViewSchoolSwaps;
    var schoolSwaps = deps.schoolSwaps;
    var buildClassSchoolSwapChanges = deps.buildClassSchoolSwapChanges;
    var classScheduleRows = deps.classScheduleRows;
    var isSingleWeek = deps.isSingleWeek;

    const resolveDetailRequest = (reqId, subRecord) => {
      let matched = requestsList.value.find(r => r.id === reqId);
      if (!matched) {
        matched = allPendingRequests.value.find(r => r.id === reqId);
      }
      if (matched) return matched;
      if (!subRecord) return null;
      if (isTriangleRequest(subRecord)) {
        return {
          id: subRecord.requestId || subRecord.id,
          serial: subRecord.serial || '---',
          type: 'triangle',
          requesterEmail: subRecord.actualTeacherEmail || subRecord.actualTeacherName || '',
          targetTeacherEmail: subRecord.originalTeacherEmail || subRecord.originalTeacherName || '',
          requesterName: subRecord.actualTeacherName || '',
          targetTeacherName: subRecord.originalTeacherName || '',
          requestDate: subRecord.triangleSourceDate || subRecord.date || '',
          requestPeriod: subRecord.triangleSourcePeriod != null ? subRecord.triangleSourcePeriod : subRecord.period,
          requestPeriodDay: subRecord.triangleSourceDayOfWeek || null,
          targetDate: subRecord.date || '',
          targetPeriod: subRecord.period,
          targetDayOfWeek: subRecord.dayOfWeek || null,
          className: subRecord.className || '',
          subject: subRecord.subject || '',
          targetClassName: subRecord.className || '',
          targetSubject: subRecord.subject || '',
          triangleId: subRecord.triangleId || '',
          triangleLegIndex: subRecord.triangleLegIndex || null,
          reason: subRecord.reason || '三角調課',
          subFee: '無',
          status: subRecord.status || 'approved',
          note: subRecord.note || ''
        };
      }

      let reqDate = subRecord.date;
      let reqPeriod = subRecord.period;
      let reqPeriodDay = subRecord.dayOfWeek;
      let tgtDate = '—';
      let tgtPeriod = null;
      let tgtDayOfWeek = null;

      let requesterEmail = subRecord.originalTeacherEmail;
      let requestClass = subRecord.className;
      let targetTeacherEmail = subRecord.actualTeacherEmail;
      let targetClass = '';
      let reqSubject = subRecord.subject;
      let tgtSubject = '';

        if (isExchangeLikeRequest(subRecord)) {
        const peer = substitutionRecords.value.find(r => r.requestId === reqId && r.id !== subRecord.id);
        if (peer) {
          const isSub2 = String(subRecord.id).endsWith('_2');

           if (isSub2) {
            reqDate = subRecord.date;
            reqPeriod = subRecord.period;
             reqPeriodDay = subRecord.dayOfWeek;
             requesterEmail = subRecord.originalTeacherEmail;
              requestClass = subRecord.className;
              reqSubject = subRecord.subject;

            tgtDate = peer.date;
             tgtPeriod = peer.period;
             tgtDayOfWeek = peer.dayOfWeek;
             targetTeacherEmail = peer.originalTeacherEmail;
              targetClass = peer.className;
              tgtSubject = peer.subject;
           } else {
            reqDate = peer.date;
            reqPeriod = peer.period;
             reqPeriodDay = peer.dayOfWeek;
             requesterEmail = peer.originalTeacherEmail;
              requestClass = peer.className;
              reqSubject = peer.subject;

            tgtDate = subRecord.date;
             tgtPeriod = subRecord.period;
             tgtDayOfWeek = subRecord.dayOfWeek;
             targetTeacherEmail = subRecord.originalTeacherEmail;
              targetClass = subRecord.className;
              tgtSubject = subRecord.subject;
          }
        }
      }

      return {
        id: reqId || 'N/A',
        serial: subRecord.serial || '---',
        type: subRecord.type,
        requesterEmail,
        targetTeacherEmail,
        requesterName: getTeacherNameByEmail(requesterEmail),
        targetTeacherName: getTeacherNameByEmail(targetTeacherEmail),
        requestDate: reqDate,
        requestPeriod: reqPeriod,
        requestPeriodDay: reqPeriodDay,
        targetDate: tgtDate,
        targetPeriod: tgtPeriod,
        targetDayOfWeek: tgtDayOfWeek,
        className: requestClass,
        subject: reqSubject,
        targetClassName: targetClass,
        targetSubject: tgtSubject,
         reason: subRecord.reason || '請假',
         subFee: subRecord.subFee || '自費代課',
         specialFlow: subRecord.specialFlow || '',
         status: subRecord.status || 'approved',
        note: subRecord.note || ''
      };
    };

    const mapPublicClassRequests = (rows, className) => {
      const out = [];
      (rows || []).forEach((req) => {
        if (!req || String(req.status || req['狀態'] || '').toLowerCase() !== 'approved') return;
          const base = {
            requestId: req.id || req['申請單ID'] || '',
            serial: req.serial || req['單號'] || '',
            reason: req.reason || req['請假事由'] || '',
            subFee: req.subFee || req['經費來源'] || '',
          note: req.note || req['備註'] || '',
          printed: req.printed === true || req.printed === 'TRUE'
        };
        const classValue = String(req.className || req['班級'] || className || '').trim();
        const subjectValue = req.subject || req['科目'] || '';
        const targetDateValue = req.targetDate || req['對調目標日期'] || '';
        const targetPeriodValue = req.targetPeriod != null ? req.targetPeriod : req['對調目標節次'];
        const targetDayValue = req.targetDayOfWeek || req['對調目標星期'] || (() => {
          const date = new Date(String(targetDateValue || '').replace(/-/g, '/'));
          return Number.isNaN(date.getTime()) ? 0 : (date.getDay() === 0 ? 7 : date.getDay());
        })();
        const targetEmailValue = String(req.targetTeacherEmail || req['受邀人Email'] || req.targetTeacherName || req['受邀人姓名'] || '').trim().toLowerCase();
        const targetSchedule = (classViewSchedules.value || []).find(schedule =>
          String(schedule.teacherEmail || schedule.teacherName || '').trim().toLowerCase() === targetEmailValue
          && parseInt(schedule.dayOfWeek, 10) === parseInt(targetDayValue, 10)
          && parseInt(schedule.period, 10) === parseInt(targetPeriodValue, 10)
          && (typeof window === 'undefined' || !DomainSchedule || !DomainSchedule.isActiveOnDate
            || DomainSchedule.isActiveOnDate(schedule, targetDateValue))
        );
        const targetClassValue = String(req.targetClassName || req['對調目標班級'] || (targetSchedule && targetSchedule.className) || classValue).trim();
        const targetSubjectValue = req.targetSubject || req['對調目標科目'] || (targetSchedule && targetSchedule.subject) || '';
        const type = req.type || req['異動類型'] || 'substitution';
        const requestDate = req.requestDate || req['異動日期'] || '';
        const requestPeriod = req.requestPeriod != null ? req.requestPeriod : req['異動節次'];
        const requesterName = req.requesterName || req['申請人姓名'] || '';
        const targetName = req.targetTeacherName || req['受邀人姓名'] || '';
        if (type === 'triangle' || type === '三角調') {
          out.push(Object.assign({}, base, {
            id: base.requestId,
            date: targetDateValue,
            period: targetPeriodValue,
            originalTeacherName: targetName,
            actualTeacherName: requesterName,
            className: classValue,
            subject: subjectValue,
            type: 'triangle'
          }));
          return;
        }
        if (type === 'exchange' || type === '對調') {
          var classStayFlow = String(req.specialFlow || req['特殊流程'] || '') === 'admin_same_period_exchange'
            || String(req.specialFlow || req['特殊流程'] || '') === 'teacher_swap';
          if (classStayFlow) {
            out.push(Object.assign({}, base, {
              id: String(base.requestId) + '_class_1',
              requestId: base.requestId,
              date: requestDate,
              period: requestPeriod,
              originalTeacherName: requesterName,
              actualTeacherName: targetName,
              className: classValue,
              subject: subjectValue,
              type: 'exchange'
            }));
            out.push(Object.assign({}, base, {
              id: String(base.requestId) + '_class_2',
              requestId: base.requestId,
              date: targetDateValue,
              period: targetPeriodValue,
              originalTeacherName: targetName,
              actualTeacherName: requesterName,
              className: targetClassValue,
              subject: targetSubjectValue,
              type: 'exchange'
            }));
            return;
          }
          // 調課只交換時段：班級與科目必須跟著原授課教師移動。
          out.push(Object.assign({}, base, {
            id: String(base.requestId) + '_class_1',
            requestId: base.requestId,
            date: targetDateValue,
            period: targetPeriodValue,
            originalTeacherName: targetName,
            actualTeacherName: requesterName,
            className: classValue,
            subject: subjectValue,
            type: 'exchange'
          }));
          out.push(Object.assign({}, base, {
            id: String(base.requestId) + '_class_2',
            requestId: base.requestId,
            date: requestDate,
            period: requestPeriod,
            originalTeacherName: requesterName,
            actualTeacherName: targetName,
            className: targetClassValue,
            subject: targetSubjectValue,
            type: 'exchange'
          }));
          return;
        }
        out.push(Object.assign({}, base, {
          id: base.requestId,
          requestId: base.requestId,
          date: requestDate,
          period: requestPeriod,
          originalTeacherName: requesterName,
          actualTeacherName: targetName,
          className: classValue,
          subject: subjectValue,
          type: 'substitution'
        }));
      });
      return out.filter(r => r.date && r.period != null);
    };

    const classChangeSummary = computed(() => {
      const cls = selectedClass.value;
      if (!cls) return [];
      const weekSet = new Set(selectedClassWeekDates.value || []);
      const rows = [];
      classSubstitutionRows.value.forEach(r => {
        if (String(r.className || '') !== String(cls)) return;
        const isEx = isExchangeLikeRequest(r);
        // 用 YYYY-MM-DD 或 YYYY/MM/DD 皆可；勿接 T00:00:00 以免部分瀏覽器解析失敗
        let dayNum = 0;
        if (r.date) {
          const raw = String(r.date).trim();
          const d = new Date(raw.includes('T') ? raw : raw.replace(/-/g, '/'));
          if (!Number.isNaN(d.getTime())) {
            const gd = d.getDay();
            dayNum = gd === 0 ? 7 : gd;
          } else {
            const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
              const d2 = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
              if (!Number.isNaN(d2.getTime())) {
                const gd = d2.getDay();
                dayNum = gd === 0 ? 7 : gd;
              }
            }
          }
        }
        const toName = r.actualTeacherName || getTeacherNameByEmail(r.actualTeacherEmail) || '—';
        const subject = r.subject || '';
        const dayPart = dayNum ? (DateUtils.getWeekDayText(dayNum) || '') : '';
        const datePart = dayPart
          ? `${formatDateMMDD(r.date)}(${dayPart})`
          : `${formatDateMMDD(r.date)}`;
        const isMutual = !isEx && isQuotaDeductFee(r.subFee);
        const isCombined = isCombinedReturnRequest(r);
        // 班級摘要：互代不顯示「不結鐘點」字樣
        const line = isEx
          ? `${datePart} ${formatPeriodText(r.period)} 改上 ${subject}（${toName}）`
          : isCombined
             ? `${datePart} ${formatPeriodText(r.period)} ${subject} 併班上課，由${toName}代課`
          : isMutual
            ? `${datePart} ${formatPeriodText(r.period)} ${subject} 由${toName}互代`
            : `${datePart} ${formatPeriodText(r.period)} ${subject} 由${toName}代課`;
        rows.push({
          id: r.id,
          date: r.date,
          period: r.period,
          dayText: dayPart,
           type: isEx ? '調課' : (isCombined ? '併班上課' : (isMutual ? '互代' : '代課')),
          line,
          inWeek: weekSet.has(r.date)
        });
      });
      const classSchoolSwapRows = classUsesPublicData.value
        ? classViewSchoolSwaps.value
        : schoolSwaps.value;
      buildClassSchoolSwapChanges(
        cls,
        classScheduleRows.value,
        classSchoolSwapRows,
        selectedClassWeekDates.value,
        isSingleWeek
      ).forEach(change => {
        const dayPart = change.dayNum ? (DateUtils.getWeekDayText(change.dayNum) || '') : '';
        const datePart = dayPart
          ? `${formatDateMMDD(change.date)}(${dayPart})`
          : `${formatDateMMDD(change.date)}`;
        const sourcePart = `${formatDateMMDD(change.sourceDate)} ${formatPeriodText(change.sourcePeriod)}`;
        rows.push({
          id: change.id,
          date: change.date,
          period: change.period,
          dayText: dayPart,
          type: '全校對調',
          line: `${datePart} ${formatPeriodText(change.period)} ${change.subject}（原${sourcePart}）`,
          inWeek: change.inWeek,
          isSchoolSwap: true
        });
      });
      rows.sort((a, b) => {
        if (a.inWeek !== b.inWeek) return a.inWeek ? -1 : 1;
        const c = String(a.date).localeCompare(String(b.date));
        if (c !== 0) return c;
        return parseInt(a.period, 10) - parseInt(b.period, 10);
      });
      return rows;
    });

    return {
      resolveDetailRequest: resolveDetailRequest,
      mapPublicClassRequests: mapPublicClassRequests,
      classChangeSummary: classChangeSummary
    };
  }
  return { create: create };
})();

export { UiClassView };
