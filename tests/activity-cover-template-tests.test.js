import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

/**
 * 輪值通知單範本內容鎖定。
 *
 * 背景：範本文案由使用者直接在 .docx 改（例如加上「本學年」），程式不重寫該段文字，
 * 一旦範本被舊版覆蓋或佔位符被 Word 切斷，生成文件就會少字／數字空白。
 * 這裡直接讀 public/templates/activity-cover-template.docx 驗內容。
 */
test('輪值單範本：文案含「本學年未執行的課務」且三個佔位符完整', async () => {
  const docxPath = fileURLToPath(new URL('../public/templates/activity-cover-template.docx', import.meta.url));
  const zip = await JSZip.loadAsync(await readFile(docxPath));
  const docFile = zip.file('word/document.xml');
  assert.ok(docFile, '範本缺少 word/document.xml');
  const xml = await docFile.async('string');
  // Word 常把同一句話拆成多個 run（<w:t>），比對前先去標籤
  const text = xml.replace(/<[^>]+>/g, '');

  assert.ok(
    text.includes('本學年未執行的課務'),
    '範本文案需為「本學年未執行的課務共N節」（若退回舊文案，生成的通知單會少這三個字）'
  );
  assert.ok(text.includes('本次輪值安排'), '範文需保留「本次輪值安排」');
  assert.ok(text.includes('尚有'), '範文需保留「尚有」');

  ['{{DEMAND}}', '{{ARRANGED}}', '{{REMAINING}}'].forEach((token) => {
    assert.ok(text.includes(token), '範本需保留完整佔位符 ' + token + '（被 Word 拆成多個 run 會導致數字空白）');
  });
});
