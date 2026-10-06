// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { UiInteraction } from '../src/modules/ui-interaction.js';

test('class view：applyClassViewFromUrl 正規化併班值', () => {
  const ref = (value) => ({ value });
  const pendingClassView = ref('');
  const selectedClass = ref('');
  const activeTab = ref('timetable');
  const classReadonlyMode = ref(false);
  window.happyDOM.setURL('http://localhost/?class=' + encodeURIComponent('703、704'));
  const api = UiInteraction.create({ pendingClassView, activeTab, selectedClass, classReadonlyMode, classList: ref(['701', '703', '703、704']) });
  assert.equal(api.applyClassViewFromUrl(), true);
  assert.equal(selectedClass.value, '703');
  assert.equal(pendingClassView.value, '703');
  window.happyDOM.setURL('http://localhost/');
});

test('class view：單班深連結不受影響', () => {
  const ref = (value) => ({ value });
  const pendingClassView = ref('');
  const selectedClass = ref('');
  const activeTab = ref('timetable');
  const classReadonlyMode = ref(false);
  window.happyDOM.setURL('http://localhost/?class=705');
  const api = UiInteraction.create({ pendingClassView, activeTab, selectedClass, classReadonlyMode, classList: ref(['701', '705']) });
  assert.equal(api.applyClassViewFromUrl(), true);
  assert.equal(selectedClass.value, '705');
  window.happyDOM.setURL('http://localhost/');
});

test('class view：resolvePendingClassView 正規化併班值', () => {
  const ref = (value) => ({ value });
  const pendingClassView = ref('802、805、806');
  const selectedClass = ref('');
  const activeTab = ref('timetable');
  const classReadonlyMode = ref(false);
  const api = UiInteraction.create({
    pendingClassView, activeTab, selectedClass, classReadonlyMode,
    classList: ref(['801', '802', '802、805、806'])
  });
  api.resolvePendingClassView();
  assert.equal(selectedClass.value, '802');
  assert.equal(pendingClassView.value, '');
});
