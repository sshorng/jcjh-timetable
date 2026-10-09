import './styles/style.css';
import './styles/mobile.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { autofitDirective } from './directives/autofit.js';
// R-接線：導覽模組改 ESM 後不再有獨立 script 檔；ui-tour 的 ensureOnboardingTour
// 以動態 import() 按需載入（首屏不含；新用戶登入 800ms 後才觸發）。

export function createV2App() {
  const app = createApp(App);
  app.use(createPinia());
  app.directive('autofit', autofitDirective);
  return app;
}

// entry：瀏覽器且 #app 存在才自動掛載（測試 import 不觸發）
if (typeof document !== 'undefined' && document.querySelector('#app')) {
  createV2App().mount('#app');
}
