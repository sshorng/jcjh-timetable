# archive — 一次性遷移腳本（V1→V2，已退役）

這些腳本把 V1（全域 script＋`window` 掛載）機械移植成 V2（ESM＋Pinia），
以及把 V1 測試轉成 vitest。移植已於 2026-10 完成並全量驗證（48 檔 62 測），
留檔備查，不再執行。

- `port-*.cjs`：模組／領域／測試的移植產生器
- `gen-*.cjs`：App.vue 與 store 分解產生器
- `stmtspan.cjs`、`mask.cjs`：移植期輔助
- `_patch_p1_p3.py`：更早的一次性修補

現行指令只用 `scripts/e2e-boot-check.cjs`（`npm run e2e:boot`）。
