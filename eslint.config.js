// 最小可用護欄：只攔「未定義」與「未使用」（抓 TemplateBuffer／漏接 import 那類）。
// :legacy:2026-10 — recommended 全開噪音太大（既有碼風格債另排期），先求零誤報再收緊。
import { GAS_GLOBALS } from './tests/gas-globals.mjs';

const gasGlobals = Object.fromEntries(GAS_GLOBALS.map((name) => [name, 'readonly']));

export default [
  {
    // GAS 後端＋已封存遷移腳本：另一個 runtime／凍結，不在此掃
    ignores: ['node_modules/**', 'dist/**', 'v1-backup/**', 'code.gs', 'docs/**', 'scripts/archive/**']
  },
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        AbortController: 'readonly',
        ResizeObserver: 'readonly',
        TextEncoder: 'readonly',
        FileReader: 'readonly',
        Image: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        history: 'readonly',
        google: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        globalThis: 'readonly',
        // vendor-libs.js 經 npm＋import() 懶載後掛到全域的運行期三方庫
        // （XLSX 已移除：SheetJS HIGH 漏洞無修補版，讀寫改走 ExcelJS）
        JSZip: 'readonly',
        ExcelJS: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  },
  {
    // Node 側：測試／腳本（含 vm 灌入的 code.gs 後端全域＋happy-dom 的 Event）
    files: ['tests/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        Event: 'readonly',
        ...gasGlobals,
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly'
      }
    }
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' }
  }
];
