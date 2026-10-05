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
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js']
  }
});
