/**
 * 自 v1 ui-proxy.js 機械移植（port-modules.cjs）：
 * IIFE 掛載改 ESM export；body 與 v1 逐字一致。
 */

/**
 * ui-proxy.js — 身份／代理（代申請驗證／授權名單／線上開關）（從 app.js 抽出，2A）
 *
 * Eager 載入（setup 內委派，需先於 app.js）。create(deps) 注入 refs／回呼。
 */
import { showToast } from '../ui/toast.js';
import { runBackgroundSave } from '../ui/save-bubble.js';
const UiProxy = (() => {
  function create(deps) {
    deps = deps || {};
    var computed = deps.computed;
    var callGasApi = deps.callGasApi;
    var user = deps.user;
    var getTeacherNameByEmail = deps.getTeacherNameByEmail;
    var isAdmin = deps.isAdmin;
    var canStaffProxySubmit = deps.canStaffProxySubmit;
    var proxyTargetEmail = deps.proxyTargetEmail;
    var showProxyTargetDropdown = deps.showProxyTargetDropdown;
    var proxyTargetQuery = deps.proxyTargetQuery;
    var isStaff = deps.isStaff;
    var teachersList = deps.teachersList;
    var proxySubmitEmails = deps.proxySubmitEmails;
    var proxySubmitEnabledBy = deps.proxySubmitEnabledBy;
    var proxySubmitEnabledAt = deps.proxySubmitEnabledAt;
    var PROXY_SUBMIT_EMAILS_LS_KEY = deps.PROXY_SUBMIT_EMAILS_LS_KEY;
    // 儲存類動作改走背景泡泡（ui/save-bubble.js），不再使用全域 loading 遮罩
    var onlineSubstitutionEnabled = deps.onlineSubstitutionEnabled;
    var proxyGrantQuery = deps.proxyGrantQuery;
    var subsidyProjectPlans = deps.subsidyProjectPlans;
    var lookupTeacher = deps.lookupTeacher;
    var parseTeacherSubjects = deps.parseTeacherSubjects;
    var searchQuery = deps.searchQuery;
    var selectedSubject = deps.selectedSubject;

const canOperateOnTeacherEmail = (teacherEmail) => {
  if (!user.value) return false;
  const me = String(getTeacherNameByEmail(user.value.email) || '').toLowerCase();
  const em = String(teacherEmail || '').toLowerCase();
  if (!em) return false;
  if (em === me) return true;
  if (isAdmin.value) return true;
  // 已授權行政：可對全校教師操作（不必先在右上選好才准點）
  if (canStaffProxySubmit.value) return true;
  return false;
};

const ensureProxyTargetForTeacher = (teacherEmail) => {
  if (!canStaffProxySubmit.value || !user.value) return;
  const me = String(getTeacherNameByEmail(user.value.email) || '').toLowerCase();
  const em = String(teacherEmail || '').trim().toLowerCase();
  if (!em || em === me) return;
  if (String(proxyTargetEmail.value || '').toLowerCase() === em) return;
  proxyTargetEmail.value = em;
  try {
    const nm = getTeacherNameByEmail(em) || em;
    if (selectedSubject.value === 'mine') selectedSubject.value = 'all';
    showToast('已切換代申請對象：' + nm, 'info', 2200);
  } catch (e) { /* ignore */ }
};

const setProxyTarget = (email) => {
  const em = String(email || '').trim().toLowerCase();
  if (!em) {
    proxyTargetEmail.value = '';
    showProxyTargetDropdown.value = false;
    proxyTargetQuery.value = '';
    return;
  }
  if (!canStaffProxySubmit.value && !isAdmin.value) {
    showToast(isStaff.value
      ? '您是行政，但尚未被教學組勾選授權代申請'
      : '僅授權的行政可代申請', 'warning');
    return;
  }
  proxyTargetEmail.value = em;
  showProxyTargetDropdown.value = false;
  proxyTargetQuery.value = '';
  // 切到該教師課表
  searchQuery.value = getTeacherNameByEmail(em) || em;
  if (selectedSubject.value === 'mine') selectedSubject.value = 'all';
  showToast('代申請對象：' + (getTeacherNameByEmail(em) || em), 'info');
};

const filterStaffEmailsOnly = (emails) => {
  const staffSet = {};
  (teachersList.value || []).forEach(t => {
    if (t.role === 'staff') {
      const em = String(t.loginEmail || '').toLowerCase();
      if (em) staffSet[em] = 1;
    }
  });
  const seen = {};
  const out = [];
  (emails || []).forEach(raw => {
    const e = String(raw || '').trim().toLowerCase();
    if (!e || seen[e] || !staffSet[e]) return;
    seen[e] = 1;
    out.push(e);
  });
  return out;
};

const persistProxySubmitEmails = async (nextList, _toastOk) => {
  if (!isAdmin.value) {
    showToast('僅教學組可設定代申請行政', 'warning');
    return false;
  }
  const prev = (proxySubmitEmails.value || []).slice();
  const uniq = filterStaffEmailsOnly(nextList);
  proxySubmitEmails.value = uniq;
  const by = user.value
    ? (user.value.displayName || getTeacherNameByEmail(user.value.email) || user.value.email)
    : '';
  const at = new Date().toISOString();
  proxySubmitEnabledBy.value = by;
  proxySubmitEnabledAt.value = at;
  try { localStorage.setItem(PROXY_SUBMIT_EMAILS_LS_KEY, uniq.join(',')); } catch (e) { /* ignore */ }
  // 本地先寫入（上面已套用）；GAS 在背景同步，完成再跳泡泡
  const saveResult = await runBackgroundSave({
    key: 'proxy-submit-emails',
    label: '代申請授權',
    successMessage: uniq.length
      ? ('已授權 ' + uniq.length + ' 位行政可代申請')
      : '已清空授權（所有行政皆不可代申請）',
    errorMessage: '儲存代申請授權失敗',
    rollback: () => {
      proxySubmitEmails.value = prev;
      try { localStorage.setItem(PROXY_SUBMIT_EMAILS_LS_KEY, prev.join(',')); } catch (e2) { /* ignore */ }
    },
    apiCall: () => callGasApi('saveMailSettings', {
      proxySubmitEmails: uniq.join(','),
      proxySubmitEnabled: uniq.length > 0,
      proxySubmitEnabledBy: by,
      proxySubmitEnabledAt: at
    })
  });
  if (saveResult.ok) return true;
  const msg = saveResult.error && saveResult.error.message
    ? String(saveResult.error.message)
    : String(saveResult.error || '');
  if (/未定義|不支援|not support|Unknown action/i.test(msg)) {
    // 後端還沒這個 action：保留本機授權名單，等 GAS 更新後再同步
    proxySubmitEmails.value = uniq;
    try { localStorage.setItem(PROXY_SUBMIT_EMAILS_LS_KEY, uniq.join(',')); } catch (e3) { /* ignore */ }
    showToast('已寫入本機授權名單（後端尚未同步，請更新 GAS）', 'warning', 4500);
    return true;
  }
  return false;
};

const toggleProxySubmitEmail = async (email) => {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  const t = (teachersList.value || []).find(x =>
    String(x.loginEmail || '').toLowerCase() === em
  );
  if (!t || t.role !== 'staff') {
    showToast('只能授權「行政」角色', 'warning');
    return;
  }
  const cur = (proxySubmitEmails.value || []).slice();
  const idx = cur.indexOf(em);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(em);
  await persistProxySubmitEmails(cur);
};

const setOnlineSubstitutionEnabled = async (enabled) => {
  if (!isAdmin.value) {
    showToast('僅教學組可切換線上調代課模式', 'warning');
    return;
  }
  const previous = onlineSubstitutionEnabled.value;
  onlineSubstitutionEnabled.value = !!enabled;
  // 本地先寫入（上方已切換）；GAS 在背景同步，完成再跳泡泡
  await runBackgroundSave({
    key: 'online-substitution-mode',
    label: '調代課模式',
    successMessage: onlineSubstitutionEnabled.value
      ? '已開啟線上調代課'
      : '已切換為紙本模式，媒合與模擬仍可使用',
    errorMessage: '切換調代課模式失敗',
    rollback: () => { onlineSubstitutionEnabled.value = previous; },
    apiCall: () => callGasApi('saveMailSettings', {
      onlineSubstitutionEnabled: onlineSubstitutionEnabled.value
    })
  });
};

/** 維護「代課費專案清單」（系統設定 subsidyProjectPlans，以「、」分隔） */
const saveSubsidyProjectPlans = async (nextList) => {
  if (!isAdmin.value) {
    showToast('僅教學組可維護代課費專案清單', 'warning');
    return false;
  }
  const prev = (subsidyProjectPlans.value || []).slice();
  const uniq = [];
  String(Array.isArray(nextList) ? nextList.join('、') : (nextList == null ? '' : nextList))
    .split(/[、,，;；\n]+/)
    .forEach(raw => {
      const name = String(raw || '').trim();
      if (!name || uniq.indexOf(name) >= 0) return;
      uniq.push(name);
    });
  subsidyProjectPlans.value = uniq;
  const saveResult = await runBackgroundSave({
    key: 'subsidy-project-plans',
    label: '代課費專案清單',
    successMessage: uniq.length
      ? ('已更新 ' + uniq.length + ' 個代課費專案')
      : '已清空專案清單（所有代課費皆為公付）',
    errorMessage: '儲存代課費專案清單失敗',
    rollback: () => { subsidyProjectPlans.value = prev; },
    apiCall: () => callGasApi('saveMailSettings', { subsidyProjectPlans: uniq.join('、') })
  });
  return !!(saveResult && saveResult.ok);
};

const filteredProxyTeachers = computed(() => {
  const q = String(proxyTargetQuery.value || '').trim().toLowerCase();
  const list = teachersList.value || [];
  const me = user.value ? String(getTeacherNameByEmail(user.value.email) || '').toLowerCase() : '';
  return list.filter(t => {
    const em = String(t.teacherName || t.name || '').toLowerCase();
    const loginEmail = String(t.loginEmail || '').toLowerCase();
    if (!em || em === me) return false;
    if (t.role === 'admin') return false;
    if (!q) return true;
    const name = String(t.name || '').toLowerCase();
    const sub = String(t.subject || '').toLowerCase();
    return name.includes(q) || em.includes(q) || loginEmail.includes(q) || sub.includes(q);
  });
});

const proxyGrantCandidateTeachers = computed(() => {
  const q = String(proxyGrantQuery.value || '').trim().toLowerCase();
  return (teachersList.value || []).filter(t => {
    if (t.role !== 'staff') return false;
    const em = String(t.loginEmail || '').toLowerCase();
    if (!em) return false;
    if (!q) return true;
    const name = String(t.name || '').toLowerCase();
    const sub = String(t.subject || '').toLowerCase();
    return name.includes(q) || em.includes(q) || sub.includes(q);
  });
});

const userRoleText = computed(() => {
  if (isAdmin.value) return '教學組';
  if (isStaff.value) return '行政';
  const match = user.value ? lookupTeacher(user.value.email) : null;
  if (!match) return '教師';
  const domains = parseTeacherSubjects(match.subject);
  if (!domains.length) return '教師';
  return domains.length === 1 ? `${domains[0]}科教師` : `${domains.join('／')}教師`;
});

const isProxySubmitGranted = computed(() => {
  if (!user.value) return false;
  const me = String(user.value.email || '').trim().toLowerCase();
  if (!me) return false;
  return (proxySubmitEmails.value || []).some(function (e) {
    return String(e || '').trim().toLowerCase() === me;
  });
});

    return {
      canOperateOnTeacherEmail: canOperateOnTeacherEmail,
      ensureProxyTargetForTeacher: ensureProxyTargetForTeacher,
      setProxyTarget: setProxyTarget,
      filterStaffEmailsOnly: filterStaffEmailsOnly,
      persistProxySubmitEmails: persistProxySubmitEmails,
      toggleProxySubmitEmail: toggleProxySubmitEmail,
      setOnlineSubstitutionEnabled: setOnlineSubstitutionEnabled,
      saveSubsidyProjectPlans: saveSubsidyProjectPlans,
      filteredProxyTeachers: filteredProxyTeachers,
      proxyGrantCandidateTeachers: proxyGrantCandidateTeachers,
      userRoleText: userRoleText,      isProxySubmitGranted: isProxySubmitGranted,

    };
  }
  return { create: create };
})();

export { UiProxy };
