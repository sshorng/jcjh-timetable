/**
 * 自 v1 ui-mutual.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */
import DomainActivityCover from '../domain/domain-activity-cover.js';
import DomainClassAway from '../domain/domain-class-away.js';

/**
 * ui-mutual.js — 活動互代面板狀態 + 暫定一次送出（從 ui-activity.js 拆出，2B）
 * 懶載：首屏不載，互代操作時經 ensureUiMutual() 載入。
 * 對外 API 不變：UiMutualPanelState, UiMutualSubmit
 */
/**
 * 活動互代面板：localStorage 暫存、外出班／帶隊、暫定草稿 CRUD、累加額度
 * （暫定一次送出仍在 app.js）
 */
const UiMutualPanelState = (() => {
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
    var DAC = deps.DAC || function () { return DomainActivityCover; };

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

    // R17：setMutualActivityPeriodBoundary 自 app.js 搬移
    function setMutualActivityPeriodBoundary(field, value) {
      if (field !== 'start' && field !== 'end') return;
      if (field === 'start') mutualActivityStartPeriod.value = String(value || '0');
      else mutualActivityEndPeriod.value = String(value || '8');
      if (mutualActivityStart.value && mutualActivityStart.value === mutualActivityEnd.value) {
        const order = [0, 1, 2, 3, 4, 45, 5, 6, 7, 8];
        const startIndex = order.indexOf(parseInt(mutualActivityStartPeriod.value, 10));
        const endIndex = order.indexOf(parseInt(mutualActivityEndPeriod.value, 10));
        if (startIndex > endIndex) {
          if (field === 'start') mutualActivityEndPeriod.value = mutualActivityStartPeriod.value;
          else mutualActivityStartPeriod.value = mutualActivityEndPeriod.value;
        }
      }
      persistMutualPanelDraft();
    }

    function normalizeMutualPeriods(periods) {
      var dca = DomainClassAway;
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
           ? (DomainClassAway && DomainClassAway.periodLabel
             ? '每日' + DomainClassAway.periodLabel(mutualActivityPeriods.value) : '每日指定')
           : (DomainClassAway && DomainClassAway.periodRangeLabel
             ? '連續' + DomainClassAway.periodRangeLabel(mutualActivityStartPeriod.value, mutualActivityEndPeriod.value) : '全部節次')) + '\n'
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
      setMutualActivityPeriodBoundary: setMutualActivityPeriodBoundary,
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
const UiMutualSubmit = (() => {
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
    var DAC = deps.DAC || function () { return DomainActivityCover; };
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

export { UiMutualPanelState, UiMutualSubmit };
