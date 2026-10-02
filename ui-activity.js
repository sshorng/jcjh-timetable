/**
 * ui-activity.js — 空堂事件 + 活動互代（方案甲）
 * 合併：class-away-admin / mutual-bridge / mutual-panel-state / mutual-submit / batch-submit
 * 對外 API 不變：UiClassAwayAdmin, UiMutualBridge, UiMutualPanelState, UiMutualSubmit, UiBatchSubmit
 */
/**
  * 後台：空堂事件 CRUD（從 app.js 抽出）
 * create(deps) → { refs + methods } 供 Vue setup 解構
 */
window.UiClassAwayAdmin = (function () {
  function create(deps) {
    var ref = deps.ref;
    var callGasApi = deps.callGasApi;
    var showToast = deps.showToast;
    var showConfirm = deps.showConfirm;
    var classAwayEvents = deps.classAwayEvents; // ref
    var classList = deps.classList; // computed/ref
    var currentSemester = deps.currentSemester; // ref
    var loading = deps.loading; // ref
    var clearScheduleCache = deps.clearScheduleCache || function () {};
    var softRefreshInBackground = deps.softRefreshInBackground || function () {};

    var showClassAwayModal = ref(false);
    var classAwayModalMode = ref('add');
    var classAwayPeriodOptions = [
      { value: '0', label: '早自習' },
      { value: '1', label: '第1節' }, { value: '2', label: '第2節' },
      { value: '3', label: '第3節' }, { value: '4', label: '第4節' },
      { value: '45', label: '午休' },
      { value: '5', label: '第5節' }, { value: '6', label: '第6節' },
      { value: '7', label: '第7節' }, { value: '8', label: '第8節' }
    ];

    function normalizeClassAwayPeriods(raw) {
      if (window.DomainClassAway && window.DomainClassAway.normalizePeriods) {
        return window.DomainClassAway.normalizePeriods(raw);
      }
      if (Array.isArray(raw)) return raw.map(String);
      var text = String(raw == null ? '' : raw).trim();
      if (!text || text === 'all' || text === '全部') return ['all'];
      return text.split(/[,，、;；|｜/／]+/).map(function (value) {
        value = String(value || '').trim();
        if (value === '早自習') return '0';
        if (value === '午休' || value === '午餐' || value.toLowerCase() === 'lunch') return '45';
        var match = value.match(/(?:第\s*)?(\d+)\s*(?:節)?/);
        var n = match ? parseInt(match[1], 10) : NaN;
        return Number.isInteger(n) && (n === 45 || (n >= 0 && n <= 8)) ? String(n) : '';
      }).filter(function (value, index, list) { return value && list.indexOf(value) === index; });
    }

    var classAwayForm = ref({
      id: '', name: '', startDate: '', endDate: '',
      scope: 'classes', classes: [], periodMode: 'range', periods: ['all'], startPeriod: '0', endPeriod: '8',
      billingRule: 'keep', forMutual: true, enabled: true, note: ''
    });

    function sanitizeClassNames(list) {
      if (window.DomainClassAway && window.DomainClassAway.parseClassList) {
        return window.DomainClassAway.parseClassList(list || []);
      }
      return (list || []).map(function (c) { return String(c || '').trim(); })
        .filter(function (c) { return c && !/^0+$/.test(c); });
    }

    function openAddClassAwayModal() {
      classAwayModalMode.value = 'add';
      classAwayForm.value = {
        id: '', name: '', startDate: '', endDate: '',
        scope: 'classes', classes: [], periodMode: 'range', periods: ['all'], startPeriod: '0', endPeriod: '8',
        billingRule: 'keep', forMutual: true, enabled: true, note: ''
      };
      showClassAwayModal.value = true;
    }

    function openEditClassAwayModal(ev) {
      classAwayModalMode.value = 'edit';
      var clean = sanitizeClassNames(ev.classes || []);
      var hasPeriodRange = !!(window.DomainClassAway && window.DomainClassAway.eventPeriodRange
        ? window.DomainClassAway.eventPeriodRange(ev)
        : (ev.startPeriod != null && ev.startPeriod !== '' && ev.endPeriod != null && ev.endPeriod !== ''));
      classAwayForm.value = {
        id: ev.id,
        name: ev.name || '',
        startDate: ev.startDate || '',
        endDate: ev.endDate || '',
        scope: ev.scope === 'all' ? 'all' : 'classes',
        classes: clean,
        periodMode: hasPeriodRange ? 'range' : 'daily',
        periods: hasPeriodRange ? ['all'] : normalizeClassAwayPeriods(ev.periods !== undefined ? ev.periods : ev.period),
        startPeriod: String(ev.startPeriod == null || ev.startPeriod === '' ? '0' : ev.startPeriod),
        endPeriod: String(ev.endPeriod == null || ev.endPeriod === '' ? '8' : ev.endPeriod),
        billingRule: ev.billingRule === 'reduce' ? 'reduce' : 'keep',
        forMutual: !!ev.forMutual,
        enabled: ev.enabled !== false,
        note: ev.note || ''
      };
      showClassAwayModal.value = true;
    }

    function setClassAwayPeriods(periods) {
      var clean = normalizeClassAwayPeriods(periods);
      classAwayForm.value = Object.assign({}, classAwayForm.value, {
        periods: clean
      });
    }

    function setClassAwayPeriodMode(mode) {
      classAwayForm.value = Object.assign({}, classAwayForm.value, {
        periodMode: mode === 'daily' ? 'daily' : 'range'
      });
    }

    function toggleClassAwayPeriod(period) {
      var value = String(period || '');
      if (value === 'all') {
        var current = normalizeClassAwayPeriods(classAwayForm.value.periods || []);
        setClassAwayPeriods(current.indexOf('all') >= 0 ? [] : ['all']);
        return;
      }
      var selected = normalizeClassAwayPeriods(classAwayForm.value.periods || []);
      if (selected.indexOf('all') >= 0) selected = [];
      var index = selected.indexOf(value);
      if (index >= 0) selected.splice(index, 1);
      else selected.push(value);
      selected.sort(function (a, b) { return Number(a) - Number(b); });
      setClassAwayPeriods(selected);
    }

    function isClassAwayPeriodSelected(period) {
      var selected = normalizeClassAwayPeriods(classAwayForm.value.periods || []);
      return selected.indexOf('all') >= 0 || selected.indexOf(String(period || '')) >= 0;
    }

    function selectClassAwayPeriodRange() {
      setClassAwayPeriods(classAwayPeriodOptions.map(function (option) { return option.value; }));
    }

    function clearClassAwayPeriods() {
      setClassAwayPeriods([]);
    }

    function setClassAwayPeriodBoundary(field, value) {
      if (field !== 'startPeriod' && field !== 'endPeriod') return;
      classAwayForm.value = Object.assign({}, classAwayForm.value, { [field]: String(value || '') });
    }

    function isClassAwayFullDaySelected() {
      if (classAwayForm.value.periodMode === 'daily') {
        return normalizeClassAwayPeriods(classAwayForm.value.periods || []).indexOf('all') >= 0;
      }
      return String(classAwayForm.value.startPeriod) === '0'
        && String(classAwayForm.value.endPeriod) === '8';
    }

    function isClassAwayRangeEvent(ev) {
      if (window.DomainClassAway && window.DomainClassAway.eventPeriodRange) {
        return !!window.DomainClassAway.eventPeriodRange(ev);
      }
      return !!(ev && ev.startPeriod != null && ev.startPeriod !== ''
        && ev.endPeriod != null && ev.endPeriod !== '');
    }

    function classAwayDailyPeriodLabel(ev) {
      if (isClassAwayRangeEvent(ev)) return '—';
      var periods = ev && ev.periods !== undefined ? ev.periods : (ev && ev.period);
      if (window.DomainClassAway && window.DomainClassAway.periodLabel) {
        return window.DomainClassAway.periodLabel(periods);
      }
      var selected = normalizeClassAwayPeriods(periods);
      if (!selected.length || selected[0] === 'all') return '全部節次';
      return selected.map(function (period) {
        var option = classAwayPeriodOptions.find(function (item) { return item.value === period; });
        return option ? option.label : period;
      }).join('、');
    }

    function classAwayBoundaryPeriodLabel(ev, boundary) {
      if (!isClassAwayRangeEvent(ev)) return '—';
      var start = ev.startPeriod != null && ev.startPeriod !== '' ? ev.startPeriod : ev['起始節次'];
      var end = ev.endPeriod != null && ev.endPeriod !== '' ? ev.endPeriod : ev['結束節次'];
      if (window.DomainClassAway && window.DomainClassAway.periodRangeLabel) {
        var raw = boundary === 'start' ? start : end;
        return window.DomainClassAway.periodRangeLabel(raw, raw);
      }
      var value = String(boundary === 'start' ? start : end);
      var option = classAwayPeriodOptions.find(function (item) { return item.value === value; });
      return option ? option.label : value;
    }

    function classAwayPeriodLabel(ev) {
      if (isClassAwayRangeEvent(ev) && window.DomainClassAway && window.DomainClassAway.periodRangeLabel) {
        return '連續：' + window.DomainClassAway.periodRangeLabel(ev.startPeriod || ev['起始節次'], ev.endPeriod || ev['結束節次']);
      }
      var periods = ev && ev.periods !== undefined ? ev.periods : (ev && ev.period);
      if (window.DomainClassAway && window.DomainClassAway.periodLabel) {
        return '每日：' + window.DomainClassAway.periodLabel(periods);
      }
      var selected = normalizeClassAwayPeriods(periods);
      if (!selected.length || selected[0] === 'all') return '每日：全部節次';
      return '每日：' + selected.map(function (period) {
        var option = classAwayPeriodOptions.find(function (item) { return item.value === period; });
        return option ? option.label : period;
      }).join('、');
    }

    function toggleClassAwayFormClass(cls) {
      var c = (window.DomainClassAway && window.DomainClassAway.normClass)
        ? window.DomainClassAway.normClass(cls)
        : String(cls || '').trim();
      if (!c) return;
      var arr = sanitizeClassNames(classAwayForm.value.classes || []);
      var i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(c);
      classAwayForm.value = Object.assign({}, classAwayForm.value, { classes: arr.sort() });
    }

    function isClassAwayFormClassSelected(cls) {
      var c = (window.DomainClassAway && window.DomainClassAway.normClass)
        ? window.DomainClassAway.normClass(cls)
        : String(cls || '').trim();
      return sanitizeClassNames(classAwayForm.value.classes || []).indexOf(c) >= 0;
    }

    function selectClassAwayGrade(grade) {
      if (!window.DomainClassAway) return;
      var all = (classList && classList.value) ? classList.value : [];
      var gradeClasses = window.DomainClassAway.filterClassesByGrade(all, grade);
      var set = {};
      sanitizeClassNames(classAwayForm.value.classes || []).forEach(function (c) { set[c] = 1; });
      gradeClasses.forEach(function (c) { set[c] = 1; });
      classAwayForm.value = Object.assign({}, classAwayForm.value, {
        classes: Object.keys(set).sort(function (a, b) {
          return a.localeCompare(b, 'zh-Hant', { numeric: true });
        })
      });
    }

    async function saveClassAwayEvent() {
      var f = classAwayForm.value;
      if (!String(f.name || '').trim()) { showToast('請填事件名稱', 'info'); return; }
      if (!f.startDate) { showToast('請填起日', 'info'); return; }
      if (f.endDate && f.endDate < f.startDate) { showToast('迄日不可早於起日', 'info'); return; }
      var scope = f.scope === 'all' ? 'all' : 'classes';
      var periodMode = f.periodMode === 'daily' ? 'daily' : 'range';
      var selectedPeriods = normalizeClassAwayPeriods(f.periods || []);
      if (periodMode === 'daily') {
        if (!selectedPeriods.length) { showToast('每日指定節次至少選一個節次', 'info'); return; }
      } else {
        var startPeriodIndex = classAwayPeriodOptions.findIndex(function (option) { return option.value === String(f.startPeriod); });
        var endPeriodIndex = classAwayPeriodOptions.findIndex(function (option) { return option.value === String(f.endPeriod); });
        if (startPeriodIndex < 0 || endPeriodIndex < 0
            || (f.endDate && f.endDate === f.startDate && endPeriodIndex < startPeriodIndex)) {
          showToast('同一天的終點節次不可早於起點節次', 'info');
          return;
        }
      }
      var forMutual = !!f.forMutual;
      var cleanClasses = sanitizeClassNames(f.classes || []);
      if (scope === 'classes' && !cleanClasses.length) {
        showToast('請至少勾選一個有效班級（勿含 000）', 'info');
        return;
      }
      if (scope === 'all') cleanClasses = [];
      loading.value = true;
      try {
        var id = f.id || ('cae_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
        var classListStr = cleanClasses.join(',');
        var sheetRow = {
          "事件ID": String(id),
          "學期代號": currentSemester.value,
          "事件名稱": String(f.name).trim(),
          "起日": String(f.startDate || '').slice(0, 10),
          "迄日": f.endDate ? String(f.endDate).slice(0, 10) : '',
          "起始節次": periodMode === 'range' ? String(f.startPeriod) : '',
          "結束節次": periodMode === 'range' ? String(f.endPeriod) : '',
          "適用範圍": scope === 'all' ? '全校' : '指定班級',
          "班級清單": scope === 'all' ? '' : ("'" + classListStr),
          "停課節次": periodMode === 'range'
            ? '全部節次'
            : (window.DomainClassAway && window.DomainClassAway.normalizePeriod
              ? window.DomainClassAway.normalizePeriod(selectedPeriods) : selectedPeriods.join(',')),
          "鐘點規則": f.billingRule === 'reduce' ? 'reduce' : 'keep',
          "可進互代": forMutual ? 'TRUE' : 'FALSE',
          "啟用": f.enabled !== false ? 'TRUE' : 'FALSE',
          "備註": f.note || ''
        };
        await callGasApi('saveClassAwayEvent', sheetRow);
        var mapped = window.FieldMap.mapClassAwayEvent(
          Object.assign({}, sheetRow, { "班級清單": classListStr })
        );
        mapped.classes = cleanClasses.slice();
        mapped.period = window.DomainClassAway.eventPeriod(mapped);
        mapped.periods = window.DomainClassAway.eventPeriods(mapped);
        var list = classAwayEvents.value.slice();
        var idx = list.findIndex(function (x) { return x.id === id; });
        if (idx >= 0) list[idx] = mapped;
        else list.push(mapped);
        classAwayEvents.value = list;
        showClassAwayModal.value = false;
        showToast(
          '空堂事件已儲存（' + (mapped.scope === 'all' ? '全校' : mapped.classes.length + ' 班')
            + '／' + classAwayPeriodLabel(mapped) + '）',
          'success'
        );
        clearScheduleCache();
        softRefreshInBackground({ force: true, delay: 700 });
      } catch (e) {
        showToast('儲存失敗：' + (e && e.message ? e.message : String(e)), 'error');
      } finally {
        loading.value = false;
      }
    }

    async function deleteClassAwayEvent(ev) {
      if (!ev || !ev.id) return;
      if (!await showConfirm('確定刪除空堂事件「' + (ev.name || ev.id) + '」？')) return;
      loading.value = true;
      try {
        await callGasApi('deleteClassAwayEvent', { id: ev.id });
        classAwayEvents.value = classAwayEvents.value.filter(function (x) { return x.id !== ev.id; });
        showToast('已刪除', 'success');
        clearScheduleCache();
        softRefreshInBackground({ force: true, delay: 700 });
      } catch (e) {
        showToast('刪除失敗：' + (e && e.message ? e.message : String(e)), 'error');
      } finally {
        loading.value = false;
      }
    }

    return {
      showClassAwayModal: showClassAwayModal,
      classAwayModalMode: classAwayModalMode,
      classAwayPeriodOptions: classAwayPeriodOptions,
      classAwayForm: classAwayForm,
      openAddClassAwayModal: openAddClassAwayModal,
      openEditClassAwayModal: openEditClassAwayModal,
      setClassAwayPeriodBoundary: setClassAwayPeriodBoundary,
      toggleClassAwayPeriod: toggleClassAwayPeriod,
      isClassAwayPeriodSelected: isClassAwayPeriodSelected,
      selectClassAwayPeriodRange: selectClassAwayPeriodRange,
      clearClassAwayPeriods: clearClassAwayPeriods,
      isClassAwayFullDaySelected: isClassAwayFullDaySelected,
      setClassAwayPeriodMode: setClassAwayPeriodMode,
      classAwayPeriodLabel: classAwayPeriodLabel,
      classAwayDailyPeriodLabel: classAwayDailyPeriodLabel,
      classAwayBoundaryPeriodLabel: classAwayBoundaryPeriodLabel,
      isClassAwayRangeEvent: isClassAwayRangeEvent,
      toggleClassAwayFormClass: toggleClassAwayFormClass,
      isClassAwayFormClassSelected: isClassAwayFormClassSelected,
      selectClassAwayGrade: selectClassAwayGrade,
      saveClassAwayEvent: saveClassAwayEvent,
      deleteClassAwayEvent: deleteClassAwayEvent,
      sanitizeClassNames: sanitizeClassNames
    };
  }

  return { create: create };
})();


/**
 * 活動互代 ↔ 空堂事件橋接（帶入事件、進度統計）
 * 從 app.js 抽出；暫定送出等仍留在 app
 */
window.UiMutualBridge = (function () {
  function create(deps) {
    var ref = deps.ref;
    var computed = deps.computed;
    var showToast = deps.showToast;
    var classAwayEvents = deps.classAwayEvents;
    var classList = deps.classList;
    var semesterEndDate = deps.semesterEndDate;
    var mutualActivityStart = deps.mutualActivityStart;
    var mutualActivityEnd = deps.mutualActivityEnd;
    var mutualActivityStartPeriod = deps.mutualActivityStartPeriod;
    var mutualActivityEndPeriod = deps.mutualActivityEndPeriod;
    var mutualActivityPeriodMode = deps.mutualActivityPeriodMode || ref('range');
    var mutualActivityPeriods = deps.mutualActivityPeriods || ref(['all']);
    var mutualAwayClasses = deps.mutualAwayClasses;
    var mutualNote = deps.mutualNote;
    var mutualLeadEmails = deps.mutualLeadEmails;
    var mutualDrafts = deps.mutualDrafts;
    var isMutualCover = deps.isMutualCover;
    var batchSlots = deps.batchSlots;
    var allSchedules = deps.allSchedules;
    var requestsList = deps.requestsList;
    var teachersList = deps.teachersList;
    var currentWeekDates = deps.currentWeekDates;
    var getScheduleForDate = deps.getScheduleForDate;
    var persistMutualPanelDraft = deps.persistMutualPanelDraft || function () {};
    var clearScheduleCache = deps.clearScheduleCache || function () {};
    var ensureMutualActivityRange = deps.ensureMutualActivityRange || function () {};
    var DAC = deps.DAC || function () { return window.DomainActivityCover; };

    var mutualImportableEvents = computed(function () {
      return (classAwayEvents.value || []).filter(function (e) {
        return e.enabled !== false && e.forMutual;
      });
    });
    var mutualImportEventId = ref('');

    function applyClassAwayEventById(eventId) {
      var id = String(eventId || '').trim();
      mutualImportEventId.value = id;
      if (!id) return;
      var list = mutualImportableEvents.value || [];
      var ev = list.find(function (e) { return e.id === id; })
        || (classAwayEvents.value || []).find(function (e) { return e.id === id; });
      if (!ev) {
        showToast('找不到該空堂事件', 'warning');
        return;
      }
       var classes = [];
       if (window.DomainClassAway && window.DomainClassAway.getAwayClassesInRange) {
         classes = window.DomainClassAway.getAwayClassesInRange(
           ev.startDate,
           ev.endDate || (semesterEndDate && semesterEndDate.value) || ev.startDate,
           [ev],
           semesterEndDate && semesterEndDate.value,
           { forMutualOnly: true, allClasses: (classList && classList.value) || [] }
         );
       } else if (window.DomainClassAway && window.DomainClassAway.parseClassList) {
         classes = window.DomainClassAway.parseClassList(ev.classes || ev.classList || '');
      } else if (Array.isArray(ev.classes)) {
        classes = ev.classes.map(function (c) { return String(c || '').trim(); }).filter(Boolean);
      } else {
        classes = String(ev.classes || '').split(/[,，、\s]+/).map(function (c) { return c.trim(); }).filter(Boolean);
      }
      var known = {};
      ((classList && classList.value) || []).forEach(function (c) {
        known[String(c).trim()] = 1;
      });
      var matched = classes.filter(function (c) { return known[c]; });
      if (matched.length) classes = matched;

        var dca = window.DomainClassAway;
        var hasEventRange = !!(dca && dca.eventPeriodRange && dca.eventPeriodRange(ev));
        mutualActivityStart.value = ev.startDate || '';
        var end = ev.endDate || (semesterEndDate && semesterEndDate.value) || '';
        mutualActivityEnd.value = end;
        mutualActivityPeriodMode.value = hasEventRange ? 'range' : 'daily';
        mutualActivityPeriods.value = hasEventRange
          ? ['all']
          : (dca && dca.eventPeriods ? dca.eventPeriods(ev) : (ev.periods || ['all']));
        mutualActivityStartPeriod.value = String(hasEventRange && ev.startPeriod != null && ev.startPeriod !== '' ? ev.startPeriod : '0');
        mutualActivityEndPeriod.value = String(hasEventRange && ev.endPeriod != null && ev.endPeriod !== '' ? ev.endPeriod : '8');
       mutualAwayClasses.value = classes.slice().sort();
       var mutualEventRange = {
          startDate: mutualActivityStart.value,
          endDate: mutualActivityEnd.value,
          periodMode: mutualActivityPeriodMode.value,
          periods: mutualActivityPeriods.value,
          startPeriod: hasEventRange ? mutualActivityStartPeriod.value : '',
          endPeriod: hasEventRange ? mutualActivityEndPeriod.value : ''
       };
       var selectedClassSet = {};
       classes.forEach(function (c) { selectedClassSet[String(c || '').trim()] = true; });
       function slotStaysInImportedEvent(slot) {
         if (!slot) return false;
         var date = String(slot.dateStr || slot.date || '').slice(0, 10);
         var period = slot.period;
         if (window.DomainClassAway && window.DomainClassAway.isDateInEvent
             && !window.DomainClassAway.isDateInEvent(date, mutualEventRange, semesterEndDate && semesterEndDate.value)) return false;
         if (window.DomainClassAway && window.DomainClassAway.eventAppliesToPeriod
             && !window.DomainClassAway.eventAppliesToPeriod(mutualEventRange, period, date,
               semesterEndDate && semesterEndDate.value)) return false;
         var slotClasses = window.DomainClassAway && window.DomainClassAway.parseClassList
           ? window.DomainClassAway.parseClassList(slot.className || '')
           : String(slot.className || '').split(/[,，、/／\s]+/).filter(Boolean);
         return !slotClasses.length || slotClasses.some(function (c) { return !!selectedClassSet[c]; });
       }
       var oldDraftCount = (mutualDrafts.value || []).length;
       mutualDrafts.value = (mutualDrafts.value || []).filter(slotStaysInImportedEvent);
       var removedDraftCount = oldDraftCount - mutualDrafts.value.length;
       if (batchSlots && Array.isArray(batchSlots.value)) {
         batchSlots.value = batchSlots.value.filter(slotStaysInImportedEvent);
       }
       if (ev.name) {
         var rangeTip = ev.startDate ? (ev.startDate + (end ? '～' + end : '')) : '';
          var periodTip = mutualActivityPeriodMode.value === 'daily'
            ? (window.DomainClassAway && window.DomainClassAway.periodLabel
              ? '每日' + window.DomainClassAway.periodLabel(mutualActivityPeriods.value) : '每日指定節次')
            : (window.DomainClassAway && window.DomainClassAway.periodRangeLabel
              ? '連續' + window.DomainClassAway.periodRangeLabel(mutualActivityStartPeriod.value, mutualActivityEndPeriod.value) : '');
         mutualNote.value = (rangeTip ? (ev.name + ' ' + rangeTip) : String(ev.name))
           + (periodTip ? ' ' + periodTip : '');
      }
       persistMutualPanelDraft();
       clearScheduleCache();
       if (removedDraftCount) {
         showToast('已帶入「' + ev.name + '」，並移除 ' + removedDraftCount + ' 筆不在事件班級／時段內的暫定', 'info');
       }
       if (!classes.length) {
        showToast('已帶入「' + ev.name + '」的日期，但事件沒有班級清單，請手動勾外出班', 'warning');
      } else {
        showToast(
          '已帶入「' + ev.name + '」：' + classes.length + ' 班 · '
           + (mutualActivityStart.value || '？') + '～' + (mutualActivityEnd.value || '學期結束')
            + ' · ' + (mutualActivityPeriodMode.value === 'daily'
              ? (window.DomainClassAway && window.DomainClassAway.periodLabel
                ? '每日' + window.DomainClassAway.periodLabel(mutualActivityPeriods.value) : '每日指定節次')
              : (window.DomainClassAway && window.DomainClassAway.periodRangeLabel
                ? '連續' + window.DomainClassAway.periodRangeLabel(mutualActivityStartPeriod.value, mutualActivityEndPeriod.value) : '全部節次')),
          'success'
        );
      }
    }

    function applyClassAwayToMutualPanel() {
      if (!mutualImportEventId.value) {
        showToast('請先選擇一個空堂事件', 'info');
        return;
      }
      applyClassAwayEventById(mutualImportEventId.value);
    }

    var mutualCoverStats = computed(function () {
      var dac = DAC();
      if (!dac || !dac.buildStats) {
        return {
          awayClasses: 0, releasedSlots: 0, mutualDone: 0, publicDone: 0,
          arranged: 0, drafted: 0, demand: 0, remaining: 0, leaveTeachers: 0,
          pendingSelected: 0, byLeaders: [], rangeDays: 0, rangeLabel: ''
        };
      }
      if (isMutualCover.value) ensureMutualActivityRange();
      var leaders = (mutualLeadEmails.value || []).map(function (em) {
        var t = (teachersList.value || []).find(function (x) {
          return x.email && String(x.email).toLowerCase() === String(em).toLowerCase();
        });
        return { email: em, name: t ? t.name : em };
      });
      var isSingleWeekFn = deps.isSingleWeek;
      return dac.buildStats({
        active: !!isMutualCover.value,
        awayClasses: mutualAwayClasses.value,
        startDate: mutualActivityStart.value,
        endDate: mutualActivityEnd.value,
        periodMode: mutualActivityPeriodMode.value,
        periods: mutualActivityPeriods.value,
        startPeriod: mutualActivityStartPeriod.value,
        endPeriod: mutualActivityEndPeriod.value,
        allSchedules: allSchedules.value,
        requests: requestsList.value,
        weekDates: currentWeekDates.value,
        leaderEmails: leaders,
        leaveEmails: leaders.map(function (l) { return l.email; }),
        teachers: teachersList.value,
        pendingDrafts: isMutualCover.value ? (mutualDrafts.value || []) : [],
        pendingSlots: isMutualCover.value ? (batchSlots.value || []) : [],
        getScheduleForDate: getScheduleForDate,
        isSingleWeek: typeof isSingleWeekFn === 'function' ? isSingleWeekFn : null
      });
    });

    return {
      mutualImportableEvents: mutualImportableEvents,
      mutualImportEventId: mutualImportEventId,
      applyClassAwayEventById: applyClassAwayEventById,
      applyClassAwayToMutualPanel: applyClassAwayToMutualPanel,
      mutualCoverStats: mutualCoverStats
    };
  }

  return { create: create };
})();


/**
 * 活動互代面板：localStorage 暫存、外出班／帶隊、暫定草稿 CRUD、累加額度
 * （暫定一次送出仍在 app.js）
 */
window.UiMutualPanelState = (function () {
  var LS_KEY = 'jcjh_mutual_panel_draft_v1';

  function mutualDraftKey(leaveEmail, dateStr, period) {
    return String(leaveEmail || '').toLowerCase() + '|' + dateStr + '|' + period;
  }

  function create(deps) {
    var showToast = deps.showToast;
    var showConfirm = deps.showConfirm;
    var callGasApi = deps.callGasApi;
    var isAdmin = deps.isAdmin;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var isMutualCover = deps.isMutualCover;
    var mutualAwayClasses = deps.mutualAwayClasses;
    var mutualLeadEmails = deps.mutualLeadEmails;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var mutualNote = deps.mutualNote;
    var mutualDrafts = deps.mutualDrafts;
    var mutualActivityStart = deps.mutualActivityStart;
    var mutualActivityEnd = deps.mutualActivityEnd;
    var mutualActivityStartPeriod = deps.mutualActivityStartPeriod;
    var mutualActivityEndPeriod = deps.mutualActivityEndPeriod;
    var mutualActivityPeriodMode = deps.mutualActivityPeriodMode || { value: 'range' };
    var mutualActivityPeriods = deps.mutualActivityPeriods || { value: ['all'] };
    var currentWeekDates = deps.currentWeekDates;
    var classList = deps.classList;
    var teachersList = deps.teachersList;
    var allSchedules = deps.allSchedules;
    var requestsList = deps.requestsList;
    var activeCell = deps.activeCell;
    var inputRequestDate = deps.inputRequestDate;
    var recommendedTeachers = deps.recommendedTeachers;
    var showMatchModal = deps.showMatchModal;
    var pendingRequestData = deps.pendingRequestData;
    var batchSubFee = deps.batchSubFee;
    var directApproveMode = deps.directApproveMode;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var softRefreshInBackground = deps.softRefreshInBackground || function () {};
    var defaultSubFeeForReason = deps.defaultSubFeeForReason || function () { return '自費代課'; };
    var getScheduleForDate = deps.getScheduleForDate;
    var classAwayEvents = deps.classAwayEvents;
    var getMutualImportEventId = deps.getMutualImportEventId || function () { return ''; };
    var DAC = deps.DAC || function () { return window.DomainActivityCover; };

    function persistMutualPanelDraft() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({
          awayClasses: mutualAwayClasses.value || [],
          leadEmails: mutualLeadEmails.value || [],
          skipNotify: !!mutualSkipNotify.value,
          note: mutualNote.value || '',
          drafts: mutualDrafts.value || [],
          start: mutualActivityStart.value || '',
          end: mutualActivityEnd.value || '',
          periodMode: mutualActivityPeriodMode.value || 'range',
          periods: mutualActivityPeriods.value || ['all'],
          startPeriod: mutualActivityStartPeriod.value || '0',
          endPeriod: mutualActivityEndPeriod.value || '8',
          panelOpen: !!isMutualCover.value
        }));
      } catch (e) { /* ignore */ }
    }

    function restoreMutualPanelDraft() {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    function applyMutualPanelDraft(saved) {
      if (!saved || typeof saved !== 'object') return;
      if (Array.isArray(saved.awayClasses)) mutualAwayClasses.value = saved.awayClasses.slice();
      if (Array.isArray(saved.leadEmails)) mutualLeadEmails.value = saved.leadEmails.slice();
      if (typeof saved.skipNotify === 'boolean') mutualSkipNotify.value = saved.skipNotify;
      if (typeof saved.note === 'string') mutualNote.value = saved.note;
      if (Array.isArray(saved.drafts)) mutualDrafts.value = saved.drafts.slice();
      if (saved.start) mutualActivityStart.value = saved.start;
      if (saved.end) mutualActivityEnd.value = saved.end;
      if (saved.periodMode === 'daily' || saved.periodMode === 'range') mutualActivityPeriodMode.value = saved.periodMode;
      if (Array.isArray(saved.periods)) mutualActivityPeriods.value = saved.periods.slice();
      if (saved.startPeriod != null) mutualActivityStartPeriod.value = String(saved.startPeriod);
      if (saved.endPeriod != null) mutualActivityEndPeriod.value = String(saved.endPeriod);
    }

    function setMutualActivityThisWeek() {
      var week = currentWeekDates.value || [];
      mutualActivityStart.value = week[0] || '';
      mutualActivityEnd.value = week[4] || week[0] || '';
      persistMutualPanelDraft();
    }

    function setMutualActivityPeriodMode(mode) {
      mutualActivityPeriodMode.value = mode === 'daily' ? 'daily' : 'range';
      persistMutualPanelDraft();
    }

    function normalizeMutualPeriods(periods) {
      var dca = window.DomainClassAway;
      if (dca && dca.normalizePeriods) return dca.normalizePeriods(periods);
      if (Array.isArray(periods)) return periods.map(String);
      return ['all'];
    }

    function isMutualActivityPeriodSelected(period) {
      var selected = normalizeMutualPeriods(mutualActivityPeriods.value || []);
      return selected.indexOf('all') >= 0 || selected.indexOf(String(period)) >= 0;
    }

    function toggleMutualActivityPeriod(period) {
      var value = String(period || '');
      var selected = normalizeMutualPeriods(mutualActivityPeriods.value || []);
      if (value === 'all') {
        mutualActivityPeriods.value = selected.indexOf('all') >= 0 ? [] : ['all'];
      } else {
        if (selected.indexOf('all') >= 0) selected = [];
        var index = selected.indexOf(value);
        if (index >= 0) selected.splice(index, 1);
        else selected.push(value);
        var order = ['0', '1', '2', '3', '4', '45', '5', '6', '7', '8'];
        selected.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        mutualActivityPeriods.value = selected;
      }
      persistMutualPanelDraft();
    }

    function setMutualActivityPeriods(periods) {
      mutualActivityPeriods.value = normalizeMutualPeriods(periods);
      persistMutualPanelDraft();
    }

    function ensureMutualActivityRange() {
      var week = currentWeekDates.value || [];
      if (!mutualActivityStart.value && week[0]) mutualActivityStart.value = week[0];
      if (!mutualActivityEnd.value && week[4]) mutualActivityEnd.value = week[4];
    }

    async function clearMutualPanel() {
      var hasData = (mutualAwayClasses.value || []).length
        || (mutualLeadEmails.value || []).length
        || (mutualDrafts.value || []).length
        || mutualActivityPeriodMode.value !== 'range'
        || normalizeMutualPeriods(mutualActivityPeriods.value || []).join(',') !== 'all'
        || String(mutualActivityStartPeriod.value || '0') !== '0'
        || String(mutualActivityEndPeriod.value || '8') !== '8'
        || String(mutualNote.value || '').trim();
      if (hasData) {
        var ok = await showConfirm(
          '將清空外出班、帶隊老師、暫定安排與統一備註（期間改回本週）。\n確定？',
          '一鍵清空活動互代'
        );
        if (!ok) return;
      }
      mutualAwayClasses.value = [];
      mutualLeadEmails.value = [];
      mutualDrafts.value = [];
      mutualNote.value = '';
      mutualSkipNotify.value = true;
      mutualActivityPeriodMode.value = 'range';
      mutualActivityPeriods.value = ['all'];
      mutualActivityStartPeriod.value = '0';
      mutualActivityEndPeriod.value = '8';
      setMutualActivityThisWeek();
      persistMutualPanelDraft();
      showToast('已清空活動互代面板', 'info');
    }

    function toggleMutualLead(email) {
      var em = String(email || '').trim();
      if (!em) return;
      var arr = mutualLeadEmails.value.slice();
      var key = em.toLowerCase();
      var i = arr.findIndex(function (e) { return String(e).toLowerCase() === key; });
      if (i >= 0) arr.splice(i, 1);
      else arr.push(em);
      mutualLeadEmails.value = arr;
      persistMutualPanelDraft();
    }

    function isMutualLead(email) {
      var key = String(email || '').toLowerCase();
      return (mutualLeadEmails.value || []).some(function (e) {
        return String(e).toLowerCase() === key;
      });
    }

    function toggleMutualAwayClass(cls) {
      var dac = DAC();
      if (!dac) return;
      mutualAwayClasses.value = dac.toggleAwayClass(mutualAwayClasses.value, cls);
      persistMutualPanelDraft();
    }

    function selectAwayGrade(grade) {
      var dac = DAC();
      if (!dac) return;
      mutualAwayClasses.value = dac.toggleAwayGrade(
        (classList && classList.value) || [],
        mutualAwayClasses.value,
        grade
      );
      persistMutualPanelDraft();
    }

    function getMutualDraftAt(leaveEmail, dateStr, period) {
      var key = mutualDraftKey(leaveEmail, dateStr, period);
      return (mutualDrafts.value || []).find(function (d) { return d.key === key; }) || null;
    }

    function removeMutualDraft(key) {
      mutualDrafts.value = mutualDrafts.value.filter(function (d) { return d.key !== key; });
      persistMutualPanelDraft();
    }

    function clearMutualDrafts() {
      mutualDrafts.value = [];
      persistMutualPanelDraft();
      showToast('已清除全部暫定', 'info');
    }

    function activityBalanceCtx(extra) {
      var ex = extra || {};
      var excludeDraftKey = ex.excludeDraftKey || '';
      if (!excludeDraftKey && ex.includeSelfDraft !== true && activeCell.value && inputRequestDate.value) {
        try {
          var leave = activeCell.value.teacherEmail;
          var dateStr = inputRequestDate.value;
          var period = activeCell.value.period;
          if (leave && dateStr && getMutualDraftAt(leave, dateStr, period)) {
            excludeDraftKey = mutualDraftKey(leave, dateStr, period);
          }
        } catch (e) { /* ignore */ }
      }
      var drafts = (ex.pendingDrafts !== undefined) ? ex.pendingDrafts : (mutualDrafts.value || []);
      var targetPeriod = (ex.targetPeriod != null)
        ? ex.targetPeriod
        : (activeCell.value && activeCell.value.period != null ? activeCell.value.period : null);
      return {
        awayClasses: mutualAwayClasses.value,
        startDate: mutualActivityStart.value,
        endDate: mutualActivityEnd.value,
        periodMode: mutualActivityPeriodMode.value,
        periods: mutualActivityPeriods.value,
        startPeriod: mutualActivityStartPeriod.value,
        endPeriod: mutualActivityEndPeriod.value,
        weekDates: currentWeekDates.value,
        allSchedules: allSchedules.value,
        requests: requestsList.value,
        teachers: teachersList.value,
        pendingDrafts: drafts,
        excludeDraftKey: excludeDraftKey,
        targetPeriod: targetPeriod,
        period: targetPeriod,
        getScheduleForDate: getScheduleForDate
      };
    }

    function patchLocalMutualQuota(email, nextQuota) {
      var em = String(email || '').toLowerCase();
      var list = teachersList.value.slice();
      var i = list.findIndex(function (t) {
        return [t.email, t.loginEmail].some(function (value) {
          return value && String(value).toLowerCase() === em;
        });
      });
      if (i < 0) return;
      list[i] = Object.assign({}, list[i], {
        mutualQuota: (function () {
          var n = parseFloat(nextQuota);
          if (isNaN(n) || n < 0) n = 0;
          return Math.round(n * 1000) / 1000;
        })()
      });
      teachersList.value = list;
    }

    /** 從空堂事件解析發放用的 eventId / eventName */
    function resolveEarnEventFromClassAway() {
      var events = (classAwayEvents && classAwayEvents.value) ? classAwayEvents.value : [];
      var selectedId = String(getMutualImportEventId() || '').trim();
      var hit = null;
      if (selectedId) {
        hit = events.find(function (e) { return String(e.id) === selectedId; }) || null;
      }
      // 未選下拉：用期間＋外出班對可進互代事件做最佳匹配
      if (!hit && events.length) {
        var start = String(mutualActivityStart.value || '').slice(0, 10);
        var end = String(mutualActivityEnd.value || '').slice(0, 10);
        var awaySet = {};
        (mutualAwayClasses.value || []).forEach(function (c) {
          var k = String(c || '').trim();
          if (k) awaySet[k] = true;
        });
        var best = null;
        var bestScore = -1;
        events.forEach(function (e) {
          if (!e || e.enabled === false) return;
          if (e.forMutual === false) return;
          var es = String(e.startDate || '').slice(0, 10);
          var ee = String(e.endDate || '').slice(0, 10);
          var score = 0;
          var samePeriodRange = String(e.startPeriod == null || e.startPeriod === '' ? '0' : e.startPeriod)
              === String(mutualActivityStartPeriod.value || '0')
            && String(e.endPeriod == null || e.endPeriod === '' ? '8' : e.endPeriod)
              === String(mutualActivityEndPeriod.value || '8');
          if (start && es && start === es) score += 3;
          if (end && ee && end === ee) score += 2;
          if (samePeriodRange) score += 4;
          if (start && es && !end && start === es) score += 1;
          var cls = Array.isArray(e.classes) ? e.classes : [];
          var overlap = 0;
          cls.forEach(function (c) {
            if (awaySet[String(c || '').trim()]) overlap++;
          });
          if (overlap > 0) score += Math.min(5, overlap);
          if (score > bestScore) {
            bestScore = score;
            best = e;
          }
        });
        if (best && bestScore >= 3) hit = best;
      }
      if (hit) {
        return {
          eventId: String(hit.id || '').trim(),
          eventName: String(hit.name || '').trim()
        };
      }
      // 備註常在帶入事件時寫成「事件名 起日～迄日」
      var note = String(mutualNote.value || '').trim();
      if (note) {
        var nameFromNote = note.split(/\s+/)[0] || note;
        if (nameFromNote && nameFromNote !== '活動互代') {
          var awayKey = (mutualAwayClasses.value || []).slice().sort().join(',');
          return {
            eventId: 'act_' + mutualActivityStart.value + '_' + mutualActivityEnd.value + '_'
              + mutualActivityStartPeriod.value + '_' + mutualActivityEndPeriod.value + '_'
              + String(awayKey).replace(/[^0-9A-Za-z\u4e00-\u9fff,]/g, '').slice(0, 40),
            eventName: nameFromNote
          };
        }
      }
      return { eventId: '', eventName: '' };
    }

    async function recalculateMutualQuotasFromActivity() {
      if (!isAdmin.value) {
        showToast('僅管理員可發放折抵額度', 'warning');
        return;
      }
      var dac = DAC();
      if (!dac || !dac.buildQuotaRecalcRows) {
        showToast('活動互代模組未載入', 'error');
        return;
      }
      if (!mutualAwayClasses.value.length) {
        showToast('請先選擇外出班級', 'info');
        return;
      }
      ensureMutualActivityRange();
      var leaders = Array.from(new Set(
        (mutualLeadEmails.value || []).map(function (e) { return String(e).toLowerCase(); }).filter(Boolean)
      ));
      var rows = dac.buildQuotaRecalcRows({
        mode: 'add',
        teachers: teachersList.value,
        awayClasses: mutualAwayClasses.value,
        startDate: mutualActivityStart.value,
        endDate: mutualActivityEnd.value,
        periodMode: mutualActivityPeriodMode.value,
        periods: mutualActivityPeriods.value,
        startPeriod: mutualActivityStartPeriod.value,
        endPeriod: mutualActivityEndPeriod.value,
        weekDates: currentWeekDates.value,
        allSchedules: allSchedules.value,
        excludeEmails: leaders
      });
      var skippedLeaders = rows.filter(function (r) { return r.skipped; });
      var changed = rows.filter(function (r) { return !r.skipped && r.released > 0; });
      if (!changed.length) {
        var tip = skippedLeaders.length ? '（已排除帶隊 ' + skippedLeaders.length + ' 人）' : '';
        showToast('此期間沒有可發放的釋出節數' + tip, 'info');
        return;
      }
      // 事件名稱／ID：必須對應空堂事件名稱（勿寫死「活動互代」）
      var eventMeta = resolveEarnEventFromClassAway();
      var eventId = eventMeta.eventId;
      var eventName = eventMeta.eventName;
      if (!eventName) {
        showToast('請先在上方選取空堂事件（事件名稱會寫入額度帳本）', 'warning');
        return;
      }
      // 全列名單（依釋出多→少、再姓名），並加總釋出節數
      var sorted = changed.slice().sort(function (a, b) {
        if ((b.released || 0) !== (a.released || 0)) return (b.released || 0) - (a.released || 0);
        return String(a.name || a.email).localeCompare(String(b.name || b.email), 'zh-Hant');
      });
      var totalReleased = sorted.reduce(function (sum, r) {
        return sum + (parseFloat(r.released) || 0);
      }, 0);
      totalReleased = Math.round(totalReleased * 1000) / 1000;
      var fmtQ = function (n) {
        var x = Math.round((parseFloat(n) || 0) * 1000) / 1000;
        return (x % 1 === 0) ? String(x) : String(x);
      };
      var totalSlots = sorted.reduce(function (sum, r) {
        return sum + (parseInt(r.releasedSlots, 10) || 0);
      }, 0);
      var listLines = sorted.map(function (r, i) {
        var nm = r.name || r.email || '（無名）';
        var rel = parseFloat(r.released) || 0;
        var slots = parseInt(r.releasedSlots, 10) || 0;
        var prev = parseFloat(r.prevQuota) || 0;
        var next = (typeof r.nextQuota === 'number') ? r.nextQuota : (prev + rel);
        return (i + 1) + '. ' + nm + '　釋出 ' + slots + ' 節→＋' + fmtQ(rel)
          + '　（餘額 ' + fmtQ(prev) + '→' + fmtQ(next) + '）';
      }).join('\n');
      var skipTip = skippedLeaders.length
        ? '\n已排除帶隊 ' + skippedLeaders.length + ' 人：'
          + skippedLeaders.map(function (r) { return r.name || r.email; }).join('、')
        : '';
      var ok = await showConfirm(
        '將寫入「額度帳本」並更新教師名單餘額（同活動不重複）\n'
        + '規則：一般課表未上 1 節＝發 1；小鐘點不發額度（未授課另扣）；扣額度須滿 1 才扣 1\n'
         + '空堂事件：' + eventName + '\n'
         + '期間：' + mutualActivityStart.value + '～' + mutualActivityEnd.value + ' · '
         + (mutualActivityPeriodMode.value === 'daily'
           ? (window.DomainClassAway && window.DomainClassAway.periodLabel
             ? '每日' + window.DomainClassAway.periodLabel(mutualActivityPeriods.value) : '每日指定')
           : (window.DomainClassAway && window.DomainClassAway.periodRangeLabel
             ? '連續' + window.DomainClassAway.periodRangeLabel(mutualActivityStartPeriod.value, mutualActivityEndPeriod.value) : '全部節次')) + '\n'
        + '外出班：' + mutualAwayClasses.value.length + ' 班\n'
        + '發放 ' + sorted.length + ' 位教師　·　合計釋出 ' + totalSlots + ' 節　·　合計額度 ＋' + fmtQ(totalReleased)
        + skipTip + '\n\n'
        + '── 全名單 ──\n'
        + listLines + '\n\n'
        + '合計：' + sorted.length + ' 人／' + totalSlots + ' 節／額度 ＋' + fmtQ(totalReleased) + '\n\n'
        + '確定發放？\n（若本活動已發放過，將略過已發者）',
        '發放折抵額度'
      );
      if (!ok) return;
      loading.value = true;
      loadingMessage.value = '計算釋出節數並批次寫入額度帳本（約數秒）…';
      try {
        // 只送有釋出者，減輕 payload
        var payloadList = changed.map(function (r) {
          return { email: r.loginEmail || r.email, name: r.name || '', released: r.released };
        });
        loadingMessage.value = '正在批次寫入 ' + payloadList.length + ' 人…';
        var gasCall = (typeof callGasApi === 'function') ? callGasApi : null;
        var res = await gasCall('earnMutualQuotaFromActivity', {
          eventId: eventId,
          eventName: eventName,
          startDate: mutualActivityStart.value,
          endDate: mutualActivityEnd.value,
          mode: 'add',
          list: payloadList
        });
        var earnedN = res && res.earned != null ? res.earned : 0;
        var skippedN = res && res.skipped != null ? res.skipped : 0;
        var wroteN = res && res.wroteLedger != null ? res.wroteLedger : earnedN;
        if (res && res.results && res.results.length) {
          res.results.forEach(function (r) {
            if (r.skipped) return;
            if (typeof r.balance === 'number') {
              patchLocalMutualQuota(r.email, r.balance);
              return;
            }
            var src = changed.find(function (c) {
              var resultEmail = String(r.email || '').toLowerCase();
              return [c.email, c.loginEmail].some(function (value) {
                return value && String(value).toLowerCase() === resultEmail;
              });
            });
            var t = (teachersList.value || []).find(function (x) {
              var resultEmail = String(r.email || '').toLowerCase();
              return [x.email, x.loginEmail].some(function (value) {
                return value && String(value).toLowerCase() === resultEmail;
              });
            });
            var prev = t ? (parseFloat(t.mutualQuota) || 0) : 0;
            patchLocalMutualQuota(r.email, prev + (src ? (src.released || 0) : 0));
          });
        }
        var skipMsg = skippedLeaders.length ? '，帶隊排除 ' + skippedLeaders.length : '';
        var dupMsg = skippedN ? '，帳本已有略過 ' + skippedN : '';
        if (earnedN === 0 && skippedN > 0) {
          showToast('本事件帳本已有 earn 列（略過 ' + skippedN + '）。若表上沒看到，請確認分頁名是「額度帳本」', 'warning');
        } else {
          showToast('已寫入額度帳本 ' + wroteN + ' 列／發放 ' + earnedN + ' 人' + dupMsg + skipMsg, 'success');
        }
        // 額度已變：清前端歷程快取（若有）
        try {
          if (typeof window !== 'undefined' && window.__quotaLedgerCacheBust) window.__quotaLedgerCacheBust();
        } catch (eB) { /* ignore */ }
        softRefreshInBackground({ force: true, delay: 900 });
      } catch (e) {
        console.error(e);
        showToast('發放額度失敗：' + (e && e.message ? e.message : String(e)), 'error');
      } finally {
        loading.value = false;
      }
    }

    function setMutualCover(on) {
      if (!isAdmin.value) {
        showToast('僅管理員可使用活動互代', 'warning');
        return;
      }
      isMutualCover.value = !!on;
      if (isMutualCover.value) {
        var saved = restoreMutualPanelDraft();
        if (saved) applyMutualPanelDraft(saved);
        ensureMutualActivityRange();
        if (pendingRequestData && pendingRequestData.value) {
          if (!pendingRequestData.value.reason) pendingRequestData.value.reason = '公假';
          pendingRequestData.value.subFee = ACTIVITY_PUBLIC_FEE;
          if (pendingRequestData.value.mode === 'substitution' || !pendingRequestData.value.mode) {
            if (directApproveMode) directApproveMode.value = true;
          }
        }
        if (batchSubFee) batchSubFee.value = ACTIVITY_PUBLIC_FEE;
        persistMutualPanelDraft();
        var n = (mutualDrafts.value || []).length;
        showToast(
          n > 0
            ? '活動互代已開啟（已還原 ' + n + ' 節暫定，送出前會保留）'
            : '活動互代：選取內容會暫存；點帶隊課格暫定→一次送出',
          'info'
        );
      } else {
        persistMutualPanelDraft();
        if (pendingRequestData && pendingRequestData.value) {
          pendingRequestData.value.subFee = defaultSubFeeForReason(pendingRequestData.value.reason);
          if (batchSubFee) batchSubFee.value = pendingRequestData.value.subFee || '自費代課';
        }
        showToast('已關閉活動互代面板（選取與暫定已保留）', 'info');
      }
    }

    function toggleMutualCover() {
      setMutualCover(!isMutualCover.value);
    }

    function assignMutualDraftFromMatch(subEmail) {
      if (!isMutualCover.value || !subEmail) return;
      var leaveEmail = activeCell.value && activeCell.value.teacherEmail;
      if (!leaveEmail) {
        showToast('請先點選帶隊老師的課格', 'info');
        return;
      }
      if (!isMutualLead(leaveEmail)) {
        showToast('請先將該老師加入「帶隊老師」名單', 'warning');
        return;
      }
      var dateStr = inputRequestDate.value;
      var period = parseInt(activeCell.value.period, 10);
      var dayOfWeek = parseInt(activeCell.value.dayOfWeek, 10);
      var cls = activeCell.value.classData || {};
      var cand = (recommendedTeachers.value || []).find(function (t) {
        return t.email && String(t.email).toLowerCase() === String(subEmail).toLowerCase();
      });
      var dac = DAC();
      if (!cand && dac) {
        var bal = dac.getTeacherReleaseBalance(subEmail, activityBalanceCtx());
        cand = { email: subEmail, remainingReleased: bal.remaining };
      }
      var fee = dac
        ? dac.feeFromCandidate(cand, true, period)
        : (parseInt(period, 10) === 8 ? PERIOD8_FEE : ACTIVITY_PUBLIC_FEE);
      var key = mutualDraftKey(leaveEmail, dateStr, period);
      var draft = {
        key: key,
        leaveEmail: leaveEmail,
        leaveName: getTeacherNameByEmail(leaveEmail),
        dateStr: dateStr,
        dayOfWeek: dayOfWeek,
        period: period,
        className: cls.className || '',
        subject: cls.subject || '',
        restriction: cls.restriction || '',
        subEmail: subEmail,
        subName: getTeacherNameByEmail(subEmail),
        fee: fee
      };
      var list = mutualDrafts.value.filter(function (d) { return d.key !== key; });
      list.push(draft);
      list.sort(function (a, b) {
        if (a.dateStr !== b.dateStr) return String(a.dateStr).localeCompare(String(b.dateStr));
        if (a.leaveName !== b.leaveName) {
          return String(a.leaveName).localeCompare(String(b.leaveName), 'zh-Hant');
        }
        return a.period - b.period;
      });
      mutualDrafts.value = list;
      persistMutualPanelDraft();
      if (showMatchModal) showMatchModal.value = false;
      showToast('暫定：' + draft.leaveName + ' 第' + period + '節 → ' + draft.subName + '（' + fee + '）', 'success');
    }

    return {
      LS_KEY: LS_KEY,
      mutualDraftKey: mutualDraftKey,
      persistMutualPanelDraft: persistMutualPanelDraft,
      restoreMutualPanelDraft: restoreMutualPanelDraft,
      applyMutualPanelDraft: applyMutualPanelDraft,
      clearMutualPanel: clearMutualPanel,
      ensureMutualActivityRange: ensureMutualActivityRange,
      setMutualActivityThisWeek: setMutualActivityThisWeek,
      setMutualActivityPeriodMode: setMutualActivityPeriodMode,
      toggleMutualActivityPeriod: toggleMutualActivityPeriod,
      isMutualActivityPeriodSelected: isMutualActivityPeriodSelected,
      setMutualActivityPeriods: setMutualActivityPeriods,
      toggleMutualLead: toggleMutualLead,
      isMutualLead: isMutualLead,
      toggleMutualAwayClass: toggleMutualAwayClass,
      selectAwayGrade: selectAwayGrade,
      getMutualDraftAt: getMutualDraftAt,
      removeMutualDraft: removeMutualDraft,
      clearMutualDrafts: clearMutualDrafts,
      activityBalanceCtx: activityBalanceCtx,
      patchLocalMutualQuota: patchLocalMutualQuota,
      recalculateMutualQuotasFromActivity: recalculateMutualQuotasFromActivity,
      setMutualCover: setMutualCover,
      toggleMutualCover: toggleMutualCover,
      assignMutualDraftFromMatch: assignMutualDraftFromMatch
    };
  }

  return { create: create, mutualDraftKey: mutualDraftKey, LS_KEY: LS_KEY };
})();


