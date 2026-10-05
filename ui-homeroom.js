/**
 * ui-homeroom.js — 代導／空堂（載入／指派／手動建單／申請驗證／額度預覽）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 * manualHomeroomSearchQuery 在原檔從未宣告（latent bug），改由本模組持有。
 */
window.UiHomeroom = (function () {
  function create(deps) {
    deps = deps || {};
    var isCourseAdjustmentOnlyRequest = deps.isCourseAdjustmentOnlyRequest;
    var substitutionRecords = deps.substitutionRecords;
    var isEmptySlotAssignmentRequest = deps.isEmptySlotAssignmentRequest;
    var computed = deps.computed;
    var callGasApi = deps.callGasApi;
    var isAdmin = deps.isAdmin;
    var user = deps.user;
    var homeroomRecordsLoading = deps.homeroomRecordsLoading;
    var currentSemester = deps.currentSemester;
    var homeroomRecords = deps.homeroomRecords;
    var loadWeeklyData = deps.loadWeeklyData;
    var homeroomAssignSelections = deps.homeroomAssignSelections;
    var teachersList = deps.teachersList;
    var extractNameFromFormatted = deps.extractNameFromFormatted;
    var getHomeroomCoverCandidates = deps.getHomeroomCoverCandidates;
    var teachersListDetails = deps.teachersListDetails;
    var manualHomeroomForm = deps.manualHomeroomForm;
    var getTodayYmdStr = deps.getTodayYmdStr;
    var showManualHomeroomModal = deps.showManualHomeroomModal;
    // R16：代導判定 7 件自 app.js 搬移（本模組持有；isFullDayHomeroomLeave 內部共用）
    const homeroomTimeRangeBounds = (raw) => {
      const normalized = String(raw == null ? '' : raw).trim()
        .replace(/[～—–]/g, '~').replace(/\s*至\s*/g, '~').replace(/\s*-\s*/g, '~');
      const match = normalized.match(/^(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const start = Number(match[1]) * 60 + Number(match[2]);
      const end = Number(match[3]) * 60 + Number(match[4]);
      if (Number(match[1]) > 23 || Number(match[3]) > 23
          || Number(match[2]) > 59 || Number(match[4]) > 59 || end <= start) return null;
      return { start, end };
    };
    const homeroomFullDayEndMinutes = (record, teacherKey) => {
      const key = String(record && (record.leaveEmail || record.originalTeacherEmail
        || record.requesterEmail || record['申請人Email'] || record['原導師Email']
        || record.originalTeacherName || record.requesterName || record['申請人姓名'] || record['原導師姓名']
        || teacherKey) || '').trim().toLowerCase();
      const teacher = (teachersList.value || []).find(t => {
        const email = String(t && (t.loginEmail || t.email) || '').trim().toLowerCase();
        const name = String(t && (t.teacherName || t.name) || '').trim().toLowerCase();
        return key && (key === email || key === name);
      });
      const role = String(teacher && teacher.role || '').trim().toLowerCase();
      return role === 'admin' || role === 'staff' ? 17 * 60 : 16 * 60;
    };
    const isFullDayHomeroomLeave = (record, teacherKey) => {
      const type = String(record && (record.leaveTimeType || record['請假時間類型']) || '').trim();
      if (/^(上午|下午|半日|半天)$/.test(type)) return false;
      const raw = record && (record.leaveTime || record['請假時間'] || record.timeRange || '');
      const normalized = String(raw == null ? '' : raw).trim()
        .replace(/[～—–]/g, '~').replace(/\s*至\s*/g, '~').replace(/\s*-\s*/g, '~');
      if (!normalized || normalized === '全天' || normalized === '全日') {
        return !type || type === '全天' || type === '全日';
      }
      const bounds = homeroomTimeRangeBounds(normalized);
      return !!bounds && bounds.start <= 8 * 60 && bounds.end >= homeroomFullDayEndMinutes(record, teacherKey);
    };
    const getTeacherJobTitleByEmail = (email) => {
      if (!email) return '';
      const t = lookupTeacher(email);
      return t ? (t.jobTitle || t.job || '') : '';
    };
    const chineseClassNumber = (raw) => {
      const value = String(raw || '').trim();
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (value === '十') return 10;
      if (value.startsWith('十')) return 10 + parseInt(({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[value.slice(1)] || ''), 10);
      return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }[value] || 0);
    };
    const getHomeroomClassCodes = (value) => {
      const raw = String(value || '').replace(/\s+/g, '');
      if (!raw) return [];
      const codes = new Set((raw.match(/[789]\d{2}/g) || []));
      const namedClasses = raw.match(/[789七八九]年(?:級)?[0-9一二三四五六七八九十]+班/g) || [];
      namedClasses.forEach(named => {
        const match = named.match(/^([789七八九])年(?:級)?([0-9一二三四五六七八九十]+)班$/);
        if (!match) return;
        const grade = ({ 七: '7', 八: '8', 九: '9' }[match[1]] || match[1]);
        const classNumber = chineseClassNumber(match[2]);
        if (classNumber > 0) codes.add(grade + String(classNumber).padStart(2, '0'));
      });
      return Array.from(codes);
    };
    const isHomeroomTeacher = (teacher, className) => {
      const targetClass = className || (activeCell.value && activeCell.value.classData && activeCell.value.classData.className);
      if (!teacher || !targetClass) return false;
      const directTitle = teacher.jobTitle || teacher.job || teacher['職務'] || '';
      const title = String(directTitle || getTeacherJobTitleByEmail(
        teacher.loginEmail || teacher.email || teacher.teacherName || teacher.name
      ) || '').trim();
      if (!title.includes('導師')) return false;
      const targetCodes = getHomeroomClassCodes(targetClass);
      if (!targetCodes.length) return false;
      const teacherCodes = getHomeroomClassCodes(title);
      return targetCodes.some(code => teacherCodes.includes(code));
    };
    var getLeaveTimeDefaults = deps.getLeaveTimeDefaults;
    var reportStartDate = deps.reportStartDate;
    var reportEndDate = deps.reportEndDate;
    var activeCell = deps.activeCell;
    var inputRequestDate = deps.inputRequestDate;
    var allSchedules = deps.allSchedules;
    var pendingRequestData = deps.pendingRequestData;
    var matchMode = deps.matchMode;
    var isBatchGroupExpanded = deps.isBatchGroupExpanded;
    var makeBatchItemRow = deps.makeBatchItemRow;
    var exchangeWeekOffset = deps.exchangeWeekOffset;
    var getExchangeWeekDates = deps.getExchangeWeekDates;
    var toLocalDateStr = deps.toLocalDateStr;
    var isSingleWeek = deps.isSingleWeek;
    var getScheduleForDate = deps.getScheduleForDate;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var isMutualCover = deps.isMutualCover;
    var mutualAwayClasses = deps.mutualAwayClasses;
    var batchSlots = deps.batchSlots;
    var QUOTA_DEDUCT_FEE = deps.QUOTA_DEDUCT_FEE;
    var lookupTeacher = deps.lookupTeacher;
    var isPeriod8FeeLocked = deps.isPeriod8FeeLocked;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var batchSubFee = deps.batchSubFee;
    var manualHomeroomSearchQuery = deps.manualHomeroomSearchQuery || { value: '' };

const loadHomeroomRecords = async (opts = {}) => {
  if (!isAdmin.value || !user.value) return false;
  homeroomRecordsLoading.value = true;
  try {
    const res = await callGasApi('getHomeroomRecords', { semesterId: currentSemester.value });
    if (res && Array.isArray(res.homeroomRecords)) {
      homeroomRecords.value = res.homeroomRecords.map(r => window.FieldMap.mapHomeroomRecord(r));
    }
    return true;
  } catch (e) {
    if (!opts.silent) showToast('載入代導紀錄失敗：' + (e && e.message ? e.message : e), 'warning');
    return false;
  } finally {
    homeroomRecordsLoading.value = false;
  }
};

const executeOptimisticAction = async (opts) => {
  opts = opts || {};
  let snapshot = null;
  if (typeof opts.optimistic === 'function') {
    snapshot = opts.optimistic();
  }
  try {
    const res = typeof opts.apiCall === 'function' ? await opts.apiCall() : null;
    if (typeof opts.onSuccess === 'function') {
      opts.onSuccess(res);
    }
    if (opts.successMessage) {
      showToast(opts.successMessage, 'success', 3000);
    }
    return res;
  } catch (err) {
    console.error('背景同步失敗：', err);
    if (typeof opts.rollback === 'function') {
      opts.rollback(snapshot);
    } else {
      loadWeeklyData({ force: false, silent: true }).catch(function () {});
    }
    const errMsg = err && err.message ? String(err.message) : String(err || '未知錯誤');
    const title = opts.errorTitle || '⚠️ 背景同步失敗警示';
    const msg = (opts.errorMessagePrefix ? (opts.errorMessagePrefix + '：\n\n') : '') + errMsg + '\n\n（系統已嘗試還原本地資料，請檢查網路或數據後再試。）';
    if (typeof showConfirm === 'function') {
      await showConfirm(msg, title, { alertOnly: true });
    } else {
      alert(msg);
    }
    throw err;
  }
};

const assignHomeroomTeacher = async (record) => {
  if (!record || !record.id) return;
  const teacherName = String(homeroomAssignSelections.value[record.id] || '').trim();
  if (!teacherName) {
    showToast('請先選擇代導教師', 'info');
    return;
  }
  const actualTeacher = teachersList.value.find(t => (t.teacherName || t.name) === teacherName);
  const actualName = actualTeacher ? (actualTeacher.teacherName || actualTeacher.name) : teacherName;

  await executeOptimisticAction({
    optimistic: () => {
      const snapshot = (homeroomRecords.value || []).slice();
      const next = snapshot.slice();
      const idx = next.findIndex(r => r.id === record.id);
      if (idx >= 0) {
        next[idx] = Object.assign({}, next[idx], {
          actualTeacherName: actualName,
          status: 'assigned'
        });
      }
      homeroomRecords.value = next;
      const nextSelections = Object.assign({}, homeroomAssignSelections.value);
      delete nextSelections[record.id];
      homeroomAssignSelections.value = nextSelections;
      return snapshot;
    },
    rollback: (snapshot) => {
      if (snapshot) homeroomRecords.value = snapshot;
    },
    apiCall: () => callGasApi('saveHomeroomCoverTeacher', {
      semesterId: currentSemester.value,
      recordId: record.id,
       actualTeacherName: actualName
    }),
    successMessage: `✅ 代導教師（${actualName}）指定成功，已同步至雲端`,
    errorMessagePrefix: `指定代導教師（${actualName}）失敗`
  });
};

const onHomeroomInputSelect = (record, nameOrEmail) => {
  if (!record || !record.id) return;
  const cleanVal = extractNameFromFormatted(nameOrEmail);
  if (!cleanVal) {
    homeroomAssignSelections.value[record.id] = '';
    return;
  }
  const candidates = (typeof getHomeroomCoverCandidates === 'function' ? getHomeroomCoverCandidates(record) : []) || [];
  const found = candidates.find(t => t.name === cleanVal || t.email === cleanVal) ||
                (teachersListDetails.value || []).find(t => t.name === cleanVal || t.email === cleanVal);
  if (found) {
    homeroomAssignSelections.value[record.id] = found.teacherName || found.name;
  } else {
    const partial = candidates.find(t => t.name.indexOf(cleanVal) >= 0) ||
                    (teachersListDetails.value || []).find(t => t.name.indexOf(cleanVal) >= 0);
    if (partial) homeroomAssignSelections.value[record.id] = partial.teacherName || partial.name;
  }
};

const onManualCoverTeacherInput = (nameOrEmail) => {
  const cleanVal = extractNameFromFormatted(nameOrEmail);
  if (!cleanVal) {
    manualHomeroomForm.value.actualTeacherEmail = '';
    return;
  }
  const found = (teachersListDetails.value || []).find(t => t.name === cleanVal || t.email === cleanVal);
  if (found) {
    manualHomeroomForm.value.actualTeacherEmail = found.teacherName || found.name;
  } else {
    const partial = (teachersListDetails.value || []).find(t => t.name.indexOf(cleanVal) >= 0);
    if (partial) manualHomeroomForm.value.actualTeacherEmail = partial.teacherName || partial.name;
  }
};

const getFilteredHomeroomCandidates = (record, query) => {
  const candidates = (typeof getHomeroomCoverCandidates === 'function' ? getHomeroomCoverCandidates(record) : []) || [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return candidates;
  return candidates.filter(t => {
    const name = String(t && t.name || '').toLowerCase();
    const email = String(t && t.email || '').toLowerCase();
    const job = String(t && t.jobTitle || '').toLowerCase();
    const subj = String(t && t.subject || '').toLowerCase();
    return name.indexOf(q) >= 0 || email.indexOf(q) >= 0 || job.indexOf(q) >= 0 || subj.indexOf(q) >= 0;
  });
};

const filteredManualCoverTeachers = computed(() => {
  const q = String(manualHomeroomSearchQuery.value || '').trim().toLowerCase();
  const list = teachersListDetails.value || [];
  if (!q) return list;
  return list.filter(t => {
    const name = String(t && t.name || '').toLowerCase();
    const email = String(t && t.email || '').toLowerCase();
    const job = String(t && t.jobTitle || '').toLowerCase();
    const subj = String(t && t.subject || '').toLowerCase();
    return name.indexOf(q) >= 0 || email.indexOf(q) >= 0 || job.indexOf(q) >= 0 || subj.indexOf(q) >= 0;
  });
});

const openManualHomeroomModal = () => {
  manualHomeroomForm.value = {
    leaveEmail: '',
    className: '',
    date: getTodayYmdStr(),
    leaveTimeType: '全天',
    leaveTime: '08:00~16:00',
    actualTeacherEmail: '',
     note: '導師整日請假，系統未自動產生代導費，手動補建'
  };
  showManualHomeroomModal.value = true;
};

const onManualHomeroomLeaveTeacherChange = () => {
  const email = manualHomeroomForm.value.leaveEmail;
  if (!email) return;
  const t = teachersList.value.find(x => x.email === email);
  if (t) {
    const defaults = getLeaveTimeDefaults(email);
    manualHomeroomForm.value.leaveTimeType = defaults.type;
    manualHomeroomForm.value.leaveTime = defaults.range;
    const title = String(t.jobTitle || '').trim();
    const m = title.match(/([0-9一二三四五六七八九十0-9\-]+(?:\s*年\s*[0-9一二三四五六七八九十]+)?(?:\s*班)?)\s*導師/);
    if (m && m[1]) {
      manualHomeroomForm.value.className = m[1].trim();
    } else if (title) {
      manualHomeroomForm.value.className = title.replace(/導師/g, '').trim() || '導師班';
    }
  }
};

const currentMonthHomeroomRecords = computed(() => {
  const start = String(reportStartDate.value || '').trim();
  const end = String(reportEndDate.value || '').trim();
  const list = (homeroomRecords.value || []).filter(r => {
    if (!r || r.enabled === false || String(r.status || '').toLowerCase() === 'cancelled') return false;
    if (!isBillableHomeroomRecord(r)) return false;
    const date = String(r.date || '').slice(0, 10).replace(/\//g, '-');
    if (!start || !end) return false;
    return date >= start && date <= end;
  });
  return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
});

const saveManualHomeroomRecord = async () => {
  const form = manualHomeroomForm.value;
  if (!form.leaveEmail) { showToast('請選擇請假導師', 'warning'); return; }
  if (!form.date) { showToast('請選擇代導日期', 'warning'); return; }
  if (!isFullDayHomeroomLeave(form)) {
    showToast('代導鐘點費僅適用整日請假；純課務調整、上午／下午或不足全天不建立代導費', 'warning');
    return;
  }

  const origTeacher = teachersList.value.find(t => t.email === form.leaveEmail);
  const origName = origTeacher ? origTeacher.name : form.leaveEmail;
  const actualTeacher = teachersList.value.find(t => t.email === form.actualTeacherEmail);
  const actualName = actualTeacher ? actualTeacher.name : '';

  showManualHomeroomModal.value = false;

  await executeOptimisticAction({
    optimistic: () => {
      const snapshot = (homeroomRecords.value || []).slice();
      const tempRecord = {
        id: 'mentor_manual_temp_' + Date.now(),
        semesterId: currentSemester.value,
        sourceRequestId: 'manual',
        originalTeacherName: origName,
        className: form.className || '導師班',
        date: form.date,
        leaveTimeType: form.leaveTimeType,
        leaveTime: form.leaveTime,
        actualTeacherName: actualName,
        feeAmount: 455,
        status: form.actualTeacherEmail ? 'assigned' : 'pending',
        enabled: true,
        note: form.note || '管理員手動新增代導費'
      };
      homeroomRecords.value = [tempRecord, ...snapshot];
      return snapshot;
    },
    rollback: (snapshot) => {
      if (snapshot) homeroomRecords.value = snapshot;
    },
    apiCall: () => callGasApi('saveManualHomeroomRecord', {
      semesterId: currentSemester.value,
       leaveName: form.leaveEmail,
      className: form.className,
      date: form.date,
      leaveTimeType: form.leaveTimeType,
      leaveTime: form.leaveTime,
       actualTeacherName: form.actualTeacherEmail,
      note: form.note
    }),
    onSuccess: () => loadHomeroomRecords({ silent: true }),
    successMessage: `✅ 已成功建立【${origName}】代導費，並同步至雲端`,
    errorMessagePrefix: `手動新增代導費失敗`
  });
};

const deleteHomeroomRecord = async (record) => {
  if (!record || !record.id) return;
  const ok = await showConfirm(`確定要撤銷／刪除【${record.date} ${record.className || ''} ${record.originalTeacherName}】的代導紀錄嗎？`, '撤銷代導紀錄確認');
  const confirmed = ok && typeof ok === 'object' ? ok.ok : ok;
  if (!confirmed) return;

  await executeOptimisticAction({
    optimistic: () => {
      const snapshot = (homeroomRecords.value || []).slice();
      homeroomRecords.value = snapshot.filter(r => r.id !== record.id);
      return snapshot;
    },
    rollback: (snapshot) => {
      if (snapshot) homeroomRecords.value = snapshot;
    },
    apiCall: () => callGasApi('deleteHomeroomRecord', {
      semesterId: currentSemester.value,
      recordId: record.id
    }),
    successMessage: `✅ 代導紀錄已成功撤銷，並同步至雲端`,
    errorMessagePrefix: `撤銷代導紀錄失敗`
  });
};

const exchangeTeachersList = computed(() => {
  if (!activeCell.value.classData) return [];
  const myClassName = activeCell.value.classData.className;
  const myTeacherEmail = activeCell.value.teacherEmail;
  const requestDate = String(inputRequestDate.value || '').trim();

  const emailsInSameClass = new Set(
    allSchedules.value
      .filter(s => s.className === myClassName && s.teacherEmail !== myTeacherEmail
        && (!requestDate || !window.DomainSchedule || !window.DomainSchedule.isActiveOnDate
          || window.DomainSchedule.isActiveOnDate(s, requestDate)))
      .map(s => s.teacherEmail)
  );
  return teachersList.value.filter(t => emailsInSameClass.has(t.email));
});

const isRequestValid = computed(() => {
  const pending = pendingRequestData.value;
  if (!inputRequestDate.value || !pending) return false;
  if (matchMode.value === 'substitution') {
    return !!pending.subTeacher;
  } else {
    return !!pending.subTeacher && !!pending.timeB && !!pending.dateB;
  }
});

const flattenBatchDisplayGroups = (entries, scope) => {
  const rows = [];
  (entries || []).forEach(entry => {
    rows.push(entry);
    if (entry.displayKind !== 'batch' || !isBatchGroupExpanded(scope, entry.batchId)) return;
    entry.items.forEach((record, index) => {
      rows.push(makeBatchItemRow(
        record,
        `${entry.displayKey}:item:${record && record.id ? record.id : index}`,
        entry.displayKey
      ));
    });
  });
  return rows;
};

const recommendedExchangeList = computed(() => {
  if (matchMode.value !== 'exchange' || !activeCell.value.dayOfWeek || !inputRequestDate.value) return [];
  const leaveCell = activeCell.value.classData || null;

  const offset = parseInt(exchangeWeekOffset.value, 10) || 0;
  const baseDates = getExchangeWeekDates();
  const targetWeekDates = baseDates.map(dStr => {
    if (!dStr) return '';
    if (offset === 0) return dStr;
    const d = new Date(String(dStr).replace(/-/g, '/'));
    if (isNaN(d.getTime())) return dStr;
    d.setDate(d.getDate() + offset * 7);
    return toLocalDateStr(d);
  });

  return window.DomainMatch.listExchangeCandidates({
    allSchedules: allSchedules.value,
    className: leaveCell ? leaveCell.className : '',
    leaveEmail: activeCell.value.teacherEmail,
    leaveDate: inputRequestDate.value,
    leavePeriod: activeCell.value.period,
    leaveDay: activeCell.value.dayOfWeek,
     leaveCell: leaveCell,
     leaveAttr: leaveCell ? leaveCell.attr : '',
     weekDates: targetWeekDates,
     isSingleWeek,
     getScheduleForDate,
    getTeacherNameByEmail,
    // 調課：外出班／空堂事件釋出視同空堂（不特別優先排序）
    awayClasses: isMutualCover.value ? mutualAwayClasses.value : []
  });
});

const resolvePendingPeriods = () => {
  const p = pendingRequestData.value || {};
  if (p.isBatch && batchSlots.value && batchSlots.value.length) {
    return batchSlots.value.map(s => parseInt(s.period, 10)).filter(n => !isNaN(n));
  }
  if (p.isBatch && p.batchSlots && p.batchSlots.length) {
    return p.batchSlots.map(s => parseInt(s.period, 10)).filter(n => !isNaN(n));
  }
  if (p.timeKey) {
    const tk = (window.DateUtils && window.DateUtils.decodeTimeKey)
      ? window.DateUtils.decodeTimeKey(p.timeKey)
      : { period: parseInt(String(p.timeKey).slice(-1), 10) };
    const n = parseInt(tk.period, 10);
    if (!isNaN(n)) return [n];
  }
  if (activeCell.value && activeCell.value.period != null) {
    return [parseInt(activeCell.value.period, 10)];
  }
  return [];
};

const quotaDeductPreview = computed(() => {
  const p = pendingRequestData.value;
  if (!p || p.mode !== 'substitution') return null;
  if (p.subFee !== QUOTA_DEDUCT_FEE) return null;
  if (isPeriod8FeeLocked.value) return null;
  const counts = {};
  if (p.isPerSlot && p.batchSlots && p.batchSlots.length) {
    p.batchSlots.forEach(s => {
      const em = String(s.subTeacherEmail || '').toLowerCase();
      if (!em) return;
      counts[em] = (counts[em] || 0) + 1;
    });
  } else if (p.isBatch && batchSlots.value && batchSlots.value.length) {
    const em = String(p.subTeacher || '').toLowerCase();
    if (em) counts[em] = batchSlots.value.length;
  } else {
    const em = String(p.subTeacher || '').toLowerCase();
    if (em) counts[em] = 1;
  }
  const lines = Object.keys(counts).map(em => {
    const t = lookupTeacher(em);
    const name = (t && t.name) || getTeacherNameByEmail(em) || em;
    const before = t ? (parseFloat(t.mutualQuota) || 0) : 0;
    const deduct = counts[em];
    // 須餘額 ≥ 本次扣節數（每節 1）；不足 1 不夠扣 1
    const short = before + 1e-9 < deduct;
    const after = short ? before : Math.round((before - deduct) * 1000) / 1000;
    return { email: em, name, before, deduct, after: Math.max(0, after), short };
  });
  return lines.length ? lines : null;
});

const switchQuotaDeductToSelfPay = () => {
  const pending = pendingRequestData.value;
  if (!pending || pending.mode !== 'substitution') return;
  if (isPeriod8FeeLocked.value) {
    showToast('第8節須使用計畫經費，無法改自費', 'warning');
    return;
  }
  if (isMutualCover.value) {
    pending.subFee = ACTIVITY_PUBLIC_FEE;
    batchSubFee.value = ACTIVITY_PUBLIC_FEE;
    showToast('額度不足，已改為活動公費', 'info');
    return;
  }
  pending.subFee = '自費代課';
  batchSubFee.value = '自費代課';
  showToast('已改為自費代課，請再確認後送出', 'info');
};

const approvedConvertSig = (requests) => {
  const parts = [];
  (requests || []).forEach((r) => {
    if (!r || r.status !== 'approved') return;
    parts.push([
      r.id || '',
      r.type || '',
      r.batchId || '',
      r.requestDate || r.date || '',
      r.requestPeriod != null ? r.requestPeriod : (r.period || ''),
      r.targetDate || '',
      r.targetPeriod != null ? r.targetPeriod : '',
       r.requesterEmail || '',
       r.targetTeacherEmail || '',
       r.triangleId || '',
       r.triangleLegIndex != null ? r.triangleLegIndex : '',
       r.specialFlow || '',
       r.className || '',
       r.subject || '',
       r.targetClassName || '',
       r.targetSubject || '',
       r.subFee || '',
      r.leaveTimeType || '',
      r.leaveTime || '',
      r.printed ? '1' : '0',
      r.updatedAt || r.createdAt || ''
    ].join('\x1f'));
  });
  parts.sort();
  return parts.join('\x1e');
};

const isBillableHomeroomRecord = (record) => {
  if (isCourseAdjustmentOnlyRequest(record)) return false;
  const ids = String(record && (record.sourceRequestId || record['來源申請單ID']) || '')
    .split(/[,，;；\s]+/).map(value => String(value || '').trim()).filter(Boolean);
  const matched = substitutionRecords.value.filter(request => {
    const requestId = String(request && (request.requestId || request.id || request['申請單ID']) || '').trim();
    return requestId && ids.includes(requestId);
  });
  const hasEmptySlotAssignment = matched.some(isEmptySlotAssignmentRequest);
  const billableMatches = matched.filter(request => !isEmptySlotAssignmentRequest(request));
  if (matched.length && !billableMatches.length) return false;
  if (!matched.length) return isFullDayHomeroomLeave(record);
  const teacherKey = record && (record.leaveEmail || record.originalTeacherEmail
    || record['原導師Email'] || record.originalTeacherName || record['原導師姓名'] || '');
  if (billableMatches.some(request => !isCourseAdjustmentOnlyRequest(request) && isFullDayHomeroomLeave(request, teacherKey))) return true;
  // Requests are time-windowed; keep the persisted full-day record when older source IDs are not loaded.
  return !hasEmptySlotAssignment && billableMatches.length < ids.length && isFullDayHomeroomLeave(record, teacherKey);
};

    return {
      loadHomeroomRecords: loadHomeroomRecords,
      executeOptimisticAction: executeOptimisticAction,
      assignHomeroomTeacher: assignHomeroomTeacher,
      onHomeroomInputSelect: onHomeroomInputSelect,
      onManualCoverTeacherInput: onManualCoverTeacherInput,
      getFilteredHomeroomCandidates: getFilteredHomeroomCandidates,
      filteredManualCoverTeachers: filteredManualCoverTeachers,
      openManualHomeroomModal: openManualHomeroomModal,
      onManualHomeroomLeaveTeacherChange: onManualHomeroomLeaveTeacherChange,
      currentMonthHomeroomRecords: currentMonthHomeroomRecords,
      saveManualHomeroomRecord: saveManualHomeroomRecord,
      deleteHomeroomRecord: deleteHomeroomRecord,
      exchangeTeachersList: exchangeTeachersList,
      isRequestValid: isRequestValid,
      flattenBatchDisplayGroups: flattenBatchDisplayGroups,
      recommendedExchangeList: recommendedExchangeList,
      resolvePendingPeriods: resolvePendingPeriods,
      quotaDeductPreview: quotaDeductPreview,
      switchQuotaDeductToSelfPay: switchQuotaDeductToSelfPay,      approvedConvertSig: approvedConvertSig,
      isBillableHomeroomRecord: isBillableHomeroomRecord,
      homeroomTimeRangeBounds: homeroomTimeRangeBounds,
      homeroomFullDayEndMinutes: homeroomFullDayEndMinutes,
      isFullDayHomeroomLeave: isFullDayHomeroomLeave,
      getTeacherJobTitleByEmail: getTeacherJobTitleByEmail,
      chineseClassNumber: chineseClassNumber,
      getHomeroomClassCodes: getHomeroomClassCodes,
      isHomeroomTeacher: isHomeroomTeacher,

    };
  }
  return { create: create };
})();
