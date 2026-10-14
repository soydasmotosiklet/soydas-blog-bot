import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlocksHtml, wrapContent, IKAS_EDITOR_STYLE } from '../src/render.js';

// Beklenen çıktılar ikas admin panelindeki parser'dan alındı.
test('ikas parser ile birebir aynı HTML', () => {
  const blocks = [
    { type: 'header', data: { text: 'Başlık', level: 2 } },
    { type: 'list', data: { style: 'unordered', items: ['a <b>b</b>', 'c'] } },
    { type: 'table', data: { withHeadings: true, content: [['A', 'B'], ['1', '2']] } },
    { type: 'paragraph', data: { text: 'p <a href="https://x.com">l</a>' } },
    { type: 'list', data: { style: 'ordered', items: ['a', 'b'] } },
    { type: 'header', data: { text: 'X', level: 3 } },
  ];
  assert.equal(
    renderBlocksHtml(blocks),
    '<h2>Başlık</h2><ul><li>a <b>b</b></li><li>c</li></ul><table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table><p class="editor-paragraph"> p <a href="https://x.com">l</a> </p><ol><li>a</li><li>b</li></ol><h3>X</h3>',
  );
});

test('görsel bloğu boyut ve stil ile (tarayıcı serileştirmesi)', () => {
  const url = 'https://cdn.myikas.com/images/m/i/image_1080.webp';
  const html = renderBlocksHtml(
    [{ type: 'image', data: { file: { url }, caption: 'Kapalı (full face) – Soydaş', withBorder: false, stretched: false, withBackground: false } }],
    { [url]: { width: 1080, height: 432 } },
  );
  assert.equal(
    html,
    `<figure class="editor-fig-img"><img class="editor-img   " src="${url}" alt="Kapalı (full face) – Soydaş" width="1080" height="432" style="max-width: 100%; aspect-ratio: 1080 / 432;"><figcaption class="editor-fig-cap">Kapalı (full face) – Soydaş</figcaption></figure>`,
  );
});

test('& işareti tarayıcı gibi kaçırılır', () => {
  assert.equal(renderBlocksHtml([{ type: 'paragraph', data: { text: 'a & b &amp; c' } }]), '<p class="editor-paragraph"> a &amp; b &amp; c </p>');
});

test('sarmalayıcı ve stil', () => {
  const w = wrapContent('<p>x</p>');
  assert.ok(w.startsWith('<html lang="en">\n          <style>.ikas-editor-v1>table'));
  assert.ok(w.endsWith('<p>x</p>\n          </div>\n          </html>\n  '));
  assert.equal(IKAS_EDITOR_STYLE.length, 1883);
});
