import assert from 'node:assert/strict';
import { test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

function destructuredNames(source, storeName) {
  const names = new Set();
  const re = new RegExp(`const \\{([^}]*)\\}\\s*=\\s*${storeName};`, 'g');
  let m;
  while ((m = re.exec(source))) {
    m[1].split(',').forEach((raw) => {
      const name = raw.split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
  }
  return names;
}

function returnedNames(source) {
  const names = new Set();
  const re = /return\s*\{([^}]*)\};/g;
  let m;
  while ((m = re.exec(source))) {
    m[1].split(',').forEach((raw) => {
      const name = raw.split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
  }
  return names;
}

// 這條鎖住「store 沒回傳、模板卻呼叫」的整類 bug：
// 之前 classAwayEventRuleSummary 只加在 ui-activity，忘了加進 stores/backoffice.js，
// 線上就炸成 TypeError: e(...) is not a function，而單元測試沒渲染那一頁所以全綠。
test('App.vue 從 backofficeStore 取用的名稱，store 必須真的回傳', () => {
  const wanted = destructuredNames(read('src/App.vue'), 'backofficeStore');
  const provided = returnedNames(read('src/stores/backoffice.js'));
  const missing = [...wanted].filter((name) => !provided.has(name));
  assert.deepEqual(missing, [], '以下名稱 store 沒回傳，模板一呼叫就會 TypeError');
});

test('App.vue 從 interactionStore 取用的名稱，store 必須真的回傳', () => {
  const wanted = destructuredNames(read('src/App.vue'), 'interactionStore');
  const provided = returnedNames(read('src/stores/interaction.js'));
  const missing = [...wanted].filter((name) => !provided.has(name));
  assert.deepEqual(missing, [], '以下名稱 store 沒回傳，模板一呼叫就會 TypeError');
});
