/**
 * 自 v1 ui-timetable.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
import DomainClassAway from '../domain/domain-class-away.js';
import DomainMatch from '../domain/domain-match.js';
import DomainSchedule from '../domain/domain-schedule.js';
import DomainSchoolSwap from '../domain/domain-school-swap.js';
import DomainTriangle from '../domain/domain-triangle.js';
import FeeUtils from '../domain/fee-utils.js';
import FieldMap from '../domain/field-map.js';
import { UiLineTemplate } from '../modules/ui-line-template.js';
import { UiListHelpers } from '../modules/ui-list-helpers.js';
import { UiMutualPanelState } from '../modules/ui-mutual.js';

/**
 * ui-timetable.js — 課表存取層（方案甲第三大塊）
 * 含：解析／grid／格樣式／點格／媒合名單／預覽高亮／班級課表點格／批次媒合
 */
const UiTimetable = (() => {
  /**
   * @param {object} deps Vue ref/computed 與回呼
   */
  function create(deps) {
    var computed = deps.computed;
    var allSchedules = deps.allSchedules;
    var schoolSwaps = deps.schoolSwaps;
    var substitutionRecords = deps.substitutionRecords;
    var substitutionsLookup = deps.substitutionsLookup || { value: {} }; // computed Map-like
    var allPendingRequests = deps.allPendingRequests;
    var displayTimetableTeachers = deps.displayTimetableTeachers;
    var currentWeekDates = deps.currentWeekDates;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getTeacherSubjectByEmail = deps.getTeacherSubjectByEmail;
    var formatDateMMDD = deps.formatDateMMDD;
    var isSingleWeek = deps.isSingleWeek;
    var isClassAwayOnDate = deps.isClassAwayOnDate;
    var getWeekDayText = deps.getWeekDayText;
    var batchSelectMode = deps.batchSelectMode;
    var isBatchSlotSelected = deps.isBatchSlotSelected;
    var isMutualCover = deps.isMutualCover;
    var DAC = deps.DAC;
    var isMutualActivitySlotInRange = deps.isMutualActivitySlotInRange;
    var mutualAwayClasses = deps.mutualAwayClasses;
    var mutualActivityStart = deps.mutualActivityStart;
    var mutualActivityEnd = deps.mutualActivityEnd;
    var mutualActivityStartPeriod = deps.mutualActivityStartPeriod;
    var mutualActivityEndPeriod = deps.mutualActivityEndPeriod;
    var isEmptySlotAssignmentRequest = deps.isEmptySlotAssignmentRequest;
    var isCourseAdjustmentOnlyRequest = deps.isCourseAdjustmentOnlyRequest;
    var getTeacherSubjectByEmail = deps.getTeacherSubjectByEmail;
    // 2A：再異動判定吃申請單狀態（app 經 getTimetableApi 傳入 requestsList）
    var requestsList = deps.requestsList;

    var scheduleIndex = computed(function () {
      return DomainSchedule.buildScheduleIndex(allSchedules.value);
    });

    var schoolSwapIndex = computed(function () {
      return DomainSchoolSwap
        ? DomainSchoolSwap.buildIndex(schoolSwaps ? schoolSwaps.value : [])
        : { rows: [], bySlot: {} };
    });

    function resolveBaseSlot(dateStr, dayOfWeek, period, teacherEmail) {
      return DomainSchoolSwap
        ? (teacherEmail && DomainSchoolSwap.resolveSlotForTeacher
          ? DomainSchoolSwap.resolveSlotForTeacher(
            schoolSwapIndex.value, dateStr, dayOfWeek, period, teacherEmail,
            scheduleIndex.value, allSchedules.value
          )
          : DomainSchoolSwap.resolveSlot(schoolSwapIndex.value, dateStr, dayOfWeek, period))
        : { dayOfWeek: dayOfWeek, period: period, row: null, endpoint: '' };
    }

    var pendingIndex = computed(function () {
      if (DomainSchedule && DomainSchedule.buildPendingIndex) {
        return DomainSchedule.buildPendingIndex(allPendingRequests.value);
      }
      return null;
    });

    var _scheduleCache = new Map();

    function clearScheduleCache() {
      _scheduleCache.clear();
      fetchRecommendations._cache = {};
    }

    function getApprovedScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) {
      var key = dateStr + '_' + period;
      var lookup = substitutionsLookup.value || {};
      var baseSlot = resolveBaseSlot(dateStr, dayOfWeek, period, teacherEmail);
      var cell = DomainSchedule.resolveApprovedSchedule({
        teacherEmail: teacherEmail,
        dateStr: dateStr,
        period: period,
        dayOfWeek: dayOfWeek,
        schedulePeriod: baseSlot.period,
        scheduleDayOfWeek: baseSlot.dayOfWeek,
        allSchedules: allSchedules.value,
        scheduleIndex: scheduleIndex.value,
        periodSubs: lookup[key] || [],
        allSubs: substitutionRecords.value,
        helpers: {
          getTeacherNameByEmail: getTeacherNameByEmail,
          getTeacherSubjectByEmail: getTeacherSubjectByEmail,
          formatDateMMDD: formatDateMMDD,
          isSingleWeek: isSingleWeek,
          isClassAway: isClassAwayOnDate,
          getWeekDayText: getWeekDayText,
          resolveBaseSlot: resolveBaseSlot
        }
      });
      if (cell && baseSlot.row) {
        cell = Object.assign({}, cell, {
          schoolSwap: baseSlot.row,
          schoolSwapEndpoint: baseSlot.endpoint,
          schoolSwapSourceDay: baseSlot.dayOfWeek,
          schoolSwapSourcePeriod: baseSlot.period
        });
      }
      return cell;
    }

    function getScheduleForDate(teacherEmail, dateStr, period, dayOfWeek) {
      var memoKey = teacherEmail + '|' + dateStr + '|' + period;
      if (_scheduleCache.has(memoKey)) return _scheduleCache.get(memoKey);
      var baseSlot = resolveBaseSlot(dateStr, dayOfWeek, period, teacherEmail);
      var cell = getApprovedScheduleForDate(teacherEmail, dateStr, period, dayOfWeek);
      var merged = DomainSchedule.applyPendingOverlay({
        cell: cell,
        teacherEmail: teacherEmail,
        dateStr: dateStr,
        period: period,
        pendingRequests: allPendingRequests.value,
        pendingIndex: pendingIndex.value,
        getWeekDayText: getWeekDayText,
        allSchedules: allSchedules.value,
        scheduleIndex: scheduleIndex.value,
        resolveBaseSlot: resolveBaseSlot
      });
      if (merged && baseSlot.row && !merged.schoolSwap) {
        merged = Object.assign({}, merged, {
          schoolSwap: baseSlot.row,
          schoolSwapEndpoint: baseSlot.endpoint,
          schoolSwapSourceDay: baseSlot.dayOfWeek,
          schoolSwapSourcePeriod: baseSlot.period
        });
      }
       if (merged && merged.className && !merged.isClassAway && isClassAwayOnDate(merged.className, dateStr, period)) {
        merged = Object.assign({}, merged, { isClassAway: true });
      }
       _scheduleCache.set(memoKey, merged);
       return merged;
     }

    // 2A：以下兩函式自 app.js verbatim 搬移（依賴 scheduleIndex／allSchedules／isSingleWeek／getScheduleForDate
    // 皆為本 create 作用域內既有，名稱沿用，呼叫端零修改）
    const findBaseScheduleSlot = (email, dayOfWeek, period, dateStr) => {
      if (!email || dayOfWeek == null || dayOfWeek === '' || period == null || period === '') return null;
      const em = String(email).toLowerCase();
      const dow = parseInt(dayOfWeek, 10);
      const p = parseInt(period, 10);
      if (Number.isNaN(dow) || Number.isNaN(p)) return null;
      let cands = [];
      const idx = scheduleIndex.value;
      if (idx && DomainSchedule && DomainSchedule.getCandidates) {
        cands = DomainSchedule.getCandidates(idx, em, dow, p, allSchedules.value, dateStr) || [];
      } else {
        cands = (allSchedules.value || []).filter(s =>
          s.teacherEmail && String(s.teacherEmail).toLowerCase() === em
          && parseInt(s.dayOfWeek, 10) === dow
          && parseInt(s.period, 10) === p
          && (!DomainSchedule || !DomainSchedule.isActiveOnDate
            || DomainSchedule.isActiveOnDate(s, dateStr))
        );
      }
      if (!cands.length) return null;
      if (dateStr && typeof isSingleWeek === 'function') {
        const single = isSingleWeek(dateStr);
        const byWeek = cands.find(s => {
          if (s.attr === '單週') return single;
          if (s.attr === '雙週') return !single;
          return false;
        });
        if (byWeek) return byWeek;
      }
      return cands.find(s => s.attr !== '單週' && s.attr !== '雙週') || cands[0];
    };

    /**
     * 從「已組裝的 substitution 列 + 基礎課表」解析有效班科
     * slotSubs：同日同節的 edge 陣列（建議由 slotIndex 提供，避免每次 filter 全表）
     */
    const resolveCellFromBaseAndSubs = (email, dateStr, period, dayOfWeek, subsSoFar, slotSubsOpt) => {
      if (!email || period == null || period === '') return null;
      const em = String(email).toLowerCase();
      const p = parseInt(period, 10);
      const dateKey = String(dateStr || '');
      const slotSubs = slotSubsOpt || (subsSoFar || []).filter(s =>
        s && String(s.date) === dateKey && parseInt(s.period, 10) === p
      );

      const courseMetadataFromRecord = (record) => {
        if (!record) return null;
        const hasMetadata = ['courseAttr', 'courseSpecialTags', 'courseIsOvertime', 'courseIsSubstitute']
          .some(key => Object.prototype.hasOwnProperty.call(record, key));
        if (!hasMetadata) return null;
        return {
          attr: record.courseAttr == null ? '' : String(record.courseAttr),
          specialTags: record.courseSpecialTags == null ? '' : String(record.courseSpecialTags),
          isOvertime: record.courseIsOvertime === true,
          isSubstitute: record.courseIsSubstitute === true
        };
      };

      // 1) 直接：此人是 actual（調入／代課中）
      const asActual = slotSubs.filter(s =>
        s.actualTeacherEmail && String(s.actualTeacherEmail).toLowerCase() === em
      );
      let hit = DomainSchedule && typeof DomainSchedule.selectActualDutyRecord === 'function'
        ? DomainSchedule.selectActualDutyRecord(slotSubs, em)
        : (asActual.length ? asActual[asActual.length - 1] : null);
      // 轉代消耗：調入後又同班科調出，視為已轉走，不再是有效義務（防重複再調）
      if (hit) {
        var hitKey = String(hit.className || '').trim() + '|' + String(hit.subject || '').trim();
        var hitIdx = slotSubs.indexOf(hit);
        var forwarded = (slotSubs || []).some(function (s, si) {
          if (si <= hitIdx) return false;
          if (!s || !s.originalTeacherEmail) return false;
          if (String(s.originalTeacherEmail).toLowerCase() !== em) return false;
          return String(s.className || '').trim() + '|' + String(s.subject || '').trim() === hitKey;
        });
        if (forwarded) hit = null;
      }
      if (hit) {
        let cls = hit.className || '';
        let subj = hit.subject || '';
        // 班科空：沿 forward 鏈回推起點
        if (!cls || !subj) {
          const byOrig = {};
          slotSubs.forEach(s => {
            if (s.originalTeacherEmail && s.actualTeacherEmail) {
              byOrig[String(s.originalTeacherEmail).toLowerCase()] = s;
            }
          });
          // 反查：誰一路轉到 em
          let start = null;
          Object.keys(byOrig).forEach(o => {
            let cur = o;
            const vis = new Set();
            while (byOrig[cur] && !vis.has(cur)) {
              vis.add(cur);
              const next = String(byOrig[cur].actualTeacherEmail).toLowerCase();
              if (next === em) { start = o; break; }
              cur = next;
            }
          });
          if (start) {
            let cur = start;
            const vis = new Set();
            while (byOrig[cur] && !vis.has(cur)) {
              vis.add(cur);
              const rec = byOrig[cur];
              if (!cls && rec.className) cls = rec.className;
              if (!subj && rec.subject) subj = rec.subject;
              cur = String(rec.actualTeacherEmail).toLowerCase();
            }
            if ((!cls || !subj) && typeof findBaseScheduleSlot === 'function') {
              let dayNum = dayOfWeek;
              if ((dayNum == null || dayNum === '') && dateStr) {
                const d = new Date(String(dateStr).replace(/-/g, '/'));
                if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
              }
              const base = findBaseScheduleSlot(start, dayNum, period, dateStr);
              if (base) {
                if (!cls) cls = base.className || '';
                if (!subj) subj = base.subject || '';
              }
            }
          }
        }
        if (cls || subj) {
          return Object.assign({
            className: cls,
            subject: subj,
            fromSub: true,
            isSubstitutionDuty: true,
            dutyType: hit.type || '',
            isEmptySlotAssign: !!(DomainSchedule
              && DomainSchedule.isEmptySlotAssignmentRecord
              && DomainSchedule.isEmptySlotAssignmentRecord(hit))
          }, courseMetadataFromRecord(hit) || {});
        }
      }

      // 2) 此人是 original（已調出）→ 無有效課可再對調，回 null 讓上層顯示空
      const asOrig = slotSubs.find(s =>
        s.originalTeacherEmail && String(s.originalTeacherEmail).toLowerCase() === em
      );
      if (asOrig) return null;

      let dayNum = dayOfWeek;
      if ((dayNum == null || dayNum === '') && dateStr) {
        const d = new Date(String(dateStr).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      // 3) 執行期有效課表
      if (dateStr && typeof getScheduleForDate === 'function') {
        try {
          const cell = getScheduleForDate(email, dateStr, period, dayNum);
          if (cell && cell.isSubstitutionDuty && (cell.className || cell.subject)) return cell;
          if (cell && (cell.className || cell.subject) && !cell.isSubstituted) return cell;
        } catch (e) { /* 尚未就緒 */ }
      }
      const base = typeof findBaseScheduleSlot === 'function'
        ? findBaseScheduleSlot(email, dayNum, period, dateStr)
        : null;
      return base;
    };

    // 2A：以下交換目標鏈自 app.js 搬移（getScheduleForDate／findBaseScheduleSlot 為本作用域既有；
    // isTriangleRequest 走 UiListHelpers、顯示文字走 UiLineTemplate／DateUtils，皆呼叫期解析）
    const isExchangeLikeRequest = (r) => !!(r && (
      r.type === 'exchange' || r.type === '對調' || UiListHelpers.isTriangleRequest(r)
    ));

    const getTargetSubject = (req) => {
      if (!req) return '';
      if (isExchangeLikeRequest(req)) {
        const info = getTargetClassAndSubject(req);
        return info.subject || req.targetSubject || '';
      }
      return req.targetSubject || req.subject || '';
    };

    const getTargetClassAndSubject = (req) => {
      if (!isExchangeLikeRequest(req)) return { className: '', subject: '' };
      if (UiListHelpers.isTriangleRequest(req)) {
        // 三角調是整堂原課跟著來源教師移動，不使用目標教師原課班科。
        return {
          className: String(req.className || '').trim(),
          subject: String(req.subject || '').trim()
        };
      }
      const explicitClass = String(req.targetClassName || '').trim();
      const explicitSubject = String(req.targetSubject || '').trim();
      if (explicitClass || explicitSubject) {
        return { className: explicitClass, subject: explicitSubject };
      }
      let dayNum = req.targetDayOfWeek;
      if ((dayNum == null || dayNum === '') && req.targetDate) {
        const d = new Date(String(req.targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      const cell = resolveExchangeTargetCell(req.targetTeacherEmail, req.targetDate, req.targetPeriod, dayNum);
      return {
        className: cell ? (cell.className || '') : (req.targetClassName || ''),
        subject: cell ? (cell.subject || '') : (req.targetSubject || '')
      };
    };

    const getOriginalRequestSubject = (req) => {
       if (!req) return '';
       // 請假課堂以申請單為準；有效課表僅在缺欄時補
       if (req.subject) return req.subject;
       const dateStr = req.requestDate || '';
       if (!dateStr) return '';
       const d = new Date(dateStr.replace(/-/g, '/'));
       const day = d.getDay() === 0 ? 7 : d.getDay();
       const cell = resolveExchangeTargetCell(req.requesterEmail, dateStr, req.requestPeriod, day);
       return cell ? (cell.subject || '') : '';
    };

    const getOriginalRequestClass = (req) => {
      if (!req) return '';
      if (req.className) return req.className;
      const dateStr = req.requestDate || '';
      if (!dateStr) return '';
      const d = new Date(dateStr.replace(/-/g, '/'));
      const day = d.getDay() === 0 ? 7 : d.getDay();
      const cell = resolveExchangeTargetCell(req.requesterEmail, dateStr, req.requestPeriod, day);
      return cell ? (cell.className || '') : '';
    };

    const getOriginalTargetSubject = (req) => {
      if (!isExchangeLikeRequest(req)) return '';
      return getTargetClassAndSubject(req).subject;
    };

    const getOriginalTargetClass = (req) => {
      if (!isExchangeLikeRequest(req)) return '';
      return getTargetClassAndSubject(req).className;
    };

    const resolveExchangeTargetCell = (teacherEmail, dateStr, period, dayOfWeek) => {
      if (!teacherEmail || period == null || period === '') return null;
      let dayNum = dayOfWeek;
      if ((dayNum == null || dayNum === '') && dateStr) {
        const d = new Date(String(dateStr).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      // 1) 有效課表（含已核准異動＋pending 疊加）
      if (dateStr && typeof getScheduleForDate === 'function') {
        try {
          const cell = getScheduleForDate(teacherEmail, dateStr, period, dayNum);
          if (cell && (cell.className || cell.subject) && !cell.isSubstituted) return cell;
          // 調出格：用 subRecord 對側資訊不夠；優先找 isSubstitutionDuty
          if (cell && cell.isSubstitutionDuty) return cell;
        } catch (e) { /* timetable 未就緒 */ }
      }
      if (dateStr && typeof getApprovedScheduleForDate === 'function') {
        try {
          const cell = getApprovedScheduleForDate(teacherEmail, dateStr, period, dayNum);
          if (cell && (cell.className || cell.subject) && !cell.isSubstituted) return cell;
          if (cell && cell.isSubstitutionDuty) return cell;
        } catch (e2) { /* ignore */ }
      }
      // 2) 基礎課表（含單雙週）
      return findBaseScheduleSlot(teacherEmail, dayNum, period, dateStr);
    };

    const formatExchangeClassSlot = (req) => {
       if (!req || !isExchangeLikeRequest(req)) return '—';
       if (UiListHelpers.isTriangleRequest(req)) {
         let dayNum = req.targetDayOfWeek;
         if ((dayNum == null || dayNum === '') && req.targetDate) {
           const d = new Date(String(req.targetDate).replace(/-/g, '/'));
           if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
         }
          const movedCourse = UiLineTemplate.formatCourseDisplayText(req.className, req.subject);
          return UiLineTemplate._fmtSlot(req.targetDate, DateUtils.getWeekDayText(dayNum), req.targetPeriod, movedCourse || '');
       }
       let dayNum = req.targetDayOfWeek;
      if ((dayNum == null || dayNum === '') && req.targetDate) {
        const d = new Date(String(req.targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
       const cell = resolveExchangeTargetCell(
        req.targetTeacherEmail,
        req.targetDate,
        req.targetPeriod,
        dayNum
      );
      const clsName = cell ? (cell.className || '') : (req.targetClassName || '');
      const subj = cell ? (cell.subject || '') : (req.targetSubject || '');
       const cls = UiLineTemplate.formatCourseDisplayText(clsName, subj);
       return UiLineTemplate._fmtSlot(req.targetDate, DateUtils.getWeekDayText(dayNum), req.targetPeriod, cls || '');
    };

    // 2A：快辦標題自 app.js 搬移（isExchangeLikeRequest 本模組既有；其餘走 UiLineTemplate／UiListHelpers）
    const formatQuickTodoTitle = (req, role) => {
      if (!req) return '—';
      const isEx = isExchangeLikeRequest(req);
      const leaveSlot = UiLineTemplate.formatQuickSlotCompact(
        req.requestDate, req.requestPeriodDay, req.requestPeriod, req.className, req.subject
      );
      if (UiLineTemplate.isCombinedReturnRequest(req)) {
         return '併班上課 · ' + leaveSlot;
      }
      if (isEx) {
        let dayNum = req.targetDayOfWeek;
        if ((dayNum == null || dayNum === '') && req.targetDate) {
          const d = new Date(String(req.targetDate).replace(/-/g, '/'));
          if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
        }
         const cell = UiListHelpers.isTriangleRequest(req) ? null : resolveExchangeTargetCell(
           req.targetTeacherEmail, req.targetDate, req.targetPeriod, dayNum
         );
         const peerSlot = UiLineTemplate.formatQuickSlotCompact(
           req.targetDate,
           dayNum,
           req.targetPeriod,
           cell ? cell.className : (UiListHelpers.isTriangleRequest(req) ? req.className : (req.targetClassName || '')),
           cell ? cell.subject : (UiListHelpers.isTriangleRequest(req) ? req.subject : (req.targetSubject || ''))
         );
        // sent＝申請人視角；incoming＝受邀人視角；括號內放真實姓名
        const meName = role === 'sent'
          ? (req.requesterName || '我')
          : (req.targetTeacherName || '我');
        const peerName = role === 'sent'
          ? (req.targetTeacherName || '對方')
          : (req.requesterName || '對方');
        const mySlot = role === 'sent' ? leaveSlot : peerSlot;
        const otherSlot = role === 'sent' ? peerSlot : leaveSlot;
        return mySlot + '（' + meName + '）⇄ ' + otherSlot + '（' + peerName + '）';
      }
      if (role === 'sent') {
        return (req.targetTeacherName || '對方') + ' · ' + leaveSlot;
      }
      return (req.requesterName || '申請人') + ' · ' + leaveSlot;
    };

    // 測試接縫：允許覆寫細胞解析（paper-flow 以 fixture 代課格驗證映射；預設走本模組實作）
    var resolveCell = deps.resolveCellFromBaseAndSubs || resolveCellFromBaseAndSubs;
    var findBase = deps.findBaseScheduleSlot || findBaseScheduleSlot;

    // 2A：三角候選簇自 app.js 搬移（activeCell／teachersList 等由 app 經 deps 傳入；缺省給空殼保部分呼叫不斷線）
    var activeCell = deps.activeCell || { value: null };
    var inputRequestDate = deps.inputRequestDate || { value: '' };
    var teachersList = deps.teachersList || { value: [] };
    var timetablePeriods = deps.timetablePeriods;
    var trianglePickB = deps.trianglePickB || { value: '' };
    var trianglePickC = deps.trianglePickC || { value: '' };
    var triangleCandidateSearch = deps.triangleCandidateSearch || { value: '' };
    var triangleCandidateDisplayCount = deps.triangleCandidateDisplayCount || { value: 18 };
    var triangleReason = deps.triangleReason;
    var triangleNote = deps.triangleNote;
    var showTriangleTimetablePreview = deps.showTriangleTimetablePreview || { value: false };
    var lookupTeacher2 = deps.lookupTeacher || function () { return null; };
    var isCombinedClassFn = deps.isCombinedClass || function () { return false; };
    var notificationsSuppressed = deps.notificationsSuppressed || { value: false };
    var openLineMessageEditor = deps.openLineMessageEditor || function () {};
    var getLineHandledSlot = deps.getLineHandledSlot
      || (typeof window !== 'undefined' && UiLineTemplate && UiLineTemplate.getLineHandledSlot)
      || function () { return {}; };
    var isPaperFlowRequest = deps.isPaperFlowRequest || function () { return false; };
    var isProxySubmitRequest = deps.isProxySubmitRequest || function () { return false; };
    var watchFn = deps.watch || function () {};
    // v2 無 showToast 全域，一律走 deps 注入；未注入則為空操作
    var showToastFn = deps.showToast || function () {};

    const triangleTeacherKey = (value) => String(value || '').trim().toLowerCase();
    const triangleSlotKey = (slot) => {
      if (!slot) return '';
      return `${String(slot.date || '').slice(0, 10)}|${parseInt(slot.period, 10)}`;
    };
    const triangleCellIsUsable = (cell) => !!(cell
      && String(cell.className || '').trim()
      && String(cell.subject || '').trim()
      && !cell.isPending
      && !cell.isSubstituted
      && !cell.isSubstitutionDuty
      && !cell.isClassAway
      && !cell.isPatrol
      && cell.attr !== '巡堂');

    /** 以目前週課表列出可作為第二、第三位教師原課的有效課堂。 */
    const triangleCandidates = computed(() => {
      const source = activeCell.value || {};
      const sourceTeacher = triangleTeacherKey(source.teacherEmail || source.teacherName);
      const sourceDate = String(inputRequestDate.value || '').slice(0, 10);
      const sourceClass = String(source.classData && source.classData.className || '').trim();
      const sameClass = (left, right) => {
        const a = String(left || '').trim();
        const b = String(right || '').trim();
        if (!a || !b) return false;
        if (a === b) return true;
        if (DateUtils && typeof DateUtils.classListIncludes === 'function') {
          return DateUtils.classListIncludes(a, b) || DateUtils.classListIncludes(b, a);
        }
        return false;
      };
      if (!sourceTeacher || !sourceDate || !source.classData || !triangleCellIsUsable(source.classData)) return [];
      const dates = [];
      (currentWeekDates.value || []).forEach((date) => {
        if (date && dates.indexOf(date) < 0) dates.push(date);
      });
      if (dates.indexOf(sourceDate) < 0) dates.push(sourceDate);
      const periods = Array.isArray(timetablePeriods) && timetablePeriods.length
        ? timetablePeriods : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
      const seen = Object.create(null);
      const result = [];
      (teachersList.value || []).forEach((teacher) => {
        if (!teacher) return;
        const email = teacher.email || teacher.teacherName || teacher.name || '';
        const teacherName = teacher.teacherName || teacher.name || email;
        if (!email || triangleTeacherKey(email) === sourceTeacher) return;
        if (!(allSchedules.value || []).some(schedule =>
          triangleTeacherKey(schedule.teacherEmail || schedule.teacherName) === triangleTeacherKey(email)
          && sameClass(schedule.className, sourceClass)
        )) return;
        dates.forEach((date, dateIndex) => {
          const day = dateIndex < 5 ? dateIndex + 1 : (() => {
            const parsed = new Date(String(date).replace(/-/g, '/'));
            if (Number.isNaN(parsed.getTime())) return 0;
            const raw = parsed.getDay();
            return raw === 0 ? 7 : raw;
          })();
          if (!day) return;
          periods.forEach((period) => {
            const cell = getScheduleForDate(email, date, period, day);
            if (!triangleCellIsUsable(cell)) return;
            if (!sameClass(cell.className, sourceClass)) return;
            const key = `${triangleTeacherKey(email)}|${date}|${parseInt(period, 10)}`;
            if (seen[key]) return;
            seen[key] = true;
            result.push({
              key,
              email,
              teacherName,
              date,
              dayOfWeek: day,
              period: parseInt(period, 10),
               className: String(cell.className || '').trim(),
               subject: String(cell.subject || '').trim(),
               attr: String(cell.attr || '').trim(),
               restriction: cell.restriction || '',
               specialTags: cell.specialTags || cell['特殊標記'] || '',
               isPullOut: !!(cell.isPullOut || cell.attr === '抽離')
            });
          });
        });
      });
      return result.sort((a, b) => String(a.teacherName).localeCompare(String(b.teacherName), 'zh-Hant')
        || String(a.date).localeCompare(String(b.date))
        || (a.period - b.period));
    });
    const triangleCandidateB = computed(() =>
      triangleCandidates.value.find((candidate) => candidate.key === trianglePickB.value) || null
    );
    const triangleCandidateCList = computed(() => {
      const b = triangleCandidateB.value;
      const bTeacher = b ? triangleTeacherKey(b.email) : '';
      return triangleCandidates.value.filter((candidate) => triangleTeacherKey(candidate.email) !== bTeacher);
    });
    const triangleCandidateC = computed(() =>
      triangleCandidateCList.value.find((candidate) => candidate.key === trianglePickC.value) || null
    );
    const triangleSourceParticipant = () => {
      const source = activeCell.value || {};
      const classData = source.classData || {};
      return {
        email: source.teacherEmail || source.teacherName || '',
        teacherName: source.teacherName || getTeacherNameByEmail(source.teacherEmail),
        slot: {
          date: String(inputRequestDate.value || '').slice(0, 10),
          day: parseInt(source.dayOfWeek, 10),
          period: parseInt(source.period, 10)
        },
        course: {
          className: String(classData.className || '').trim(),
          subject: String(classData.subject || '').trim(),
           attr: String(classData.attr || '').trim(),
           restriction: classData.restriction || '',
           specialTags: classData.specialTags || classData['特殊標記'] || '',
           isPullOut: !!classData.isPullOut,
          isPending: !!classData.isPending,
          isSubstituted: !!classData.isSubstituted
        }
      };
    };
    const triangleCandidateParticipant = (candidate) => candidate ? {
        email: candidate.email,
        teacherName: candidate.teacherName,
        slot: { date: candidate.date, day: candidate.dayOfWeek, period: candidate.period },
        course: {
           className: candidate.className,
           subject: candidate.subject,
           attr: candidate.attr,
           restriction: candidate.restriction || '',
           specialTags: candidate.specialTags || '',
           isPullOut: candidate.isPullOut
        }
       } : null;
    const triangleCandidateIsRestricted = (candidate) => !!(candidate && (
      candidate.restriction === 'restricted'
      || candidate.restriction === '限制'
      || UiLineTemplate.hasScheduleSpecialTag(candidate, '綁課')
    ));
    const triangleParticipants = computed(() => [
      triangleSourceParticipant(),
      triangleCandidateParticipant(triangleCandidateB.value),
      triangleCandidateParticipant(triangleCandidateC.value)
    ]);
    const buildTriangleOccupiedByTeacher = (participants, scheduleGetter) => {
      const list = (participants || []).filter(Boolean);
      const occupied = {};
      const getCell = scheduleGetter || getScheduleForDate;
      list.forEach((participant) => {
        const teacherKey = participant.teacherName || participant.email;
        occupied[teacherKey] = [];
        list.forEach((other) => {
          const cell = getCell(
            participant.email,
            other.slot.date,
            other.slot.period,
            other.slot.day
          );
          if (!cell || (!cell.className && !cell.subject)) return;
          occupied[teacherKey].push({
            teacher: teacherKey,
            date: other.slot.date,
            period: other.slot.period,
            className: cell.className,
            subject: cell.subject
          });
        });
      });
      return occupied;
    };
    const triangleCandidateSearchText = (candidate) => [
      candidate && candidate.teacherName,
      candidate && candidate.email,
      candidate && candidate.className,
      candidate && candidate.subject,
      candidate && candidate.date,
      candidate && candidate.dayOfWeek,
      candidate && candidate.period,
      candidate && getWeekDayText(candidate.dayOfWeek)
    ].map(value => String(value == null ? '' : value).toLowerCase()).join(' ');
    const triangleCandidateOptions = computed(() => {
      const query = String(triangleCandidateSearch.value || '').trim().toLowerCase();
      const list = (triangleCandidates.value || []).slice();
      if (!query) return list;
      return list.filter(candidate => triangleCandidateSearchText(candidate).includes(query));
    });
    const createTriangleScheduleGetter = () => {
      const cache = Object.create(null);
      return (email, date, period, day) => {
        const key = `${String(email || '').toLowerCase()}|${String(date || '').slice(0, 10)}|${parseInt(period, 10)}|${parseInt(day, 10)}`;
        if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
        const cell = getScheduleForDate(email, date, period, day);
        cache[key] = cell;
        return cell;
      };
    };
    const validateTriangleSelection = (candidateB, candidateC, scheduleGetter) => {
      const source = triangleSourceParticipant();
      const b = triangleCandidateParticipant(candidateB);
      const c = triangleCandidateParticipant(candidateC);
      if (!source || !b || !c || !DomainTriangle || !DomainTriangle.buildCycleLegs) {
        return { ok: false, errors: ['三角調資料尚未選完整'] };
      }
      const participants = [source, b, c];
      const legs = DomainTriangle.buildCycleLegs(participants.map((participant) => ({
        teacher: participant.teacherName,
        slot: participant.slot,
        course: participant.course
      })));
      return DomainTriangle.validateTriangle(
        { legs },
        { occupiedByTeacher: buildTriangleOccupiedByTeacher(participants, scheduleGetter) }
      );
    };
    const triangleCandidateCanMoveTo = (candidate, targetSlot, scheduleGetter) => {
      if (!candidate || !targetSlot) return false;
      const sourceSlot = candidate.slot || candidate;
      const destination = targetSlot.slot || targetSlot;
      if (triangleSlotKey(sourceSlot) === triangleSlotKey(destination)) return true;
      const getCell = scheduleGetter || getScheduleForDate;
      const cell = getCell(candidate.email, destination.date, destination.period, destination.day || destination.dayOfWeek);
      return !cell || (!cell.className && !cell.subject && !cell.isPending && !cell.isSubstituted && !cell.isSubstitutionDuty);
    };
    const triangleCandidateSort = (a, b) => {
      const dayA = parseInt(a && a.dayOfWeek, 10) || 99;
      const dayB = parseInt(b && b.dayOfWeek, 10) || 99;
      return dayA - dayB
        || String(a && a.date || '').localeCompare(String(b && b.date || ''))
        || ((parseInt(a && a.period, 10) || 0) - (parseInt(b && b.period, 10) || 0))
        || String(a && a.teacherName || '').localeCompare(String(b && b.teacherName || ''), 'zh-Hant');
    };
    const triangleCandidatePriority = (candidate, availableKey) => {
      if (!candidate || !candidate[availableKey]) return 2;
      return candidate.triangleCanDirectExchange ? 1 : 0;
    };
    const triangleCandidateBPriority = (candidate) =>
      triangleCandidatePriority(candidate, 'triangleHasC');
    const getExchangeWeekDates = () => {
      const dateStr = String(inputRequestDate.value || '').trim();
      if (dateStr && DateUtils && typeof DateUtils.getWeekDatesFrom === 'function') {
        const dates = DateUtils.getWeekDatesFrom(dateStr);
        if (Array.isArray(dates) && dates.length === 5) return dates;
      }
      return currentWeekDates.value || [];
    };

    const triangleDirectExchangeKeys = computed(() => {
      const keys = Object.create(null);
      const source = triangleSourceParticipant();
      const sourceClass = source && source.course ? String(source.course.className || '').trim() : '';
      if (!source || !source.email || !source.slot.date || !sourceClass
          || !DomainMatch || typeof DomainMatch.listExchangeCandidates !== 'function') {
        return keys;
      }
      const directCandidates = DomainMatch.listExchangeCandidates({
        allSchedules: allSchedules.value,
        className: sourceClass,
        leaveEmail: source.email,
        leaveDate: source.slot.date,
        leavePeriod: source.slot.period,
        leaveDay: source.slot.day,
        leaveCell: activeCell.value && activeCell.value.classData
          ? activeCell.value.classData : source.course,
        leaveAttr: source.course.attr,
        weekDates: getExchangeWeekDates(),
        isSingleWeek,
        getScheduleForDate,
        getTeacherNameByEmail,
        awayClasses: isMutualCover.value ? mutualAwayClasses.value : []
      });
      const weekDates = getExchangeWeekDates();
      (directCandidates || []).forEach(candidate => {
        const day = parseInt(candidate.dayOfWeek, 10);
        const date = weekDates[day - 1] || candidate.date || '';
        const key = `${triangleTeacherKey(candidate.teacherEmail)}|${String(date).slice(0, 10)}|${parseInt(candidate.period, 10)}`;
        keys[key] = true;
      });
      return keys;
    });
    const triangleCandidateCOptions = computed(() => {
      const source = triangleSourceParticipant();
      const b = triangleCandidateB.value;
      const sourceTeacher = triangleTeacherKey(source.email || source.teacherName);
      const getCachedSchedule = createTriangleScheduleGetter();
      const bTeacher = b ? triangleTeacherKey(b.email) : '';
      if (!b) return [];
      return triangleCandidateOptions.value
        .filter(candidate => triangleTeacherKey(candidate.email) !== sourceTeacher
          && triangleTeacherKey(candidate.email) !== bTeacher)
        .map(candidate => {
          const canComplete = triangleCandidateCanMoveTo(b, candidate, getCachedSchedule)
            && triangleCandidateCanMoveTo(candidate, source.slot, getCachedSchedule);
          return Object.assign({}, candidate, {
            triangleHasB: canComplete,
            triangleIsRestricted: triangleCandidateIsRestricted(candidate)
          });
        })
        .sort((a, b) => Number(b.triangleHasB) - Number(a.triangleHasB)
          || triangleCandidateSort(a, b));
    });
    const triangleCandidateCReadyCount = computed(() =>
      triangleCandidateCOptions.value.filter(candidate => candidate.triangleHasB).length
    );
    const triangleCandidateBOptions = computed(() => {
      const source = triangleSourceParticipant();
      const allCandidates = triangleCandidates.value || [];
      const getCachedSchedule = createTriangleScheduleGetter();
      const sourceTeacher = triangleTeacherKey(source.email || source.teacherName);
      return triangleCandidateOptions.value
        .filter(candidate => triangleTeacherKey(candidate.email) !== sourceTeacher)
        .map(candidate => {
          const canMoveA = triangleCandidateCanMoveTo(source, candidate, getCachedSchedule);
          const hasC = canMoveA && allCandidates.some(c =>
            triangleTeacherKey(c.email) !== sourceTeacher
            && triangleTeacherKey(c.email) !== triangleTeacherKey(candidate.email)
            && triangleCandidateCanMoveTo(candidate, c, getCachedSchedule)
            && triangleCandidateCanMoveTo(c, source.slot, getCachedSchedule)
          );
          return Object.assign({}, candidate, {
            triangleHasC: hasC,
            triangleCanDirectExchange: !!triangleDirectExchangeKeys.value[candidate.key],
            triangleIsRestricted: triangleCandidateIsRestricted(candidate)
          });
        })
        .sort((a, b) => triangleCandidateBPriority(a) - triangleCandidateBPriority(b)
          || triangleCandidateSort(a, b));
    });
    const triangleCandidateBReadyCount = computed(() =>
      triangleCandidateBOptions.value.filter(candidate => candidate.triangleHasC).length
    );
    const displayedTriangleCOptions = computed(() =>
      triangleCandidateCOptions.value.slice(0, triangleCandidateDisplayCount.value)
    );
    const displayedTriangleBOptions = computed(() =>
      triangleCandidateBOptions.value.slice(0, triangleCandidateDisplayCount.value)
    );
    const selectTriangleCandidateB = (candidate) => {
      if (!candidate || candidate.triangleHasC === false) return;
      trianglePickB.value = candidate.key;
      trianglePickC.value = '';
      triangleCandidateSearch.value = '';
    };
    const selectTriangleCandidateC = (candidate) => {
      if (!candidate || candidate.triangleHasB === false) return;
      trianglePickC.value = candidate.key;
      triangleCandidateSearch.value = '';
    };
    const loadMoreTriangleCandidates = () => {
      const total = triangleCandidateB.value
        ? triangleCandidateCOptions.value.length
        : triangleCandidateBOptions.value.length;
      triangleCandidateDisplayCount.value = Math.min(
        triangleCandidateDisplayCount.value + 18,
        total
      );
    };
    watchFn(triangleCandidateSearch, () => {
      triangleCandidateDisplayCount.value = 18;
    });
    const triangleLegs = computed(() => {
      const participants = triangleParticipants.value;
      if (participants.some((participant) => !participant)) return [];
      if (DomainTriangle && DomainTriangle.buildCycleLegs) {
        return DomainTriangle.buildCycleLegs(participants.map((participant) => ({
          teacher: participant.teacherName,
          slot: participant.slot,
          course: participant.course
        })));
      }
      return [];
    });
    const triangleValidation = computed(() => {
      if (!trianglePickB.value || !trianglePickC.value) {
        return { ok: false, errors: ['請選擇另外兩位教師的有效原課'] };
      }
      if (!DomainTriangle || !DomainTriangle.validateTriangle) {
        return { ok: false, errors: ['三角調模組尚未載入'] };
      }
      return validateTriangleSelection(triangleCandidateB.value, triangleCandidateC.value);
    });
    const trianglePreviewRows = computed(() => triangleLegs.value.map((leg) => ({
      index: leg.index,
      sourceTeacher: leg.sourceTeacher,
      targetTeacher: leg.targetTeacher,
      sourceSlot: leg.sourceSlot,
      targetSlot: leg.targetSlot,
      sourceCourse: leg.sourceCourse
    })));
    const trianglePreviewWeekDates = computed(() => getExchangeWeekDates().map((date, index) => ({
      date,
      day: index + 1,
      weekDay: getWeekDayText(index + 1),
      shortDate: formatDateMMDD(date)
    })));
    const triangleTimetablePreview = computed(() => {
      const participants = triangleParticipants.value;
      if (participants.length !== 3 || participants.some(participant => !participant || !participant.email)) return [];
      const periods = Array.isArray(timetablePeriods) && timetablePeriods.length
        ? timetablePeriods : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
      const dates = trianglePreviewWeekDates.value;
      return participants.map((participant, index) => ({
        role: ['A', 'B', 'C'][index],
        email: participant.email,
        teacherName: participant.teacherName,
        sourceSlot: participant.slot,
        sourceCourse: participant.course,
        targetSlot: participants[(index + 1) % participants.length].slot,
        rows: periods.map(period => ({
          period,
          cells: dates.map(dayInfo => {
            const isMovedFrom = triangleSlotKey(participant.slot) === triangleSlotKey({
              date: dayInfo.date,
              period
            });
            const isMovedTo = triangleSlotKey(participants[(index + 1) % participants.length].slot) === triangleSlotKey({
              date: dayInfo.date,
              period
            });
            const rawCell = getScheduleForDate(participant.email, dayInfo.date, period, dayInfo.day);
            const cell = isMovedTo
              ? participant.course
              : (isMovedFrom ? {} : (rawCell || {}));

    return {
              date: dayInfo.date,
              day: dayInfo.day,
              period,
              className: String(cell.className || '').trim(),
              subject: String(cell.subject || '').trim(),
              attr: String(cell.attr || '').trim(),
              restriction: cell.restriction || '',
              specialTags: cell.specialTags || cell['特殊標記'] || '',
              isPullOut: !!(cell.isPullOut || cell.attr === '抽離'),
              isRestricted: triangleCandidateIsRestricted(cell),
              isPending: !!cell.isPending,
              isSubstituted: !!cell.isSubstituted,
              isMovedFrom,
              isMovedTo
            };
          })
        }))
      }));
    });
    const openTriangleTimetablePreview = () => {
      if (!triangleReady.value) {
        showToastFn('請先選定可完成的 B、C，才能預覽三人課表', 'warning');
        return false;
      }
      showTriangleTimetablePreview.value = true;
      return true;
    };
    const triangleReady = computed(() => !!(triangleValidation.value && triangleValidation.value.ok));
    const resetTriangleDraft = () => {
      trianglePickB.value = '';
      trianglePickC.value = '';
      triangleReason.value = '';
      triangleNote.value = '';
      triangleCandidateSearch.value = '';
      triangleCandidateDisplayCount.value = 18;
    };

    const copyLineMessageForRequest = (req) => {
      const isExchange = isExchangeLikeRequest(req);
      // 待行政核准案件已進入紙本／行政處理階段，不應再帶線上簽核網址。
      const paperFlowRequest = req.status === 'pending_admin'
        || (!isProxySubmitRequest(req) && (isPaperFlowRequest(req) || notificationsSuppressed.value));
      const currentUrl = window.location.origin + window.location.pathname;

      // LINE 按鈕是單筆操作；批次中的其他節次需各自確認，避免誤把整批課程傳給對方。
      let lineText = '';
      if (paperFlowRequest) {
         const rows = [req];
         const first = rows[0];
         const firstIsExchange = first.type === 'exchange' || first.type === '對調';
         const firstSlot = getLineHandledSlot(first);
         const askOptions = {
           targetName: first.targetTeacherName || req.targetTeacherName,
           requesterName: isProxySubmitRequest(first)
             ? (first.requesterName || req.requesterName)
             : '',
           isExchange: firstIsExchange,
            courseTeacherA: first.requesterName || first.originalTeacherName || '',
            courseTeacherB: first.targetTeacherName || first.actualTeacherName || '',
            dateA: firstSlot.date,
           dayA: firstSlot.day,
           periodA: firstSlot.period,
           classA: getOriginalRequestClass(first) || firstSlot.className,
           subjectA: getOriginalRequestSubject(first) || firstSlot.subject
         };
        if (firstIsExchange) {
          askOptions.dateB = first.targetDate;
          askOptions.dayB = first.targetDayOfWeek;
          askOptions.periodB = first.targetPeriod;
          askOptions.classB = getOriginalTargetClass(first) || '';
          askOptions.subjectB = getOriginalTargetSubject(first) || '';
         } else if (rows.length > 1) {
           askOptions.slots = rows.map(row => {
             const slot = getLineHandledSlot(row);
             return {
               date: slot.date,
               day: slot.day,
               period: slot.period,
                className: getOriginalRequestClass(row) || slot.className,
                subject: getOriginalRequestSubject(row) || slot.subject,
                teacherName: row.requesterName || row.originalTeacherName || ''
             };
           });
        }
        lineText = UiLineTemplate.buildAskFirstLineText(askOptions);
      } else if (req.batchId && !isExchange) {
         const slots = [req].map(r => {
           const slot = getLineHandledSlot(r);
           return {
             id: r.id,
             date: slot.date,
             day: slot.day,
             period: slot.period,
              className: getOriginalRequestClass(r) || slot.className,
              subject: getOriginalRequestSubject(r) || slot.subject,
              teacherName: r.requesterName || r.originalTeacherName || ''
           };
         });
        lineText = UiLineTemplate.buildLineBatchInviteText({
          targetName: req.targetTeacherName,
          requesterName: isProxySubmitRequest(req) ? req.requesterName : '',
          reason: req.reason,
          subFee: req.subFee,
           systemUrl: currentUrl,
           batchId: req.batchId,
           paperFlow: paperFlowRequest,
           slots
         });
      } else {
        const agreeLink = `${currentUrl}?action=respond&id=${req.id}&status=agree`;
        const declineLink = `${currentUrl}?action=respond&id=${req.id}&status=decline`;
         const leaveSlot = getLineHandledSlot(req);
         const leaveClass = getOriginalRequestClass(req) || leaveSlot.className;
         const leaveSubject = getOriginalRequestSubject(req) || leaveSlot.subject;
        let swapClass = '';
        let swapSubject = '';
        if (isExchange) {
          swapClass = getOriginalTargetClass(req) || '';
          swapSubject = getOriginalTargetSubject(req) || '';
        }
        lineText = UiLineTemplate.buildLineInviteText({
          targetName: req.targetTeacherName,
          requesterName: isProxySubmitRequest(req) ? req.requesterName : '',
          courseTeacherA: req.requesterName || req.originalTeacherName || '',
          courseTeacherB: req.targetTeacherName || req.actualTeacherName || '',
           dateA: leaveSlot.date,
           dayA: leaveSlot.day,
           periodA: leaveSlot.period,
          classA: leaveClass,
          subjectA: leaveSubject,
          isExchange,
          dateB: req.targetDate,
          dayB: req.targetDayOfWeek,
          periodB: req.targetPeriod,
          classB: swapClass,
           subjectB: swapSubject,
           agreeLink,
           declineLink,
           systemUrl: currentUrl,
           paperFlow: paperFlowRequest
         });
      }

      openLineMessageEditor(lineText, paperFlowRequest ? '送出前先問對方（LINE 範本）' : 'LINE 邀請訊息');
    };

    const findCombinedReturnCandidates = (cell) => {
      const source = cell || {};
      const sourceTeacherKey = String(getTeacherNameByEmail(source.teacherEmail || source.teacherName) || source.teacherEmail || source.teacherName || '')
        .trim().toLowerCase();
      const sourceDay = parseInt(source.dayOfWeek, 10);
      const sourcePeriod = parseInt(source.period, 10);
      const sourceDate = String(inputRequestDate.value || (currentWeekDates.value[sourceDay - 1] || '')).slice(0, 10);
      if (!sourceTeacherKey
          || !Number.isFinite(sourceDay) || !Number.isFinite(sourcePeriod)) return [];

      const availableByTeacher = Object.create(null);
      const candidatesByTeacher = Object.create(null);
      (allSchedules.value || []).forEach(schedule => {
        if (!schedule) return;
        const rawTeacher = String(schedule.teacherEmail || schedule.teacherName || '').trim();
        const teacherKey = String(getTeacherNameByEmail(rawTeacher) || rawTeacher).trim().toLowerCase();
        if (!teacherKey || teacherKey === sourceTeacherKey) return;
        if (parseInt(schedule.dayOfWeek, 10) !== sourceDay
            || parseInt(schedule.period, 10) !== sourcePeriod) return;

        const scheduleClass = String(schedule.className || '').trim();
        // R-v2接線：v1 此處裸引用跨檔全域（production 無此全域，會 ReferenceError；
        // v1 測試靠 vm context 蒙混過關）。v2 改走已 import 的 UiLineTemplate。
        const scheduleTags = UiLineTemplate.getScheduleSpecialTags(schedule);
        const isCombined = isCombinedClassFn(scheduleClass) || scheduleTags.includes('併班');
        // 音樂班等特殊班級的名稱不會與八、九年級班名重疊，不能用班名交集判斷。
        if (!isCombined) return;
        if (schedule.isPatrol || schedule.attr === '巡堂' || schedule.attr === '抽離'
            || scheduleTags.includes('抽離')) return;
        if (sourceDate && DomainSchedule && typeof DomainSchedule.isActiveOnDate === 'function'
            && !DomainSchedule.isActiveOnDate(schedule, sourceDate)) return;
        if (sourceDate && schedule.attr === '單週' && !isSingleWeek(sourceDate)) return;
        if (sourceDate && schedule.attr === '雙週' && isSingleWeek(sourceDate)) return;

        if (availableByTeacher[teacherKey] === undefined) {
          const current = typeof getScheduleForDate === 'function'
            ? getScheduleForDate(rawTeacher, sourceDate, sourcePeriod, sourceDay)
            : null;
          availableByTeacher[teacherKey] = !current
            || (!current.isPending && !current.isSubstituted && !current.isSubstitutionDuty);
        }
        if (!availableByTeacher[teacherKey]) return;

        const rosterTeacher = lookupTeacher2(rawTeacher);
        const candidate = candidatesByTeacher[teacherKey] || {
          email: (rosterTeacher && (rosterTeacher.email || rosterTeacher.teacherName || rosterTeacher.name)) || rawTeacher,
          name: (rosterTeacher && (rosterTeacher.name || rosterTeacher.teacherName))
            || getTeacherNameByEmail(rawTeacher) || rawTeacher,
          classNames: [],
          subjects: []
        };
        if (scheduleClass && !candidate.classNames.includes(scheduleClass)) candidate.classNames.push(scheduleClass);
        const subject = String(schedule.subject || '').trim();
        if (subject && !candidate.subjects.includes(subject)) candidate.subjects.push(subject);
        candidatesByTeacher[teacherKey] = candidate;
      });

      return Object.keys(candidatesByTeacher).map(key => {
        const candidate = candidatesByTeacher[key];
        return Object.assign({}, candidate, {
          teacherName: candidate.name,
          className: candidate.classNames.join('、'),
          subject: candidate.subjects.join('、'),
          dayOfWeek: sourceDay,
          period: sourcePeriod
        });
      }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')
        || String(a.email || '').localeCompare(String(b.email || '')));
    };

    const convertRequestsToSubstitutions = (requests) => {
      const courseMetadataFromCell = (cell) => {
        if (!cell) return null;
        const hasAttributeField = ['attr', '課堂屬性', 'specialTags', '特殊標記', 'isOvertime', 'isSubstitute']
          .some(key => Object.prototype.hasOwnProperty.call(cell, key));
        if (!hasAttributeField) return null;
        const attr = String(cell.attr || cell['課堂屬性'] || '').trim();
        const rawTags = cell.specialTags || cell['特殊標記'] || '';
        const specialTags = FieldMap && typeof FieldMap.normalizeSpecialTags === 'function'
          ? FieldMap.normalizeSpecialTags(rawTags)
          : String(rawTags).split(/[,，、;；\/／|｜\n]+/).map(value => String(value || '').trim())
            .filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join('、');
        const tags = specialTags.split('、').filter(Boolean);
        return {
          courseAttr: attr,
          courseSpecialTags: specialTags,
          courseIsOvertime: cell.isOvertime === true
            || attr.indexOf('超鐘點') >= 0
            || tags.includes('超鐘點'),
          courseIsSubstitute: cell.isSubstitute === true || attr === '代課'
        };
      };
      const withCourseMetadata = (record, cell) => {
        const metadata = courseMetadataFromCell(cell);
        return metadata ? Object.assign(record, metadata) : record;
      };
      const subs = [];
      // date|period → edges（邊組邊查，避免 resolve 每次 O(n) filter）
      const slotIndex = Object.create(null);
      const slotKey = (dateStr, period) => String(dateStr || '') + '|' + (parseInt(period, 10) || 0);
      const pushSub = (rec) => {
        if (!rec) return;
        // Keep non-enumerable legacy aliases for calculation modules; the persisted/API key is the name.
        if (!Object.prototype.hasOwnProperty.call(rec, 'originalTeacherEmail')) {
          Object.defineProperty(rec, 'originalTeacherEmail', {
            configurable: true, enumerable: false, get: () => rec.originalTeacherName || ''
          });
        }
        if (!Object.prototype.hasOwnProperty.call(rec, 'actualTeacherEmail')) {
          Object.defineProperty(rec, 'actualTeacherEmail', {
            configurable: true, enumerable: false, get: () => rec.actualTeacherName || ''
          });
        }
        subs.push(rec);
        const k = slotKey(rec.date, rec.period);
        if (!slotIndex[k]) slotIndex[k] = [];
        slotIndex[k].push(rec);
      };
      const resolveAt = (email, dateStr, period, dayOfWeek) =>
        resolveCell(
          email, dateStr, period, dayOfWeek, subs, slotIndex[slotKey(dateStr, period)] || []
        );

      const approved = (requests || []).filter(r => r && r.status === 'approved');
      // 建立時間優先，讓較早核准的調入可被後續對調引用
      approved.sort((a, b) => {
        const ta = String(a.createdAt || a.requestDate || '');
        const tb = String(b.createdAt || b.requestDate || '');
        if (ta !== tb) return ta.localeCompare(tb);
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

      approved.forEach(req => {
        if (req.type === 'triangle' || req.type === '三角調') {
          // 三角調每條 leg 只建立「目標原課時段」的一組 edge；三條 leg 合併後才是完整循環。
          const triangleSourceCell = resolveAt(
            req.requesterEmail,
            req.requestDate,
            req.requestPeriod,
            req.requestPeriodDay
          );
          pushSub(withCourseMetadata({
            // 直接沿用申請單 ID，列印回寫「是否已印」時可對應到後端原列。
            id: req.id,
            date: req.targetDate,
            period: req.targetPeriod,
            dayOfWeek: req.targetDayOfWeek,
            serial: req.serial || req['單號'] || '',
            originalTeacherName: req.targetTeacherName,
            actualTeacherName: req.requesterName,
            className: req.className || '',
            subject: req.subject || '',
             // 三角調是整堂課跟著來源教師移動，目標欄位只代表接手的時段。
             formClassName: req.className || '',
             formSubject: req.subject || '',
            requestId: req.id,
            batchId: req.batchId || '',
            triangleId: req.triangleId || req.batchId || '',
            triangleSourceDate: req.requestDate,
            triangleSourcePeriod: req.requestPeriod,
            triangleSourceDayOfWeek: req.requestPeriodDay,
            triangleTargetTeacherName: req.targetTeacherName,
            type: 'triangle',
            printed: req.printed,
            subFee: '無',
            reason: req.reason,
            leaveTimeType: '',
            leaveTime: '',
            note: req.note
          }, triangleSourceCell));
        } else if (req.type === 'substitution' || req.type === '代課') {
          // 請假節可能本身已是調入課：班科以有效課為準，缺才用申請單
          let leaveDay = req.requestPeriodDay;
          if ((leaveDay == null || leaveDay === '') && req.requestDate) {
            const d = new Date(String(req.requestDate).replace(/-/g, '/'));
            if (!Number.isNaN(d.getTime())) leaveDay = d.getDay() === 0 ? 7 : d.getDay();
          }
          const leaveCell = resolveAt(
            req.requesterEmail,
            req.requestDate,
            req.requestPeriod,
            leaveDay
          );
          // 空堂排班：班科以申請單為準（無基礎課可疊）。
          const emptyAssign = !!(req.isEmptySlotAssign
            || String(req.reason || '').trim() === '空堂排班'
            || String(req.note || '').indexOf('[空堂排班]') >= 0);
          const leaveCellIsTask = isEmptySlotAssignmentRequest(leaveCell);
          const leaveBaseCell = leaveCellIsTask && typeof findBase === 'function'
            ? findBase(req.requesterEmail, leaveDay, req.requestPeriod, req.requestDate)
            : null;
          // 空堂巡堂任務不是被代課程；再辦申請要保留原班科，真正的代課調入仍優先。
          const leaveCourse = DomainSchedule && DomainSchedule.resolveSubstitutionCourse
            ? DomainSchedule.resolveSubstitutionCourse(req, leaveCell, leaveBaseCell, emptyAssign)
            : {
              className: emptyAssign ? (req.className || '') : ((leaveCell && leaveCell.className) || req.className || ''),
              subject: emptyAssign ? (req.subject || '') : ((leaveCell && leaveCell.subject) || req.subject || '')
            };
          const leaveCls = leaveCourse.className;
          const leaveSubj = leaveCourse.subject;
          const leaveMetadataCell = leaveCellIsTask ? leaveBaseCell : leaveCell;
           pushSub(withCourseMetadata({
             id: req.id,
             date: req.requestDate,
             period: req.requestPeriod,
             serial: req.serial || req['單號'] || '',
             originalTeacherName: req.requesterName,
             actualTeacherName: req.actualTeacherName || req.targetTeacherName || '',
            className: leaveCls,
            subject: leaveSubj,
            requestId: req.id,
            batchId: req.batchId || '',
             type: req.type === 'triangle' ? 'triangle' : 'substitution',
             triangleId: req.triangleId || '',
             triangleLegIndex: req.triangleLegIndex,
            printed: req.printed,
            subFee: req.subFee,
            reason: req.reason,
            leaveTimeType: req.leaveTimeType || '',
            leaveTime: req.leaveTime || '',
              courseAdjustmentOnly: isCourseAdjustmentOnlyRequest(req),
             note: req.note,
             specialFlow: req.specialFlow || '',
             isEmptySlotAssign: emptyAssign
            }, emptyAssign ? leaveCell : leaveMetadataCell));
        } else if (req.type === 'exchange' || req.type === '對調') {
          // 請假節若已是「代課／調入義務」（空堂代生物），再調出必須寫生物，不可回退基礎數學
          // 否則科目＝自己的基礎／專長
          let dayNum = req.targetDayOfWeek;
          if ((dayNum == null || dayNum === '') && req.targetDate) {
            const d = new Date(String(req.targetDate).replace(/-/g, '/'));
            if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
          }
          let leaveDay = req.requestPeriodDay;
          if ((leaveDay == null || leaveDay === '') && req.requestDate) {
            const d2 = new Date(String(req.requestDate).replace(/-/g, '/'));
            if (!Number.isNaN(d2.getTime())) leaveDay = d2.getDay() === 0 ? 7 : d2.getDay();
          }
          const ownSubject = (email, dateStr, period, day) => {
            let base = null;
            if (typeof findBase === 'function') {
              base = findBase(email, day, period, dateStr);
            }
            return (base && base.subject)
              || (typeof getTeacherSubjectByEmail === 'function' ? getTeacherSubjectByEmail(email) : '')
              || '';
          };
          const leaveEff = resolveAt(
            req.requesterEmail, req.requestDate, req.requestPeriod, leaveDay
          );
          const targetEff = resolveAt(
            req.targetTeacherEmail, req.targetDate, req.targetPeriod, dayNum
          );
          const leaveCellIsTask = isEmptySlotAssignmentRequest(leaveEff);
          const targetCellIsTask = isEmptySlotAssignmentRequest(targetEff);
          const leaveBaseCell = leaveCellIsTask && typeof findBase === 'function'
            ? findBase(req.requesterEmail, leaveDay, req.requestPeriod, req.requestDate)
            : null;
          const targetBaseCell = targetCellIsTask && typeof findBase === 'function'
            ? findBase(req.targetTeacherEmail, dayNum, req.targetPeriod, req.targetDate)
            : null;
          // 網頁課表顯示調課後的實際安排：教師帶著自己的班級／科目換到對方時段。
          // 僅「代課義務」再調課：優先使用有效的義務班科。
          const leaveSubDuty = !!(!leaveCellIsTask && leaveEff && leaveEff.fromSub && (
            leaveEff.dutyType === 'substitution' || leaveEff.dutyType === '代課'
          ));
          const leaveCls = leaveSubDuty
            ? ((leaveEff && leaveEff.className) || req.className || '')
            : (req.className || (leaveCellIsTask && leaveBaseCell && leaveBaseCell.className)
              || (!leaveCellIsTask && leaveEff && leaveEff.className) || '');
          const leaveSubj = leaveSubDuty
            ? ((leaveEff && leaveEff.subject) || req.subject || '')
            : (req.subject
              || (leaveCellIsTask && leaveBaseCell && leaveBaseCell.subject)
              || (!leaveCellIsTask && leaveEff && leaveEff.subject)
              || ownSubject(req.requesterEmail, req.requestDate, req.requestPeriod, leaveDay)
              || '');
          const targetSubDuty = !!(!targetCellIsTask && targetEff && targetEff.fromSub && (
            targetEff.dutyType === 'substitution' || targetEff.dutyType === '代課'
          ));
          const targetCls = targetSubDuty
            ? ((targetEff && targetEff.className) || req.targetClassName || '')
            : (req.targetClassName || (targetCellIsTask && targetBaseCell && targetBaseCell.className)
              || (!targetCellIsTask && targetEff && targetEff.className) || '');
          const targetSubj = targetSubDuty
            ? ((targetEff && targetEff.subject) || req.targetSubject || '')
            : (req.targetSubject
              || (targetCellIsTask && targetBaseCell && targetBaseCell.subject)
              || (!targetCellIsTask && targetEff && targetEff.subject)
              || ownSubject(req.targetTeacherEmail, req.targetDate, req.targetPeriod, dayNum)
              || '');
          const leaveMetadataCell = leaveCellIsTask ? leaveBaseCell : leaveEff;
          const targetMetadataCell = targetCellIsTask ? targetBaseCell : targetEff;

          var classStayFlow = String(req.specialFlow || req['特殊流程'] || '') === 'admin_same_period_exchange'
            || String(req.specialFlow || req['特殊流程'] || '') === 'teacher_swap';
          if (classStayFlow) {
            // 班留原時段（同節互換／特殊對調人走班留）：兩邊原班級留在原日期節次，只換老師。
            pushSub(withCourseMetadata({
              id: req.id + '_1',
              date: req.requestDate,
              period: req.requestPeriod,
              serial: req.serial || req['單號'] || '',
              originalTeacherName: req.requesterName,
              actualTeacherName: req.targetTeacherName,
              className: leaveCls,
              subject: leaveSubj,
              formClassName: leaveCls,
              formSubject: leaveSubj,
              requestId: req.id,
              batchId: req.batchId || '',
              type: 'exchange',
              printed: req.printed,
              subFee: '無',
              reason: req.reason,
              leaveTimeType: '',
              leaveTime: '',
              note: req.note
            }, leaveMetadataCell));
            pushSub(withCourseMetadata({
              id: req.id + '_2',
              date: req.targetDate,
              period: req.targetPeriod,
              serial: req.serial || req['單號'] || '',
              originalTeacherName: req.targetTeacherName,
              actualTeacherName: req.requesterName,
              className: targetCls,
              subject: targetSubj,
              formClassName: targetCls,
              formSubject: targetSubj,
              requestId: req.id,
              batchId: req.batchId || '',
              type: 'exchange',
              printed: req.printed,
              subFee: '無',
              reason: req.reason,
              leaveTimeType: '',
              leaveTime: '',
              note: req.note
            }, targetMetadataCell));
            return;
          }

          // _1：目標日由申請人上自己的原課程。
           pushSub(withCourseMetadata({
             id: req.id + '_1',
             date: req.targetDate,
             period: req.targetPeriod,
             serial: req.serial || req['單號'] || '',
             originalTeacherName: req.targetTeacherName,
             actualTeacherName: req.requesterName,
             className: leaveCls,
             subject: leaveSubj,
             // 列印調代課單仍要顯示目標位置原本的班級／科目。
             formClassName: targetCls,
             formSubject: targetSubj,
             requestId: req.id,
             batchId: req.batchId || '',
             type: 'exchange',
             printed: req.printed,
             subFee: '無',
             reason: req.reason,
             leaveTimeType: req.leaveTimeType || '',
             leaveTime: req.leaveTime || '',
             note: req.note
           }, leaveMetadataCell));

          // _2：原異動日由受邀人上自己的原課程。
          pushSub(withCourseMetadata({
            id: req.id + '_2',
            date: req.requestDate,
            period: req.requestPeriod,
            serial: req.serial || req['單號'] || '',
            originalTeacherName: req.requesterName,
            actualTeacherName: req.targetTeacherName,
            className: targetCls,
            subject: targetSubj,
            // 列印調代課單仍要顯示申請人原位置的班級／科目。
            formClassName: leaveCls,
            formSubject: leaveSubj,
            requestId: req.id,
            batchId: req.batchId || '',
            type: 'exchange',
            printed: req.printed,
            subFee: '無',
            reason: req.reason,
            leaveTimeType: req.leaveTimeType || '',
            leaveTime: req.leaveTime || '',
            note: req.note
          }, targetMetadataCell));
        }
      });
      return subs;
    };

    // 2A：再異動前次義務解析自 app.js 搬移（吃 substitutionRecords ref，本 create 既有）
    const findPriorDutyAtSlot = (email, dateStr, period, excludeId, excludeRequestId) => {
      const em = String(email || '').toLowerCase();
      const p = parseInt(period, 10);
      const dk = String(dateStr || '');
      if (!em || !dk || Number.isNaN(p)) return null;
      const all = substitutionRecords.value || [];
      for (let i = all.length - 1; i >= 0; i--) {
        const s = all[i];
        if (!s || (excludeId && s.id === excludeId)) continue;
        if (excludeRequestId && String(s.requestId || '') === String(excludeRequestId)) continue;
        if (String(s.date) !== dk || parseInt(s.period, 10) !== p) continue;
        if (s.actualTeacherEmail && String(s.actualTeacherEmail).toLowerCase() === em
            && (s.className || s.subject)) {
          return s;
        }
      }
      return null;
    };

    /**
     * 歷史「請假課堂」班科：
     * 1) 申請單／歷史列已寫的 className+subject（請假課堂本身）
     * 2) 同節先前代課義務（空堂代生物再調出）
     * 3) 請假師該節基礎課（不可用專長欄當主標）
     */
    const resolveHistoryLeaveClassSubject = (rec) => {
      if (!rec) return { className: '', subject: '', priorDuty: null };
      const dateStr = String(rec.requestDate || rec.date || '');
      const period = rec.requestPeriod != null ? rec.requestPeriod : rec.period;
      const p = parseInt(period, 10);
      const em = String(rec.originalTeacherEmail || rec.requesterEmail || '').toLowerCase();
      // 歷史 mapped 列已對齊請假班科時直接用
      let clsName = String(rec.className || '').trim();
      let subj = String(rec.subject || '').trim();
      if (clsName && subj) {
        return { className: clsName, subject: subj, priorDuty: null };
      }
      if (!em || !dateStr || Number.isNaN(p)) {
        return { className: clsName, subject: subj, priorDuty: null };
      }
      const priorDuty = findPriorDutyAtSlot(em, dateStr, period, rec.id);
      // 僅「代課義務」覆蓋；對調 edge 已保存該日期原課，不可互相覆蓋。
      if (priorDuty && (priorDuty.type === 'substitution' || priorDuty.type === '代課')) {
        return {
          className: priorDuty.className || clsName,
          subject: priorDuty.subject || subj,
          priorDuty
        };
      }
      let dayNum = null;
      const d = new Date(dateStr.replace(/-/g, '/'));
      if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      const base = typeof findBaseScheduleSlot === 'function'
        ? findBaseScheduleSlot(em, dayNum, period, dateStr)
        : null;
      if (!clsName && base) clsName = base.className || '';
      if (!subj && base) subj = base.subject || '';
      return { className: clsName, subject: subj, priorDuty: null };
    };

    // 2A：綁課判定自 app.js 搬移（findPriorDutyAtSlot／findBaseScheduleSlot／isExchangeLikeRequest 本作用域既有）
    const cellIsRestricted = (cell) => !!(cell && (cell.restriction === 'restricted' || cell.restriction === '限制'));

    const isLeaveClassRestricted = (req) => {
      if (!req || !req.requesterEmail || !req.requestPeriod) return false;
      // 申請中：以請假人該節有效義務／基礎限制
      const prior = findPriorDutyAtSlot(
        req.requesterEmail, req.requestDate, req.requestPeriod, null, req.id
      );
      let dayNum = req.requestPeriodDay;
      if ((dayNum == null || dayNum === '') && req.requestDate) {
        const d = new Date(String(req.requestDate).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      if (prior) {
        return cellIsRestricted(
          findBaseScheduleSlot(prior.originalTeacherEmail, dayNum, req.requestPeriod, req.requestDate)
        );
      }
      return cellIsRestricted(
        findBaseScheduleSlot(req.requesterEmail, dayNum, req.requestPeriod, req.requestDate)
      );
    };

    const isExchangeClassRestricted = (req) => {
      if (!req || !isExchangeLikeRequest(req) || !req.targetTeacherEmail || !req.targetPeriod) return false;
      let dayNum = req.targetDayOfWeek;
      if ((dayNum == null || dayNum === '') && req.targetDate) {
        const d = new Date(String(req.targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      const prior = findPriorDutyAtSlot(
        req.targetTeacherEmail, req.targetDate, req.targetPeriod, null, req.id
      );
      if (prior) {
        return cellIsRestricted(
          findBaseScheduleSlot(prior.originalTeacherEmail, dayNum, req.targetPeriod, req.targetDate)
        );
      }
      return cellIsRestricted(
        findBaseScheduleSlot(req.targetTeacherEmail, dayNum, req.targetPeriod, req.targetDate)
      );
    };

    /** 有效課的綁課：義務課看原課老師該節限制；否則看本師基礎 */
    const resolveRestrictionForHistoryRec = (rec, side) => {
      // side: 'leave' | 'exchange'
      if (!rec) return false;
      let dateStr, period, email, excludeId, prior;
      if (side === 'exchange') {
        dateStr = rec.targetDate || '';
        period = rec.targetPeriod;
        // peer 列：原師＝對方
        if (rec.requestId) {
          const peer = (substitutionRecords.value || []).find(x =>
            x && x.requestId === rec.requestId && x.id !== rec.id
          );
          if (peer) {
            dateStr = peer.date || dateStr;
            period = peer.period != null ? peer.period : period;
            email = peer.originalTeacherEmail;
            excludeId = peer.id;
            prior = findPriorDutyAtSlot(email, dateStr, period, excludeId);
            if (prior) {
              // 義務課綁課＝義務原師在該節的基礎限制
              let dayNum = null;
              const d = new Date(String(dateStr).replace(/-/g, '/'));
              if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
              const base = findBaseScheduleSlot(prior.originalTeacherEmail, dayNum, period, dateStr);
              return cellIsRestricted(base);
            }
            let dayNum2 = null;
            const d2 = new Date(String(dateStr).replace(/-/g, '/'));
            if (!Number.isNaN(d2.getTime())) dayNum2 = d2.getDay() === 0 ? 7 : d2.getDay();
            return cellIsRestricted(findBaseScheduleSlot(email, dayNum2, period, dateStr));
          }
        }
        email = rec.actualTeacherEmail || rec.targetTeacherEmail;
        dateStr = rec.targetDate || dateStr;
        period = rec.targetPeriod != null ? rec.targetPeriod : period;
      } else {
        dateStr = rec.requestDate || rec.date || '';
        period = rec.requestPeriod != null ? rec.requestPeriod : rec.period;
        email = rec.originalTeacherEmail || rec.requesterEmail;
        excludeId = rec.id;
        prior = findPriorDutyAtSlot(email, dateStr, period, excludeId);
        if (prior) {
          let dayNum = null;
          const d = new Date(String(dateStr).replace(/-/g, '/'));
          if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
          // 空堂代生物再調出：綁課看「生物」原課老師該節，不是 A 的數學
          const base = findBaseScheduleSlot(prior.originalTeacherEmail, dayNum, period, dateStr);
          return cellIsRestricted(base);
        }
      }
      if (!email || !dateStr || period == null) return false;
      let dayNum = null;
      const d = new Date(String(dateStr).replace(/-/g, '/'));
      if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      return cellIsRestricted(findBaseScheduleSlot(email, dayNum, period, dateStr));
    };

    const isHistoryLeaveRestricted = (rec) => {
      if (!rec) return false;
      // history 列可能只有 date/period
      const dateStr = rec.requestDate || rec.date;
      const period = rec.requestPeriod != null ? rec.requestPeriod : rec.period;
      if (!rec.originalTeacherEmail || !dateStr || period == null) return false;
      return resolveRestrictionForHistoryRec(
        Object.assign({}, rec, { requestDate: dateStr, requestPeriod: period }),
        'leave'
      );
    };

    const isHistoryExchangeRestricted = (rec) => {
      if (!rec || !isExchangeLikeRequest(rec) || !rec.targetDate || rec.targetDate === '—' || rec.targetPeriod == null) {
        return false;
      }
      return resolveRestrictionForHistoryRec(rec, 'exchange');
    };

    // 2A：再異動判定簇自 app.js 搬移（substitutionRecords／requestsList 本作用域既有）
    /** 再異動判斷用：同一申請的 _1／_2 邊不可算成自己的前一筆。 */
    const normalizeRechangeRequestId = (value) => String(value || '').trim().replace(/_(?:class_)?[12]$/, '');
    /** 只有已核准生效的異動才會成為下一筆的前次異動。 */
    const isEffectiveChangedDuty = (record) => {
      if (!record || record.enabled === false || record.isPaperDraft) return false;
      const recordRequestId = normalizeRechangeRequestId(record.requestId || record.id);
      let rawStatus = record.status;
      if (rawStatus == null || String(rawStatus).trim() === '') rawStatus = record['狀態'];

      // 以申請單最新狀態為準，避免已核准後撤回／駁回的舊紀錄仍被算入。
      if (recordRequestId && typeof requestsList !== 'undefined'
          && requestsList && Array.isArray(requestsList.value)) {
        const request = requestsList.value.find(row =>
          row && normalizeRechangeRequestId(row.id || row.requestId) === recordRequestId
        );
        const requestStatus = request && (request.status || request['狀態']);
        if (requestStatus != null && String(requestStatus).trim() !== '') rawStatus = requestStatus;
      }

      const status = String(rawStatus == null ? '' : rawStatus).trim().toLowerCase();
      if (!status) return true; // 舊歷史列沒有狀態欄時，沿用既有有效紀錄。
      return [
        'approved', 'active', 'effective', 'approved_active',
        '核准生效', '已核准', '核准', '已生效', '生效', '有效', '啟用'
      ].includes(status);
    };
    const hasOtherChangedDutyAtSlot = (email, dateStr, period, excludeRequestId) => {
      const em = String(email || '').trim().toLowerCase();
      const dk = String(dateStr || '').trim();
      const p = parseInt(period, 10);
      const excluded = normalizeRechangeRequestId(excludeRequestId);
      if (!em || !dk || Number.isNaN(p)) return false;
      return (substitutionRecords.value || []).some(s => {
        if (!isEffectiveChangedDuty(s)) return false;
        const rowRequestId = normalizeRechangeRequestId(s.requestId || s.id);
        if (excluded && rowRequestId === excluded) return false;
        if (String(s.date || s.requestDate || '').trim() !== dk) return false;
        if (parseInt(s.period != null ? s.period : s.requestPeriod, 10) !== p) return false;
        if (!(s.className || s.subject)) return false;
        const original = String(s.originalTeacherEmail || '').trim().toLowerCase();
        const actual = String(s.actualTeacherEmail || '').trim().toLowerCase();
        return original === em || actual === em;
      });
    };

    /** 原始位置是否為「再異動」；請假與調課都套用同一規則。 */
    const isHistoryLeaveRechanged = (rec) => {
      if (!rec) return false;
      const dateStr = String(rec.date || rec.requestDate || '');
      const period = rec.period != null ? rec.period : rec.requestPeriod;
      const em = rec.originalTeacherEmail || rec.requesterEmail;
      return hasOtherChangedDutyAtSlot(em, dateStr, period, rec.requestId || rec.id);
    };

    /** 對調目標位置是否為「再異動」；只看目標端，不把標籤放到原始端。 */
    const isHistoryExchangeRechanged = (rec) => {
      if (!rec || !isExchangeLikeRequest(rec)) return false;
      const requestId = rec.requestId || rec.id;
      const all = substitutionRecords.value || [];
      const targetEdge = requestId
        ? all.find(x => x && x.requestId === requestId && String(x.id || '').endsWith('_1'))
          || all.find(x => x && x.requestId === requestId && x.id !== rec.id)
        : null;
      const targetDate = (targetEdge && targetEdge.date) || rec.targetDate;
      const targetPeriod = targetEdge && targetEdge.period != null ? targetEdge.period : rec.targetPeriod;
      const targetTeacher = (targetEdge && targetEdge.originalTeacherEmail)
        || rec.targetTeacherEmail
        || rec.actualTeacherEmail;
      return hasOtherChangedDutyAtSlot(targetTeacher, targetDate, targetPeriod, requestId);
    };

    /** 申請單：原始位置是否再異動（進行中列表用）。 */
    const isRequestLeaveRechanged = (req) => {
      if (!req) return false;
      const sourceDate = req.requestDate || req.date;
      const sourcePeriod = req.requestPeriod != null ? req.requestPeriod : req.period;
      const sourceTeacher = req.requesterEmail || req.originalTeacherEmail;
      return hasOtherChangedDutyAtSlot(sourceTeacher, sourceDate, sourcePeriod, req.id);
    };

    /** 申請單：對調目標節是否再異動（進行中列表用）。 */
    const isRequestExchangeRechanged = (req) => {
      if (!req || !isExchangeLikeRequest(req)) return false;
      if (!req.targetTeacherEmail || !req.targetDate) return false;
      return hasOtherChangedDutyAtSlot(req.targetTeacherEmail, req.targetDate, req.targetPeriod, req.id);
    };

    // 2A：歷史 slot 顯示自 app.js 搬移（顯示文字走 UiLineTemplate／DateUtils，呼叫期解析）
    const formatHistoryLeaveSlot = (rec) => {
      if (!rec) return '—';
      const dateStr = rec.requestDate || rec.date || '';
      const period = rec.requestPeriod != null ? rec.requestPeriod : rec.period;
      let dayNum = null;
      if (dateStr) {
        const d = new Date(String(dateStr).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
      }
      const day = dayNum != null ? DateUtils.getWeekDayText(dayNum) : '—';
      const resolved = resolveHistoryLeaveClassSubject(rec);
       const cls = UiLineTemplate.formatCourseDisplayText(resolved.className, resolved.subject);
       return UiLineTemplate._fmtSlot(dateStr, day, period, cls || '');
    };

    /**
     * 對調目標節：受邀人在該日該節的「有效課」
     * 含已核准調入／代課；不可只查基礎課表（調入格無基礎列會查空）
     */
    const formatHistoryExchangeSlot = (rec) => {
      if (!rec || !isExchangeLikeRequest(rec)) return '—';
      if (UiListHelpers.isTriangleRequest(rec)) {
        const dateStr = rec.targetDate || rec.date || '';
        let dayNum = rec.targetDayOfWeek;
        if ((dayNum == null || dayNum === '') && dateStr) {
          const d = new Date(String(dateStr).replace(/-/g, '/'));
          if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
        }
        const movedCourse = UiLineTemplate.formatCourseDisplayText(rec.className, rec.subject);
        return UiLineTemplate._fmtSlot(dateStr, dayNum != null ? DateUtils.getWeekDayText(dayNum) : '—', rec.targetPeriod || rec.period, movedCourse);
      }
      let targetDate = rec.targetDate;
      let targetPeriod = rec.targetPeriod;
      let clsName = String(rec.targetClassName || '').trim();
      let subj = String(rec.targetSubject || '').trim();
      // 有完整 target 班科（mapped 已對齊）直接顯示
      if (targetDate && targetDate !== '---' && targetDate !== '—' && (clsName || subj)) {
        let dayNum = null;
        const d = new Date(String(targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d.getTime())) dayNum = d.getDay() === 0 ? 7 : d.getDay();
        const day = dayNum != null ? DateUtils.getWeekDayText(dayNum) : '—';
         const cls = UiLineTemplate.formatCourseDisplayText(clsName, subj);
         return UiLineTemplate._fmtSlot(targetDate, day, targetPeriod, cls || '');
      }
      // 備援：目標日 edge _1 的班科就是目標位置原本的課堂。
      let peerTargetEdge = null;
      if (rec.requestId) {
        const peers = (substitutionRecords.value || []).filter(x =>
          x && x.requestId === rec.requestId
        );
        peerTargetEdge = peers.find(x => String(x.id || '').endsWith('_1'))
          || peers.find(x => x.id !== rec.id)
          || null;
        if (peerTargetEdge) {
          if (!targetDate || targetDate === '---' || targetDate === '—') {
            targetDate = peerTargetEdge.date;
            targetPeriod = peerTargetEdge.period;
          }
          if (!clsName) clsName = String(peerTargetEdge.className || '').trim();
          if (!subj) subj = String(peerTargetEdge.subject || '').trim();
        }
      }
      // 再備援：受邀人目標節基礎課
      if ((!clsName || !subj) && rec.actualTeacherEmail && targetDate && targetPeriod != null) {
        let dayNum = null;
        const d2 = new Date(String(targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d2.getTime())) dayNum = d2.getDay() === 0 ? 7 : d2.getDay();
        const cell = resolveExchangeTargetCell(
          rec.actualTeacherEmail, targetDate, targetPeriod, dayNum
        );
        if (cell) {
          if (!clsName) clsName = cell.className || '';
          if (!subj) subj = cell.subject || '';
        }
      }
      let dayNumOut = null;
      if (targetDate && targetDate !== '—' && targetDate !== '---') {
        const d3 = new Date(String(targetDate).replace(/-/g, '/'));
        if (!Number.isNaN(d3.getTime())) dayNumOut = d3.getDay() === 0 ? 7 : d3.getDay();
      }
      const day = dayNumOut != null ? DateUtils.getWeekDayText(dayNumOut) : '—';
       const cls = UiLineTemplate.formatCourseDisplayText(clsName, subj);
       return UiLineTemplate._fmtSlot(targetDate, day, targetPeriod, cls || '');
    };

    /** 暫定草稿 key → draft（建 grid 時一次索引，避免每格 find） */
    var mutualDraftIndex = computed(function () {
      var map = {};
      if (!isMutualCover.value) return map;
      (deps.mutualDrafts && deps.mutualDrafts.value ? deps.mutualDrafts.value : []).forEach(function (d) {
        if (d && d.key) map[d.key] = d;
      });
      return map;
    });

    function draftAt(leaveEmail, dateStr, period) {
      if (!isMutualCover.value) return null;
      var key = (UiMutualPanelState && UiMutualPanelState.mutualDraftKey)
        ? UiMutualPanelState.mutualDraftKey(leaveEmail, dateStr, period)
        : (String(leaveEmail || '').toLowerCase() + '|' + dateStr + '|' + period);
      return mutualDraftIndex.value[key] || null;
    }

    var weekScheduleGrid = computed(function () {
      // 明確依賴索引／lookup，避免 memo 命中時漏追蹤、異動後不重畫
      void pendingIndex.value;
      void scheduleIndex.value;
      void schoolSwapIndex.value;
      void substitutionsLookup.value;
      void mutualDraftIndex.value;
      void batchSelectMode.value;
      var grid = {};
      var teachers = displayTimetableTeachers.value || [];
      var dates = currentWeekDates.value || [];
      var mutualOn = !!isMutualCover.value;
      teachers.forEach(function (t) {
        if (!t || !t.email) return;
        var row = {};
        for (var day = 1; day <= 5; day++) {
          var dateStr = dates[day - 1];
          if (!dateStr) continue;
          var periodList = (DateUtils && DateUtils.getTimetablePeriods)
            ? DateUtils.getTimetablePeriods()
             : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
          for (var pi = 0; pi < periodList.length; pi++) {
            var period = periodList[pi];
            var cell = getScheduleForDate(t.email, dateStr, period, day);
            var draft = mutualOn ? draftAt(t.email, dateStr, period) : null;
            var batchOn = batchSelectMode.value && isBatchSlotSelected(t.email, dateStr, period);
             var awayLabel = !!(cell && cell.className && (isAwayClassCell(cell.className, dateStr, period) || cell.isClassAway) && !draft);
            var cls = cellClassFromCell(cell, !!draft, batchOn, awayLabel);
            var feeShort = '';
            if (draft) {
              if (draft.fee === '扣額度' || draft.fee === '互代不結') feeShort = '互代';
              else if (draft.fee === '第8節代課') feeShort = '第8節';
              else if (FeeUtils && FeeUtils.isTimetableOnlyFee
                && FeeUtils.isTimetableOnlyFee(draft.fee)) feeShort = '課表';
              else feeShort = '公費';
            }
            row[day + '-' + period] = {
              cell: cell,
              cls: cls,
              draft: draft,
              draftSubName: draft ? (draft.subName || '') : '',
              draftFeeShort: feeShort,
              isAwayLabel: awayLabel && !!(mutualOn || cell.isClassAway)
            };
          }
        }
        grid[t.email] = row;
        var low = String(t.email).toLowerCase();
        if (low !== t.email) grid[low] = row;
      });
      return grid;
    });

    function cellFromGrid(email, day, period) {
      var g = weekScheduleGrid.value;
      if (!g || !email) return null;
      var row = g[email] || g[String(email).toLowerCase()];
      var slot = row ? row[day + '-' + period] : null;
      if (!slot) return null;
      // 相容：舊呼叫端期待 cell 本體
      return slot.cell !== undefined ? slot.cell : slot;
    }

    function slotFromGrid(email, day, period) {
      var g = weekScheduleGrid.value;
      if (!g || !email) return null;
      var row = g[email] || g[String(email).toLowerCase()];
      return row ? (row[day + '-' + period] || null) : null;
    }

    function cellClassFromCell(cell, draftOn, batchOn, awayOn) {
      var batchCls = batchOn ? ' is-batch-selected' : '';
      if (!cell) return 'is-empty' + batchCls;
       if (cell.isPending) {
         if (cell.pendingType === 'combined_return_out') return 'is-pending-sub-out is-pending-combined-return-out' + batchCls;
         if (cell.pendingType === 'substitution_out') return 'is-pending-sub-out' + batchCls;
         if (cell.pendingType === 'substitution_in') return 'is-pending-sub-in' + batchCls;
         if (cell.pendingType === 'exchange_out') return 'is-pending-exc-out' + batchCls;
         if (cell.pendingType === 'exchange_in') return 'is-pending-exc-in' + batchCls;
         if (cell.pendingType === 'triangle' || cell.pendingType === 'triangle_out') return 'is-pending-exc-out' + batchCls;
         if (cell.pendingType === 'triangle_in') return 'is-pending-exc-in' + batchCls;
       }
       if (cell.hasConcurrentDuty) return 'is-concurrent-duty' + batchCls;
       if (cell.isReturnDuty) return 'has-class is-return-duty' + batchCls;
       if (cell.hasMultipleOutgoing) return ((cell.subType === 'exchange' || cell.subType === 'triangle') ? 'is-exchange-out' : 'is-substituted-out') + batchCls;
       if (cell.isSubstituted) {
         return ((cell.subType === 'exchange' || cell.subType === 'triangle') ? 'is-exchange-out' : 'is-substituted-out') + batchCls;
       }
       if (cell.isSubstitutionDuty) {
         var baseCls = (cell.subType === 'exchange' || cell.subType === 'triangle') ? 'is-exchange-in' : 'is-substituted-in';
        if (awayOn || cell.isClassAway) {
          baseCls += ' is-away-vacant';
        }
        return baseCls + batchCls;
      }
      if (draftOn) return 'is-mutual-draft' + batchCls;
      if (awayOn || cell.isClassAway) return 'is-away-class' + batchCls;
      if (cell.isPatrol || cell.attr === '巡堂') return 'is-patrol' + batchCls;
      if (cell.isPullOut || cell.attr === '抽離') return 'is-pullout has-class' + batchCls;
      // 超鐘點：外觀與一般課相同，僅課名後標（超）
      if (cell.attr === '實支') return 'is-elastic' + batchCls;
      return 'has-class' + batchCls;
    }

     function isAwayClassCell(className, dateStr, period) {
      if (!className) return false;
      var cls = String(className).trim();
      if (!cls) return false;
       if (isClassAwayOnDate(cls, dateStr, period)) return true;
      if (!isMutualCover.value) return false;
       if (!(mutualAwayClasses.value || []).includes(cls)) return false;
       var start = mutualActivityStart.value;
       var end = mutualActivityEnd.value;
       if (DAC() && DAC().isDateInRange) {
         if (!DAC().isDateInRange(dateStr, start, end)) return false;
         return !isMutualActivitySlotInRange || isMutualActivitySlotInRange(dateStr, period);
       }
       var d = String(dateStr || '').slice(0, 10);
       if (start && d < start) return false;
       if (end && d > end) return false;
       return !isMutualActivitySlotInRange || isMutualActivitySlotInRange(dateStr, period);
    }

    function getClassCellClassForDate(teacherEmail, dateStr, period, dayOfWeek) {
      var slot = slotFromGrid(teacherEmail, dayOfWeek, period);
      if (slot && slot.cls) return slot.cls;
      var cell = getScheduleForDate(teacherEmail, dateStr, period, dayOfWeek);
      var draftOn = isMutualCover.value && !!draftAt(teacherEmail, dateStr, period);
      var batchOn = batchSelectMode.value && isBatchSlotSelected(teacherEmail, dateStr, period);
      var cls = cellClassFromCell(cell, draftOn, batchOn);
       if (cell && (isAwayClassCell(cell.className, dateStr, period) || cell.isClassAway) && !draftOn && !cell.isPending && !cell.isSubstituted && !cell.isSubstitutionDuty) {
        return 'is-away-class' + (batchOn ? ' is-batch-selected' : '');
      }
      return cls;
    }

    /**
     * 智慧代課媒合名單（單節）
     * 優先後端 getMatchCandidates（教師瘦課表時必備）；失敗再本地 DomainMatch
     * deps 需含媒合用 ref：matchMode, inputRequestDate, activeCell, teachersList, …
     * 可選：fetchMatchCandidates（async API）
     */
    function fetchRecommendations(matchDeps) {
      var matchMode = matchDeps.matchMode;
      var inputRequestDate = matchDeps.inputRequestDate;
      var activeCell = matchDeps.activeCell;
      var teachersList = matchDeps.teachersList;
      var getTeacherSubjectByEmail = matchDeps.getTeacherSubjectByEmail;
      var activityBalanceCtx = matchDeps.activityBalanceCtx;
      var recommendationLoading = matchDeps.recommendationLoading;
      var matchSearchQuery = matchDeps.matchSearchQuery;
      var matchDisplayCount = matchDeps.matchDisplayCount;
      var matchShowNoTeacherWarning = matchDeps.matchShowNoTeacherWarning;
      var recommendedTeachers = matchDeps.recommendedTeachers;
      var fetchMatchCandidates = matchDeps.fetchMatchCandidates;

      if (matchMode.value !== 'substitution' || !inputRequestDate.value) return;
      recommendationLoading.value = true;

      function applyList(list, emptyMeta) {
        list = list || [];
        if (isMutualCover.value && DAC() && DAC().enrichCandidatesWithBalance) {
          list = DAC().enrichCandidatesWithBalance(list, activityBalanceCtx());
        }
        matchSearchQuery.value = '';
        matchDisplayCount.value = 10;
        matchShowNoTeacherWarning.value = list.length === 0;
        recommendedTeachers.value = list;
        if (matchDeps.matchEmptyReasons) {
          matchDeps.matchEmptyReasons.value = (list.length === 0 && emptyMeta)
            ? emptyMeta
            : null;
        }
        recommendationLoading.value = false;
      }

      /** 媒合 0 人時的可能原因（給 UI） */
      function buildEmptyReasons(opts) {
        opts = opts || {};
        var period = parseInt(activeCell.value && activeCell.value.period, 10);
        var reasons = [];
        if (opts.batchAll) {
          reasons.push('選定的多節無法由「同一人」全節皆空');
          reasons.push('可改「每節不同人」、減少節數，或改單節媒合');
          return reasons;
        }
        if (period === 8) {
          reasons.push('第 8 節僅能與第 8 節互代，可代人選通常較少');
        }
        reasons.push('該時段多數教師已有課（含進行中申請佔位）');
        if (activeCell.value && activeCell.value.classData
            && activeCell.value.classData.restriction === 'restricted') {
          reasons.push('本節為綁課，建議代課；可人選仍可能偏少');
        }
        if (isMutualCover.value) {
          reasons.push('活動互代僅帶隊老師課可排；請確認外出班與帶隊設定');
        }
        reasons.push('可試：換日期、改調課、或請教學組手動安排');
        return reasons;
      }

      function runLocal() {
        var leaveEmail = activeCell.value.teacherEmail;
        var leaveTeacher = (teachersList.value || []).find(function (t) {
          return t.email && leaveEmail
            && String(t.email).toLowerCase() === String(leaveEmail).toLowerCase();
        });
        var list = DomainMatch.rankSubstitutionCandidates({
          teachers: teachersList.value,
          allSchedules: allSchedules.value,
          leaveEmail: leaveEmail,
          dateStr: inputRequestDate.value,
          targetDay: activeCell.value.dayOfWeek,
          targetPeriod: activeCell.value.period,
          myCourse: activeCell.value.classData ? activeCell.value.classData.subject : '',
          myDomain: leaveTeacher
            ? (leaveTeacher.subject || '')
            : getTeacherSubjectByEmail(leaveEmail),
          myClass: activeCell.value.classData ? activeCell.value.classData.className : '',
          getScheduleForDate: getScheduleForDate,
          awayClasses: isMutualCover.value ? mutualAwayClasses.value : [],
          awayStartDate: isMutualCover.value ? mutualActivityStart.value : '',
          awayEndDate: isMutualCover.value ? mutualActivityEnd.value : '',
          awayStartPeriod: isMutualCover.value ? mutualActivityStartPeriod.value : '',
          awayEndPeriod: isMutualCover.value ? mutualActivityEndPeriod.value : '',
          activityMode: !!isMutualCover.value,
          preferReleasedByAway: !!isMutualCover.value
        });
        applyList(list, list.length === 0 ? buildEmptyReasons({}) : null);
      }

      function runRemoteThenLocal() {
        var leaveEmail = activeCell.value.teacherEmail;
        var leaveTeacher = (teachersList.value || []).find(function (t) {
          return t.email && leaveEmail
            && String(t.email).toLowerCase() === String(leaveEmail).toLowerCase();
        });
        var myCourse = activeCell.value.classData ? activeCell.value.classData.subject : '';
        var myClass = activeCell.value.classData ? activeCell.value.classData.className : '';
        var myDomain = leaveTeacher
          ? (leaveTeacher.subject || '')
          : getTeacherSubjectByEmail(leaveEmail);
        // 僅「課表明顯不全」（教師端瘦身）才打後端；有全校課表一律本地（比 GAS 往返快）
        var schedLen = (allSchedules.value || []).length;
        var teacherN = (teachersList.value || []).length;
        var scope = matchDeps.scheduleScope
          ? (matchDeps.scheduleScope.value != null ? matchDeps.scheduleScope.value : matchDeps.scheduleScope)
          : '';
        var slimScope = String(scope || '') === 'teacher_self_and_class';
        // 啟發式：人均課表列偏少 → 多半是瘦包（全校通常 ≳ 人均 8～15）
        var seemsSlim = teacherN > 0 && schedLen > 0 && schedLen < teacherN * 4;
        var preferRemote = typeof fetchMatchCandidates === 'function'
          && (slimScope || seemsSlim);

        if (!preferRemote) {
          runLocal();
          return;
        }

        // 短快取：同節 45 秒內不重複打 GAS
        var cacheKey = [
          leaveEmail, inputRequestDate.value,
          activeCell.value.dayOfWeek, activeCell.value.period,
          myClass, myCourse, isMutualCover.value ? '1' : '0',
          isMutualCover.value ? mutualActivityStart.value : '',
          isMutualCover.value ? mutualActivityEnd.value : '',
          isMutualCover.value ? mutualActivityStartPeriod.value : '',
          isMutualCover.value ? mutualActivityEndPeriod.value : ''
        ].join('|');
        var now = Date.now();
        if (!fetchRecommendations._cache) fetchRecommendations._cache = {};
        var hit = fetchRecommendations._cache[cacheKey];
        if (hit && (now - hit.ts) < 45000 && hit.list) {
          var cached = hit.list.slice();
          applyList(cached, cached.length === 0 ? buildEmptyReasons({}) : null);
          return;
        }

        fetchMatchCandidates({
          leaveEmail: leaveEmail,
          dateStr: inputRequestDate.value,
          dayOfWeek: activeCell.value.dayOfWeek,
          period: activeCell.value.period,
          myCourse: myCourse,
          myDomain: myDomain,
          myClass: myClass,
          awayClasses: isMutualCover.value ? mutualAwayClasses.value : [],
          awayStartDate: isMutualCover.value ? mutualActivityStart.value : '',
          awayEndDate: isMutualCover.value ? mutualActivityEnd.value : '',
          awayStartPeriod: isMutualCover.value ? mutualActivityStartPeriod.value : '',
          awayEndPeriod: isMutualCover.value ? mutualActivityEndPeriod.value : '',
          activityMode: !!isMutualCover.value,
          limit: 40
        }).then(function (res) {
          var raw = (res && res.candidates) || [];
          var list = raw.map(function (c) {
            var teacherName = c.teacherName || c.name || c.email || '';
            return {
              // Domain candidate key is teacher name; email remains a local legacy alias only.
              email: teacherName,
               teacherName: teacherName,
               name: teacherName,
               subject: c.subject,
               jobTitle: c.jobTitle || c.job || '',
               role: c.role || 'teacher',
              baseHours: c.baseHours,
              mutualQuota: c.mutualQuota,
              todayPeriodCount: c.todayPeriodCount || 0,
              isSameCourse: !!c.isSameCourse,
              isSameSubject: !!c.isSameSubject,
              isPrimarySubject: !!c.isPrimarySubject,
              subjectMatchRank: c.subjectMatchRank || 0,
              isSameClass: !!c.isSameClass,
              isReleasedByAway: !!c.isReleasedByAway,
              suggestedFee: c.suggestedFee || '',
              demandDomain: c.demandDomain || '',
              score: c.score || 0
            };
          });
          try {
            fetchRecommendations._cache[cacheKey] = { ts: Date.now(), list: list };
            // 最多留 20 組
            var keys = Object.keys(fetchRecommendations._cache);
            if (keys.length > 20) {
              keys.sort(function (a, b) {
                return (fetchRecommendations._cache[a].ts || 0) - (fetchRecommendations._cache[b].ts || 0);
              });
              keys.slice(0, keys.length - 20).forEach(function (k) {
                delete fetchRecommendations._cache[k];
              });
            }
          } catch (eC) { /* ignore */ }
          applyList(list, list.length === 0 ? buildEmptyReasons({}) : null);
        }).catch(function (err) {
          console.warn('getMatchCandidates 失敗，改本地媒合：', err);
          runLocal();
        });
      }

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { setTimeout(runRemoteThenLocal, 0); });
      } else {
        setTimeout(runRemoteThenLocal, 0);
      }
    }

    /**
     * 點課表格（一般／互代／批次／詳情）
     */
    async function handleCellClick(clickDeps, teacherEmail, dayOfWeek, period, dateStr) {
      var isScheduleEditMode = clickDeps.isScheduleEditMode;
      var openScheduleEditModal = clickDeps.openScheduleEditModal;
      var showToast = clickDeps.showToast;
      var showConfirm = clickDeps.showConfirm;
      var isMutualLead = clickDeps.isMutualLead;
      var getMutualDraftAt = clickDeps.getMutualDraftAt;
      var removeMutualDraft = clickDeps.removeMutualDraft;
      var activeCell = clickDeps.activeCell;
      var inputRequestDate = clickDeps.inputRequestDate;
      var matchMode = clickDeps.matchMode;
      var matchPreview = clickDeps.matchPreview;
      var showCompareModal = clickDeps.showCompareModal;
      var showMatchModal = clickDeps.showMatchModal;
      var fetchRecommendationsFn = clickDeps.fetchRecommendations;
      var batchSelectMode = clickDeps.batchSelectMode;
      var batchFlowMode = clickDeps.batchFlowMode;
      var isAdmin = clickDeps.isAdmin;
      var user = clickDeps.user;
      var toggleBatchSlot = clickDeps.toggleBatchSlot;
      var detailRequest = clickDeps.detailRequest;
      var detailSubRecord = clickDeps.detailSubRecord;
      var showDetailModal = clickDeps.showDetailModal;
      var resolveDetailRequest = clickDeps.resolveDetailRequest;
      var getTeacherNameByEmail = clickDeps.getTeacherNameByEmail;
      var exchangeTargetDate = clickDeps.exchangeTargetDate;
      var exchangeWeekOffset = clickDeps.exchangeWeekOffset;
      var exchangePeriodId = clickDeps.exchangePeriodId;
      var exchangeTeacherEmail = clickDeps.exchangeTeacherEmail;

      if (isScheduleEditMode.value) {
        openScheduleEditModal(teacherEmail, dayOfWeek, period);
        return;
      }

      if (isMutualCover.value && clickDeps.isMutualActivitySlotInRange
          && !clickDeps.isMutualActivitySlotInRange(dateStr, period)) {
        showToast('此日期／節次不在活動互代的起訖時段內', 'info');
        return;
      }

      var cell = getScheduleForDate(teacherEmail, dateStr, period, dayOfWeek);

      // 調代課／進行中：先開資訊框（空堂排班改由詳情內按鈕）
      // 真的空堂／巡堂：admin 可直接開空堂排班
       if (!cell) {
        var canEmpty0 = !!(isAdmin && isAdmin.value);
        if (!canEmpty0 && clickDeps.canOperateOnTeacherEmail) {
          canEmpty0 = !!clickDeps.canOperateOnTeacherEmail(teacherEmail);
        }
        if (canEmpty0 && clickDeps.openEmptySlotAssign) {
          clickDeps.openEmptySlotAssign(teacherEmail, dayOfWeek, period, dateStr, null);
          return;
        }
         return;
       }

       // 一般／批次模式下，空堂事件代表該班本節停課，不應再建立代課需求。
       if (cell.isClassAway && !isMutualCover.value && !cell.isPending
           && !cell.isSubstituted && !cell.isSubstitutionDuty) {
         showToast('此班本節為空堂事件，不需申請代課。若要安排活動互代，請切換至活動模式。', 'info');
         return;
       }

       if (isMutualCover.value && !batchSelectMode.value) {
        if (!isMutualLead(teacherEmail)) {
          showToast('請先將該老師加入「帶隊老師」，或點帶隊名單定位課表', 'info');
          return;
        }
        if (cell.isPatrol || cell.attr === '巡堂') {
          showToast('巡堂節不列入活動互代（不計鐘點）；請私下安排代巡', 'info');
          return;
        }
        if (cell.isSubstituted) {
          showToast('此格已調出／請假，無法暫定', 'warning');
          return;
        }
        if (cell.isPending) {
          showToast('此格尚有進行中申請', 'warning');
          return;
        }
        var existing = getMutualDraftAt(teacherEmail, dateStr, period);
        if (existing) {
          var clear = await showConfirm(
            '此節已暫定由 ' + existing.subName + ' 代課（' + existing.fee + '）。\n清除暫定？\n（取消則重新選人）',
            '暫定安排'
          );
          if (clear) {
            removeMutualDraft(existing.key);
            showToast('已清除暫定', 'info');
            return;
          }
        }
        activeCell.value = {
          teacherEmail: teacherEmail,
          teacherName: getTeacherNameByEmail(teacherEmail),
          dayOfWeek: dayOfWeek,
          period: period,
          classData: cell
        };
        inputRequestDate.value = dateStr;
        matchMode.value = 'substitution';
        matchPreview.value = null;
        showCompareModal.value = false;
        showMatchModal.value = true;
        fetchRecommendationsFn();
        return;
      }

      if (batchSelectMode.value) {
        if (cell.isPatrol || cell.attr === '巡堂') {
          showToast(batchFlowMode && batchFlowMode.value === 'exchange'
            ? '巡堂節不可批次調課'
            : '巡堂節不需批次代課；若要請人代巡，請私下安排', 'info');
          return;
        }
        if (cell.isSubstituted) {
          showToast('此格已調出／請假，非實際上課，無法加入批次', 'warning');
          return;
        }
        if (cell.isPending) {
          showToast('此格尚有進行中申請，無法加入批次', 'warning');
          return;
        }
        var canActOnOther = !!(isAdmin && isAdmin.value);
        if (!canActOnOther && clickDeps.canOperateOnTeacherEmail) {
          canActOnOther = !!clickDeps.canOperateOnTeacherEmail(teacherEmail);
        }
        if (!canActOnOther && user.value
            && String(teacherEmail).toLowerCase() !== String(getTeacherNameByEmail(user.value.email) || '').toLowerCase()) {
          showToast('一般教師只能批次自己的課；行政需先被教學組授權代申請', 'warning');
          return;
        }
        if (clickDeps.ensureProxyTargetForTeacher) {
          try { clickDeps.ensureProxyTargetForTeacher(teacherEmail); } catch (eBat) { /* ignore */ }
        }
        toggleBatchSlot({
          teacherEmail: teacherEmail,
          teacherName: getTeacherNameByEmail(teacherEmail),
          dateStr: dateStr,
          dayOfWeek: dayOfWeek,
          period: period,
          className: cell.className,
          subject: cell.subject,
          restriction: cell.restriction || '',
          attr: cell.attr || '',
          isPullOut: !!(cell.isPullOut || cell.attr === '抽離'),
          isDuty: !!cell.isSubstitutionDuty,
          dutyType: cell.subType || ''
        });
        return;
      }

      if (cell.isPending && cell.pendingRecord) {
        detailRequest.value = cell.pendingRecord;
        detailSubRecord.value = null;
        showDetailModal.value = true;
        return;
      }

      // 調出／代課／調入：一律先開調代課資訊（含 isSubstituted）
      if (cell.subRecord || cell.isSubstituted) {
        if (cell.subRecord) {
          var reqId = cell.subRecord.requestId;
          detailSubRecord.value = cell.subRecord;
          var resolved = resolveDetailRequest(reqId, cell.subRecord);
          if (resolved) {
            detailRequest.value = resolved;
          } else {
            detailRequest.value = {
              id: 'N/A', serial: '---', type: 'substitution',
              requestDate: cell.subRecord.date
            };
          }
        } else {
          detailSubRecord.value = null;
          detailRequest.value = {
            id: 'N/A', serial: '---', type: 'substitution',
            requestDate: dateStr
          };
        }
        showDetailModal.value = true;
        return;
      }

      // 巡堂：admin 可空堂排班；其餘提示
      if (cell.isPatrol || cell.attr === '巡堂') {
        if (isAdmin && isAdmin.value && clickDeps.openEmptySlotAssign) {
          clickDeps.openEmptySlotAssign(teacherEmail, dayOfWeek, period, dateStr, cell);
          return;
        }
        showToast('本節為【巡堂】：不計鐘點、不需系統代課；若要請人代巡，請私下安排或互換', 'info');
        return;
      }

      // 權限：自己／教學組／已授權行政（點格即可，自動設代申請對象）
      var canClick = !!(isAdmin && isAdmin.value);
      if (!canClick && clickDeps.canOperateOnTeacherEmail) {
        canClick = !!clickDeps.canOperateOnTeacherEmail(teacherEmail);
      }
      if (!canClick && user.value
          && String(teacherEmail).toLowerCase() === String(getTeacherNameByEmail(user.value.email) || '').toLowerCase()) {
        canClick = true;
      }
      if (!canClick) {
        var me = user.value ? String(getTeacherNameByEmail(user.value.email) || '').toLowerCase() : '';
        var other = String(teacherEmail || '').toLowerCase() !== me;
        if (other) {
          showToast('無法代此教師申請。請確認您是「已授權的行政」（後台有勾選您）。', 'warning');
        }
        return;
      }
      // 已授權行政點別人課格 → 自動設為代申請對象
      if (clickDeps.ensureProxyTargetForTeacher) {
        try { clickDeps.ensureProxyTargetForTeacher(teacherEmail); } catch (eEns) { /* ignore */ }
      }

      activeCell.value = {
        teacherEmail: teacherEmail,
        teacherName: getTeacherNameByEmail(teacherEmail),
        dayOfWeek: dayOfWeek,
        period: period,
        classData: cell
      };
      inputRequestDate.value = dateStr;
      if (cell.restriction === 'restricted') {
        matchMode.value = 'substitution';
      }
      exchangeTargetDate.value = '';
      exchangeWeekOffset.value = 0;
      exchangePeriodId.value = '';
      exchangeTeacherEmail.value = '';
      if (matchMode.value === 'substitution') {
        fetchRecommendationsFn();
      }
      matchPreview.value = null;
      showMatchModal.value = true;
    }

    /** 第八節班級週表：沿用既有調代課媒合與異動詳情流程。 */
    function handlePeriod8CellClick(deps, cell) {
      if (!cell) return;
      var record = cell.record;
      var detailSubRecord = deps.detailSubRecord;
      var detailRequest = deps.detailRequest;
      var showDetailModal = deps.showDetailModal;
      var resolveDetailRequest = deps.resolveDetailRequest;
      var getTeacherNameByEmail = deps.getTeacherNameByEmail;
      if (record) {
        detailSubRecord.value = record;
        var requestId = record.requestId || record.id;
        detailRequest.value = resolveDetailRequest(requestId, record) || {
          id: 'N/A', serial: '---', type: 'substitution', requestDate: record.date
        };
        showDetailModal.value = true;
        return;
      }
      if (cell.status === 'away') {
        if (deps.showToast) deps.showToast('此班本節為空堂事件，不需申請代課。', 'info');
        return;
      }
      var teacherEmail = String(cell.originalTeacherEmail || cell.teacherEmail || '').trim();
      var canAct = !!(deps.isAdmin && deps.isAdmin.value);
      if (!canAct && deps.canOperateOnTeacherEmail) canAct = !!deps.canOperateOnTeacherEmail(teacherEmail);
      if (!canAct) {
        if (deps.showToast) deps.showToast('目前帳號沒有操作這位教師第八節的權限。', 'warning');
        return;
      }
      if (deps.ensureProxyTargetForTeacher) {
        try { deps.ensureProxyTargetForTeacher(teacherEmail); } catch (eProxy) { /* ignore */ }
      }
      deps.activeCell.value = {
        teacherEmail: teacherEmail,
        teacherName: cell.originalTeacherName || getTeacherNameByEmail(teacherEmail),
        dayOfWeek: parseInt(cell.dayOfWeek, 10),
        period: 8,
        classData: {
          className: cell.className,
          subject: cell.subject || '課輔',
          teacherName: cell.originalTeacherName || getTeacherNameByEmail(teacherEmail),
          attr: '課輔',
          restriction: ''
        }
      };
      deps.inputRequestDate.value = cell.date;
      deps.matchMode.value = 'substitution';
      deps.matchPreview.value = null;
      deps.recommendedTeachers.value = [];
      deps.matchSearchQuery.value = '';
      deps.matchDisplayCount.value = 10;
      if (deps.fetchRecommendations) deps.fetchRecommendations();
      deps.showMatchModal.value = true;
    }

    /**
     * 單節媒合（批次「每節不同人」）
     */
    function fetchSingleSlotRecommendations(matchDeps, slot) {
      if (!slot) return;
      var teachersList = matchDeps.teachersList;
      var getTeacherSubjectByEmail = matchDeps.getTeacherSubjectByEmail;
      var activityBalanceCtx = matchDeps.activityBalanceCtx;
      var recommendationLoading = matchDeps.recommendationLoading;
      var matchMode = matchDeps.matchMode;
      var matchSearchQuery = matchDeps.matchSearchQuery;
      var matchDisplayCount = matchDeps.matchDisplayCount;
      var matchShowNoTeacherWarning = matchDeps.matchShowNoTeacherWarning;
      var recommendedTeachers = matchDeps.recommendedTeachers;

      recommendationLoading.value = true;
      matchMode.value = 'substitution';
      var runSlot = function () {
        var leaveEmail = slot.teacherEmail;
        var leaveTeacher = (teachersList.value || []).find(function (t) {
          return t.email && leaveEmail
            && String(t.email).toLowerCase() === String(leaveEmail).toLowerCase();
        });
        var myDomain = leaveTeacher
          ? (leaveTeacher.subject || '')
          : getTeacherSubjectByEmail(leaveEmail);
        var awaySet = {};
        (isMutualCover.value ? (mutualAwayClasses.value || []) : []).forEach(function (c) {
          var k = String(c || '').trim();
          if (k) awaySet[k] = true;
        });
        var slotAwaySet = isMutualCover.value && isMutualActivitySlotInRange
          && !isMutualActivitySlotInRange(slot.dateStr, slot.period) ? {} : awaySet;
        var freeTeachers = (teachersList.value || []).filter(function (t) {
          if (!t.email || String(t.email).toLowerCase() === String(leaveEmail).toLowerCase()) return false;
          var cell = getScheduleForDate(t.email, slot.dateStr, slot.period, slot.dayOfWeek);
          if (DomainMatch && DomainMatch.isSlotFreeForMatch) {
            return DomainMatch.isSlotFreeForMatch(cell, slotAwaySet);
          }
          if (cell === null || cell.isSubstituted || cell.isClassAway) return true;
          if (cell.className && slotAwaySet[String(cell.className).trim()]) return true;
          return false;
        });
        var ranked = DomainMatch.rankSubstitutionCandidates({
          teachers: freeTeachers,
          allSchedules: allSchedules.value,
          leaveEmail: leaveEmail,
          dateStr: slot.dateStr,
          targetDay: slot.dayOfWeek,
          targetPeriod: slot.period,
          myCourse: slot.subject || '',
          myDomain: myDomain,
           myClass: slot.className || '',
           getScheduleForDate: getScheduleForDate,
           awayClasses: isMutualCover.value ? mutualAwayClasses.value : [],
           awayStartDate: isMutualCover.value ? mutualActivityStart.value : '',
           awayEndDate: isMutualCover.value ? mutualActivityEnd.value : '',
           awayStartPeriod: isMutualCover.value ? mutualActivityStartPeriod.value : '',
           awayEndPeriod: isMutualCover.value ? mutualActivityEndPeriod.value : '',
           activityMode: !!isMutualCover.value,
          preferReleasedByAway: !!isMutualCover.value
        });
        if (isMutualCover.value && DAC() && DAC().enrichCandidatesWithBalance) {
          ranked = DAC().enrichCandidatesWithBalance(ranked, activityBalanceCtx());
        }
        matchSearchQuery.value = '';
        matchDisplayCount.value = 10;
        matchShowNoTeacherWarning.value = ranked.length === 0;
        recommendedTeachers.value = ranked;
        if (matchDeps.matchEmptyReasons) {
          if (ranked.length === 0) {
            var r = [];
            if (parseInt(slot.period, 10) === 8) r.push('第 8 節僅能與第 8 節互代，可代人選通常較少');
            r.push('該時段多數教師已有課（含進行中申請佔位）');
            if (slot.restriction === 'restricted') r.push('本節為綁課，建議代課；可人選仍可能偏少');
            if (isMutualCover.value) r.push('活動互代僅帶隊老師課可排；請確認外出班與帶隊設定');
            r.push('可試：換日期、改調課、或請教學組手動安排');
            matchDeps.matchEmptyReasons.value = r;
          } else {
            matchDeps.matchEmptyReasons.value = null;
          }
        }
        recommendationLoading.value = false;
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { setTimeout(runSlot, 0); });
      } else {
        setTimeout(runSlot, 0);
      }
    }

    /**
     * 批次媒合：同一人全代（所有節次皆空）
     */
    function fetchBatchRecommendations(matchDeps) {
      var batchSlots = matchDeps.batchSlots;
      var batchAssignMode = matchDeps.batchAssignMode;
      var batchActiveSlot = matchDeps.batchActiveSlot;
      var batchActiveSlotKey = matchDeps.batchActiveSlotKey;
      var activeCell = matchDeps.activeCell;
      var inputRequestDate = matchDeps.inputRequestDate;
      var teachersList = matchDeps.teachersList;
      var getTeacherSubjectByEmail = matchDeps.getTeacherSubjectByEmail;
      var activityBalanceCtx = matchDeps.activityBalanceCtx;
      var recommendationLoading = matchDeps.recommendationLoading;
      var matchMode = matchDeps.matchMode;
      var matchSearchQuery = matchDeps.matchSearchQuery;
      var matchDisplayCount = matchDeps.matchDisplayCount;
      var matchShowNoTeacherWarning = matchDeps.matchShowNoTeacherWarning;
      var recommendedTeachers = matchDeps.recommendedTeachers;
      var QUOTA_DEDUCT_FEE = matchDeps.QUOTA_DEDUCT_FEE;
      var ACTIVITY_PUBLIC_FEE = matchDeps.ACTIVITY_PUBLIC_FEE;

      if (!batchSlots.value || batchSlots.value.length < 2) return;
      if (batchAssignMode.value === 'perSlot') {
        var slot = (batchActiveSlot && batchActiveSlot.value) || batchSlots.value[0];
        if (slot) {
          batchActiveSlotKey.value = slot.key;
          activeCell.value = {
            teacherEmail: slot.teacherEmail,
            teacherName: slot.teacherName,
            dayOfWeek: slot.dayOfWeek,
            period: slot.period,
            classData: {
              className: slot.className,
              subject: slot.subject,
              restriction: slot.restriction || ''
            }
          };
          inputRequestDate.value = slot.dateStr;
          fetchSingleSlotRecommendations(matchDeps, slot);
        }
        return;
      }

      recommendationLoading.value = true;
      matchMode.value = 'substitution';
      var runBatch = function () {
        var leaveEmail = batchSlots.value[0].teacherEmail;
        var leaveTeacher = (teachersList.value || []).find(function (t) {
          return t.email && leaveEmail
            && String(t.email).toLowerCase() === String(leaveEmail).toLowerCase();
        });
        var myDomain = leaveTeacher
          ? (leaveTeacher.subject || '')
          : getTeacherSubjectByEmail(leaveEmail);
        var awaySet = {};
        (isMutualCover.value ? (mutualAwayClasses.value || []) : []).forEach(function (c) {
          var k = String(c || '').trim();
          if (k) awaySet[k] = true;
        });
        var freeTeachers = (teachersList.value || []).filter(function (t) {
          if (!t.email || String(t.email).toLowerCase() === String(leaveEmail).toLowerCase()) return false;
          return batchSlots.value.every(function (s) {
            var cell = getScheduleForDate(t.email, s.dateStr, s.period, s.dayOfWeek);
            var slotAwaySet = isMutualCover.value && isMutualActivitySlotInRange
              && !isMutualActivitySlotInRange(s.dateStr, s.period) ? {} : awaySet;
            if (DomainMatch && DomainMatch.isSlotFreeForMatch) {
              return DomainMatch.isSlotFreeForMatch(cell, slotAwaySet);
            }
            if (cell === null || cell.isSubstituted || cell.isClassAway) return true;
            if (cell.className && slotAwaySet[String(cell.className).trim()]) return true;
            return false;
          });
        });
        var scoreMap = {};
        freeTeachers.forEach(function (t) {
          scoreMap[t.email] = Object.assign({}, t, {
            todayPeriodCount: 0,
            isSameCourse: false,
            isSameSubject: false,
            isPrimarySubject: false,
            subjectMatchRank: 0,
            isSameClass: false,
            isReleasedByAway: false,
            suggestedFee: isMutualCover.value ? ACTIVITY_PUBLIC_FEE : '',
            score: 0,
            freeAllSlots: true,
            slotCount: batchSlots.value.length
          });
        });
        batchSlots.value.forEach(function (s) {
          var ranked = DomainMatch.rankSubstitutionCandidates({
            teachers: freeTeachers,
            allSchedules: allSchedules.value,
            leaveEmail: leaveEmail,
            dateStr: s.dateStr,
            targetDay: s.dayOfWeek,
            targetPeriod: s.period,
            myCourse: s.subject || '',
            myDomain: myDomain,
             myClass: s.className || '',
             getScheduleForDate: getScheduleForDate,
             awayClasses: isMutualCover.value ? mutualAwayClasses.value : [],
             awayStartDate: isMutualCover.value ? mutualActivityStart.value : '',
             awayEndDate: isMutualCover.value ? mutualActivityEnd.value : '',
             awayStartPeriod: isMutualCover.value ? mutualActivityStartPeriod.value : '',
             awayEndPeriod: isMutualCover.value ? mutualActivityEndPeriod.value : '',
             activityMode: !!isMutualCover.value,
            preferReleasedByAway: !!isMutualCover.value
          });
          ranked.forEach(function (r) {
            if (!scoreMap[r.email]) return;
            scoreMap[r.email].score += (r.score || 0);
            scoreMap[r.email].todayPeriodCount = Math.max(
              scoreMap[r.email].todayPeriodCount,
              r.todayPeriodCount || 0
            );
            if (r.isSameCourse) scoreMap[r.email].isSameCourse = true;
            if (r.isSameSubject) scoreMap[r.email].isSameSubject = true;
            if (r.isPrimarySubject) scoreMap[r.email].isPrimarySubject = true;
            scoreMap[r.email].subjectMatchRank = Math.max(
              scoreMap[r.email].subjectMatchRank || 0,
              r.subjectMatchRank || 0
            );
            if (r.isSameClass) scoreMap[r.email].isSameClass = true;
            if (r.isReleasedByAway) {
              scoreMap[r.email].isReleasedByAway = true;
              scoreMap[r.email].releasedSlotCount = (scoreMap[r.email].releasedSlotCount || 0) + 1;
              if (isMutualCover.value) scoreMap[r.email].suggestedFee = QUOTA_DEDUCT_FEE;
            }
          });
        });
        var list = Object.keys(scoreMap).map(function (k) { return scoreMap[k]; });
        if (isMutualCover.value && DAC() && DAC().enrichCandidatesWithBalance) {
          list = DAC().enrichCandidatesWithBalance(list, activityBalanceCtx());
        }
        list.sort(function (a, b) {
          if (isMutualCover.value) {
            var qa = typeof a.remainingReleased === 'number' ? a.remainingReleased : 0;
            var qb = typeof b.remainingReleased === 'number' ? b.remainingReleased : 0;
            if (qb !== qa) return qb - qa;
            var ra = a.isReleasedByAway ? 1 : 0;
            var rb = b.isReleasedByAway ? 1 : 0;
            if (rb !== ra) return rb - ra;
            var rca = a.releasedSlotCount || 0;
            var rcb = b.releasedSlotCount || 0;
            if (rcb !== rca) return rcb - rca;
          }
          return b.score - a.score
            || (b.subjectMatchRank || 0) - (a.subjectMatchRank || 0)
            || a.todayPeriodCount - b.todayPeriodCount;
        });
        matchSearchQuery.value = '';
        matchDisplayCount.value = 10;
        matchShowNoTeacherWarning.value = list.length === 0;
        recommendedTeachers.value = list;
        if (matchDeps.matchEmptyReasons) {
          matchDeps.matchEmptyReasons.value = list.length === 0
            ? [
                '選定的多節無法由「同一人」全節皆空',
                '可改「每節不同人」、減少節數，或改單節媒合'
              ]
            : null;
        }
        recommendationLoading.value = false;
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { setTimeout(runBatch, 0); });
      } else {
        setTimeout(runBatch, 0);
      }
    }

    // DI：測試顯式注入 getScheduleForDate 時優先採用（正式環境 app.js 不傳，沿用內部實作）
const getClassAwayEventName = (className, dateStr, period) => {
  if (!className || !DomainClassAway) return '';
  const parseClasses = typeof DomainClassAway.parseClassList === 'function'
    ? DomainClassAway.parseClassList
    : value => String(value || '').split(/[,，、/／\s]+/).map(item => item.trim()).filter(Boolean);
  const classNames = parseClasses(className);
  if (!classNames.length || typeof DomainClassAway.eventsActiveOnDate !== 'function') return '';
  const activeEvents = DomainClassAway.eventsActiveOnDate(
    dateStr || getTodayString(), getClassAwayEventsForView(), semesterEndDate.value, period
  );
  const names = [];
  activeEvents.forEach(event => {
    const eventClasses = typeof DomainClassAway.eventClasses === 'function'
      ? DomainClassAway.eventClasses(event)
      : parseClasses(event && (event.classes || event.classList || event['班級清單']));
    const matchesClass = typeof DomainClassAway.eventAppliesToClass === 'function'
      ? classNames.some(classValue => DomainClassAway.eventAppliesToClass(event, classValue))
      : classNames.some(classValue => eventClasses.includes(classValue));
    if (!matchesClass) return;
    const name = String(event && (event.name || event['事件名稱']) || '').trim();
    if (name && !names.includes(name)) names.push(name);
  });
  return names.join('、');
};
    var classList = deps.classList;

    if (deps.getScheduleForDate) getScheduleForDate = deps.getScheduleForDate;
    var getTodayString = deps.getTodayString;
    var getClassAwayEventsForView = deps.getClassAwayEventsForView;
    var semesterEndDate = deps.semesterEndDate;
    // R-v2：activeAwayBanner 需排在 dep 賦值之後（eager computed stub 下亦成立；
    // 真 Vue 懶求值語義不變）。原 v1 位置在 dep 賦值之前，屬潛伏排序問題。
    const activeAwayBanner = computed(() => {
      if (!DomainClassAway) return null;
      const today = getTodayString();
      const active = DomainClassAway.eventsActiveOnDate(
        today, getClassAwayEventsForView(), semesterEndDate.value
      );
      if (!active.length) return null;
      const names = active.map(e => e.name || '未命名').join('、');
      const classes = DomainClassAway.getActiveAwayClasses(
        today, getClassAwayEventsForView(), semesterEndDate.value, undefined, { allClasses: classList.value }
      );
      return { names, classes, count: classes.length };
    });


    return {
       scheduleIndex: scheduleIndex,
       schoolSwapIndex: schoolSwapIndex,
       resolveBaseSlot: resolveBaseSlot,
      getApprovedScheduleForDate: getApprovedScheduleForDate,
      activeAwayBanner: activeAwayBanner,
      getClassAwayEventName: getClassAwayEventName,
      getClassAwayEventName: getClassAwayEventName,
      getScheduleForDate: getScheduleForDate,
      findBaseScheduleSlot: findBaseScheduleSlot,
      resolveCellFromBaseAndSubs: resolveCellFromBaseAndSubs,
      isExchangeLikeRequest: isExchangeLikeRequest,
      getTargetSubject: getTargetSubject,
      getTargetClassAndSubject: getTargetClassAndSubject,
      getOriginalRequestSubject: getOriginalRequestSubject,
      getOriginalRequestClass: getOriginalRequestClass,
      getOriginalTargetSubject: getOriginalTargetSubject,
      getOriginalTargetClass: getOriginalTargetClass,
      resolveExchangeTargetCell: resolveExchangeTargetCell,
      formatExchangeClassSlot: formatExchangeClassSlot,
      formatQuickTodoTitle: formatQuickTodoTitle,
      convertRequestsToSubstitutions: convertRequestsToSubstitutions,
      findPriorDutyAtSlot: findPriorDutyAtSlot,
      resolveHistoryLeaveClassSubject: resolveHistoryLeaveClassSubject,
      cellIsRestricted: cellIsRestricted,
      isLeaveClassRestricted: isLeaveClassRestricted,
      isExchangeClassRestricted: isExchangeClassRestricted,
      resolveRestrictionForHistoryRec: resolveRestrictionForHistoryRec,
      isHistoryLeaveRestricted: isHistoryLeaveRestricted,
      isHistoryExchangeRestricted: isHistoryExchangeRestricted,
      formatHistoryLeaveSlot: formatHistoryLeaveSlot,
      formatHistoryExchangeSlot: formatHistoryExchangeSlot,
      triangleTeacherKey: triangleTeacherKey,
      triangleSlotKey: triangleSlotKey,
      triangleCellIsUsable: triangleCellIsUsable,
      triangleCandidates: triangleCandidates,
      triangleCandidateB: triangleCandidateB,
      triangleCandidateCList: triangleCandidateCList,
      triangleCandidateC: triangleCandidateC,
      triangleSourceParticipant: triangleSourceParticipant,
      triangleCandidateParticipant: triangleCandidateParticipant,
      triangleCandidateIsRestricted: triangleCandidateIsRestricted,
      triangleParticipants: triangleParticipants,
      buildTriangleOccupiedByTeacher: buildTriangleOccupiedByTeacher,
      triangleCandidateSearchText: triangleCandidateSearchText,
      triangleCandidateOptions: triangleCandidateOptions,
      createTriangleScheduleGetter: createTriangleScheduleGetter,
      validateTriangleSelection: validateTriangleSelection,
      triangleCandidateCanMoveTo: triangleCandidateCanMoveTo,
      triangleCandidateSort: triangleCandidateSort,
      triangleCandidatePriority: triangleCandidatePriority,
      triangleCandidateBPriority: triangleCandidateBPriority,
      triangleDirectExchangeKeys: triangleDirectExchangeKeys,
      triangleCandidateCOptions: triangleCandidateCOptions,
      triangleCandidateCReadyCount: triangleCandidateCReadyCount,
      triangleCandidateBOptions: triangleCandidateBOptions,
      triangleCandidateBReadyCount: triangleCandidateBReadyCount,
      displayedTriangleCOptions: displayedTriangleCOptions,
      displayedTriangleBOptions: displayedTriangleBOptions,
      selectTriangleCandidateB: selectTriangleCandidateB,
      selectTriangleCandidateC: selectTriangleCandidateC,
      loadMoreTriangleCandidates: loadMoreTriangleCandidates,
      triangleLegs: triangleLegs,
      triangleValidation: triangleValidation,
      trianglePreviewRows: trianglePreviewRows,
      trianglePreviewWeekDates: trianglePreviewWeekDates,
      triangleTimetablePreview: triangleTimetablePreview,
      openTriangleTimetablePreview: openTriangleTimetablePreview,
      triangleReady: triangleReady,
      resetTriangleDraft: resetTriangleDraft,
      getExchangeWeekDates: getExchangeWeekDates,
      copyLineMessageForRequest: copyLineMessageForRequest,
      findCombinedReturnCandidates: findCombinedReturnCandidates,
      normalizeRechangeRequestId: normalizeRechangeRequestId,
      isEffectiveChangedDuty: isEffectiveChangedDuty,
      hasOtherChangedDutyAtSlot: hasOtherChangedDutyAtSlot,
      isHistoryLeaveRechanged: isHistoryLeaveRechanged,
      isHistoryExchangeRechanged: isHistoryExchangeRechanged,
      isRequestLeaveRechanged: isRequestLeaveRechanged,
      isRequestExchangeRechanged: isRequestExchangeRechanged,
      clearScheduleCache: clearScheduleCache,
      weekScheduleGrid: weekScheduleGrid,
      cellFromGrid: cellFromGrid,
      slotFromGrid: slotFromGrid,
      isAwayClassCell: isAwayClassCell,
      getClassCellClassForDate: getClassCellClassForDate,
       fetchRecommendations: fetchRecommendations,
       handleCellClick: handleCellClick,
       handlePeriod8CellClick: handlePeriod8CellClick,
       fetchSingleSlotRecommendations: fetchSingleSlotRecommendations,
      fetchBatchRecommendations: fetchBatchRecommendations,

      // ── 媒合預覽（課表高亮）──
      selectMatchPreviewSub: function (deps, email) {
        var matchPreview = deps.matchPreview;
        var activeCell = deps.activeCell;
        var getTeacherNameByEmail = deps.getTeacherNameByEmail;
        if (!email || !activeCell.value) {
          matchPreview.value = null;
          return;
        }
        var key = String(email).toLowerCase();
        if (matchPreview.value && matchPreview.value.mode === 'substitution' && matchPreview.value.email === key) {
          matchPreview.value = null;
          return;
        }
        matchPreview.value = {
          mode: 'substitution',
          email: key,
          name: getTeacherNameByEmail(email),
          dayOfWeek: parseInt(activeCell.value.dayOfWeek, 10),
          period: parseInt(activeCell.value.period, 10),
          className: activeCell.value.classData ? activeCell.value.classData.className : '',
          subject: activeCell.value.classData ? activeCell.value.classData.subject : ''
        };
      },
      selectMatchPreviewExchange: function (deps, row) {
        var matchPreview = deps.matchPreview;
        var getTeacherNameByEmail = deps.getTeacherNameByEmail;
        if (!row) {
          matchPreview.value = null;
          return;
        }
        var email = String(row.teacherEmail || '').toLowerCase();
        var day = parseInt(row.dayOfWeek, 10);
        var period = parseInt(row.period, 10);
        if (matchPreview.value && matchPreview.value.mode === 'exchange'
            && matchPreview.value.email === email
            && parseInt(matchPreview.value.dayOfWeek, 10) === day
            && parseInt(matchPreview.value.period, 10) === period) {
          matchPreview.value = null;
          return;
        }
        matchPreview.value = {
          mode: 'exchange',
          email: email,
          name: row.teacherName || getTeacherNameByEmail(row.teacherEmail),
          dayOfWeek: day,
          period: period,
          className: row.className || '',
          subject: row.subject || ''
        };
      },
      clearMatchPreview: function (deps) {
        deps.matchPreview.value = null;
      },
      isMatchPreviewSelected: function (deps, email, day, period) {
        var matchPreview = deps.matchPreview;
        if (!matchPreview.value || !email) return false;
        var p = matchPreview.value;
        if (p.email !== String(email).toLowerCase()) return false;
        if (day === undefined || period === undefined) return true;
        return parseInt(p.dayOfWeek, 10) === parseInt(day, 10)
          && parseInt(p.period, 10) === parseInt(period, 10);
      },
      isMatchSourceCell: function (deps, teacherEmail, day, period) {
        var showMatchModal = deps.showMatchModal;
        var activeCell = deps.activeCell;
        if (!showMatchModal.value || !activeCell.value || !teacherEmail) return false;
        var a = String(activeCell.value.teacherEmail || '').toLowerCase();
        var b = String(teacherEmail || '').toLowerCase();
        return !!(a && a === b
          && parseInt(activeCell.value.dayOfWeek, 10) === parseInt(day, 10)
          && parseInt(activeCell.value.period, 10) === parseInt(period, 10));
      },
      isMatchSourceEntry: function (deps, entry, day, period) {
        var showMatchModal = deps.showMatchModal;
        var activeCell = deps.activeCell;
        if (!showMatchModal.value || !activeCell.value || !entry) return false;
        var tName = activeCell.value.teacherName || '';
        var emailOk = entry.teacherEmail && activeCell.value.teacherEmail
          && String(entry.teacherEmail).toLowerCase() === String(activeCell.value.teacherEmail).toLowerCase();
        var nameOk = entry.teacherName && tName && entry.teacherName === tName;
        return !!(emailOk || nameOk)
          && parseInt(activeCell.value.dayOfWeek, 10) === parseInt(day, 10)
          && parseInt(activeCell.value.period, 10) === parseInt(period, 10)
          && (!activeCell.value.classData || !activeCell.value.classData.subject
            || entry.subject === activeCell.value.classData.subject);
      },
      isMatchHoverCell: function (deps, teacherEmail, day, period) {
        var showMatchModal = deps.showMatchModal;
        var matchPreview = deps.matchPreview;
        var activeCell = deps.activeCell;
        if (!showMatchModal.value || !matchPreview.value || !teacherEmail || !activeCell.value) return false;
        if (matchPreview.value.mode !== 'exchange') return false;
        var self = String(activeCell.value.teacherEmail || '').toLowerCase();
        if (self !== String(teacherEmail).toLowerCase()) return false;
        var h = matchPreview.value;
        return parseInt(h.dayOfWeek, 10) === parseInt(day, 10)
          && parseInt(h.period, 10) === parseInt(period, 10);
      },
      isMatchHoverEntry: function () { return false; },

      getClassCellClassForClass: function (deps, className, day, period) {
        var classSchedules = deps.classSchedules;
        var selectedClassWeekDates = deps.selectedClassWeekDates;
        var classSubstitutionMap = deps.classSubstitutionMap;
        var isClassAwayOnDate = deps.isClassAwayOnDate;
        var entries = classSchedules.value[className] && classSchedules.value[className][day + '-' + period];
        if (!entries || !entries.length) return 'is-empty';
        var dateForDay = selectedClassWeekDates.value[day - 1];
        if (dateForDay && classSubstitutionMap.value[className + '|' + dateForDay + '|' + period]) {
          return 'has-substitution';
        }
        if (dateForDay && typeof isClassAwayOnDate === 'function'
            && isClassAwayOnDate(className, dateForDay, period)) {
          return 'is-away-class';
        }
        if (entries.some(function (e) { return e.attr === '巡堂' || e.isPatrol; })) return 'is-patrol';
        // 超鐘點：外觀與一般課相同，僅課名後標（超）
        if (entries.some(function (e) { return e.attr === '實支'; })) return 'is-elastic';
        return 'has-class';
      },

      handleClassCellClick: function (deps, cls, day, period, entryOrIndex) {
        var classSchedules = deps.classSchedules;
        var selectedClassWeekDates = deps.selectedClassWeekDates;
        var classSubstitutionMap = deps.classSubstitutionMap;
        var detailSubRecord = deps.detailSubRecord;
        var detailRequest = deps.detailRequest;
        var showDetailModal = deps.showDetailModal;
        var resolveDetailRequest = deps.resolveDetailRequest;
        var classReadonlyMode = deps.classReadonlyMode;
        var isAdmin = deps.isAdmin;
        var getTeacherNameByEmail = deps.getTeacherNameByEmail;
        var activeCell = deps.activeCell;
        var inputRequestDate = deps.inputRequestDate;
        var matchMode = deps.matchMode;
        var exchangeTargetDate = deps.exchangeTargetDate;
        var exchangeWeekOffset = deps.exchangeWeekOffset;
        var exchangePeriodId = deps.exchangePeriodId;
        var exchangeTeacherEmail = deps.exchangeTeacherEmail;
        var matchPreview = deps.matchPreview;
        var recommendedTeachers = deps.recommendedTeachers;
        var matchSearchQuery = deps.matchSearchQuery;
         var matchDisplayCount = deps.matchDisplayCount;
         var fetchRecommendations = deps.fetchRecommendations;
         var showMatchModal = deps.showMatchModal;
              var isClassAwayOnDate = deps.isClassAwayOnDate;

        var entries = classSchedules.value[cls] && classSchedules.value[cls][day + '-' + period];
        if (!entries || !entries.length) return;
        var cellData = entries[0];
        if (entryOrIndex !== undefined && entryOrIndex !== null) {
          if (typeof entryOrIndex === 'object') cellData = entryOrIndex;
          else if (entries[entryOrIndex]) cellData = entries[entryOrIndex];
        }
        var dateForDay = selectedClassWeekDates.value[day - 1];
        if (!dateForDay) return;
        // 唯讀班級課表：所有格子皆不可點（含異動格）
        if (classReadonlyMode && classReadonlyMode.value) return;
        var subKey = cls + '|' + dateForDay + '|' + period;
        var subRecord = classSubstitutionMap.value[subKey];
         if (subRecord) {
          detailSubRecord.value = subRecord;
          var resolved = resolveDetailRequest(subRecord.requestId, subRecord);
          detailRequest.value = resolved || {
            id: 'N/A', serial: '---', type: 'substitution', requestDate: subRecord.date
          };
          showDetailModal.value = true;
           return;
         }
         if (typeof isClassAwayOnDate === 'function'
             && isClassAwayOnDate(cls, dateForDay, period)) {
           if (deps.showToast) deps.showToast('此班本節為空堂事件，不需申請代課。', 'info');
           return;
         }
          var canClassAct = !!(isAdmin && isAdmin.value);
         var teacherKey = String(cellData.teacherEmail || '').trim();
         var tName = String(cellData.teacherName || cellData['教師姓名'] || getTeacherNameByEmail(teacherKey) || '').trim();
         if (!teacherKey) teacherKey = tName;
         if (!canClassAct && deps.canOperateOnTeacherEmail) {
           canClassAct = !!deps.canOperateOnTeacherEmail(teacherKey);
         }
         if (!canClassAct) return;
         if (deps.ensureProxyTargetForTeacher) {
           try { deps.ensureProxyTargetForTeacher(teacherKey); } catch (eCls) { /* ignore */ }
         }
         activeCell.value = {
           teacherEmail: teacherKey,
           teacherName: tName,
          dayOfWeek: day,
          period: period,
          classData: {
             className: cls,
             subject: cellData.subject,
             teacherName: tName,
             teacherEmail: teacherKey,
             attr: cellData.attr || '基本',
            restriction: cellData.restriction || ''
          }
        };
        inputRequestDate.value = dateForDay;
        if (cellData.restriction === 'restricted') matchMode.value = 'substitution';
        exchangeTargetDate.value = '';
        exchangeWeekOffset.value = 0;
        exchangePeriodId.value = '';
        exchangeTeacherEmail.value = '';
        matchPreview.value = null;
        recommendedTeachers.value = [];
        matchSearchQuery.value = '';
        matchDisplayCount.value = 10;
        if (matchMode.value === 'substitution') fetchRecommendations();
        showMatchModal.value = true;
      },

      startSecondSub: function (deps) {
        var detailSubRecord = deps.detailSubRecord;
        var getTeacherNameByEmail = deps.getTeacherNameByEmail;
        var activeCell = deps.activeCell;
        var inputRequestDate = deps.inputRequestDate;
        var showDetailModal = deps.showDetailModal;
        var exchangeTargetDate = deps.exchangeTargetDate;
        var exchangeWeekOffset = deps.exchangeWeekOffset;
        var exchangePeriodId = deps.exchangePeriodId;
        var exchangeTeacherEmail = deps.exchangeTeacherEmail;
        var matchMode = deps.matchMode;
    
        var matchPreview = deps.matchPreview;
        var showMatchModal = deps.showMatchModal;
        var fetchRecommendations = deps.fetchRecommendations;
        if (!detailSubRecord.value) return;
        var record = detailSubRecord.value;
        activeCell.value = {
          teacherEmail: record.actualTeacherEmail,
          teacherName: getTeacherNameByEmail(record.actualTeacherEmail),
          dayOfWeek: new Date(String(record.date).replace(/-/g, '/')).getDay(),
          period: record.period,
          classData: {
            className: record.className,
            subject: record.subject,
            teacherEmail: record.actualTeacherEmail
          }
        };
        inputRequestDate.value = record.date;
        showDetailModal.value = false;
        exchangeTargetDate.value = '';
        exchangeWeekOffset.value = 0;
        exchangePeriodId.value = '';
        exchangeTeacherEmail.value = '';
        if (matchMode.value === 'substitution') fetchRecommendations();
        matchPreview.value = null;
        showMatchModal.value = true;
      }
    };
  }

  return { create: create };
})();

export { UiTimetable };
