# 建成國中線上課表系統（調代課）

教師調代課、代課媒合、簽核、匯出（會計／監考／課表）與列印的單頁應用。
前端 Vite＋Vue 3＋Pinia（`src/`），後端 Google Apps Script（`code.gs`，試算表為資料庫），
靜態部署於 Vercel（`dist/`，`npm run build` 產生，不進版控）。

## 常用指令

```bash
npm run dev              # 本地開發
npm run build            # 打包 dist（Vercel 同指令）
npm test                 # 全測（vitest，50+ 檔／70+ 項）
npm run test:coverage    # 覆蓋率（門檻：語句 60／分支 75／函數 55／行 60）
npm run lint             # ESLint（零錯誤門檻）
npm run lint:sync-gas    # code.gs 新增頂層函數後，再生測試用 GAS 全域清單
npm run e2e:boot         # 建置＋開機自檢
```

## 目錄結構

```text
src/
  App.vue                # 殼層：導覽＋各 Tab＋modal 掛載（modal 本體見 components/）
  components/            # 展示型元件（props 注入＋defineModel，業務邏輯在 stores）
  stores/                # 15 個 Pinia store（領域狀態＋工廠接線）
  modules/               # 匯出／列印／領域編排（ui-* 為 create(deps) 工廠）
  domain/                # 純領域邏輯（可單測：billing／schedule／match…）
  api/                   # GAS 呼叫端（gas-client.js）
tests/                   # 契約＋接線＋單元測試（__appmap.json 鎖定模板綁定）
code.gs                  # GAS 後端（另一個 runtime，不進 ESLint）
scripts/                 # 工具腳本（archive/ 為已封存一次性遷移腳本）
```

## 架構約定

- 匯出 payload（accounting／invigilation／activity-cover／period8／school-timetable）
  走 `src/modules/export-lazy.js` 按需載入，不進首屏主包；print-helper 維持靜態（同步預覽路徑）。
- 三方庫走 npm＋`import()` 懶載（`vendor-libs.js`），無 CDN；XLSX 已因無修補版 HIGH 漏洞移除，
  讀寫統一走 ExcelJS（`src/modules/excel-io.js`）。
- 測試用 `vm` 把 `code.gs` 灌成全域：ESLint 認名單由 `tests/gas-globals.mjs` 提供，
  後端加函數後跑 `npm run lint:sync-gas`。
- 元件拆分原則：App.vue 只留殼層與接線，modal／抽屜逐個抽為展示元件；
  模板文字斷言散在各測試時，轉向讀新元件檔（聚合檢查見 `tests/composition.test.js`）。

## 注意事項

- `.perch/`、`v1-backup/` 不進版控（前者含機密，後者為本地 V1 備份）。
- 推送不用 `--force`；CI workflow 需在 GitHub 網頁手動新增（token 無 workflow 權限）。
- `uuid` 經 exceljs 引入 moderate 告警：已確認 exceljs 僅調用無參數 `uuidv4()`，
  公告攻擊路徑不可達，`npm audit fix --force` 會降級 exceljs，故接受風險並觀察。
