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

## 基線表（實測後填寫）

| 場景 | 條件 | 耗時 | 備註 |
|---|---|---|---|
| 首載全量（冷，GAS 快取 MISS） | 無痕視窗＋`scope=fresh` | ___ ms | 目標 Phase 1B 後 ＜5000ms |
| 首載全量（暖，GAS 快取 HIT） | 重整 | ___ ms | 目標 1000～3000ms |
| 核准後 softRefresh（delta 命中） | 簽核 1 筆 | ___ ms | 目標 1 POST 內完成 |
| 核准後 softRefresh（回退全量） | — | ___ ms | 觀察回退頻率 |
| 整學期會計匯出 buildExportData | 100師×2000筆級 | ___ ms | 目標 Phase 1C 後 ＜2000ms |
| 課表匯入 8000 筆 | S1 全覆寫 | ___ ms | 觀察是否觸及 6 分鐘上限 |

## 驗收閾值（Phase 1 結束時）

- 冷載 ＜5s、暖載 1～3s、匯出 ＜2s 且 UI 不假死（有進度回報）。
- 併發 3 人同時核准：不再出現 `操作過於頻繁`（寫鎖分級＋友善重試訊息）。
- GAS `put` 配額：全量請求每冷 miss 只寫 1 把 key（取消雙寫）。
