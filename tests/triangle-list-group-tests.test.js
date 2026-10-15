// 三角調整組列表呈現契約：三筆腿必須合成「整組列」，不可只顯示其中一筆。
import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UiListHelpers } from '../src/modules/ui-list-helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '..', 'src', 'App.vue'), 'utf8');
const dataSource = fs.readFileSync(path.join(here, '..', 'src', 'modules', 'ui-data.js'), 'utf8');

function triangleLegs(id) {
  return [
    { id: `${id}_1`, serial: `TRI${id}-1`, type: 'triangle', triangleId: id, batchId: id, triangleLegIndex: 1, requesterName: '林志鴻', targetTeacherName: '施伯旻', status: 'pending_admin' },
    { id: `${id}_2`, serial: `TRI${id}-2`, type: 'triangle', triangleId: id, batchId: id, triangleLegIndex: 2, requesterName: '施伯旻', targetTeacherName: '劉佳忠', status: 'pending_admin' },
    { id: `${id}_3`, serial: `TRI${id}-3`, type: 'triangle', triangleId: id, batchId: id, triangleLegIndex: 3, requesterName: '劉佳忠', targetTeacherName: '林志鴻', status: 'pending_teacher' }
  ];
}

test('三角三筆腿會合成一個整組列，且保留全部三筆', () => {
  const rows = UiListHelpers.buildBatchDisplayGroups(triangleLegs('tri_1'), 'admin');
  expect(rows.length).toBe(1);
  expect(rows[0].displayKind).toBe('batch');
  expect(rows[0].isTriangle).toBe(true);
  expect(rows[0].items.length).toBe(3);
});

test('整組列的申請教師與代課教師摘要列出全部參與者', () => {
  const group = UiListHelpers.buildBatchDisplayGroups(triangleLegs('tri_1'), 'admin')[0];
  expect(UiListHelpers.getBatchGroupRequesterSummary(group)).toBe('林志鴻、施伯旻、劉佳忠');
  expect(UiListHelpers.getBatchGroupTeacherSummary(group)).toBe('施伯旻、劉佳忠、林志鴻');
});

test('整組列狀態顯示為待教師簽核，而不是多種狀態', () => {
  const group = UiListHelpers.buildBatchDisplayGroups(triangleLegs('tri_1'), 'admin')[0];
  expect(UiListHelpers.getBatchGroupStatusText(group)).toBe('待教師簽核');
  expect(UiListHelpers.getBatchGroupStatusClass(group)).toBe('status-pending-teacher');
});

test('只剩一筆時維持單筆列，並標示第幾筆', () => {
  const rows = UiListHelpers.buildBatchDisplayGroups([triangleLegs('tri_1')[2]], 'admin');
  expect(rows.length).toBe(1);
  expect(rows[0].displayKind).toBe('item');
  expect(UiListHelpers.triangleLegLabel(rows[0])).toBe('第3筆');
});

test('一般批次代課的分組行為不受影響', () => {
  const rows = UiListHelpers.buildBatchDisplayGroups([
    { id: 'b1', type: 'sub', batchId: 'B9', requesterName: '甲', targetTeacherName: '乙' },
    { id: 'b2', type: 'sub', batchId: 'B9', requesterName: '丙', targetTeacherName: '丁' }
  ], 'admin');
  expect(rows[0].isTriangle).toBe(false);
  expect(rows[0].batchId).toBe('batch:b9');
});

test('資料層不再收合三角列，三筆都要進列表', () => {
  expect(dataSource).not.toMatch(/collapseTriangleRows\(schoolPendingRows/);
});

test('列表樣板標示「三角調整組／整組 N 筆」與「第 N 筆／共 3 筆」', () => {
  expect(appSource).toMatch(/row\.isTriangle \? '三角調整組' : '批次申請'/);
  expect(appSource).toMatch(/row\.isTriangle \? '整組' : '批次'/);
  expect((appSource.match(/triangleLegLabel\(/g) || []).length).toBeGreaterThanOrEqual(3);
  expect((appSource.match(/getBatchGroupRequesterSummary\(row\)/g) || []).length).toBe(3);
});

test('整組內教師與課堂依「第幾筆」排序，不受列表時間排序影響', () => {
  const shuffled = [
    triangleLegs('tri_9')[2],
    triangleLegs('tri_9')[0],
    triangleLegs('tri_9')[1]
  ];
  const group = UiListHelpers.buildBatchDisplayGroups(shuffled, 'admin')[0];
  expect(group.items.map(item => item.triangleLegIndex)).toEqual([1, 2, 3]);
  expect(UiListHelpers.getBatchGroupRequesterSummary(group)).toBe('林志鴻、施伯旻、劉佳忠');
  expect(UiListHelpers.getBatchGroupTeacherSummary(group)).toBe('施伯旻、劉佳忠、林志鴻');
});

test('缺腳次資料的三角列排在最後，不會插隊', () => {
  const rows = [
    { id: 'a', type: 'triangle', triangleId: 'tri_8', requesterName: '甲', targetTeacherName: '乙' },
    { id: 'b', type: 'triangle', triangleId: 'tri_8', triangleLegIndex: 2, requesterName: '乙', targetTeacherName: '丙' }
  ];
  const group = UiListHelpers.buildBatchDisplayGroups(rows, 'admin')[0];
  expect(group.items.map(item => item.id)).toEqual(['b', 'a']);
  expect(UiListHelpers.triangleLegLabel(group.items[0])).toBe('第2筆');
  expect(UiListHelpers.triangleLegLabel(group.items[1])).toBe('整組');
});
