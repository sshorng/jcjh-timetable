/** v-autofit：單行自動縮小字級（內容超過一行寬度時逐級縮小，直到下限；hover 靠 title 顯示全文）。
 * 自 v1 app.js fitSingleLineText＋app.directive('autofit') 逐字移植（僅全域 Vue 解構移除）。
 */
export function fitSingleLineText(el) {
  if (!el || !el.isConnected) return;
  var max = parseFloat((el.dataset && el.dataset.autofitMax) || '13.5');
  var min = parseFloat((el.dataset && el.dataset.autofitMin) || '9');
  if (!(max > 0)) max = 13.5;
  if (!(min > 0)) min = 9;
  var size = max;
  el.style.fontSize = size + 'px';
  var guard = 0;
  while (el.scrollWidth > el.clientWidth + 1 && size > min && guard < 20) {
    size = Math.max(min, size - 0.5);
    el.style.fontSize = size + 'px';
    guard++;
  }
}

export const autofitDirective = {
  mounted: function (el) {
    // R-效能：同一幀多次觸發（掛載＋RO＋updated 連打）合併為一次量測，
    // 避免渲染風暴時反覆強制同步排版
    var scheduled = false;
    var run = function () {
      scheduled = false;
      fitSingleLineText(el);
    };
    var schedule = function () {
      if (scheduled) return;
      scheduled = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else run();
    };
    el.__autofitSchedule = schedule;
    schedule();
    try {
      if (typeof ResizeObserver === 'function') {
        var ro = new ResizeObserver(function () { schedule(); });
        ro.observe(el);
        el.__autofitRo = ro;
      }
    } catch (e) { /* ignore */ }
  },
  updated: function (el) {
    if (typeof el.__autofitSchedule === 'function') el.__autofitSchedule();
    else fitSingleLineText(el);
  },
  unmounted: function (el) {
    try { if (el.__autofitRo) el.__autofitRo.disconnect(); } catch (e) { /* ignore */ }
  }
};
