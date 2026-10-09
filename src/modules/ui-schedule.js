/**
 * 自 v1 ui-schedule.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DateUtils from '../domain/date-utils.js';
// 2.0a：DomainBilling 改經 export-gates 按需載入（period8 視圖才用，首屏不含）。
import { getDomainBillingSync } from './export-gates.js';
import DomainClassAway from '../domain/domain-class-away.js';
import DomainSchedule from '../domain/domain-schedule.js';
import DomainSchoolSwap from '../domain/domain-school-swap.js';

/**
 * ui-schedule.js — 排課視圖（班級清單／課表索引／週次）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
const UiSchedule = (() => {
  function create(deps) {
    deps = deps || {};
    var showMatchModal = deps.showMatchModal;
    var activeCell = deps.activeCell;
    var ttPageSize = deps.ttPageSize;
    var TT_PAGE_SIZE_DEFAULT = deps.TT_PAGE_SIZE_DEFAULT;
    var ttPage = deps.ttPage;
    var selectedClassDate = deps.selectedClassDate;
    var period8WeekDate = deps.period8WeekDate;
    var computed = deps.computed;
    var classDirectory = deps.classDirectory;
    var classScheduleRows = deps.classScheduleRows;
    var classSubstitutionRows = deps.classSubstitutionRows;
    var classScheduleRows = deps.classScheduleRows;
    var period8Ready = deps.period8Ready;
    var allSchedules = deps.allSchedules;
    var substitutionRecords = deps.substitutionRecords;
    var classAwayEvents = deps.classAwayEvents;
    var semesterEndDate = deps.semesterEndDate;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getClassAwayEventName = deps.getClassAwayEventName;
    var isSingleWeek = deps.isSingleWeek;
    var parseScheduleClasses = deps.parseScheduleClasses;
    var selectedClass = deps.selectedClass;
    var classReadonlyMode = deps.classReadonlyMode;
    var userRole = deps.userRole;
    var classViewSchoolSwaps = deps.classViewSchoolSwaps;
    var schoolSwaps = deps.schoolSwaps;
    var selectedWeekDate = deps.selectedWeekDate;
    var toLocalDateStr = deps.toLocalDateStr;
    var user = deps.user;
    var canViewAllTimetables = deps.canViewAllTimetables;
    var teachersList = deps.teachersList;
    var lookupTeacher = deps.lookupTeacher;
    var parseTeacherSubjects = deps.parseTeacherSubjects;
    var searchQuery = deps.searchQuery;
    var selectedSubject = deps.selectedSubject;
    var isMutualCover = deps.isMutualCover;

const classList = computed(() => {
  const set = new Set();
  const pullOutClassLabels = new Set();
  (classDirectory.value || []).forEach(c => {
    const value = String(c || '').trim();
    if (value && !/^0+$/.test(value)) set.add(value);
  });
  const source = classScheduleRows.value || [];
  if (DomainClassAway && DomainClassAway.scanClassNames) {
    DomainClassAway.scanClassNames(source).forEach(c => set.add(c));
  }
  source.forEach(s => {
    const c = String(s.className || '').trim();
    const isPullOut = s.attr === '抽離' || s.isPullOut
      || (DomainSchedule && typeof DomainSchedule.isPullOutCell === 'function'
        && DomainSchedule.isPullOutCell(s));
    if (isPullOut) {
      const names = (DateUtils && DateUtils.parseCombinedClasses)
        ? DateUtils.parseCombinedClasses(s.className)
        : c.split(/[、,，/／|｜\s]+/).filter(Boolean);
      // 抽離課的多班文字是特殊課程標籤，不是可檢視的班級；個別實際班名仍保留。
      if (c && names.length > 1) pullOutClassLabels.add(c);
      names.forEach(name => {
        const value = String(name || '').trim();
        if (/英資|特教|資優|抽離/.test(value)) pullOutClassLabels.add(value);
      });
    } else if (c && !/^0+$/.test(c)) {
      set.add(c);
    }
  });
  return [...set].filter(value => !pullOutClassLabels.has(value)).sort((a, b) => {
    const aIsEnglishGifted = /英資|英語資優/.test(a);
    const bIsEnglishGifted = /英資|英語資優/.test(b);
    if (aIsEnglishGifted !== bIsEnglishGifted) return aIsEnglishGifted ? 1 : -1;
    const aNumber = String(a).match(/^\d+/);
    const bNumber = String(b).match(/^\d+/);
    if (!!aNumber !== !!bNumber) return aNumber ? -1 : 1;
    if (aNumber && bNumber && Number(aNumber[0]) !== Number(bNumber[0])) {
      return Number(aNumber[0]) - Number(bNumber[0]);
    }
    return a.localeCompare(b, 'zh-Hant', { numeric: true });
  });
});

const period8RosterData = computed(() => {
  const dates = period8WeekDates.value || [];
  const Billing = getDomainBillingSync();
  if (!period8Ready.value || !Billing
      || typeof Billing.buildPeriod8ClassRoster !== 'function') {
    return { dates, rows: [] };
  }
  return Billing.buildPeriod8ClassRoster({
    dates,
    classNames: classList.value,
    allSchedules: allSchedules.value,
    substitutionRecords: substitutionRecords.value,
    classAwayEvents: classAwayEvents.value,
    semesterEndDate: semesterEndDate.value,
    getTeacherNameByEmail,
    getClassAwayEventName,
    isSingleWeek
  });
});

const classScheduleIndex = computed(() => {
  const map = {};
  classScheduleRows.value.forEach(s => {
    if (!s.className || s.attr === '抽離' || s.isPullOut) return;
    const classes = parseScheduleClasses(s.className);
    if (!classes.length) return;
    classes.forEach(cls => {
      if (!map[cls]) map[cls] = [];
      map[cls].push({
        schedule: s,
        isCombined: classes.length > 1,
        combinedWith: classes.filter(other => other !== cls).join('、')
      });
    });
  });
  return map;
});

const classSchedules = computed(() => {
  const map = {};
  const cls = String(selectedClass.value || '').trim();
  if (!cls) return map;
  const weekDates = selectedClassWeekDates.value || [];
  const rows = classScheduleIndex.value[cls] || [];
  const useClassViewSwaps = classReadonlyMode.value || userRole.value === 'teacher';
  const swapIndex = DomainSchoolSwap
    ? DomainSchoolSwap.buildIndex(useClassViewSwaps ? classViewSchoolSwaps.value : schoolSwaps.value)
    : { rows: [], bySlot: {} };
  const periods = (DateUtils && DateUtils.getTimetablePeriods)
    ? DateUtils.getTimetablePeriods()
    : [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
  rows.forEach(entry => {
    const s = entry.schedule;
    const sourceDay = parseInt(s.dayOfWeek, 10);
    const sourcePeriod = parseInt(s.period, 10);
    for (let actualDay = 1; actualDay <= 5; actualDay++) {
        const dateStr = weekDates[actualDay - 1];
        if (!dateStr) continue;
        if (DomainSchedule && DomainSchedule.isActiveOnDate
            && !DomainSchedule.isActiveOnDate(s, dateStr)) continue;
      for (let pi = 0; pi < periods.length; pi++) {
        const actualPeriod = periods[pi];
        const resolved = DomainSchoolSwap
          ? DomainSchoolSwap.resolveSlot(swapIndex, dateStr, actualDay, actualPeriod)
          : { dayOfWeek: actualDay, period: actualPeriod, row: null };
        if (parseInt(resolved.dayOfWeek, 10) !== sourceDay || parseInt(resolved.period, 10) !== sourcePeriod) continue;
        if (s.attr === '單週' && !isSingleWeek(dateStr)) continue;
        if (s.attr === '雙週' && isSingleWeek(dateStr)) continue;
        if (!map[cls]) map[cls] = {};
        const key = `${actualDay}-${actualPeriod}`;
        if (!map[cls][key]) map[cls][key] = [];
        map[cls][key].push(Object.assign({}, s, {
          _isCombined: entry.isCombined,
          _combinedWith: entry.combinedWith,
          _schoolSwap: resolved.row || null,
          _schoolSwapEndpoint: resolved.endpoint || ''
        }));
      }
    }
  });
  return map;
});

const currentWeekDates = computed(() => {
  const dates = [];
  const current = new Date(selectedWeekDate.value);
  const day = current.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayDiff);
  
  for (let i = 0; i < 5; i++) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    dates.push(toLocalDateStr(next));
  }
  return dates;
});

const filteredTeachers = computed(() => {
  if (!user.value) return [];
  const myName = String(getTeacherNameByEmail(user.value.email) || '').toLowerCase();
  // 一般教師：只看自己；行政／教學組可看全校
  if (!canViewAllTimetables.value) {
    return teachersList.value.filter(t => String(t.teacherName || t.name || '').toLowerCase() === myName);
  }
  const query = searchQuery.value.trim().toLowerCase();
  const subj = selectedSubject.value;
  // 預設「我的課表」：只顯示自己（有搜尋姓名時改看全校比對）
  if (subj === 'mine' && !query) {
    const self = lookupTeacher(user.value.email);
    return self ? [self] : teachersList.value.filter(t => String(t.teacherName || t.name || '').toLowerCase() === myName);
  }
  // all＝全校；指定科目＝該領域；mine+搜尋＝用姓名在全校找
  let list = teachersList.value.slice();
  if (query || (subj && subj !== 'all' && subj !== 'mine')) {
    list = list.filter(t => {
      const nameVal = t.name || '';
      const matchesName = !query || nameVal.toLowerCase().includes(query);
      if (subj === 'all' || subj === 'mine') return matchesName;
      const domains = parseTeacherSubjects(t.subject);
      const matchesSubj = domains.includes(subj) || t.subject === subj;
      return matchesName && matchesSubj;
    });
  }
  // 有搜尋／活動互代看別人：不強制把自己掛最上面
  if (query || isMutualCover.value) {
    return list;
  }
  // 無搜尋瀏覽全校時：自己置頂
  const me = [];
  const others = [];
  list.forEach(t => {
    if (String(t.teacherName || t.name || '').toLowerCase() === myName) me.push(t);
    else others.push(t);
  });
  if (!me.length && subj === 'all') {
    const self = lookupTeacher(user.value.email);
    if (self) me.push(self);
  }
  return me.concat(others);
});

const selectedClassWeekDates = computed(() => {
  const dates = [];
  const current = new Date(selectedClassDate.value + 'T00:00:00');
  const day = current.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayDiff);
  for (let i = 0; i < 5; i++) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    dates.push(toLocalDateStr(next));
  }
  return dates;
});

const period8WeekDates = computed(() => {
  const dates = [];
  const current = new Date(period8WeekDate.value + 'T00:00:00');
  const day = current.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayDiff);
  for (let i = 0; i < 5; i += 1) {
    const next = new Date(monday);
    next.setDate(monday.getDate() + i);
    dates.push(toLocalDateStr(next));
  }
  return dates;
});

const classSubstitutionMap = computed(() => {
  if (DomainSchedule && typeof DomainSchedule.buildClassSubstitutionMap === 'function') {
    return DomainSchedule.buildClassSubstitutionMap(classSubstitutionRows.value);
  }
  const map = {};
  classSubstitutionRows.value.forEach(r => {
    const key = `${r.className}|${r.date}|${r.period}`;
    const previous = map[key];
    const isTask = row => !!(row && (row.isEmptySlotAssign
      || String(row.reason || row['請假事由'] || '').trim() === '空堂排班'
      || String(row.note || row['備註'] || '').indexOf('[空堂排班]') >= 0));
    if (!previous || (isTask(previous) && !isTask(r)) || isTask(previous) === isTask(r)) map[key] = r;
  });
  return map;
});

const displayTimetableTeachers = computed(() => {
  const base = filteredTeachers.value.slice();
  if (!showMatchModal.value || !activeCell.value?.teacherEmail) return base;
  const key = String(activeCell.value.teacherEmail).toLowerCase();
  if (base.some(t => String(t.email || '').toLowerCase() === key)) return base;
  const found = lookupTeacher(key);
  if (found) base.push(found);
  return base;
});

const visibleTimetableTeachers = computed(() => {
  const list = displayTimetableTeachers.value || [];
  // 人數少於一頁：不分頁（一般教師／我的課表）
  if (list.length <= ttPageSize.value) return list;
  const size = ttPageSize.value || TT_PAGE_SIZE_DEFAULT;
  const page = Math.min(Math.max(1, ttPage.value), Math.max(1, Math.ceil(list.length / size)));
  const start = (page - 1) * size;
  return list.slice(start, start + size);
});

    return {
      classList: classList,
      period8RosterData: period8RosterData,
      classScheduleIndex: classScheduleIndex,
      classSchedules: classSchedules,
      currentWeekDates: currentWeekDates,
      filteredTeachers: filteredTeachers,      selectedClassWeekDates: selectedClassWeekDates,
      period8WeekDates: period8WeekDates,
      classSubstitutionMap: classSubstitutionMap,
      displayTimetableTeachers: displayTimetableTeachers,
      visibleTimetableTeachers: visibleTimetableTeachers,

    };
  }
  return { create: create };
})();

export { UiSchedule };
