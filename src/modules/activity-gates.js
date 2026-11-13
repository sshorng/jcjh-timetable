import { ref } from 'vue';

/**
 * activity-gates.js — 活動互代／送審／空堂事件與領域計算模組的按需載入閘門。
 * 動態 import() 集中於此，讓首屏課表主包不含 ui-activity / ui-mutual / ui-submit / ui-request / domain-activity-cover。
 */
const activityModulesReady = ref({
  dac: false,
  activity: false,
  mutual: false,
  submit: false
});
let _dac = null;
let _dacPromise = null;
let _uiActivity = null;
let _uiActivityPromise = null;
let _uiMutual = null;
let _uiMutualPromise = null;
let _uiSubmitStack = null;
let _uiSubmitStackPromise = null;

function markReady(key) {
  activityModulesReady.value = Object.assign({}, activityModulesReady.value, { [key]: true });
}

function ensureDomainActivityCoverModule() {
  if (_dac) {
    if (!activityModulesReady.value.dac) markReady('dac');
    return Promise.resolve(_dac);
  }
  if (!_dacPromise) {
    _dacPromise = import('../domain/domain-activity-cover.js')
      .then((m) => {
        _dac = m.default || m;
        markReady('dac');
        return _dac;
      })
      .catch((err) => {
        _dacPromise = null;
        throw err;
      });
  }
  return _dacPromise;
}

function ensureUiActivityModule() {
  if (_uiActivity) {
    if (!activityModulesReady.value.activity) markReady('activity');
    return Promise.resolve(_uiActivity);
  }
  if (!_uiActivityPromise) {
    _uiActivityPromise = Promise.all([
      ensureDomainActivityCoverModule(),
      import('./ui-activity.js')
    ])
      .then(([, m]) => {
        _uiActivity = m;
        markReady('activity');
        return _uiActivity;
      })
      .catch((err) => {
        _uiActivityPromise = null;
        throw err;
      });
  }
  return _uiActivityPromise;
}

function ensureUiMutualModule() {
  if (_uiMutual) {
    if (!activityModulesReady.value.mutual) markReady('mutual');
    return Promise.resolve(_uiMutual);
  }
  if (!_uiMutualPromise) {
    _uiMutualPromise = Promise.all([
      ensureDomainActivityCoverModule(),
      import('./ui-mutual.js')
    ])
      .then(([, m]) => {
        _uiMutual = m;
        markReady('mutual');
        return _uiMutual;
      })
      .catch((err) => {
        _uiMutualPromise = null;
        throw err;
      });
  }
  return _uiMutualPromise;
}

function ensureUiSubmitModule() {
  if (_uiSubmitStack) {
    if (!activityModulesReady.value.submit) markReady('submit');
    return Promise.resolve(_uiSubmitStack);
  }
  if (!_uiSubmitStackPromise) {
    _uiSubmitStackPromise = Promise.all([
      ensureUiActivityModule(),
      import('./ui-submit.js'),
      import('./ui-request.js')
    ])
      .then(([act, subMod, reqMod]) => {
        _uiSubmitStack = {
          UiSubmit: subMod.UiSubmit,
          UiSubmitHelpers: reqMod.UiSubmitHelpers,
          UiBatchPanel: act.UiBatchPanel
        };
        markReady('submit');
        return _uiSubmitStack;
      })
      .catch((err) => {
        _uiSubmitStackPromise = null;
        throw err;
      });
  }
  return _uiSubmitStackPromise;
}

function getDomainActivityCoverSync() {
  return _dac;
}

function getUiActivitySync() {
  return _uiActivity;
}

function getUiMutualSync() {
  return _uiMutual;
}

function getUiSubmitSync() {
  return _uiSubmitStack;
}

export {
  activityModulesReady,
  ensureDomainActivityCoverModule,
  ensureUiActivityModule,
  ensureUiMutualModule,
  ensureUiSubmitModule,
  getDomainActivityCoverSync,
  getUiActivitySync,
  getUiMutualSync,
  getUiSubmitSync
};
