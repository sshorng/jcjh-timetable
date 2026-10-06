// 由 code.gs 頂層函數名產生 tests/gas-globals.mjs（ESLint 用）。
// 背景：permission/security 等測試用 vm.runInThisContext(code.gs) 把後端函數灌成全域；
// 此清單讓 no-undef 認得它們。code.gs 新增頂層函數後跑一次：npm run lint:sync-gas
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'code.gs'), 'utf8').split('\n');
const names = new Set();
src.forEach((line) => {
  let m = line.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (m) names.add(m[1]);
  m = line.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) names.add(m[1]);
});
const arr = [...names].sort();
const out = '// 自動產生（npm run lint:sync-gas），勿手改。\n'
  + '// code.gs 頂層函數／變數：測試用 vm 灌成全域，ESLint no-undef 認名單。\n'
  + 'export const GAS_GLOBALS = [\n'
  + arr.map((n) => '  ' + JSON.stringify(n)).join(',\n')
  + '\n];\n';
fs.writeFileSync(path.join(root, 'tests', 'gas-globals.mjs'), out);
console.log('gas globals: ' + arr.length);
