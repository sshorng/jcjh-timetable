// 最小可用護欄：只攔「未定義」與「未使用」（抓 TemplateBuffer／漏接 import 那類）。
// :legacy:2026-10 — recommended 全開噪音太大（既有碼風格債另排期），先求零誤報再收緊。
// 後端 code.gs 另有獨立區塊：只裝「錯了會在 GAS 執行期才炸」的結構規則，見檔尾。
import { GAS_GLOBALS } from './tests/gas-globals.mjs';

const gasGlobals = Object.fromEntries(GAS_GLOBALS.map((name) => [name, 'readonly']));

// GAS 後端自身會用到的服務全域（Apps Script runtime 提供，非本專案宣告）。
const GAS_SERVICE_GLOBALS = [
  'SpreadsheetApp', 'PropertiesService', 'CacheService', 'ContentService', 'Utilities',
  'UrlFetchApp', 'ScriptApp', 'Session', 'Logger', 'DriveApp', 'MailApp', 'GmailApp',
  'HtmlService', 'LockService', 'CalendarApp', 'console'
];
const gasServiceGlobals = Object.fromEntries(GAS_SERVICE_GLOBALS.map((name) => [name, 'readonly']));

export default [
  {
    // 產出物／備份／已封存遷移腳本不掃（code.gs 已納入，見下一個區塊）
    ignores: ['node_modules/**', 'dist/**', 'v1-backup/**', 'docs/**', 'scripts/archive/**']
  },

  {
    // GAS 後端（code.gs）：單檔腳本 runtime，無模組、無 import，故 sourceType 為 script。
    // 這裡只放「寫錯要等 GAS 真的跑起來才會炸」的規則，不碰排版與風格，維持零誤報。
    // 注意：不可把 tests/gas-globals.mjs 的清單塞進 globals，那份是 code.gs 自己的函數，
    // 灌進來會讓每個 function 宣告都被判成重複定義（no-redeclare）。
    files: ['code.gs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: gasServiceGlobals
    },
    rules: {
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-func-assign': 'error',
      'no-obj-calls': 'error',
      'no-sparse-arrays': 'error',
      'use-isnan': 'error'
    }
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
