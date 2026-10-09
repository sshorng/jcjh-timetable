# 效能基線量測（Phase 0）

> 埋點位置：`gas-api.js`（`isPerfEnabled／getPerfRecords／perfSummary`）、
> `export-accounting.js`（`opts.onProgress` phase：`charged-map／summary:*／build-data-*`）、
> `code.gs`（指令碼屬性 `PERF_LOG=true` 才輸出 `[perf]` 日誌）。

## 量測方法

### 前端（免改碼）

1. 在網址後加 `?perf=1` 重新整理（或 `localStorage.setItem('jcjh_perf','1')`）。
2. 開 DevTools Console，操作一次以下流程，console 會印 `[perf] <action>: <ms>ms`。
3. 在 Console 執行 `GasApi.perfSummary()` 取得彙總（或 `GasApi.getPerfRecords()` 看明細）。

### 後端（GAS）

1. GAS 專案設定 → 指令碼屬性 → 新增 `PERF_LOG = true`。
2. 執行 → 查看執行記錄，找 `[perf]` 行：
   - `getInitialData/full cache HIT／MISS`（快取命中與否）
   - `getInitialData/full build`（組包耗時）
   - `getInitialData/requestsOnly cache HIT／MISS、build`

### 匯出

```js
await ExportAccounting.exportWorkbook({
  /* 原有 opts… */,
  onProgress: (p) => console.log('[export]', p.phase, p.done + '/' + p.total)
});
```

## 基線表

| 場景 | 條件 | 耗時 | 備註 |
|---|---|---|---|
| 首載全量（冷，GAS 快取 MISS） | 無痕視窗＋`scope=fresh` | ___ ms（待生產環境量測） | 目標 Phase 1B 後 ＜5000ms；需 live GAS＋瀏覽器，本地無法量測 |
| 首載全量（暖，GAS 快取 HIT） | 重整 | ___ ms（待生產環境量測） | 目標 1000～3000ms；同上 |
| 核准後 softRefresh（delta 命中） | 簽核 1 筆 | ___ ms（待生產環境量測） | 目標 1 POST 內完成；同上 |
| 核准後 softRefresh（回退全量） | — | ___ ms（待生產環境量測） | 觀察回退頻率；同上 |
| 整學期會計匯出 buildExportData | 100師×2000筆級 | **約 1.8s**（1755～1834ms，見下三節；初測 109s→累計約 57 倍） | ✅ 已達「Phase 1C 後 ＜2000ms」 |
| 課表匯入 8000 筆 | S1 全覆寫 | ___ ms（待生產環境量測） | 觀察是否觸及 6 分鐘上限；需 live GAS（S1 全覆寫寫入路徑） |

## 本次量測紀錄（2026-10-10，本地 Node）

量測對象：`ExportAccounting.buildExportData` 純運算成本（不含 ExcelJS 寫檔與網路）。
環境：Windows＋Node 22.17（8 核／7.7GB），一次性腳本（未進版控，跑完即刪）。

fixture（確定性 PRNG seed `20261010`，形狀照抄 `tests/export-accounting-tests.test.js` 的斷言案例，
並滿足結算路徑的實質條件，否則紀錄會被靜默跳過而量到空路徑）：
100 師（半數無配置計畫走國教表、半數 legacy／slots 計畫走各計畫分表）、
100 筆月結列、2000 筆代課紀錄（已核准、公費代課 90％／自費代課 10％，
每筆精準命中原教師的超鐘點格：同星期、同節、同班、日期星期相符）、
8000 筆課表列。完整走進建表路徑（sanity：overtimeRows=499、overtimePlans=3）。

| 量級 | 5 次實測 ms | 中位數 |
|---|---|---|
| 10 師 × 200 筆 × 800 課表 | 631、640、651、1039、1079 | 651 ms |
| 100 師 × 2000 筆 × 8000 課表 | 107496、107814、109203、109775、110309 | **109,203 ms** |

解讀：10 倍資料量 → 約 167 倍耗時（超線性）。熱點在逐來源 × 代課紀錄 × 課表掃描
（`chargedSubstitutionRecords` 內每筆紀錄觸發 `isOvertimeSubstitution` 的全課表 `.some()` 掃描，
且 `buildChargedRecordMap` 與 `buildSummaryRows` 內多處重複呼叫）。
後續方向：對（紀錄、課表）做 memo 或建（教師、星期、節次）索引，列為下一輪項目。

## 追蹤量測（課表索引＋resolver memo 落地後，同一 fixture、同一方法）

兩處改動（皆在 `src/modules/export-accounting.js`，零簽名變更；
輸出雜湊與改前逐位元一致，NT=10／NT=100 各驗一次＋全套測試全綠）：
1. 課表索引：`isOvertimeSubstitution`／`isSubstituteAttributePayoutRecord` 的全表 `.some()`
   改按（教師識別鍵、星期、節次）查桶（101,932 → 47,069ms）。
2. resolver memo：`overtimeExpenseSourceForRecord`（單次約 3ms、全程約 8000 次呼叫但僅
   2000 筆不重複）改以紀錄內容為 key 的單次建表快取（47,069 → 8,508ms）。

| 量級 | 5 次實測 ms | 中位數 |
|---|---|---|
| 10 師 × 200 筆 × 800 課表 | 79、80、85、87、88 | 85 ms |
| 100 師 × 2000 筆 × 8000 課表 | 8298、8395、8508、8533、8580 | **8,508 ms** |

累計 101,932 → 8,508ms（約 12 倍），但仍為 ＜2000ms 目標的約 4 倍。
殘餘熱點：`planKeys.forEach` 對每個計畫重跑整個 `buildSummaryRows`
（逐來源工作多與計畫無關）。後續方向：逐來源只算一次、再按計畫分流
（需重構 200 行函數，獨立成輪）。

## 追蹤量測（billing resolver 查桶落地後，同一 fixture、同一方法）

改動在 `src/domain/domain-billing.js`（`overtimeExpenseResolutionForRecord` 內的全課表
`.filter()` 改查桶＋原謂詞逐字重驗；零簽名變更；輸出雜湊連續七次一致＋全套測試全綠）：
phase 構成由 charged-map 6128ms＋summary:overtime 2810ms 變為 357ms＋1214ms。

| 量級 | 實測 ms | 備註 |
|---|---|---|
| 100 師 × 2000 筆 × 8000 課表 | 1834、1755、1776 | 全在 ＜2000ms 門檻內 |

累計 101,932 → 約 1,800ms（約 57 倍），**匯出 ＜2s 門檻達成**。
殘餘構成：summary:overtime 約 1.2s（逐計畫遍）為最大項；如需再壓，方向仍是逐來源只算一次、
再按計畫分流（重構 `buildSummaryRows` 200 行函數，留待日後）。

## 驗收閾值（Phase 1 結束時）

- 冷載 ＜5s、暖載 1～3s、匯出 ＜2s 且 UI 不假死（有進度回報）。
- 併發 3 人同時核准：不再出現 `操作過於頻繁`（寫鎖分級＋友善重試訊息）。
- GAS `put` 配額：全量請求每冷 miss 只寫 1 把 key（取消雙寫）。
- ✅ 匯出 ＜2s 在 100 師量級已達標（初測 109s→現約 1.8s，見上三節）；GAS／瀏覽器側基線仍待生產環境補齊。
