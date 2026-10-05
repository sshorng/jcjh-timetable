// vitest setup：承接 v1 vm 語義（v1 以 global.window = global 載入模組）。
// 移植模組內殘留的 window.ensure*/window.__* 鉤子讀寫走此 shim；
// 已轉 import 的命名空間不受影響。
globalThis.window = globalThis;
// v1 單測以 noop storage 進 vm（getItem 回 ''）；此處逐字複刻，
// 避免「null vs ''」語義漂移；需要真記憶體儲存的測試自備樁。
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => '', setItem: () => {}, removeItem: () => {}, clear: () => {} };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = { getItem: () => '', setItem: () => {}, removeItem: () => {}, clear: () => {} };
}
