import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const here = path.dirname(fileURLToPath(import.meta.url));

// Phase 3 路由表化契約：doPost 40 寫入 actions＋讀取 8 actions 皆經路由表分派。
const POST_ACTIONS = ['migrateNameKeySchema', 'renameTeacherNameKey', 'saveSemester', 'deleteSemester',
  'setDefaultSemester', 'saveSchoolSwap', 'deleteSchoolSwap', 'saveClassAwayEvent', 'deleteClassAwayEvent',
  'backupTeacherExpensePlans', 'saveTeacher', 'deleteTeacher', 'importTeachersBatch', 'updateMutualQuotas',
  'earnMutualQuotaFromActivity', 'getMutualQuotaPackages', 'saveScheduleCell', 'clearScheduleCell',
  'importSchedulesBatch', 'saveHomeroomCoverTeacher', 'saveManualHomeroomRecord', 'deleteHomeroomRecord',
  'adminApprove', 'adminApproveBatch', 'adminReject', 'adminRejectBatch', 'deleteSubstitutionRecord',
  'saveHistoryEdit', 'saveMailSettings', 'batchMarkPrinted', 'submitTriangleRequest', 'submitRequest',
  'submitExchangeBatch', 'submitRequestBatch', 'sendBatchNotices', 'respondTriangleRequest', 'respondToRequest',
  'respondToBatch', 'cancelRequest', 'withdrawRequest'];
const READ_ACTIONS = ['getMatchCandidates', 'getMetaData', 'getPendingOnly', 'getHistoryMonth',
  'getMutualQuotaLedger', 'getHomeroomRecords', 'getQuotaSpendPreview', 'getInitialData'];
const cap = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);

test('gas route tables（Phase 3：doPost／讀取路由完整＋舊鏈移除）', () => {
  const source = fs.readFileSync(path.join(here, '..', 'code.gs'), 'utf8');
  new vm.Script(source, { filename: 'code.gs' });

  // 舊 if/else 鏈已移除（doPost／讀取皆無 action 分支鏈）
  assert.doesNotMatch(source, /\} else if \(action === "/, '舊 doPost else-if 鏈應已移除');
  assert.doesNotMatch(source, /\n  if \(action === "getMatchCandidates"\)/, '舊讀取 if 塊應已改走路由表');

  // 40＋8 處理器存在
  POST_ACTIONS.forEach((a) => {
    assert.ok(source.includes('function handlePost' + cap(a) + '_(ctx)'), '缺少寫入處理器 ' + a);
  });
  READ_ACTIONS.forEach((a) => {
    assert.ok(source.includes('function handleRead' + cap(a) + '_(rctx)'), '缺少讀取處理器 ' + a);
  });

  // 免登入短路保留內聯（未登入／啟動期也要能報錯、公開課表免 Token）
  assert.match(source, /if \(action === "logClientError"\)/, 'logClientError 免 Token 短路必須保留');
  assert.match(source, /if \(action === "getPublicClassData"\)/, '公開課表免登入短路必須保留');

  // 權限守衛仍在 doPost 前段（鎖外先驗，縮短鎖持有）
  const doPostStart = source.indexOf('function doPost(e)');
  const dispatchAt = source.indexOf('var postHandler = postActionRoutes_()[action]', doPostStart);
  assert.ok(doPostStart >= 0 && dispatchAt > doPostStart, 'doPost dispatch 必須存在');
  const prelude = source.slice(doPostStart, dispatchAt);
  assert.match(prelude, /ADMIN_ONLY_ACTIONS/, 'ADMIN_ONLY 權限表必須留在 dispatch 之前');
  assert.match(prelude, /acquireActionLock_/, '寫入鎖必須在 dispatch 之前取得');
  assert.match(prelude, /beginDeferredMails_/, '延遲寄信必須在 dispatch 之前開始');

  // 路由表可執行：40＋8 鍵皆對應處理器（樁 handler 驗證映射完整）
  const postTableStart = source.indexOf('function postActionRoutes_()');
  const postTableEnd = source.indexOf('function handlePost' + cap(POST_ACTIONS[0]) + '_', postTableStart);
  assert.ok(postTableStart >= 0 && postTableEnd > postTableStart, '寫入路由表必須緊鄰第一個處理器');
  const postCtx = {};
  POST_ACTIONS.forEach((a) => { postCtx['handlePost' + cap(a) + '_'] = function () { return 'stub:' + a; }; });
  vm.createContext(postCtx);
  vm.runInContext(source.slice(postTableStart, postTableEnd), postCtx, { filename: 'code.gs.post-routes' });
  const postRoutes = postCtx.postActionRoutes_();
  assert.equal(Object.keys(postRoutes).length, 40, '寫入路由表應有 40 個 action');
  POST_ACTIONS.forEach((a) => {
    assert.equal(typeof postRoutes[a], 'function', '寫入路由缺 ' + a);
    assert.equal(postRoutes[a](), 'stub:' + a, '寫入路由錯接 ' + a);
  });

  const readTableStart = source.indexOf('function readActionRoutes_()');
  const readTableEnd = source.indexOf('function handleRead' + cap(READ_ACTIONS[0]) + '_', readTableStart);
  assert.ok(readTableStart >= 0 && readTableEnd > readTableStart, '讀取路由表必須緊鄰第一個處理器');
  const readCtx = {};
  READ_ACTIONS.forEach((a) => { readCtx['handleRead' + cap(a) + '_'] = function () { return 'stub:' + a; }; });
  vm.createContext(readCtx);
  vm.runInContext(source.slice(readTableStart, readTableEnd), readCtx, { filename: 'code.gs.read-routes' });
  const readRoutes = readCtx.readActionRoutes_();
  assert.equal(Object.keys(readRoutes).length, 8, '讀取路由表應有 8 個 action');
  READ_ACTIONS.forEach((a) => {
    assert.equal(typeof readRoutes[a], 'function', '讀取路由缺 ' + a);
  });

  // 處理器首行一律解構呼叫端 ctx（作用域契約）
  POST_ACTIONS.forEach((a) => {
    const h = 'function handlePost' + cap(a) + '_(ctx) {';
    const at = source.indexOf(h);
    const nextNl = source.indexOf('\n', at);
    const line2 = source.slice(nextNl + 1, source.indexOf('\n', nextNl + 1));
    assert.match(line2, /var \{reqData, semesterId, userEmail, isAdmin, isStaff, teachers, currentTeacher, currentUrl, requestContext, cacheKey\} = ctx;/, a + ' 首行 ctx 解構');
  });

  console.log('gas route table tests PASS');
});