/**
 * 活動互代：暫定草稿一次送出
 */
window.UiMutualSubmit = (function () {
  async function submitAllMutualDrafts(deps) {
    var isMutualCover = deps.isMutualCover;
    var mutualDrafts = deps.mutualDrafts;
    var mutualNote = deps.mutualNote;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var showConfirm = deps.showConfirm;
    var showToast = deps.showToast;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var currentSemester = deps.currentSemester;
    var isAdmin = deps.isAdmin;
    var directApproveMode = deps.directApproveMode;
    var callGasApi = deps.callGasApi;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var deductMutualQuotaForRows = deps.deductMutualQuotaForRows;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var persistMutualPanelDraft = deps.persistMutualPanelDraft;
    var activityBalanceCtx = deps.activityBalanceCtx;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineBatchParts = deps.lineBatchParts;
    var lineCopyText = deps.lineCopyText;
    var showSuccessModal = deps.showSuccessModal;
    var buildLineBatchInviteText = deps.buildLineBatchInviteText;
    var DAC = deps.DAC || function () { return window.DomainActivityCover; };
    var isSubmitting = deps.isSubmitting;

    if (deps.paperMode && deps.paperMode.value && isMutualCover.value && !(isAdmin && isAdmin.value)) {
      hasLineTemplate.value = false;
      lineCopyText.value = '';
      lineBatchParts.value = [];
      if (showSuccessModal) showSuccessModal.value = false;
      if (typeof deps.openPaperPrintMutualDrafts === 'function') {
        deps.openPaperPrintMutualDrafts();
      } else {
        showToast('目前為紙本模式，請從模擬視窗列印紙本單', 'info');
      }
      return;
    }
    if (isSubmitting && isSubmitting.value) {
      showToast('申請送出中，請稍候…', 'info');
      return;
    }
    if (!isMutualCover.value) return;
    if (!mutualDrafts.value.length) {
      showToast('尚無暫定安排', 'info');
      return;
    }
    var rangeCheck = activityBalanceCtx();
    var activityDomain = DAC();
    if (activityDomain && activityDomain.isActivitySlotInRange) {
      var outOfRangeDrafts = mutualDrafts.value.filter(function (draft) {
        return !activityDomain.isActivitySlotInRange(draft.dateStr, draft.period, rangeCheck);
      });
      if (outOfRangeDrafts.length) {
        showToast('有 ' + outOfRangeDrafts.length + ' 筆暫定不在目前活動日期／節次範圍內，請移除或調整範圍', 'warning');
        return;
      }
    }
    if (isSubmitting) isSubmitting.value = true;
    loading.value = true;
    loadingMessage.value = '正在準備送出…';
    var reason = '公假';
    var note = String(mutualNote.value || '').trim();
    var byLeave = {};
    mutualDrafts.value.forEach(function (d) {
      var k = String(d.leaveEmail).toLowerCase();
      if (!byLeave[k]) byLeave[k] = [];
      byLeave[k].push(d);
    });
    var leaveGroups = Object.values(byLeave);
    var total = mutualDrafts.value.length;
    var allRows = [];
    try {
      var ok = await showConfirm(
        '將一次送出 ' + total + ' 節暫定安排（' + leaveGroups.length + ' 位帶隊老師）\n'
        + (note ? '統一備註：' + note + '\n' : '')
        + (mutualSkipNotify.value ? '不會寄系統信，請稍後用 LINE 手動通知。\n' : '')
        + '確定送出？',
        '一次送出暫定'
      );
      if (!ok) return;
      loadingMessage.value = '正在送出 ' + total + ' 節暫定…';
      for (var g = 0; g < leaveGroups.length; g++) {
        var group = leaveGroups[g];
        for (var offset = 0; offset < group.length; offset += 20) {
          var chunk = group.slice(offset, offset + 20);
          var workSlots = chunk.map(function (d) {
            return {
              teacherEmail: d.leaveEmail,
              dateStr: d.dateStr,
              dayOfWeek: d.dayOfWeek,
              period: d.period,
              className: d.className,
              subject: d.subject,
              subTeacherEmail: d.subEmail,
              subTeacherName: d.subName,
              fee: d.fee
            };
          });
          var feeAssigns = null;
          var dac = DAC();
          if (dac && dac.assignFeesForBatchSlots) {
            feeAssigns = dac.assignFeesForBatchSlots(
              workSlots,
              activityBalanceCtx({ pendingDrafts: [] })
            );
          }
          var batchId = 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
          var leaveEmail = chunk[0].leaveEmail;
          var leaveName = chunk[0].leaveName;
          var stamp = Date.now();
          var serialRoot = 'SUB' + (1000 + Math.floor(Math.random() * 9000));
          var rows = workSlots.map(function (s, i) {
            var base = String(note || '').trim();
           var noteOut = base;
            return {
              "學期代號": currentSemester.value,
              "申請單ID": 'req_' + stamp + '_' + i + '_' + Math.random().toString(36).substr(2, 5),
              "單號": serialRoot + '-' + (offset + i + 1),
              "批次ID": batchId,
              "異動類型": 'substitution',
              "申請人姓名": leaveName,
              "受邀人姓名": s.subTeacherName,
              "異動日期": s.dateStr,
              "異動節次": s.period,
              "異動星期": s.dayOfWeek,
              "班級": s.className,
              "科目": s.subject,
              "請假事由": reason,
              "經費來源": (feeAssigns && feeAssigns[i])
                ? feeAssigns[i].fee
                : (s.fee || (parseInt(s.period, 10) === 8 ? PERIOD8_FEE : ACTIVITY_PUBLIC_FEE)),
               "備註": noteOut,
               "狀態": (isAdmin.value && directApproveMode.value) ? 'approved' : 'pending_teacher',
               "直接核准": (isAdmin.value && directApproveMode.value) ? '是' : '',
               "是否已印": false,
              "建立時間": '',
              directApprove: !!(isAdmin.value && directApproveMode.value)
            };
          });
          await callGasApi('submitRequestBatch', {
            batchId: batchId,
            directApprove: !!(isAdmin.value && directApproveMode.value),
            skipNotify: !!(
              mutualSkipNotify.value
              || (deps.notificationsSuppressed && deps.notificationsSuppressed.value && isAdmin.value)
            ),
            requests: rows
          });
          rows.forEach(function (r) {
            optimisticUpsertRequest(sheetRequestToFront(r));
          });
          await deductMutualQuotaForRows(rows);
          for (var ri = 0; ri < rows.length; ri++) allRows.push(rows[ri]);
        }
      }
      softRefreshInBackground({ delay: 2000 });
      mutualDrafts.value = [];
      persistMutualPanelDraft();

      var feeKinds = {};
      allRows.forEach(function (r) {
        var f = r['經費來源'] || '';
        feeKinds[f] = (feeKinds[f] || 0) + 1;
      });
      var feeTip = Object.keys(feeKinds).map(function (f) {
        return f + ' ' + feeKinds[f] + '節';
      }).join('、');
      successModalTitle.value = '🎉 暫定已全部送出';
      successModalMessage.value = '共 ' + allRows.length + ' 節已寫入（' + feeTip + '）。'
        + (mutualSkipNotify.value ? ' 尚未寄系統信，請用下方 LINE 手動通知。' : '');
      if (deps.successFlowMode) {
        deps.successFlowMode.value = (isAdmin.value && directApproveMode.value) ? 'direct' : 'normal';
      }
      hasLineTemplate.value = !!mutualSkipNotify.value;
      if (hasLineTemplate.value) {
        var currentUrl = window.location.origin + window.location.pathname;
        var bySub = {};
        allRows.forEach(function (r) {
           var em = String(r['受邀人姓名'] || '').toLowerCase();
          if (!bySub[em]) bySub[em] = { name: r['受邀人姓名'], rows: [] };
          bySub[em].rows.push(r);
        });
        lineBatchParts.value = Object.keys(bySub).map(function (k) {
          var g = bySub[k];
          return {
            name: g.name,
            count: g.rows.length,
            text: buildLineBatchInviteText({
              targetName: g.name,
              requesterName: '教學組',
              reason: reason,
              subFee: g.rows[0]['經費來源'],
              systemUrl: currentUrl,
              batchId: g.rows[0]['批次ID'],
              paperFlow: !!(deps.notificationsSuppressed && deps.notificationsSuppressed.value),
              slots: g.rows.map(function (r) {
                return {
                  id: r['申請單ID'],
                  date: r['異動日期'],
                  day: r['異動星期'],
                  period: r['異動節次'],
                  className: r['班級'],
                   subject: r['科目'],
                   teacherName: r['申請人姓名']
                };
              })
            })
          };
        });
        lineCopyText.value = lineBatchParts.value.map(function (p) { return p.text; }).join('\n\n==========\n\n');
      } else {
        lineCopyText.value = '';
        lineBatchParts.value = [];
      }
      showSuccessModal.value = true;
    } catch (err) {
      console.error(err);
      showToast('送出暫定失敗：' + (err && err.message ? err.message : String(err)), 'error');
    } finally {
      loading.value = false;
      if (isSubmitting) isSubmitting.value = false;
    }
  }

  return { submitAllMutualDrafts: submitAllMutualDrafts };
})();


