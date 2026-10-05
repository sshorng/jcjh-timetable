import assert from 'node:assert/strict';
import { test } from 'vitest';
import DateUtils from '../src/domain/date-utils.js';
import DomainSchedule from '../src/domain/domain-schedule.js';
import DomainMatch from '../src/domain/domain-match.js';
import { UiSubmitHelpers } from '../src/modules/ui-request.js';

test('exchange week contract tests（v1 移植）', () => {
  const chemistryRequest = { className: '8英資A', subject: '化學' };
  const patrolPlaceholder = {
    originalTeacherEmail: 'zeng@example.com',
    actualTeacherEmail: 'zeng@example.com',
    className: '巡九', subject: '巡堂', type: 'substitution',
    reason: '空堂排班', isEmptySlotAssign: true
  };
  const actualChemistryDuty = {
    originalTeacherEmail: 'chen@example.com',
    actualTeacherEmail: 'zeng@example.com',
    className: '8英資A', subject: '化學', type: 'substitution', reason: '事假'
  };
  assert.equal(
    DomainSchedule.selectActualDutyRecord([actualChemistryDuty, patrolPlaceholder], 'zeng@example.com'),
    actualChemistryDuty,
    '後來加入的空堂巡堂任務不可覆蓋實際代課班科'
  );
  assert.equal(
    DomainSchedule.resolveSubstitutionCourse(
      { className: '巡九', subject: '巡堂' }, patrolPlaceholder,
      { className: '8英資A', subject: '化學' }, false
    ).className,
    '8英資A',
    '來源教師的巡堂任務不可取代原課表中的被代課程'
  );
  assert.equal(
    DomainSchedule.resolveSubstitutionCourse(
      { className: '巡九', subject: '巡堂' }, patrolPlaceholder,
      { className: '8英資A', subject: '化學' }, false
    ).subject,
    '化學'
  );
  assert.equal(
    DomainSchedule.resolveSubstitutionCourse(chemistryRequest, actualChemistryDuty, null, false).subject,
    '化學',
    '再辦時仍應沿用實際代課的有效班科'
  );
  assert.deepEqual(
    DomainSchedule.resolveSubstitutionCourse({ className: '', subject: '巡堂' }, null, { className: '8英資A', subject: '化學' }, true),
    { className: '', subject: '巡堂' },
    '新建空堂巡堂任務仍以任務資料為準'
  );
  const classCourseRecord = {
    className: '8英資A', date: '2026-09-15', period: 3,
    originalTeacherEmail: 'chen@example.com', actualTeacherEmail: 'zeng@example.com',
    subject: '化學', type: 'substitution', reason: '事假'
  };
  const classPatrolTask = {
    className: '8英資A', date: '2026-09-15', period: 3,
    originalTeacherEmail: 'chen@example.com', actualTeacherEmail: 'chen@example.com',
    subject: '巡堂', type: 'substitution', reason: '空堂排班', isEmptySlotAssign: true
  };
  const classMapAfterPatrolTask = DomainSchedule.buildClassSubstitutionMap([classCourseRecord, classPatrolTask]);
  assert.equal(
    classMapAfterPatrolTask['8英資A|2026-09-15|3'].subject,
    '化學',
    '後加的同班空堂巡堂任務不可覆蓋已建立的實際代課課程'
  );
  assert.equal(
    DomainSchedule.buildClassSubstitutionMap([classPatrolTask])['8英資A|2026-09-15|3'].subject,
    '巡堂',
    '沒有實際代課課程時仍可顯示巡堂任務'
  );
  const chenZengSlotSchedules = [
    { teacherEmail: 'chen@example.com', teacherName: '陳老師', dayOfWeek: 2, period: 3, className: '8英資A', subject: '化學' },
    { teacherEmail: 'zeng@example.com', teacherName: '曾老師', dayOfWeek: 2, period: 4, className: '802', subject: '數學' }
  ];
  const chenZengSlotRecords = [
    {
      id: 'chen-chem-sub', requestId: 'chen-chem-sub', date: '2026-09-15', period: 3,
      originalTeacherEmail: 'chen@example.com', actualTeacherEmail: 'zeng@example.com',
      className: '8英資A', subject: '化學', type: 'substitution', reason: '事假'
    },
    Object.assign({}, classPatrolTask, {
      id: 'chen-patrol-task', requestId: 'chen-patrol-task', date: '2026-09-15', period: 3
    })
  ];
  const zengCellDuringChenPatrol = DomainSchedule.resolveApprovedSchedule({
    teacherEmail: 'zeng@example.com',
    dateStr: '2026-09-15',
    dayOfWeek: 2,
    period: 3,
    allSchedules: chenZengSlotSchedules,
    scheduleIndex: DomainSchedule.buildScheduleIndex(chenZengSlotSchedules),
    periodSubs: chenZengSlotRecords,
    allSubs: chenZengSlotRecords,
    helpers: {
      getTeacherNameByEmail(value) { return value === 'chen@example.com' ? '陳老師' : '曾老師'; },
      getTeacherSubjectByEmail() { return ''; },
      formatDateMMDD(value) { return value; },
      isSingleWeek() { return true; },
      isClassAway() { return false; },
      getWeekDayText() { return '二'; }
    }
  });
  assert.equal(zengCellDuringChenPatrol.className, '8英資A', '陳老師加巡堂後，曾老師仍應顯示代課班級');
  assert.equal(zengCellDuringChenPatrol.subject, '化學');

  assert.equal(DateUtils.getExchangeTargetDate('2026-09-07', '2-8', 1), '2026-09-15');
  assert.equal(DateUtils.getExchangeTargetDate('2026-09-07', '2-8', 2), '2026-09-22');
  assert.equal(DateUtils.getExchangeTargetDate('2026-09-07', '2-8', -1), '2026-09-01');
  assert.equal(DateUtils.getExchangeTargetDate('2026-09-07', '9-8', 1), '');

  const schedules = [
    { teacherEmail: 'target@example.com', dayOfWeek: 2, period: 8, className: '701', subject: '單週課', attr: '單週' },
    { teacherEmail: 'target@example.com', dayOfWeek: 2, period: 8, className: '701', subject: '雙週課', attr: '雙週' }
  ];

  function getScheduleForDate(email, dateStr, period, dayOfWeek) {
    const single = dateStr === '2026-09-15';
    return schedules.find(row => row.teacherEmail === email
      && row.dayOfWeek === Number(dayOfWeek)
      && row.period === Number(period)
      && (row.attr === '單週' ? single : !single)) || null;
  }

  function listCandidate(isSingleWeek, targetDate) {
    const targetWeek = DateUtils.getWeekDatesFrom(targetDate);
    return DomainMatch.listExchangeCandidates({
      allSchedules: schedules,
      className: '701',
      leaveEmail: 'leave@example.com',
      leaveDate: '2026-09-07',
      leavePeriod: 8,
      leaveDay: 1,
      leaveCell: { className: '701', subject: '課程', attr: '一般' },
      weekDates: targetWeek,
      isSingleWeek: () => isSingleWeek,
      getScheduleForDate,
      getTeacherNameByEmail: () => '目標教師'
    });
  }

  assert.equal(listCandidate(true, '2026-09-15').length, 1);
  assert.equal(listCandidate(true, '2026-09-15')[0].subject, '單週課');
  assert.equal(listCandidate(false, '2026-09-22').length, 1);
  assert.equal(listCandidate(false, '2026-09-22')[0].subject, '雙週課');

  assert.deepEqual(DomainMatch.listExchangeCandidates({
    allSchedules: schedules,
    className: '701',
    leaveEmail: undefined,
    leaveDate: '2026-09-07',
    leavePeriod: 8,
    leaveDay: 1,
    weekDates: DateUtils.getWeekDatesFrom('2026-09-15'),
    getScheduleForDate
  }), [], '缺少請假教師鍵時應停止調課候選解析');

  assert.doesNotThrow(() => DomainSchedule.resolveApprovedSchedule({
    teacherEmail: undefined,
    dateStr: '2026-09-15',
    dayOfWeek: 2,
    period: 8,
    allSchedules: [],
    scheduleIndex: DomainSchedule.buildScheduleIndex([]),
    periodSubs: [{
      date: '2026-09-15',
      period: 8,
      originalTeacherEmail: 'target@example.com',
      actualTeacherEmail: 'cover@example.com',
      className: '701',
      subject: '單週課',
      type: 'substitution'
    }],
    allSubs: [],
    helpers: {}
  }), '課表解析遇到空教師鍵時不應拋出例外');

  const samePeriodSchedules = [
    { teacherEmail: 'swap-a@example.com', teacherName: 'A老師', dayOfWeek: 2, period: 3, className: '701', subject: '國文' },
    { teacherEmail: 'swap-b@example.com', teacherName: 'B老師', dayOfWeek: 2, period: 3, className: '802', subject: '數學' }
  ];
  const samePeriodRecords = [
    {
      id: 'same-period_1', requestId: 'same-period', date: '2026-09-15', period: 3,
      originalTeacherEmail: 'swap-a@example.com', actualTeacherEmail: 'swap-b@example.com',
      className: '701', subject: '國文', type: 'exchange'
    },
    {
      id: 'same-period_2', requestId: 'same-period', date: '2026-09-15', period: 3,
      originalTeacherEmail: 'swap-b@example.com', actualTeacherEmail: 'swap-a@example.com',
      className: '802', subject: '數學', type: 'exchange'
    }
  ];
  function resolveSamePeriodSwap(email) {
    return DomainSchedule.resolveApprovedSchedule({
      teacherEmail: email,
      dateStr: '2026-09-15',
      dayOfWeek: 2,
      period: 3,
      allSchedules: samePeriodSchedules,
      scheduleIndex: DomainSchedule.buildScheduleIndex(samePeriodSchedules),
      periodSubs: samePeriodRecords,
      allSubs: samePeriodRecords,
      helpers: {
        getTeacherNameByEmail(value) { return value === 'swap-a@example.com' ? 'A老師' : 'B老師'; },
        getTeacherSubjectByEmail() { return ''; },
        formatDateMMDD(value) { return value; },
        isSingleWeek() { return true; },
        isClassAway() { return false; },
        getWeekDayText() { return '二'; }
      }
    });
  }
  const samePeriodCellA = resolveSamePeriodSwap('swap-a@example.com');
  const samePeriodCellB = resolveSamePeriodSwap('swap-b@example.com');
  assert.equal(samePeriodCellA.className, '802', 'A 老師同節互換後應改上 B 的班');
  assert.equal(samePeriodCellA.subject, '數學');
  assert.equal(samePeriodCellA.outgoingDuty.className, '701', 'A 的原課需保留為調出資訊');
  assert.equal(samePeriodCellB.className, '701', 'B 老師同節互換後應改上 A 的班');
  assert.equal(samePeriodCellB.subject, '國文');
  assert.equal(samePeriodCellB.outgoingDuty.className, '802');

  // 空堂事件取消的課不能拿來交換；其他班級釋出的空堂仍可用於互調。
  const holidaySchedule = {
    teacherEmail: 'target@example.com', teacherName: '目標教師',
    dayOfWeek: 1, period: 1, className: '901', subject: '公民'
  };
  function listHolidayCandidates(targetDate, cancelled, requesterReleased) {
    return DomainMatch.listExchangeCandidates({
      allSchedules: [holidaySchedule],
      className: '901',
      leaveEmail: 'leave@example.com',
      leaveDate: '2026-10-02', leavePeriod: 7, leaveDay: 5,
      leaveCell: { className: '901', subject: '生活科技' },
      weekDates: DateUtils.getWeekDatesFrom(targetDate),
      getTeacherNameByEmail: () => '目標教師',
      getScheduleForDate(email, date, period) {
        if (date === targetDate && Number(period) === 1) {
          if (email === holidaySchedule.teacherEmail) {
            return { ...holidaySchedule, isClassAway: cancelled };
          }
          if (requesterReleased) return { className: '902', isClassAway: true };
        }
        return null;
      }
    });
  }
  assert.equal(listHolidayCandidates('2026-09-28', true, false).length, 0,
    '9/28 空堂事件取消的課不可出現在調課推薦');
  assert.equal(listHolidayCandidates('2026-09-28', false, false).length, 1,
    '沒有空堂事件時，同一堂課仍可推薦');
  assert.equal(listHolidayCandidates('2026-10-05', false, false).length, 1,
    '跨週的正常課程仍可推薦');
  const releasedCandidates = listHolidayCandidates('2026-09-28', false, true);
  assert.equal(releasedCandidates.length, 1, '其他班級外出釋出的空堂仍可互調');
  assert.equal(releasedCandidates[0].freeByAway, true);

  async function runPrepCompareUsesEffectiveTargetCourseTest() {
    const pendingRequestData = ref({});
    const activeCell = ref({
      teacherEmail: 'leave@example.com',
      dayOfWeek: 5,
      period: 4,
      classData: { className: '905', subject: '國文' }
    });
    const result = await UiSubmitHelpers.prepCompare({
      activeCell,
      inputRequestDate: ref('2026-10-02'),
      allSchedules: ref([]),
      showConfirm: async () => true,
      getScheduleForDate(email, dateStr, period) {
        if (email === 'invitee@example.com' && dateStr === '2026-10-02' && Number(period) === 5) {
          return { className: '905', subject: '童軍' };
        }
        return null;
      },
      formatDateMMDD: dateStr => String(dateStr).slice(5).replace('-', '/'),
      getWeekDayText: day => ({ 1: '一', 2: '二', 3: '三', 4: '四', 5: '五' })[day] || '',
      exchangePeriodId: ref(''),
      exchangeWeekOffset: ref(0),
      exchangeTargetDate: ref(''),
      isBatchCandidatePreview: true,
      consecAlertsA: ref([]),
      consecAlertsB: ref([]),
      isMutualCover: ref(false),
      assignMutualDraftFromMatch: () => {},
      PERIOD8_FEE: '第8節代課',
      pendingRequestData,
      showMatchModal: ref(true),
      showCompareModal: ref(false),
      getLeaveTimeDefaults: () => ({ type: '', start: '', end: '', range: '' }),
      isSingleWeek: () => false,
      getTeacherNameByEmail: email => email
    }, 'exchange', 'invitee@example.com', '5-5', '家政', '905');

    assert.equal(result, 'opened');
    assert.equal(pendingRequestData.value.isBatchCandidatePreview, true, '批次候選預覽需由模擬資料標記為唯讀');
    assert.equal(pendingRequestData.value.subB, '童軍', '調課申請應保存目標日期的有效科目，而非候選列快照');
    assert.equal(pendingRequestData.value.subBClass, '905');

    const built = UiSubmitHelpers.buildSubmitPayload({
      pendingRequestData,
      currentSemester: ref('115-1'),
      getTeacherNameByEmail: email => email === 'leave@example.com' ? '申請教師' : '受邀教師',
      isAdmin: ref(false),
      directApproveMode: ref(false),
      paperFlow: ref(false),
      isMutualCover: ref(false),
      PERIOD8_FEE: '第8節代課',
      activeCell
    }, 'req-effective-course', 'SWP1001');
    assert.equal(built.newRequest['對調目標科目'], '童軍', '送往後端的申請欄位也應是目標日期有效科目');
    assert.equal(built.newRequest['對調目標班級'], '905');
  }

  async function runDateAwareValidationTest() {
    const pendingRequestData = ref({
      mode: 'exchange',
      leaveTeacher: 'leave@example.com',
      subTeacher: 'target@example.com',
      date: '2026-09-07',
      timeKey: '1-8',
      dateB: '2026-09-15',
      timeB: '2-8',
      reason: '課務調整',
      subFee: '無'
    });
    const valid = await UiSubmitHelpers.validateSubmitRequest({
      pendingRequestData: ref(pendingRequestData.value),
      showToast: () => {},
      showConfirm: async () => true,
      isAdmin: ref(false),
      getTeacherNameByEmail: () => '測試教師',
      hasSubTeacherConflict: ref(false),
      assertQuotaDeductAllowed: () => true,
      isMutualCover: ref(false),
      activeCell: ref({ classData: { className: '701', subject: '課程', attr: '一般' } }),
      allSchedules: ref([
        { teacherEmail: 'target@example.com', dayOfWeek: 2, period: 8, className: '701', subject: '單週課', attr: '單週' },
        { teacherEmail: 'target@example.com', dayOfWeek: 2, period: 8, className: '701', subject: '雙週抽離', attr: '雙週' }
      ]),
      isSingleWeek: () => true
    });
    assert.equal(valid, true, '目標日應只使用該週有效的單／雙週課');
  }

  function ref(value) {
    return { value };
  }

  const sourceWeek = ref(DateUtils.getWeekDatesFrom('2026-09-07'));
  const targetWeek = ref(DateUtils.getWeekDatesFrom('2026-09-15'));
  const compareDeps = {
    pendingRequestData: ref({
      mode: 'exchange',
      leaveTeacher: 'leave@example.com',
      subTeacher: 'target@example.com',
      date: '2026-09-07',
      timeKey: '1-8',
      cls: '701',
      dateB: '2026-09-15',
      timeB: '2-8',
      subBClass: '702'
    }),
    currentWeekDates: sourceWeek,
    compareWeekDatesA: sourceWeek,
    compareWeekDatesB: targetWeek,
    resolveCompareBEmail: () => 'target@example.com',
    getScheduleForDate: () => null,
    isClassAwayOnDate: () => false,
    isSlotConflict: () => false,
    isBatchSlotAt: () => false,
    getBatchSlotForCompareB: () => null
  };

  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'A', 1, 8), 'mini-cell-out');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'A', 2, 8), '');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'B', 2, 8), 'mini-cell-out');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'B', 1, 8), '');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'A', 1, 8, 'source'), 'mini-cell-out');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'B', 1, 8, 'source'), 'mini-cell-new');
  assert.equal(UiSubmitHelpers.getCompareCellText(compareDeps, 'B', 1, 8, 'source'), '701 換入');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'A', 2, 8, 'target'), 'mini-cell-new');
  assert.equal(UiSubmitHelpers.getCompareCellText(compareDeps, 'A', 2, 8, 'target'), '702 換入');
  assert.equal(UiSubmitHelpers.getCompareCellClass(compareDeps, 'B', 2, 8, 'target'), 'mini-cell-out');

  const batchWeeks = UiSubmitHelpers.getBatchCompareWeeks([
    { dateStr: '2026-09-21' },
    { dateStr: '2026-09-08' },
    { dateStr: '2026-09-15' },
    { dateStr: '2026-09-22' }
  ]);
  assert.deepEqual(batchWeeks.map(week => week[0]), [
    '2026-09-07', '2026-09-14', '2026-09-21'
  ], '批次跨三週時應依週一排序並合併重複週次');
  assert.equal(batchWeeks.every(week => week.length === 5), true, '每個批次瀏覽週應包含週一至週五');

  runDateAwareValidationTest()
    .then(runPrepCompareUsesEffectiveTargetCourseTest)
    .then(() => console.log('exchange week contract tests PASS'))
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });

});
