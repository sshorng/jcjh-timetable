import { describe, expect, test } from 'vitest';
import { UiTimetable } from '../src/modules/ui-timetable.js';

const ref = value => ({ value });
const computed = getter => ({ get value() { return getter(); } });

function makeDeps(over = {}) {
  const today = '2026-10-09';
  return {
    computed,
    allSchedules: ref([]),
    schoolSwaps: ref([]),
    substitutionRecords: ref([]),
    substitutionsLookup: ref({}),
    allPendingRequests: ref([]),
    displayTimetableTeachers: ref([]),
    currentWeekDates: ref([]),
    getTeacherNameByEmail: () => '',
    getTeacherSubjectByEmail: () => '',
    formatDateMMDD: s => s,
    isSingleWeek: () => true,
    isClassAwayOnDate: () => false,
    getWeekDayText: () => '',
    batchSelectMode: ref(false),
    isBatchSlotSelected: () => false,
    isMutualCover: ref(false),
    getMutualDraftAt: () => null,
    mutualAwayClasses: ref([]),
    mutualActivityStart: ref(''),
    mutualActivityEnd: ref(''),
    mutualActivityStartPeriod: ref(''),
    mutualActivityEndPeriod: ref(''),
    isMutualActivitySlotInRange: () => false,
    getTodayString: () => today,
    getClassAwayEventsForView: () => [
      { name: '九年級畢旅', startDate: today, endDate: today, enabled: true, scope: 'all' }
    ],
    semesterEndDate: ref('2027-01-31'),
    ...over
  };
}

describe('activeAwayBanner 缺 dep 不得炸（生產 anonymous .value 迴歸）', () => {
  test('缺少 classList（舊 getTimetableApi 形狀）仍回 banner、不丟 .value', () => {
    const api = UiTimetable.create(makeDeps());
    let banner;
    expect(() => { banner = api.activeAwayBanner.value; }).not.toThrow();
    expect(banner).not.toBeNull();
    expect(banner.names).toContain('九年級畢旅');
    expect(banner.count).toBe(0);
  });

  test('補上 classList 後 count 正常展開', () => {
    const api = UiTimetable.create(makeDeps({ classList: ref(['701', '702']) }));
    const banner = api.activeAwayBanner.value;
    expect(banner.count).toBe(2);
  });

  test('無空堂事件時回 null、不碰 classList', () => {
    const api = UiTimetable.create({
      ...makeDeps({ classList: undefined }),
      getClassAwayEventsForView: () => []
    });
    expect(api.activeAwayBanner.value).toBeNull();
  });

  test('getClassAwayEventName 缺 semesterEndDate 不丟', () => {
    const deps = makeDeps();
    delete deps.semesterEndDate;
    const api = UiTimetable.create(deps);
    expect(() => api.getClassAwayEventName('701', '2026-10-09', 1)).not.toThrow();
  });
});