/**
 * 一般／活動批次代課送出（executeBatchSubmit）
 */
window.UiBatchSubmit = (function () {
  async function executeBatchExchangeSubmit(deps) {
    var batchSlots = deps.batchSlots;
    var pendingRequestData = deps.pendingRequestData;
    var showToast = deps.showToast;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var isSubmitting = deps.isSubmitting;
    var slots = batchSlots.value || [];
    var pending = pendingRequestData.value || {};
    if (slots.length < 2) {
      showToast('批次調課至少需要 2 組互調', 'info');
      return;
    }
    if (isSubmitting && isSubmitting.value) {
      showToast('申請送出中，請稍候…', 'info');
      return;
    }
    if (loading && loading.value) return;

    var batchId = String(pending.submitBatchId || (slots.find(s => s.batchId) || {}).batchId || '').trim();
    if (!batchId) {
      batchId = 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    var pendingSnapshot = Object.assign({}, pending, { submitBatchId: batchId });
    var localFailures = slots.filter(slot => !slot.exchangeSubmitted && !!slot.exchangeValidationError)
      .map(slot => ({ requestId: slot.exchangeRequestId, key: slot.key, error: slot.exchangeValidationError }));
    var eligible = slots.filter(slot => !slot.exchangeSubmitted && !slot.exchangeValidationError);
    if (!eligible.length) {
      showToast(localFailures.length
        ? '目前沒有可送出的組別，請先修正總覽中的錯誤'
        : '此批次的調課組別都已送出', localFailures.length ? 'warning' : 'info');
      return;
    }
    if (eligible.some(slot => !slot.subTeacherEmail || !slot.targetDate || slot.targetPeriod == null)) {
      showToast('仍有組別尚未完成對調配對', 'warning');
      return;
    }
    if (isSubmitting) isSubmitting.value = true;
    if (loading) loading.value = true;
    if (loadingMessage) loadingMessage.value = '正在逐組檢查並送出批次調課…';

    var encodeTime = function (day, period) {
      return window.DateUtils && window.DateUtils.encodeTimeKey
        ? window.DateUtils.encodeTimeKey(day, period)
        : (String(day) + '-' + String(period));
    };
    var prepared = [];
    var buildFailures = [];
    try {
      eligible.forEach(function (slot) {
        var requestId = String(slot.exchangeRequestId || ('req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7)));
        var serial = String(slot.exchangeSerial || ('SWP' + (1000 + Math.floor(Math.random() * 9000))));
        slot.exchangeRequestId = requestId;
        slot.exchangeSerial = serial;
        var rowPending = Object.assign({}, pendingSnapshot, {
          mode: 'exchange',
          isBatch: false,
          isExchangeBatch: false,
          leaveTeacher: slot.teacherEmail,
          subTeacher: slot.subTeacherEmail,
          date: slot.dateStr,
          timeKey: encodeTime(slot.dayOfWeek, slot.period),
          cls: slot.className || '',
          subject: slot.subject || '',
          dateB: slot.targetDate,
          timeB: encodeTime(slot.targetDayOfWeek, slot.targetPeriod),
          subBClass: slot.targetClassName || '',
          subB: slot.targetSubject || '',
          reason: pendingSnapshot.reason || '課務調整',
          note: pendingSnapshot.note || '',
          submitRequestId: requestId,
          submitSerial: serial
        });
        try {
          pendingRequestData.value = rowPending;
          if (typeof deps.buildSubmitPayload !== 'function') throw new Error('調課申請組裝模組未載入');
          var built = deps.buildSubmitPayload(requestId, serial);
          var request = built && built.newRequest;
          if (!request) throw new Error('無法建立此組調課申請資料');
          request['批次ID'] = batchId;
          request.batchId = batchId;
          prepared.push({ slot: slot, request: request });
        } catch (buildError) {
          buildFailures.push({ requestId: requestId, key: slot.key, error: String(buildError.message || buildError) });
        }
      });
    } finally {
      pendingRequestData.value = pendingSnapshot;
    }

    if (!prepared.length) {
      var noBuildFailures = localFailures.concat(buildFailures);
      batchSlots.value = (batchSlots.value || []).map(slot => {
        var failure = noBuildFailures.find(item => String(item.key) === String(slot.key));
        return failure ? Object.assign({}, slot, { exchangeSubmitError: failure.error }) : slot;
      });
      if (loading) loading.value = false;
      if (isSubmitting) isSubmitting.value = false;
      showToast('沒有成功組裝的調課組別，請檢查各組訊息', 'warning');
      return;
    }

    var directApprove = !!(deps.isAdmin && deps.isAdmin.value
      && deps.directApproveMode && deps.directApproveMode.value);
    var skipNotify = !!(
      (directApprove && deps.directApproveSkipNotify && deps.directApproveSkipNotify.value)
      || (deps.notificationsSuppressed && deps.notificationsSuppressed.value && deps.isAdmin && deps.isAdmin.value)
    );
    var response = null;
    var requestFailure = '';
    try {
      if (loadingMessage) loadingMessage.value = '正在送出 ' + prepared.length + ' 組獨立調課申請…';
      response = await deps.callGasApi('submitExchangeBatch', {
        batchId: batchId,
        directApprove: directApprove,
        paperFlow: false,
        skipNotify: skipNotify,
        requests: prepared.map(item => item.request)
      });
      if (response && response.success === false) throw new Error(response.error || '批次調課送出失敗');
    } catch (submitError) {
      requestFailure = String(submitError && submitError.message || submitError);
    } finally {
      if (loading) loading.value = false;
      if (isSubmitting) isSubmitting.value = false;
    }

    var serverSuccesses = new Map((response && response.successes || []).map(item => [String(item.requestId || ''), item]));
    var serverFailures = new Map((response && response.failures || []).map(item => [String(item.requestId || ''), item]));
    var successful = [];
    var submitFailures = localFailures.concat(buildFailures);
    prepared.forEach(function (item) {
      var id = String(item.request['申請單ID'] || '');
      var failure = serverFailures.get(id);
      if (requestFailure || failure || !serverSuccesses.has(id)) {
        submitFailures.push({
          requestId: id,
          key: item.slot.key,
          error: requestFailure || String(failure && failure.error || '伺服器未回報此組送出成功'),
          submissionUnknown: !!requestFailure
        });
        return;
      }
      var result = serverSuccesses.get(id) || {};
      if (result.status) item.request['狀態'] = result.status;
      if (result.paperFlow !== undefined) {
        item.request.paperFlow = !!result.paperFlow;
        item.request['紙本流程'] = result.paperFlow ? 'TRUE' : 'FALSE';
      } else {
        item.request.paperFlow = item.request.paperFlow === true
          || String(item.request['紙本流程'] || '').toUpperCase() === 'TRUE';
      }
      successful.push(item.request);
    });

    var successIds = new Set(successful.map(row => String(row['申請單ID'] || '')));
    var failureByKey = new Map(submitFailures.map(item => [String(item.key || ''), item]));
    batchSlots.value = (batchSlots.value || []).map(slot => {
      var id = String(slot.exchangeRequestId || '');
      if (successIds.has(id)) {
        return Object.assign({}, slot, {
          exchangeSubmitted: true,
          exchangeSubmitError: '',
          exchangeValidationError: '',
          exchangeSubmissionUnknown: false
        });
      }
      var failure = failureByKey.get(String(slot.key || ''));
      return failure ? Object.assign({}, slot, {
        exchangeSubmitError: failure.error,
        exchangeSubmissionUnknown: !!failure.submissionUnknown
      }) : slot;
    });

    if (successful.length) {
      successful.forEach(row => {
        var front = typeof deps.sheetRequestToFront === 'function' ? deps.sheetRequestToFront(row) : row;
        if (typeof deps.optimisticUpsertRequest === 'function') deps.optimisticUpsertRequest(front);
      });
      if (deps.successActionRequests) deps.successActionRequests.value = successful;
      if (typeof deps.softRefreshInBackground === 'function') deps.softRefreshInBackground({ delay: 2000 });
    }

    var paperRows = successful.filter(row => row.paperFlow === true || String(row['紙本流程'] || '').toUpperCase() === 'TRUE');
    var totalFailures = submitFailures.length;
    var allDone = (batchSlots.value || []).every(slot => slot.exchangeSubmitted);
    if (deps.successModalTitle) {
      deps.successModalTitle.value = totalFailures ? '🎉 批次調課部分送出' : '🎉 批次調課已送出';
    }
    if (deps.successModalMessage) {
      var details = submitFailures.slice(0, 5).map(item => item.error).join('；');
      deps.successModalMessage.value = '成功送出 ' + successful.length + ' 組'
        + (totalFailures ? '，' + totalFailures + ' 組未送出，錯誤已保留在各組供修正。' : '。')
        + (details ? '\n' + details : '');
    }
    if (deps.successFlowMode) deps.successFlowMode.value = directApprove ? 'direct' : 'normal';

    if (paperRows.length) {
      if (deps.showSuccessModal) deps.showSuccessModal.value = false;
      if (deps.showCompareModal) deps.showCompareModal.value = false;
      if (allDone && deps.batchSelectMode) deps.batchSelectMode.value = false;
      if (allDone && typeof deps.clearBatchSlots === 'function') deps.clearBatchSlots();
      showToast('已送出 ' + paperRows.length + ' 組紙本調課；請列印並完成簽名。', 'success', 6000);
      if (typeof deps.openPaperPrintDraft === 'function') deps.openPaperPrintDraft(paperRows);
      return;
    }

    var manualLineParts = [];
    if (skipNotify && successful.length && typeof deps.buildLineInviteText === 'function') {
      var systemUrl = window.location.origin + window.location.pathname;
      successful.forEach(function (row) {
        var requestId = String(row['申請單ID'] || '');
        var message = deps.buildLineInviteText({
          targetName: row['受邀人姓名'],
          requesterName: row.isProxySubmit ? row['申請人姓名'] : '',
          courseTeacherA: row['申請人姓名'],
          courseTeacherB: row['受邀人姓名'],
          dateA: row['異動日期'], dayA: row['異動星期'], periodA: row['異動節次'],
          classA: row['班級'], subjectA: row['科目'], isExchange: true,
          dateB: row['對調目標日期'], dayB: row['對調目標星期'], periodB: row['對調目標節次'],
          classB: row['對調目標班級'], subjectB: row['對調目標科目'],
          agreeLink: systemUrl + '?action=respond&id=' + encodeURIComponent(requestId) + '&status=agree',
          declineLink: systemUrl + '?action=respond&id=' + encodeURIComponent(requestId) + '&status=decline',
          notificationOnly: String(row['狀態'] || '') === 'approved', systemUrl: systemUrl
        });
        manualLineParts.push({ name: row['受邀人姓名'] || '', count: 1, text: message });
      });
    }
    if (deps.hasLineTemplate) deps.hasLineTemplate.value = manualLineParts.length > 0;
    if (deps.lineBatchParts) deps.lineBatchParts.value = manualLineParts;
    if (deps.lineCopyText) deps.lineCopyText.value = manualLineParts.length === 1 ? manualLineParts[0].text : '';

    if (allDone && !totalFailures) {
      if (deps.batchSelectMode) deps.batchSelectMode.value = false;
      if (typeof deps.clearBatchSlots === 'function') deps.clearBatchSlots();
      if (deps.showCompareModal) deps.showCompareModal.value = false;
      if (deps.showSuccessModal) deps.showSuccessModal.value = true;
    } else if (successful.length) {
      if (deps.showCompareModal) deps.showCompareModal.value = false;
      if (deps.showSuccessModal) deps.showSuccessModal.value = true;
      if (deps.batchSelectMode) deps.batchSelectMode.value = true;
    } else {
      if (deps.showCompareModal) deps.showCompareModal.value = true;
      showToast(totalFailures ? '沒有組別送出成功，請修正各組錯誤後再試' : '沒有可送出的調課組別', 'warning');
    }
  }

  async function executeBatchSubmit(deps) {
    if (deps.pendingRequestData && deps.pendingRequestData.value
        && deps.pendingRequestData.value.isExchangeBatch === true) {
      return executeBatchExchangeSubmit(deps);
    }
    var batchSlots = deps.batchSlots;
    var pendingRequestData = deps.pendingRequestData;
    var batchAssignMode = deps.batchAssignMode;
    var batchReason = deps.batchReason;
    var batchNote = deps.batchNote;
    var batchSubTeacher = deps.batchSubTeacher;
    var batchSubFee = deps.batchSubFee;
    var showToast = deps.showToast;
    var showConfirm = deps.showConfirm;
    var getScheduleForDate = deps.getScheduleForDate;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getLeaveTimeDefaults = deps.getLeaveTimeDefaults;
    var isMutualCover = deps.isMutualCover;
    var mutualAwayClasses = deps.mutualAwayClasses;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var isAdmin = deps.isAdmin;
    var isQuotaDeductFee = deps.isQuotaDeductFee;
    var QUOTA_DEDUCT_FEE = deps.QUOTA_DEDUCT_FEE;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var defaultSubFeeForReason = deps.defaultSubFeeForReason;
    var assertQuotaDeductAllowed = deps.assertQuotaDeductAllowed;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var currentSemester = deps.currentSemester;
    var directApproveMode = deps.directApproveMode;
    var directApproveSkipNotify = deps.directApproveSkipNotify;
    var paperFlow = deps.paperFlow;
    var callGasApi = deps.callGasApi;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var deductMutualQuotaForRows = deps.deductMutualQuotaForRows;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var activityBalanceCtx = deps.activityBalanceCtx;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineBatchParts = deps.lineBatchParts;
     var lineCopyText = deps.lineCopyText;
     var showSuccessModal = deps.showSuccessModal;
     var successActionRequests = deps.successActionRequests;
     var showCompareModal = deps.showCompareModal;
    var showMatchModal = deps.showMatchModal;
    var batchSelectMode = deps.batchSelectMode;
    var clearBatchSlots = deps.clearBatchSlots;
    var buildLineBatchInviteText = deps.buildLineBatchInviteText;
    var DAC = deps.DAC || function () { return window.DomainActivityCover; };
    var isSubmitting = deps.isSubmitting;

    if (deps.paperMode && deps.paperMode.value && isMutualCover.value && !(isAdmin && isAdmin.value)) {
      if (typeof deps.openPaperPrintDraft === 'function') {
        deps.openPaperPrintDraft();
      } else {
        showToast('目前為紙本模式，請從模擬視窗列印紙本單', 'info');
      }
      return;
    }
    if (isSubmitting && isSubmitting.value) {
      showToast('申請送出中，請稍候…', 'info');
      return;
    }
    if (batchSlots.value.length < 2) {
      showToast('批次至少 2 節', 'info');
      return;
    }
     var isPerSlot = !!(pendingRequestData.value.isPerSlot || batchAssignMode.value === 'perSlot');
     var reason = pendingRequestData.value.reason || batchReason.value;
     var courseAdjustmentOnly = !!pendingRequestData.value.courseAdjustmentOnly
       || String(reason || '').trim() === '課務調整';
    var note = pendingRequestData.value.note || batchNote.value || '';
    if (!reason) {
      showToast('請選擇請假事由', 'info');
      return;
    }
    if (isSubmitting) isSubmitting.value = true;
    loading.value = true;
    loadingMessage.value = '正在檢查批次內容…';
    function unlockSubmit() {
      loading.value = false;
      if (isSubmitting) isSubmitting.value = false;
    }

    var workSlots = batchSlots.value.map(function (s) {
      if (isPerSlot) return s;
      var subEmail = pendingRequestData.value.subTeacher || batchSubTeacher.value || s.subTeacherEmail;
      return Object.assign({}, s, {
        subTeacherEmail: subEmail,
        subTeacherName: getTeacherNameByEmail(subEmail)
      });
    });
    if (workSlots.some(function (s) { return !s.subTeacherEmail; })) {
      showToast(isPerSlot ? '尚有節次未指定代課老師' : '請先從媒合名單選擇代課教師', 'info');
      unlockSubmit();
      return;
    }
    if (isMutualCover.value && DAC() && DAC().isActivitySlotInRange) {
      var currentActivityRange = typeof activityBalanceCtx === 'function' ? activityBalanceCtx() : {};
      var outOfRangeSlots = workSlots.filter(function (slot) {
        return !DAC().isActivitySlotInRange(slot.dateStr, slot.period, currentActivityRange);
      });
      if (outOfRangeSlots.length) {
        showToast('有 ' + outOfRangeSlots.length + ' 節不在目前活動日期／節次範圍內，請移除或調整範圍', 'warning');
        unlockSubmit();
        return;
      }
    }

    var conflicts = [];
    workSlots.forEach(function (s) {
      var cell = getScheduleForDate(s.subTeacherEmail, s.dateStr, s.period, s.dayOfWeek);
      var activityRange = isMutualCover.value && typeof activityBalanceCtx === 'function'
        ? activityBalanceCtx() : {};
      var isConflict = DAC()
        ? DAC().isConflictCell(cell, !!isMutualCover.value, mutualAwayClasses.value,
          Object.assign({}, activityRange, { dateStr: s.dateStr, period: s.period }))
        : !!(cell && !cell.isSubstituted);
      if (isConflict) {
        conflicts.push(getTeacherNameByEmail(s.subTeacherEmail) + ' ' + s.dateStr + ' 第' + s.period + '節');
      }
    });
    if (conflicts.length) {
      var proxyForce = false;
      if (deps.isProxySubmitActive) {
        proxyForce = typeof deps.isProxySubmitActive === 'function'
          ? !!deps.isProxySubmitActive()
          : !!deps.isProxySubmitActive.value;
      }
      if (isAdmin.value || proxyForce) {
        var ok = await showConfirm('以下代課衝堂：\n' + conflicts.join('\n') + '\n\n可強制送出，確定？', '衝堂警告');
        if (!ok) { unlockSubmit(); return; }
      } else {
        showToast('代課教師衝堂：' + conflicts.join('、'), 'warning');
        unlockSubmit();
        return;
      }
    }

    var fee = isMutualCover.value
      ? (isQuotaDeductFee(pendingRequestData.value.subFee) ? QUOTA_DEDUCT_FEE : ACTIVITY_PUBLIC_FEE)
      : (pendingRequestData.value.subFee || batchSubFee.value
        || defaultSubFeeForReason(reason)
        || '自費代課');
    if ((workSlots || []).length && workSlots.every(function (s) { return parseInt(s.period, 10) === 8; })) {
      fee = PERIOD8_FEE;
    }
    if (fee === QUOTA_DEDUCT_FEE || pendingRequestData.value.subFee === QUOTA_DEDUCT_FEE) {
      if (!assertQuotaDeductAllowed()) { unlockSubmit(); return; }
      // 活動互代可能已自動改活動公費
      if (isMutualCover.value && pendingRequestData.value.subFee === ACTIVITY_PUBLIC_FEE) {
        fee = ACTIVITY_PUBLIC_FEE;
      }
    }

    loadingMessage.value = '正在批次送出 ' + workSlots.length + ' 筆申請...';
    try {
       var batchId = String(pendingRequestData.value.submitBatchId || '').trim();
       if (!batchId) {
         batchId = 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
         pendingRequestData.value.submitBatchId = batchId;
       }
       var leaveEmail = workSlots[0].teacherEmail;
       var leaveName = getTeacherNameByEmail(leaveEmail);
       var serialRoot = String(pendingRequestData.value.submitSerial || '').trim();
       if (!serialRoot) {
         serialRoot = 'SUB' + (1000 + Math.floor(Math.random() * 9000));
         pendingRequestData.value.submitSerial = serialRoot;
       }
      var feeAssigns = null;
      // 活動互代：逐節依剩餘額度決定扣額度／活動公費（不足自動公費）
      if (isMutualCover.value && DAC() && DAC().assignFeesForBatchSlots) {
        feeAssigns = DAC().assignFeesForBatchSlots(workSlots, activityBalanceCtx());
      }
      function feeForSlot(s, i) {
        if (parseInt(s.period, 10) === 8) return PERIOD8_FEE;
       if (feeAssigns && feeAssigns[i]) return feeAssigns[i].fee;
       if (!DAC()) return isMutualCover.value ? ACTIVITY_PUBLIC_FEE : fee;
       var activityRange = typeof activityBalanceCtx === 'function' ? activityBalanceCtx() : {};
       return DAC().feeForSubSlot({
           ...activityRange,
           activityMode: !!isMutualCover.value,
           fallbackFee: fee,
           period: s.period,
           dateStr: s.dateStr,
           subTeacherCell: getScheduleForDate(s.subTeacherEmail, s.dateStr, s.period, s.dayOfWeek),
           awayClasses: mutualAwayClasses.value
         });
      }
      var leaveEmBatch = String(leaveEmail || '').toLowerCase();
      var proxyActive = false;
      if (deps.shouldProxySubmitForLeave) {
        proxyActive = !!deps.shouldProxySubmitForLeave(leaveEmBatch);
      } else if (deps.isProxySubmitActive) {
        proxyActive = typeof deps.isProxySubmitActive === 'function'
          ? !!deps.isProxySubmitActive()
          : !!deps.isProxySubmitActive.value;
      }
      var proxyByEmail = '';
      var proxyByName = '';
      if (proxyActive && deps.getProxyActor) {
        var actor = deps.getProxyActor() || {};
        proxyByEmail = String(actor.email || '').trim().toLowerCase();
        proxyByName = String(actor.name || '').trim();
      }
      if (proxyActive && !proxyByName && proxyByEmail) {
        proxyByName = getTeacherNameByEmail(proxyByEmail) || proxyByEmail;
      }
      // 批次對象若是自己 → 不當代申請
       if (proxyActive && proxyByName && leaveEmBatch === String(proxyByName).toLowerCase()) {
        proxyActive = false;
        proxyByEmail = '';
        proxyByName = '';
      }
      var paperFlowActive = !!(paperFlow && paperFlow.value && !proxyActive && !isMutualCover.value);
      var doDirectApprove = !!(isAdmin.value && directApproveMode.value && !proxyActive && !paperFlowActive);
      var leaveTimeDefaults = typeof getLeaveTimeDefaults === 'function'
        ? getLeaveTimeDefaults(leaveEmail)
        : { type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' };
       var leaveTimeType = courseAdjustmentOnly ? '' : (pendingRequestData.value.leaveTimeType || leaveTimeDefaults.type);
       var leaveTimeStart = courseAdjustmentOnly ? '' : (pendingRequestData.value.leaveTimeStart || leaveTimeDefaults.start);
       var leaveTimeEnd = courseAdjustmentOnly ? '' : (pendingRequestData.value.leaveTimeEnd || leaveTimeDefaults.end);
       var leaveTime = courseAdjustmentOnly ? '' : (pendingRequestData.value.leaveTime || (leaveTimeStart + '~' + leaveTimeEnd));
      var batchStatus = paperFlowActive
        ? 'pending_admin'
        : (doDirectApprove ? 'approved' : (proxyActive ? 'pending_admin' : 'pending_teacher'));
      var rows = workSlots.map(function (s, i) {
        var base = String(note || '').trim();
         var noteOut = base;
         if (proxyActive) {
          var tag = '[行政代申請：' + (proxyByName || proxyByEmail) + ' 代 ' + leaveName + ']';
          noteOut = base ? (tag + ' ' + base) : tag;
        }
        var row = {
          "學期代號": currentSemester.value,
           "申請單ID": 'req_' + batchId + '-' + i,
           "單號": serialRoot + '-' + (i + 1),
           "批次ID": batchId,
           "異動類型": 'substitution',
           "申請人Email": leaveEmail,
           "受邀人Email": s.subTeacherEmail,
            "申請人姓名": leaveName,
           "受邀人姓名": s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail),
          "異動日期": s.dateStr,
          "異動節次": s.period,
          "異動星期": s.dayOfWeek,
          "班級": s.className,
          "科目": s.subject,
          "請假事由": reason,
          "請假時間類型": leaveTimeType,
           "請假時間": leaveTime,
          "經費來源": feeForSlot(s, i),
           "備註": noteOut,
            "狀態": batchStatus,
            "直接核准": doDirectApprove ? '是' : '',
            "紙本流程": paperFlowActive ? 'TRUE' : 'FALSE',
           "是否已印": false,
           "建立時間": '',
           directApprove: doDirectApprove,
           isProxySubmit: !!proxyActive,
            paperFlow: paperFlowActive,
            courseAdjustmentOnly: courseAdjustmentOnly,
            "僅課務調整": courseAdjustmentOnly ? '是' : '',
            proxyByName: proxyByName || ''
         };
         if (proxyActive && proxyByEmail) {
           row["代申請人姓名"] = proxyByName || '';
        }
        return row;
      });

      // 行政代申請：不寄受邀邀請信；教學組核准時再通知
      var skipNotify = !!(
        (isMutualCover.value && mutualSkipNotify.value)
         || (doDirectApprove && directApproveSkipNotify.value)
         || proxyActive
         || paperFlowActive
         || (deps.notificationsSuppressed && deps.notificationsSuppressed.value && isAdmin.value)
      );
      await callGasApi('submitRequestBatch', {
        batchId: batchId,
         directApprove: doDirectApprove,
         proxySubmit: !!proxyActive,
         paperFlow: paperFlowActive,
         skipNotify: skipNotify,
        requests: rows
      });

       var frontRows = rows.map(function (r) { return sheetRequestToFront(r); });
       frontRows.forEach(function (r) {
         optimisticUpsertRequest(r);
       });
       if (successActionRequests) successActionRequests.value = frontRows;
      if (rows.some(function (r) { return isQuotaDeductFee(r['經費來源'] || r.subFee); })) {
        await deductMutualQuotaForRows(rows);
      }
      softRefreshInBackground({ delay: 2000 });

      if (paperFlowActive) {
        showCompareModal.value = false;
        showMatchModal.value = false;
        hasLineTemplate.value = false;
        lineCopyText.value = '';
        lineBatchParts.value = [];
        if (showSuccessModal) showSuccessModal.value = false;
        if (typeof deps.openPaperPrintDraft === 'function') {
          deps.openPaperPrintDraft(rows);
        }
        batchSelectMode.value = false;
        clearBatchSlots();
        showToast('批次申請已送出，請列印紙本通知並交由調代課教師簽名，再送教學組線上核准。', 'success', 6000);
        return;
      }

      var n = rows.length;
      var groups = {};
      rows.forEach(function (r) {
         var em = String(r["受邀人姓名"] || '').toLowerCase();
        if (!groups[em]) groups[em] = { name: r["受邀人姓名"], rows: [] };
        groups[em].rows.push(r);
      });
      var groupList = Object.keys(groups).map(function (k) { return groups[k]; });
      var subSummary = groupList.map(function (g) {
        return g.name + '（' + g.rows.length + '節）';
      }).join('、');

      var feeKinds = {};
      rows.forEach(function (r) {
        var f = r['經費來源'] || fee;
        feeKinds[f] = (feeKinds[f] || 0) + 1;
      });
      var feeTip = Object.keys(feeKinds).map(function (f) {
        return f + ' ' + feeKinds[f] + '節';
      }).join('、');
      var mutualTip = isMutualCover.value ? '（活動互代：' + feeTip + '）' : '';
      var notifyTip = skipNotify ? ' 尚未寄信，請用下方 LINE 範本手動通知。' : '';
      if (doDirectApprove) {
        successModalTitle.value = '🎉 批次已直接核准';
      } else if (proxyActive) {
        successModalTitle.value = '🎉 批次已送交教學組';
      } else {
        successModalTitle.value = '🎉 批次申請已送出';
      }
      var proxyTip = proxyActive ? '（行政代申請，已跳過受邀確認）' : '';
      successModalMessage.value = groupList.length === 1
        ? '共 ' + n + ' 節已送出' + proxyTip + mutualTip + '，代課：' + groupList[0].name + ' 老師。' + notifyTip
        : '共 ' + n + ' 節已送出' + proxyTip + mutualTip + '，由 ' + groupList.length + ' 位老師分代：' + subSummary + '。' + notifyTip;
      if (deps.successFlowMode) {
        deps.successFlowMode.value = doDirectApprove ? 'direct' : (proxyActive ? 'proxy' : 'normal');
      }
      hasLineTemplate.value = skipNotify || (!doDirectApprove && !proxyActive);
      if (hasLineTemplate.value) {
        var currentUrl = window.location.origin + window.location.pathname;
        lineBatchParts.value = groupList.map(function (g) {
          return {
            name: g.name,
            count: g.rows.length,
            text: buildLineBatchInviteText({
              targetName: g.name,
               requesterName: proxyActive ? leaveName : '',
              reason: reason,
              subFee: fee,
              systemUrl: currentUrl,
              batchId: batchId,
              paperFlow: !!(paperFlow && paperFlow.value),
              slots: g.rows.map(function (r) {
                return {
                  id: r["申請單ID"],
                  date: r["異動日期"],
                  day: r["異動星期"],
                  period: r["異動節次"],
                  className: r["班級"],
                   subject: r["科目"],
                   teacherName: r["申請人姓名"]
                };
              })
            })
          };
        });
        lineCopyText.value = lineBatchParts.value.length === 1
          ? lineBatchParts.value[0].text
          : lineBatchParts.value.map(function (p) { return p.text; }).join('\n\n==========\n\n');
      } else {
        lineCopyText.value = '';
        lineBatchParts.value = [];
      }
      showSuccessModal.value = true;
      showCompareModal.value = false;
      showMatchModal.value = false;
      batchSelectMode.value = false;
      clearBatchSlots();
    } catch (err) {
      console.error('批次送出失敗', err);
      showToast('批次送出失敗：' + (err && err.message ? err.message : String(err)), 'error');
    } finally {
      unlockSubmit();
    }
  }

  return { executeBatchSubmit: executeBatchSubmit };
})();

/**
 * 批次選節／指派／媒合 UI（殼瘦身 C）
 * 送出：UiBatchSubmit.executeBatchSubmit
 * 晚定義 deps 請用 function 包裝後傳入 create
 */
window.UiBatchPanel = (function () {
  function create(deps) {
    var computed = deps.computed;
    var showToast = deps.showToast;
    var showConfirm = deps.showConfirm;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var getLeaveTimeDefaults = deps.getLeaveTimeDefaults;
    var getScheduleForDate = deps.getScheduleForDate;
    var formatDateMMDD = deps.formatDateMMDD;
    var isAdmin = deps.isAdmin;
    var isMutualCover = deps.isMutualCover;
    var DAC = deps.DAC || function () { return window.DomainActivityCover; };
    var mutualAwayClasses = deps.mutualAwayClasses;
    var batchSlots = deps.batchSlots;
    var batchSelectMode = deps.batchSelectMode;
    var batchFlowMode = deps.batchFlowMode;
    var validateBatchExchangeSlot = deps.validateBatchExchangeSlot;
    var batchAssignMode = deps.batchAssignMode;
    var batchActiveSlotKey = deps.batchActiveSlotKey;
    var exchangeWeekOffset = deps.exchangeWeekOffset;
    var exchangeWeekdayFilter = deps.exchangeWeekdayFilter;
    var batchSubTeacher = deps.batchSubTeacher;
    var batchReason = deps.batchReason;
    var batchSubFee = deps.batchSubFee;
    var batchNote = deps.batchNote;
    var batchCompareViewEmail = deps.batchCompareViewEmail;
    var showBatchConfirmModal = deps.showBatchConfirmModal;
    var showMatchModal = deps.showMatchModal;
    var showCompareModal = deps.showCompareModal;
    var activeCell = deps.activeCell;
    var inputRequestDate = deps.inputRequestDate;
    var matchMode = deps.matchMode;
    var matchPreview = deps.matchPreview;
    var pendingRequestData = deps.pendingRequestData;
    var recommendedTeachers = deps.recommendedTeachers;
    var recommendationLoading = deps.recommendationLoading;
    var matchSearchQuery = deps.matchSearchQuery;
    var matchDisplayCount = deps.matchDisplayCount;
    var matchShowNoTeacherWarning = deps.matchShowNoTeacherWarning;
    var matchEmptyReasons = deps.matchEmptyReasons;
    var consecAlertsA = deps.consecAlertsA;
    var consecAlertsB = deps.consecAlertsB;
    var directApproveMode = deps.directApproveMode;
    var teachersList = deps.teachersList;
    var getTeacherSubjectByEmail = deps.getTeacherSubjectByEmail;
    var activityBalanceCtx = deps.activityBalanceCtx;
    var QUOTA_DEDUCT_FEE = deps.QUOTA_DEDUCT_FEE;
    var ACTIVITY_PUBLIC_FEE = deps.ACTIVITY_PUBLIC_FEE;
    var PERIOD8_FEE = deps.PERIOD8_FEE;
    var getTimetableApi = deps.getTimetableApi;
    var isSlotConflict = deps.isSlotConflict;
    var mutualSkipNotify = deps.mutualSkipNotify;
    var isQuotaDeductFee = deps.isQuotaDeductFee;
    var defaultSubFeeForReason = deps.defaultSubFeeForReason;
    var assertQuotaDeductAllowed = deps.assertQuotaDeductAllowed;
    var loading = deps.loading;
    var loadingMessage = deps.loadingMessage;
    var currentSemester = deps.currentSemester;
    var directApproveSkipNotify = deps.directApproveSkipNotify;
    var callGasApi = deps.callGasApi;
    var optimisticUpsertRequest = deps.optimisticUpsertRequest;
    var sheetRequestToFront = deps.sheetRequestToFront;
    var deductMutualQuotaForRows = deps.deductMutualQuotaForRows;
    var softRefreshInBackground = deps.softRefreshInBackground;
    var successModalTitle = deps.successModalTitle;
    var successModalMessage = deps.successModalMessage;
    var hasLineTemplate = deps.hasLineTemplate;
    var lineBatchParts = deps.lineBatchParts;
    var lineCopyText = deps.lineCopyText;
    var showSuccessModal = deps.showSuccessModal;
    var successActionRequests = deps.successActionRequests;
    var buildLineBatchInviteText = deps.buildLineBatchInviteText;

    function batchSlotKey(email, dateStr, period) {
      return `${String(email || '').toLowerCase()}|${dateStr}|${period}`;
        }

    function isBatchSlotSelected(email, dateStr, period) {
      return batchSlots.value.some(s => s.key === batchSlotKey(email, dateStr, period));
        }

    /** 批次選節：DOM 高亮（不經 getClassCellClass 全表重算） */
    function paintBatchSlotCell(email, dateStr, period, on) {
      var em = String(email || '').toLowerCase();
      var d = String(dateStr || '').slice(0, 10);
      var p = parseInt(period, 10);
      if (!em || !d || isNaN(p)) return;
      try {
        var nodes = document.querySelectorAll(
          '.grid-cell-class[data-tt-email="' + em + '"][data-tt-date="' + d + '"][data-tt-period="' + p + '"]'
        );
        for (var i = 0; i < nodes.length; i++) {
          if (on) nodes[i].classList.add('is-batch-selected');
          else nodes[i].classList.remove('is-batch-selected');
        }
      } catch (e) { /* ignore */ }
    }
    function clearBatchSlotDom() {
      try {
        document.querySelectorAll('.grid-cell-class.is-batch-selected')
          .forEach(function (el) { el.classList.remove('is-batch-selected'); });
      } catch (e) { /* ignore */ }
    }
    function repaintAllBatchSlotDom() {
      clearBatchSlotDom();
      (batchSlots.value || []).forEach(function (s) {
        if (s) paintBatchSlotCell(s.teacherEmail, s.dateStr, s.period, true);
      });
    }

    function clearBatchSlots() {
      batchSlots.value = [];
      batchSubTeacher.value = '';
      batchReason.value = '';
      batchSubFee.value = '自費代課';
      batchNote.value = '';
      batchActiveSlotKey.value = '';
      showBatchConfirmModal.value = false;
      clearBatchSlotDom();
    };

    function setBatchFlowMode(mode) {
      var nextMode = mode === 'exchange' ? 'exchange' : 'substitution';
      if (batchFlowMode.value === nextMode) {
        if (nextMode === 'exchange') batchAssignMode.value = 'perSlot';
        return;
      }
      if (nextMode === 'exchange' && isMutualCover.value) {
        showToast('活動互代批次不支援調課，請先關閉活動互代模式', 'warning');
        return;
      }
      clearBatchSlots();
      batchFlowMode.value = nextMode;
      batchAssignMode.value = nextMode === 'exchange' ? 'perSlot' : 'same';
      matchMode.value = nextMode;
      if (exchangeWeekOffset) exchangeWeekOffset.value = 0;
      if (exchangeWeekdayFilter) exchangeWeekdayFilter.value = 0;
      showToast(nextMode === 'exchange'
        ? '批次調課：先選調出課堂，再逐組指定對調教師與對方課堂'
        : '批次代課：先選同一位教師的多節課', 'info');
    }

    var isBatchMatchFlow = computed(() =>
      batchSelectMode.value && batchSlots.value.length >= 2
    );

    var isBatchExchangeFlow = computed(() =>
      isBatchMatchFlow.value && batchFlowMode && batchFlowMode.value === 'exchange'
    );

    var isBatchPerSlotMode = computed(() =>
      isBatchMatchFlow.value && batchAssignMode.value === 'perSlot'
    );

    var batchAssignedCount = computed(() => batchSlots.value.filter(s =>
      batchFlowMode && batchFlowMode.value === 'exchange'
        ? (s.subTeacherEmail && s.targetDate && s.targetPeriod != null)
        : s.subTeacherEmail
    ).length);

    var batchAllSlotsAssigned = computed(() =>
      batchSlots.value.length >= 2 && batchSlots.value.every(s =>
        batchFlowMode && batchFlowMode.value === 'exchange'
          ? (s.subTeacherEmail && s.targetDate && s.targetPeriod != null)
          : !!s.subTeacherEmail
      )
    );

    var batchActiveSlot = computed(() =>
      batchSlots.value.find(s => s.key === batchActiveSlotKey.value) || null
    );

    /** 每節不同人：依受邀人分組（送出後 LINE／信匣用） */
    function groupBatchSlotsBySub(slots) {
      const map = {};
      (slots || []).forEach(s => {
        const email = String(s.subTeacherEmail || s.subEmail || '').toLowerCase();
        if (!email) return;
        if (!map[email]) {
          map[email] = {
            subEmail: s.subTeacherEmail || s.subEmail,
            subName: s.subTeacherName || getTeacherNameByEmail(s.subTeacherEmail || s.subEmail),
            slots: []
          };
        }
        map[email].slots.push(s);
      });
      return Object.values(map);
    };

    function setBatchAssignMode(mode) {
      if (batchFlowMode && batchFlowMode.value === 'exchange') mode = 'perSlot';
      if (batchSlots.value.some(s => s.exchangeSubmissionUnknown)) {
        showToast('有調課組送出結果不明，請先重新整理確認歷程', 'warning');
        return;
      }
      batchAssignMode.value = mode === 'perSlot' ? 'perSlot' : 'same';
      batchActiveSlotKey.value = '';
      // 切換模式時清空已指定代課人，避免混用
      batchSlots.value = batchSlots.value.map(s => {
        if (s.exchangeSubmitted) return s;
        const renewExchangeIdentity = !!(s.exchangeSubmitError && !s.exchangeSubmissionUnknown);
        return Object.assign({}, s, {
          subTeacherEmail: '',
          subTeacherName: '',
          targetDate: '',
          targetDayOfWeek: null,
          targetPeriod: null,
          targetClassName: '',
          targetSubject: '',
          exchangeWeekOffset: 0,
          exchangeRequestId: renewExchangeIdentity
            ? 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7)
            : s.exchangeRequestId,
          exchangeSerial: renewExchangeIdentity
            ? 'SWP' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)
            : s.exchangeSerial,
          exchangeValidationError: '',
          exchangeSubmitError: ''
        });
      });
      batchSubTeacher.value = '';
      if (showMatchModal.value && isBatchMatchFlow.value) {
        if (batchFlowMode && batchFlowMode.value === 'exchange') {
          const nextExchangeSlot = batchSlots.value.find(s => !s.exchangeSubmitted) || batchSlots.value[0];
          if (nextExchangeSlot) selectBatchSlotForMatch(nextExchangeSlot.key);
        } else if (batchAssignMode.value === 'same') {
          fetchBatchRecommendations();
        } else {
          recommendedTeachers.value = [];
          matchShowNoTeacherWarning.value = false;
          if (matchEmptyReasons) matchEmptyReasons.value = null;
        }
      }
    };

    function toggleBatchSelectMode() {
      batchSelectMode.value = !batchSelectMode.value;
      if (!batchSelectMode.value) {
        clearBatchSlots();
        batchFlowMode.value = 'substitution';
        matchMode.value = 'substitution';
        showMatchModal.value = false;
        showCompareModal.value = false;
      } else {
        showMatchModal.value = false;
        showCompareModal.value = false;
        showToast(batchFlowMode.value === 'exchange'
          ? '批次調課模式：點選調出課堂，再選對調教師與對方課堂'
          : '批次代課模式：點選同教師多節課，再選「同一人全代」或「每節不同人」', 'info');
      }
    };

    function toggleBatchSlot(slot) {
      const key = slot.key || batchSlotKey(slot.teacherEmail, slot.dateStr, slot.period);
      const idx = batchSlots.value.findIndex(s => s.key === key);
      if (idx >= 0) {
        if (batchSlots.value[idx].exchangeSubmitted || batchSlots.value[idx].exchangeSubmissionUnknown) {
          showToast(batchSlots.value[idx].exchangeSubmitted
            ? '此組調課已送出，不能從批次中移除'
            : '此組送出結果不明，請重新整理確認歷程後再處理', 'info');
          return;
        }
        batchSlots.value = batchSlots.value.filter((_, i) => i !== idx);
        if (batchActiveSlotKey.value === key) batchActiveSlotKey.value = '';
        paintBatchSlotCell(slot.teacherEmail, slot.dateStr, slot.period, false);
        return;
      }
      if (batchSlots.value.length >= 20) {
        showToast('單次批次最多 20 節', 'warning');
        return;
      }
      if ((!batchFlowMode || batchFlowMode.value !== 'exchange')
          && batchSlots.value.length
          && String(batchSlots.value[0].teacherEmail).toLowerCase() !== String(slot.teacherEmail).toLowerCase()) {
        showToast('批次僅能選同一位請假教師的課堂', 'warning');
        return;
      }
      var batchId = batchSlots.value[0] && batchSlots.value[0].batchId
        ? batchSlots.value[0].batchId
        : (batchFlowMode && batchFlowMode.value === 'exchange'
          ? 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
          : '');
      batchSlots.value = batchSlots.value.concat([{
        key,
        batchId: batchId,
        teacherEmail: slot.teacherEmail,
        teacherName: slot.teacherName || getTeacherNameByEmail(slot.teacherEmail),
        dateStr: slot.dateStr,
        dayOfWeek: parseInt(slot.dayOfWeek, 10),
        period: parseInt(slot.period, 10),
        className: slot.className || '',
        subject: slot.subject || '',
        restriction: slot.restriction || '',
        attr: slot.attr || '',
        isPullOut: !!slot.isPullOut,
        subTeacherEmail: '',
        subTeacherName: '',
        targetDate: '',
        targetDayOfWeek: null,
        targetPeriod: null,
        targetClassName: '',
        targetSubject: '',
        exchangeWeekOffset: 0,
        exchangeRequestId: batchFlowMode && batchFlowMode.value === 'exchange'
          ? 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7)
          : '',
        exchangeSerial: batchFlowMode && batchFlowMode.value === 'exchange'
          ? 'SWP' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)
          : '',
        exchangeValidationError: '',
        exchangeSubmitError: '',
        exchangeSubmissionUnknown: false,
        exchangeSubmitted: false
      }]).sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
        return a.period - b.period;
      });
      // DOM 高亮（點選當幀）；Vue 若之後重寫 class，再補一次
      paintBatchSlotCell(slot.teacherEmail, slot.dateStr, slot.period, true);
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          paintBatchSlotCell(slot.teacherEmail, slot.dateStr, slot.period, true);
        });
      }
    };

    /** 單節媒合（每節不同人用）— ui-timetable */
    function fetchSingleSlotRecommendations(slot) {
      const a = getTimetableApi();
      if (!a) return;
      a.fetchSingleSlotRecommendations({
        teachersList, getTeacherSubjectByEmail, activityBalanceCtx, recommendationLoading, matchMode,
        matchSearchQuery, matchDisplayCount, matchShowNoTeacherWarning, matchEmptyReasons, recommendedTeachers,
        QUOTA_DEDUCT_FEE, ACTIVITY_PUBLIC_FEE
      }, slot);
    };

    /** 批次媒合：同一人全代 — ui-timetable */
    function fetchBatchRecommendations() {
      const a = getTimetableApi();
      if (!a) return;
      a.fetchBatchRecommendations({
        batchSlots, batchAssignMode, batchActiveSlot, batchActiveSlotKey, activeCell, inputRequestDate,
        teachersList, getTeacherSubjectByEmail, activityBalanceCtx, recommendationLoading, matchMode,
        matchSearchQuery, matchDisplayCount, matchShowNoTeacherWarning, matchEmptyReasons, recommendedTeachers,
        QUOTA_DEDUCT_FEE, ACTIVITY_PUBLIC_FEE
      });
    };

    /** 每節不同人：點某一節 → 載入該節空堂名單 */
    function selectBatchSlotForMatch(slotKey) {
      const slot = batchSlots.value.find(s => s.key === slotKey);
      if (!slot) return;
      if (slot.exchangeSubmitted || slot.exchangeSubmissionUnknown) {
        showToast(slot.exchangeSubmitted
          ? '此組調課已送出，不能再修改'
          : '此組送出結果不明，請重新整理確認歷程後再處理', 'info');
        return;
      }
      batchActiveSlotKey.value = slotKey;
      matchMode.value = batchFlowMode && batchFlowMode.value === 'exchange' ? 'exchange' : 'substitution';
      activeCell.value = {
        teacherEmail: slot.teacherEmail,
        teacherName: slot.teacherName,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        classData: {
          className: slot.className,
          subject: slot.subject,
          restriction: slot.restriction || '',
          attr: slot.attr || '',
          isPullOut: !!slot.isPullOut
        }
      };
      inputRequestDate.value = slot.dateStr;
      matchPreview.value = null;
      if (batchFlowMode && batchFlowMode.value === 'exchange') {
        // 每組來源課堂的可對調星期不同；切換組別時清除上一組篩選，避免候選被舊條件藏起來。
        if (exchangeWeekdayFilter) exchangeWeekdayFilter.value = 0;
        if (matchSearchQuery) matchSearchQuery.value = '';
        if (matchDisplayCount) matchDisplayCount.value = 10;
        recommendedTeachers.value = [];
        matchShowNoTeacherWarning.value = false;
        if (matchEmptyReasons) matchEmptyReasons.value = null;
      } else {
        fetchSingleSlotRecommendations(slot);
      }
    };

    /** 選完節次 → 開智慧媒合抽屜 */
    function openBatchMatch() {
      if (batchSlots.value.length < 2) {
        showToast('請至少選 2 節再媒合（單節請直接點格子）', 'info');
        return;
      }
      const first = batchFlowMode && batchFlowMode.value === 'exchange'
        ? (batchSlots.value.find(s => !s.exchangeSubmitted) || batchSlots.value[0])
        : batchSlots.value[0];
      activeCell.value = {
        teacherEmail: first.teacherEmail,
        teacherName: first.teacherName,
        dayOfWeek: first.dayOfWeek,
        period: first.period,
        classData: {
          className: first.className,
          subject: first.subject,
          restriction: first.restriction || '',
          attr: first.attr || '',
          isPullOut: !!first.isPullOut
        }
      };
      inputRequestDate.value = first.dateStr;
      matchMode.value = batchFlowMode && batchFlowMode.value === 'exchange' ? 'exchange' : 'substitution';
      matchPreview.value = null;
      showCompareModal.value = false;
      showBatchConfirmModal.value = false;
      if (batchAssignMode.value === 'perSlot') {
        batchActiveSlotKey.value = first.key;
      } else {
        batchActiveSlotKey.value = '';
      }
      showMatchModal.value = true;
      if (batchFlowMode && batchFlowMode.value === 'exchange') {
        selectBatchSlotForMatch(first.key);
      } else {
        fetchBatchRecommendations();
      }
    };

    /** 同一人全代：從媒合名單選人 → 申請表單 */
    async function prepBatchCompare(targetEmail) {
      if (batchSlots.value.length < 2 || !targetEmail) return;
      if (batchAssignMode.value === 'perSlot') {
        await assignBatchSlotSub(targetEmail);
        return;
      }
      const leaveEmail = batchSlots.value[0].teacherEmail;
      const first = batchSlots.value[0];
      const conflicts = batchSlots.value.filter(s => {
        const cell = getScheduleForDate(targetEmail, s.dateStr, s.period, s.dayOfWeek);
        return isSlotConflict(cell, s.dateStr, s.period);
      });
      var proxyForce2 = false;
      if (deps.isProxySubmitActive) {
        proxyForce2 = typeof deps.isProxySubmitActive === 'function'
          ? !!deps.isProxySubmitActive()
          : !!deps.isProxySubmitActive.value;
      }
      if (conflicts.length && !isAdmin.value && !proxyForce2) {
        showToast(`該教師在 ${conflicts.map(c => c.dateStr + '第' + c.period + '節').join('、')} 有課`, 'warning');
        return;
      }
      if (conflicts.length && (isAdmin.value || proxyForce2)) {
        const ok = await showConfirm(
          `該教師於以下節次已有課：\n${conflicts.map(c => c.dateStr + ' 第' + c.period + '節').join('\n')}\n\n可強制安排，確定？`,
          '衝堂警告'
        );
        if (!ok) return;
      }
      // 巡堂節：可排但提醒
      const patrolSlots = batchSlots.value.filter(s => {
        const cell = getScheduleForDate(targetEmail, s.dateStr, s.period, s.dayOfWeek);
        return window.DomainSchedule && window.DomainSchedule.isPatrolCell
          && window.DomainSchedule.isPatrolCell(cell);
      });
      if (patrolSlots.length) {
        const tip = (window.DomainSchedule && window.DomainSchedule.PATROL_INCOMING_TIP)
          || '對方本節為【巡堂】。排入後請私下協調代巡堂或互換。';
        const okP = await showConfirm(
          tip + '\n\n涉及：' + patrolSlots.map(c => c.dateStr + '第' + c.period + '節').join('、') + '\n\n仍要繼續？',
          '巡堂提醒'
        );
        if (!okP) return;
      }

      batchSubTeacher.value = targetEmail;
      batchCompareViewEmail.value = targetEmail;
      batchSlots.value = batchSlots.value.map(s => ({
        ...s,
        subTeacherEmail: targetEmail,
        subTeacherName: getTeacherNameByEmail(targetEmail)
      }));
      consecAlertsA.value = [];
      consecAlertsB.value = [];
      const byDate = {};
      batchSlots.value.forEach(s => {
        if (!byDate[s.dateStr]) byDate[s.dateStr] = [];
        byDate[s.dateStr].push(s.period);
      });
      Object.keys(byDate).forEach(dateStr => {
        const periods = byDate[dateStr];
        let busy = 0;
        for (let p = 1; p <= 8; p++) {
          const cell = getScheduleForDate(targetEmail, dateStr, p, new Date(dateStr.replace(/-/g, '/')).getDay());
          const willAdd = periods.indexOf(p) >= 0;
          const isPatrol = window.DomainSchedule && window.DomainSchedule.isPatrolCell
            && window.DomainSchedule.isPatrolCell(cell);
          if ((cell && !cell.isSubstituted && !isPatrol) || willAdd) busy++;
        }
        if (busy >= 5) {
          consecAlertsB.value.push(`${formatDateMMDD(dateStr)} 當日將達 ${busy} 節（含代課）`);
        }
      });

      var leaveTimeDefaults = typeof getLeaveTimeDefaults === 'function'
        ? getLeaveTimeDefaults(leaveEmail)
        : { type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' };
      pendingRequestData.value = {
        mode: 'substitution',
        leaveTeacher: leaveEmail,
        subTeacher: targetEmail,
        date: first.dateStr,
        timeKey: (window.DateUtils && window.DateUtils.encodeTimeKey)
          ? window.DateUtils.encodeTimeKey(first.dayOfWeek, first.period)
          : (`${first.dayOfWeek}-${first.period}`),
        cls: first.className,
        subject: first.subject,
        dateB: '',
        timeB: '',
         subB: '',
         subBClass: '',
         reason: isMutualCover.value ? '公假' : '',
         courseAdjustmentOnly: false,
         leaveReasonBeforeCourseAdjustment: '',
         subFee: (function () {
          const allP8 = (batchSlots.value || []).length && batchSlots.value.every(s => parseInt(s.period, 10) === 8);
          if (allP8) return PERIOD8_FEE;
          if (isMutualCover.value) {
            return (((recommendedTeachers.value || []).find(t => t.email && String(t.email).toLowerCase() === String(targetEmail).toLowerCase()) || {}).suggestedFee
              || ACTIVITY_PUBLIC_FEE);
          }
          return '自費代課';
        })(),
        note: '',
        leaveTimeType: leaveTimeDefaults.type,
        leaveTimeStart: leaveTimeDefaults.start,
        leaveTimeEnd: leaveTimeDefaults.end,
        leaveTime: leaveTimeDefaults.range,
        isBatch: true,
         batchCount: batchSlots.value.length,
         isPerSlot: false,
         submitBatchId: 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
         submitSerial: 'SUB' + (1000 + Math.floor(Math.random() * 9000))
       };
      if (isMutualCover.value) directApproveMode.value = true;
      showMatchModal.value = false;
      showBatchConfirmModal.value = false;
      showCompareModal.value = true;
    };

    /** 每節不同人：為目前 active 節次指定代課老師 */
    async function assignBatchSlotSub(targetEmail) {
      if (!targetEmail || !batchActiveSlotKey.value) {
        showToast('請先點選要安排的節次', 'info');
        return;
      }
      const slot = batchSlots.value.find(s => s.key === batchActiveSlotKey.value);
      if (!slot) return;
      const cell = getScheduleForDate(targetEmail, slot.dateStr, slot.period, slot.dayOfWeek);
      if (window.DomainSchedule && window.DomainSchedule.isPatrolCell
          && window.DomainSchedule.isPatrolCell(cell)) {
        const tip = (window.DomainSchedule && window.DomainSchedule.PATROL_INCOMING_TIP)
          || '對方本節為【巡堂】。排入後請私下協調代巡堂或互換。';
        const okP = await showConfirm(tip + '\n\n仍要指定？', '巡堂提醒');
        if (!okP) return;
      }
      if (isSlotConflict(cell, slot.dateStr, slot.period)) {
        if (isAdmin.value) {
          const ok = await showConfirm(
            `${getTeacherNameByEmail(targetEmail)} 老師在 ${slot.dateStr} 第${slot.period}節 已有課，管理員可強制安排，確定？`,
            '衝堂警告'
          );
          if (!ok) return;
        } else {
          showToast(`該教師在 ${slot.dateStr} 第${slot.period}節 有課`, 'warning');
          return;
        }
      }
      const subName = getTeacherNameByEmail(targetEmail);
      batchSlots.value = batchSlots.value.map(s =>
        s.key === slot.key
          ? { ...s, subTeacherEmail: targetEmail, subTeacherName: subName }
          : s
      );
      showToast(`已指定：${formatDateMMDD(slot.dateStr)} 第${slot.period}節 → ${subName}`, 'success');
      // 自動跳下一節未指定者
      const next = batchSlots.value.find(s => !s.subTeacherEmail);
      if (next) {
        selectBatchSlotForMatch(next.key);
      } else {
        recommendedTeachers.value = [];
        matchShowNoTeacherWarning.value = false;
        if (matchEmptyReasons) matchEmptyReasons.value = null;
        showToast('全部節次已指定代課老師，可按「確認申請」', 'info');
      }
    };

    function clearBatchSlotSub(slotKey) {
      const current = batchSlots.value.find(s => s.key === slotKey);
      if (current && current.exchangeSubmissionUnknown) {
        showToast('此組送出結果不明，請重新整理確認歷程後再處理', 'warning');
        return;
      }
      const renewExchangeIdentity = !!(current && current.exchangeSubmitError && !current.exchangeSubmitted);
      batchSlots.value = batchSlots.value.map(s =>
        s.key === slotKey ? {
          ...s,
          subTeacherEmail: '',
          subTeacherName: '',
          targetDate: '',
          targetDayOfWeek: null,
          targetPeriod: null,
          targetClassName: '',
          targetSubject: '',
          exchangeWeekOffset: 0,
          exchangeRequestId: renewExchangeIdentity
            ? 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 7)
            : s.exchangeRequestId,
          exchangeSerial: renewExchangeIdentity
            ? 'SWP' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)
            : s.exchangeSerial,
          exchangeValidationError: '',
          exchangeSubmitError: '',
          exchangeSubmitted: false
        } : s
      );
      if (batchActiveSlotKey.value === slotKey) {
        if (batchFlowMode && batchFlowMode.value === 'exchange') {
          selectBatchSlotForMatch(slotKey);
        } else {
          fetchSingleSlotRecommendations(batchSlots.value.find(s => s.key === slotKey));
        }
      }
    };

    /** 每節不同人：全部指定完 → 進入申請表單 */
    function prepBatchPerSlotCompare() {
      if (!batchAllSlotsAssigned.value) {
        const miss = batchSlots.value.filter(s => !s.subTeacherEmail).length;
        showToast(`尚有 ${miss} 節未指定代課老師`, 'warning');
        return;
      }
      const leaveEmail = batchSlots.value[0].teacherEmail;
      const first = batchSlots.value[0];
      consecAlertsA.value = [];
      consecAlertsB.value = [];
      // 各代課老師連堂／過重檢測
      const bySubDate = {};
      batchSlots.value.forEach(s => {
        const k = `${String(s.subTeacherEmail).toLowerCase()}|${s.dateStr}`;
        if (!bySubDate[k]) bySubDate[k] = { email: s.subTeacherEmail, dateStr: s.dateStr, periods: [] };
        bySubDate[k].periods.push(s.period);
      });
      Object.values(bySubDate).forEach(g => {
        let busy = 0;
        const day = new Date(g.dateStr.replace(/-/g, '/')).getDay();
        for (let p = 1; p <= 8; p++) {
          const cell = getScheduleForDate(g.email, g.dateStr, p, day);
          const willAdd = g.periods.indexOf(p) >= 0;
          if ((cell && !cell.isSubstituted) || willAdd) busy++;
        }
        if (busy >= 5) {
          consecAlertsB.value.push(`${getTeacherNameByEmail(g.email)} ${formatDateMMDD(g.dateStr)} 將達 ${busy} 節`);
        }
      });

      const groups = groupBatchSlotsBySub(batchSlots.value);
      batchCompareViewEmail.value = groups.length ? groups[0].subEmail : '';
      var leaveTimeDefaults = typeof getLeaveTimeDefaults === 'function'
        ? getLeaveTimeDefaults(leaveEmail)
        : { type: '全天', start: '08:00', end: '16:00', range: '08:00~16:00' };
      pendingRequestData.value = {
        mode: 'substitution',
        leaveTeacher: leaveEmail,
        subTeacher: groups.length === 1 ? groups[0].subEmail : (groups[0] ? groups[0].subEmail : ''),
        date: first.dateStr,
        timeKey: (window.DateUtils && window.DateUtils.encodeTimeKey)
          ? window.DateUtils.encodeTimeKey(first.dayOfWeek, first.period)
          : (`${first.dayOfWeek}-${first.period}`),
        cls: first.className,
        subject: first.subject,
        dateB: '',
        timeB: '',
         subB: '',
         subBClass: '',
         reason: isMutualCover.value ? '公假' : '',
         courseAdjustmentOnly: false,
         leaveReasonBeforeCourseAdjustment: '',
         subFee: isMutualCover.value ? ACTIVITY_PUBLIC_FEE : '自費代課',
        note: '',
        leaveTimeType: leaveTimeDefaults.type,
        leaveTimeStart: leaveTimeDefaults.start,
        leaveTimeEnd: leaveTimeDefaults.end,
        leaveTime: leaveTimeDefaults.range,
         isBatch: true,
         batchCount: batchSlots.value.length,
         isPerSlot: true,
         subTeacherCount: groups.length,
         submitBatchId: 'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
         submitSerial: 'SUB' + (1000 + Math.floor(Math.random() * 9000))
       };
      if (isMutualCover.value) directApproveMode.value = true;
      showMatchModal.value = false;
      showBatchConfirmModal.value = false;
      showCompareModal.value = true;
    };

    function prepBatchExchangeCompare() {
      if (!(batchFlowMode && batchFlowMode.value === 'exchange')) return false;
      if (batchSlots.value.length < 2) {
        showToast('批次調課至少需要 2 組互調', 'info');
        return false;
      }
      const slots = batchSlots.value.map(slot => Object.assign({}, slot, {
        exchangeValidationError: slot.exchangeSubmitted ? '' : '',
        exchangeSubmitError: slot.exchangeSubmitted ? '' : (slot.exchangeSubmitError || '')
      }));
      const endpoints = Object.create(null);
      slots.forEach((slot, index) => {
        if (slot.exchangeSubmitted) return;
        if (!slot.subTeacherEmail || !slot.targetDate || slot.targetPeriod == null) {
          slot.exchangeValidationError = '尚未完成此組對調配對';
          return;
        }
        if (typeof validateBatchExchangeSlot === 'function') {
          const check = validateBatchExchangeSlot(slot) || {};
          if (!check.valid) slot.exchangeValidationError = check.reason || '目前課表不符合此組調課條件';
        }
        const incoming = [
          [slot.teacherEmail, slot.targetDate, slot.targetPeriod],
          [slot.subTeacherEmail, slot.dateStr, slot.period]
        ];
        incoming.forEach(parts => {
          const key = [String(parts[0] || '').toLowerCase(), parts[1], parseInt(parts[2], 10)].join('|');
          if (endpoints[key] != null) {
            const otherIndex = endpoints[key];
            const reason = '與第 ' + (otherIndex + 1) + ' 組佔用相同的調入時段';
            slot.exchangeValidationError = slot.exchangeValidationError || reason;
            slots[otherIndex].exchangeValidationError = slots[otherIndex].exchangeValidationError || reason;
          } else {
            endpoints[key] = index;
          }
        });
      });
      batchSlots.value = slots;

      const batchId = String((slots.find(slot => slot.batchId) || {}).batchId || (
        'bat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
      ));
      const withBatchId = slots.map(slot => Object.assign({}, slot, { batchId: batchId }));
      batchSlots.value = withBatchId;
      const first = withBatchId.find(slot => !slot.exchangeSubmitted) || withBatchId[0];
      const encodeTime = (day, period) => (window.DateUtils && window.DateUtils.encodeTimeKey)
        ? window.DateUtils.encodeTimeKey(day, period)
        : (String(day) + '-' + String(period));
      const validCount = withBatchId.filter(slot => !slot.exchangeSubmitted && !slot.exchangeValidationError).length;
      const invalidCount = withBatchId.filter(slot => !slot.exchangeSubmitted && !!slot.exchangeValidationError).length;
      const submittedCount = withBatchId.filter(slot => slot.exchangeSubmitted).length;
      const reason = batchReason.value || '課務調整';
      const firstTargetTime = encodeTime(first.targetDayOfWeek, first.targetPeriod);
      pendingRequestData.value = {
        mode: 'exchange',
        isBatch: true,
        isExchangeBatch: true,
        isPerSlot: batchAssignMode.value === 'perSlot',
        batchCount: withBatchId.length,
        batchValidCount: validCount,
        batchInvalidCount: invalidCount,
        batchSubmittedCount: submittedCount,
        batchSlots: withBatchId,
        leaveTeacher: first.teacherEmail,
        subTeacher: first.subTeacherEmail,
        date: first.dateStr,
        timeKey: encodeTime(first.dayOfWeek, first.period),
        cls: first.className,
        subject: first.subject,
        dateB: first.targetDate,
        timeB: firstTargetTime,
        subBClass: first.targetClassName,
        subB: first.targetSubject,
        reason: reason,
        courseAdjustmentOnly: reason === '課務調整',
        note: batchNote.value || '',
        submitBatchId: batchId,
        submitSerial: 'SWP' + (1000 + Math.floor(Math.random() * 9000))
      };
      consecAlertsA.value = [];
      consecAlertsB.value = [];
      showMatchModal.value = false;
      showBatchConfirmModal.value = false;
      showCompareModal.value = true;
      if (invalidCount) {
        showToast(validCount
          ? '總覽已開啟：' + invalidCount + ' 組需調整，其餘 ' + validCount + ' 組可個別送出'
          : '總覽已開啟：目前沒有可送出的組別，請修正標示項目', validCount ? 'warning' : 'warning');
      }
      return true;
    }

    function setBatchCompareViewEmail(email) {
      batchCompareViewEmail.value = email || '';
    };

    async function executeBatchSubmit() {
      if (!window.UiBatchSubmit) {
        showToast('批次送出模組未載入', 'error');
        return;
      }
      await window.UiBatchSubmit.executeBatchSubmit({
        batchSlots, pendingRequestData, batchFlowMode, batchAssignMode, batchReason, batchNote, batchSubTeacher, batchSubFee,
        showToast, showConfirm, getScheduleForDate, getTeacherNameByEmail, getLeaveTimeDefaults,
        isMutualCover, mutualAwayClasses, mutualSkipNotify, isAdmin, isQuotaDeductFee,
        QUOTA_DEDUCT_FEE, ACTIVITY_PUBLIC_FEE, PERIOD8_FEE, defaultSubFeeForReason, assertQuotaDeductAllowed,
        loading, loadingMessage, isSubmitting: deps.isSubmitting, currentSemester, directApproveMode, directApproveSkipNotify,
        callGasApi, optimisticUpsertRequest, sheetRequestToFront, deductMutualQuotaForRows, softRefreshInBackground,
        activityBalanceCtx, successModalTitle, successModalMessage, hasLineTemplate, lineBatchParts, lineCopyText,
        buildSubmitPayload, validateBatchExchangeSlot, buildLineInviteText: deps.buildLineInviteText,
          showSuccessModal, successActionRequests, showCompareModal, showMatchModal, batchSelectMode, clearBatchSlots, buildLineBatchInviteText, DAC,
          paperMode: deps.paperMode,
          paperFlow: deps.paperFlow,
          notificationsSuppressed: deps.notificationsSuppressed,
          openPaperPrintDraft: deps.openPaperPrintDraft,
          successFlowMode: deps.successFlowMode
       });
    };

    return {
      batchSlotKey: batchSlotKey,
      isBatchSlotSelected: isBatchSlotSelected,
      clearBatchSlots: clearBatchSlots,
      isBatchMatchFlow: isBatchMatchFlow,
      isBatchExchangeFlow: isBatchExchangeFlow,
      isBatchPerSlotMode: isBatchPerSlotMode,
      batchAssignedCount: batchAssignedCount,
      batchAllSlotsAssigned: batchAllSlotsAssigned,
      batchActiveSlot: batchActiveSlot,
      groupBatchSlotsBySub: groupBatchSlotsBySub,
      setBatchAssignMode: setBatchAssignMode,
      setBatchFlowMode: setBatchFlowMode,
      toggleBatchSelectMode: toggleBatchSelectMode,
      toggleBatchSlot: toggleBatchSlot,
      fetchSingleSlotRecommendations: fetchSingleSlotRecommendations,
      fetchBatchRecommendations: fetchBatchRecommendations,
      selectBatchSlotForMatch: selectBatchSlotForMatch,
      openBatchMatch: openBatchMatch,
      prepBatchCompare: prepBatchCompare,
      assignBatchSlotSub: assignBatchSlotSub,
      clearBatchSlotSub: clearBatchSlotSub,
      prepBatchPerSlotCompare: prepBatchPerSlotCompare,
      prepBatchExchangeCompare: prepBatchExchangeCompare,
      setBatchCompareViewEmail: setBatchCompareViewEmail,
      executeBatchSubmit: executeBatchSubmit
    };
  }

  return { create: create };
})();
