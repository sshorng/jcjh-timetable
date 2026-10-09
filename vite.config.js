import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // 靜態部署（沿用現行上傳方式）：相對路徑＋hash 檔名取代 ?v= 手工版號
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // framework 單獨成 chunk：版本穩定，快取命中率高；app 碼異動不影響它
        manualChunks: {
          vendor: ['vue', 'pinia']
        }
      }
    }
  },
  test: {
    // 4.2 測試加速實測：本專案（60 檔＋Google Drive I/O）threads 比預設 forks 快約 40～60 秒
    //（forks 173～219s → threads 106～125s，60/60 全過）。純 JS 無原生模組，threads 安全。
    pool: 'threads',
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.js'],
      // 實測底線（2026-10：65/82/59/65）：鎖略低地板，防退化
      thresholds: {
        statements: 60,
        branches: 75,
        functions: 55,
        lines: 60
      }
    }
  }
});
