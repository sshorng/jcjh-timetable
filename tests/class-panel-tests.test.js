// @vitest-environment happy-dom
import { test, expect } from 'vitest';
import { nextTick, createApp, h } from 'vue';
import ClassPanel from '../src/components/ClassPanel.vue';

const noop = () => {};
const passthrough = (v) => v;

function mountPanel(overrides) {
  const warnings = [];
  const props = {
    classReadonlyMode: false,
    classViewerReadonly: false,
    isAdmin: false,
    classList: ['701', '703、704', '英資A'],
    selectedClassWeekDates: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
    classWeekNumber: '',
    timetablePeriods: [1],
    isMobile: true,
    classSchedules: {
      701: { '1-1': [{ teacherName: '王老師', subject: '國文' }] }
    },
    classSubstitutionMap: {},
    classChangeSummary: [],
    isCombinedClass: (v) => String(v || '').includes('、'),
    copyClassReadonlyLink: noop,
    changeClassWeek: noop,
    formatDateMMDD: passthrough,
    selectClassForView: noop,
    getPeriodClass: () => '',
    getPeriodLabel: (p) => '第' + p + '節',
    getPeriodTimeSpan: () => '',
    getClassCellClassForClass: () => '',
    handleClassCellClick: noop,
    getSubjectStyle: () => '',
    isMatchSourceEntry: () => false,
    isMatchHoverEntry: () => false,
    hasScheduleSpecialTag: () => false,
    isClassAwayOnDate: () => false,
    getClassAwayEventName: () => '',
    getRealTeacherName: passthrough,
    getClassChangeTypeLabel: passthrough,
    goToClassThisWeek: noop,
    selectedClass: '701',
    ...overrides
  };
  const app = createApp({ render: () => h(ClassPanel, props) });
  app.config.warnHandler = (msg) => { warnings.push(String(msg)); };
  const el = document.createElement('div');
  document.body.appendChild(el);
  app.mount(el);
  return { app, el, warnings };
}

test('class panel：併班不設按鈕，單班與特殊班保留', async () => {
  const { app, el, warnings } = mountPanel({});
  await nextTick();
  const buttons = [...el.querySelectorAll('.class-pick-btn')].map((b) => b.textContent.trim());
  expect(buttons).toContain('701');
  expect(buttons).toContain('英資A');
  expect(buttons.some((t) => t.includes('、'))).toBe(false);
  app.unmount();
  expect(warnings).toEqual([]);
});

test('class panel：併班課程仍顯示於單班課表內', async () => {
  const { app, el, warnings } = mountPanel({
    classSchedules: {
      701: { '1-1': [{ teacherName: '王老師', subject: '國文併班', specialFlow: 'combined_return' }] }
    }
  });
  await nextTick();
  expect(el.innerHTML).toContain('國文併班');
  app.unmount();
  expect(warnings).toEqual([]);
});
