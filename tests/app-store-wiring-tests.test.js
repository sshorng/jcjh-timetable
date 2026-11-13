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

test('分頁 SFC 從各 store 取用的名稱，對應 store 必須真的回傳', () => {
  const panelFiles = [
    'src/components/PendingTabPanel.vue',
    'src/components/RecordsTabPanel.vue',
    'src/components/AdminTabPanel.vue'
  ];
  const storeFiles = [
    ['sessionStore', 'src/stores/session.js'],
    ['dataStore', 'src/stores/data.js'],
    ['timetableStore', 'src/stores/timetable.js'],
    ['requestsStore', 'src/stores/requests.js'],
    ['historyStore', 'src/stores/history.js'],
    ['backofficeStore', 'src/stores/backoffice.js'],
    ['adminStore', 'src/stores/admin.js'],
    ['outputStore', 'src/stores/output.js'],
    ['interactionStore', 'src/stores/interaction.js'],
    ['homeroomStore', 'src/stores/homeroom.js'],
    ['mutualStore', 'src/stores/mutual.js'],
    ['submitStore', 'src/stores/submit.js'],
    ['tourStore', 'src/stores/tour.js']
  ];
  const providedByStore = Object.fromEntries(
    storeFiles.map(([varName, file]) => [varName, returnedNames(read(file))])
  );
  const missing = [];
  for (const panelFile of panelFiles) {
    const src = read(panelFile);
    for (const [varName] of storeFiles) {
      const refPattern = new RegExp(`const \\{([^}]*)\\}\\s*=\\s*storeToRefs\\(${varName}\\)`, 'g');
      let m;
      while ((m = refPattern.exec(src))) {
        m[1].split(',').forEach((raw) => {
          const name = raw.split(':')[0].trim();
          if (name && !providedByStore[varName].has(name)) {
            missing.push(`${panelFile}:${varName}.${name}`);
          }
        });
      }
      for (const name of destructuredNames(src, varName)) {
        if (!providedByStore[varName].has(name)) {
          missing.push(`${panelFile}:${varName}.${name}`);
        }
      }
    }
  }
  assert.deepEqual(missing, [], '以下分頁 SFC 取用名稱未在對應 store 回傳');
});
