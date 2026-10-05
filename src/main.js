import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { autofitDirective } from './directives/autofit.js';
import { OnboardingTour } from './modules/onboarding-tour.js';

// R-接線：導覽模組改 ESM 後不再有獨立 script 檔；直接掛載全域，
// ui-tour 的 ensureOnboardingTour 會短路沿用（不再 404 抓檔）
if (typeof window !== 'undefined' && !window.OnboardingTour) {
  window.OnboardingTour = OnboardingTour;
}

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
