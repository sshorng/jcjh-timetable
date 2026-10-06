/**
 * 自 v1 ui-same-period-swap.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */

/**
 * 管理員同節互換：以目前選取課堂為起點，互換兩位教師同日同節的班級。
 */
const UiSamePeriodSwap = (() => {
  function valueOf(value) {
    return typeof value === 'function' ? value() : (value && value.value !== undefined ? value.value : value);
  }

  function teacherKey(teacher) {
    return String(teacher && (teacher.email || teacher.teacherEmail || teacher['教師Email']
      || teacher.teacherName || teacher.name || teacher['教師姓名'] || teacher.loginEmail) || '')
      .trim().toLowerCase();
  }

  function loginEmail(teacher) {
    var raw = teacher && (teacher.loginEmail || teacher['教師Email'] || teacher.teacherEmail);
    if (!raw && teacher && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(teacher.email || ''))) {
      raw = teacher.email;
    }
    return String(raw || '').trim().toLowerCase();
  }

  function findTeacherByKey(teachers, identity) {
    var key = String(identity || '').trim().toLowerCase();
    return (teachers || []).find(function (teacher) {
      return teacherKey(teacher) === key || loginEmail(teacher) === key
        || teacherName(teacher).toLowerCase() === key;
    }) || null;
  }

  function isValidLoginEmail(value) {
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '').trim());
  }

  function teacherName(teacher) {
    return String(teacher && (teacher.name || teacher.teacherName || teacher['教師姓名']) || '').trim();
  }

  function isPullOut(cell) {
    if (!cell) return false;
    if (cell.isPullOut) return true;
    var tags = String(cell.specialTags || cell['特殊標記'] || '').split(/[、,，;；/／|｜\s]+/);
    return String(cell.attr || cell['課堂屬性'] || '').indexOf('抽離') >= 0
      || tags.some(function (tag) { return String(tag || '').trim() === '抽離'; });
  }

  function isUsableCell(cell) {
    if (!cell || !String(cell.className || '').trim() || !String(cell.subject || '').trim()) return false;
    if (cell.isPending || cell.isSubstituted || cell.isSubstitutionDuty || cell.hasConcurrentDuty || cell.isClassAway) return false;
    if (cell.isPatrol || String(cell.attr || '').indexOf('巡堂') >= 0) return false;
    return true;
  }

  function listCandidates(options) {
    var opts = options || {};
    var sourceKey = String(opts.sourceKey || opts.sourceEmail || '').trim().toLowerCase();
    var date = String(opts.date || '').trim().slice(0, 10);
    var day = parseInt(opts.day, 10);
    var period = parseInt(opts.period, 10);
    var sourceCell = opts.sourceCell || null;
    var getScheduleForDate = opts.getScheduleForDate;
    if (!sourceKey || !date || !Number.isFinite(day) || !Number.isFinite(period)
        || !isUsableCell(sourceCell) || typeof getScheduleForDate !== 'function') return [];

    var seen = Object.create(null);
    return (opts.teachers || []).reduce(function (result, teacher) {
      var key = teacherKey(teacher);
      var email = loginEmail(teacher);
      if (!key || key === sourceKey || seen[key] || !isValidLoginEmail(email)) return result;
      seen[key] = true;
      var cell = getScheduleForDate(key, date, period, day);
      if (!isUsableCell(cell) || isPullOut(sourceCell) !== isPullOut(cell)) return result;
      if (String(cell.className || '').trim() === String(sourceCell.className || '').trim()
          && String(cell.subject || '').trim() === String(sourceCell.subject || '').trim()) return result;
      result.push({
        key: key,
        email: email,
        name: teacherName(teacher) || email,
        className: String(cell.className || '').trim(),
        subject: String(cell.subject || '').trim(),
        attr: String(cell.attr || '').trim(),
        restriction: String(cell.restriction || '').trim(),
        isPullOut: isPullOut(cell)
      });
      return result;
    }, []).sort(function (a, b) {
      return a.className.localeCompare(b.className, 'zh-Hant', { numeric: true })
        || a.subject.localeCompare(b.subject, 'zh-Hant')
        || a.name.localeCompare(b.name, 'zh-Hant');
    });
  }

  function create(deps) {
    var ref = deps.ref;
    var computed = deps.computed;
    var showSamePeriodSwapModal = ref(false);
    var samePeriodSwapTargetKey = ref('');
    var samePeriodSwapSearchQuery = ref('');
    var samePeriodSwapSaving = ref(false);

    function currentContext() {
      var cell = valueOf(deps.activeCell) || {};
      var date = String(valueOf(deps.inputRequestDate) || '').trim().slice(0, 10);
      var day = parseInt(cell.dayOfWeek, 10);
      var period = parseInt(cell.period, 10);
      var sourceKey = String(cell.teacherEmail || '').trim().toLowerCase();
      var rosterTeacher = findTeacherByKey(valueOf(deps.teachersList) || [], sourceKey);
      var sourceEmail = loginEmail(rosterTeacher) || (isValidLoginEmail(sourceKey) ? sourceKey : '');
      var resolved = sourceKey && date && Number.isFinite(day) && Number.isFinite(period)
        ? deps.getScheduleForDate(sourceKey, date, period, day)
        : null;
      return {
        teacherKey: sourceKey,
        email: sourceEmail,
        teacherName: cell.teacherName || deps.getTeacherNameByEmail(sourceKey) || sourceKey,
        date: date,
        day: day,
        period: period,
        cell: resolved || cell.classData || null
      };
    }

    var samePeriodSwapSource = computed(function () { return currentContext(); });
    var samePeriodSwapCandidates = computed(function () {
      var source = samePeriodSwapSource.value || {};
      return listCandidates({
        teachers: valueOf(deps.teachersList) || [],
        sourceKey: source.teacherKey,
        date: source.date,
        day: source.day,
        period: source.period,
        sourceCell: source.cell,
        getScheduleForDate: deps.getScheduleForDate
      });
    });
    var samePeriodSwapFilteredCandidates = computed(function () {
      var query = String(samePeriodSwapSearchQuery.value || '').trim().toLowerCase();
      if (!query) return samePeriodSwapCandidates.value;
      return samePeriodSwapCandidates.value.filter(function (candidate) {
        return [candidate.className, candidate.subject, candidate.name, candidate.email]
          .some(function (value) { return String(value || '').toLowerCase().indexOf(query) >= 0; });
      });
    });
    var samePeriodSwapSelectedCandidate = computed(function () {
      var key = String(samePeriodSwapTargetKey.value || '').trim().toLowerCase();
      return samePeriodSwapCandidates.value.find(function (candidate) { return candidate.key === key; }) || null;
    });

    function openSamePeriodSwapModal() {
      if (!valueOf(deps.isAdmin)) {
        deps.showToast('同節互換僅限管理員操作', 'warning');
        return;
      }
      var source = samePeriodSwapSource.value || {};
      if (!source.date || !source.teacherKey || !isUsableCell(source.cell)) {
        deps.showToast('請從一堂有效課程開啟同節互換', 'warning');
        return;
      }
      if (!isValidLoginEmail(source.email)) {
        deps.showToast('找不到所選教師的登入 Email，請確認教師名單資料', 'warning');
        return;
      }
      samePeriodSwapTargetKey.value = '';
      samePeriodSwapSearchQuery.value = '';
      showSamePeriodSwapModal.value = true;
    }

    function closeSamePeriodSwapModal() {
      if (samePeriodSwapSaving.value) return;
      showSamePeriodSwapModal.value = false;
      samePeriodSwapTargetKey.value = '';
      samePeriodSwapSearchQuery.value = '';
    }

    async function saveSamePeriodSwap() {
      if (!valueOf(deps.isAdmin)) {
        deps.showToast('同節互換僅限管理員操作', 'warning');
        return;
      }
      var source = samePeriodSwapSource.value || {};
      var target = samePeriodSwapSelectedCandidate.value;
      if (!target) {
        deps.showToast('請選擇一位可互換教師', 'warning');
        return;
      }
      var periodLabel = deps.formatPeriodText(source.period);
      var confirmText = source.date + ' ' + periodLabel + '\n'
        + source.teacherName + '：' + source.cell.className + ' ' + source.cell.subject + '\n'
        + target.name + '：' + target.className + ' ' + target.subject
        + '\n\n確認後會立即套用到雙方課表。';
      var confirmed = await deps.showConfirm(confirmText, '確認同節互換');
      if (!confirmed) return;

      samePeriodSwapSaving.value = true;
      try {
        var response = await deps.callGasApi('adminCreateSamePeriodExchange', {
          date: source.date,
          period: source.period,
          teacherAEmail: source.email,
          teacherBEmail: target.email
        });
        if (!response || response.success === false) {
          throw new Error(response && response.error ? response.error : '儲存失敗');
        }
        showSamePeriodSwapModal.value = false;
        samePeriodSwapTargetKey.value = '';
        samePeriodSwapSearchQuery.value = '';
        deps.clearScheduleCache();
        deps.showToast('同節互換已套用', 'success');
        deps.softRefreshInBackground({ force: true, delay: 300 });
        if (deps.showMatchModal) deps.showMatchModal.value = false;
      } catch (error) {
        deps.showToast('同節互換失敗：' + (error && error.message ? error.message : error), 'error');
      } finally {
        samePeriodSwapSaving.value = false;
      }
    }

    return {
      showSamePeriodSwapModal: showSamePeriodSwapModal,
      samePeriodSwapSource: samePeriodSwapSource,
      samePeriodSwapCandidates: samePeriodSwapCandidates,
      samePeriodSwapFilteredCandidates: samePeriodSwapFilteredCandidates,
      samePeriodSwapTargetKey: samePeriodSwapTargetKey,
      samePeriodSwapSearchQuery: samePeriodSwapSearchQuery,
      samePeriodSwapSelectedCandidate: samePeriodSwapSelectedCandidate,
      samePeriodSwapSaving: samePeriodSwapSaving,
      openSamePeriodSwapModal: openSamePeriodSwapModal,
      closeSamePeriodSwapModal: closeSamePeriodSwapModal,
      saveSamePeriodSwap: saveSamePeriodSwap
    };
  }

  return { create: create, listCandidates: listCandidates, isUsableCell: isUsableCell };
})();

export { UiSamePeriodSwap };
