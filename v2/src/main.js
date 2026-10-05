import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { autofitDirective } from './directives/autofit.js';

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
