// ikas blog editörünün (Editor.js + ikas parser) ürettiği HTML'in birebir aynısını üretir.
// Format, ikas admin panelindeki parser'dan çıkarıldı (Ekim 2026).

export const IKAS_EDITOR_STYLE =
  '.ikas-editor-v1>table,td,th{border:1px solid #e8e8eb;border-collapse:collapse;font-size:14px}.ikas-editor-v1>th,td{padding:6px 12px}.ikas-editor-v1 ul,.ikas-editor-v1 ol{padding-left:20px}.ikas-editor-v1 ul li{list-style-type:disc;margin:8px 0 8px 16px}.ikas-editor-v1 ol li{list-style-type:decimal;margin:8px 0 8px 16px}.ikas-editor-v1 li{margin:8px 0 8px 16px}.ikas-editor-v1 code{display:block;white-space:pre-wrap}.ikas-editor-v1 blockquote{margin-inline-start:0;border-left:3px solid rgb(41 41 41);padding-left:23px}.ikas-editor-v1 figure{margin-inline:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0;width:100%}.ikas-editor-v1 img{max-width:800px;object-fit:cover;object-position:center}.ikas-editor-v1 img.img-bg{padding:1.5em!important;background:#cdd1e0!important}.ikas-editor-v1 img.img-fullwidth{width:100%!important;max-width:100%!important;margin:0 auto!important}.ikas-editor-v1 figcaption{text-align:center;padding-top:6px;word-break:break-word;font-size:12px;background:0 0;z-index:{};}.ikas-editor-v1 .embed-youtube{width:100%;height:400px}.ikas-editor-v1 a{color:#0070f3;text-decoration:underline;cursor:pointer}.ikas-editor-v1 a:hover{opacity:.8}.products-container{display:flex;flex-direction:column;gap:10px}.product-block-container{margin:0 auto;cursor:pointer;flex:1;display:flex;gap:20px;padding:10px 0}.product-image{width:120px;height:120px;object-fit:cover;border-radius:4px;flex-shrink:0}.product-name{font-size:15px;font-weight:500;width:100%;margin:0 0 4px}.product-brand{font-size:13px;font-weight:400;color:#adb5bd;margin:0 0 4px}.product-discount-price,.product-price{width:fit-content;font-size:16px;font-weight:500;color:#000}.product-price{margin:6px 0 0}.product-discount-price{margin:6px 8px 0 0;text-decoration:line-through}.ikas-editor-v1 table b{font-weight:bold}.ikas-editor-v1 table i{font-style:italic}';

const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Blok içi metin zaten sınırlı inline HTML (<b>, <i>, <a href>) içerir.
// Tarayıcının innerHTML serileştirmesine uyması için çıplak & işaretlerini kaçırır.
export const normalizeInline = (s) =>
  String(s ?? '').replace(/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/gi, '&amp;');

/**
 * Editor.js bloklarını ikas'ın sakladığı "content" HTML'ine çevirir.
 * imageSizes: { [url]: {width, height} } — ikas'ın sunduğu (1080px) görselin gerçek boyutu.
 */
export function renderBlocksHtml(blocks, imageSizes = {}) {
  return blocks
    .map((b) => {
      const d = b.data || {};
      switch (b.type) {
        case 'paragraph':
          return `<p class="editor-paragraph"> ${normalizeInline(d.text)} </p>`;
        case 'header':
          return `<h${d.level}>${normalizeInline(d.text)}</h${d.level}>`;
        case 'list': {
          const tag = d.style === 'ordered' ? 'ol' : 'ul';
          return `<${tag}>${(d.items || []).map((i) => `<li>${normalizeInline(i)}</li>`).join('')}</${tag}>`;
        }
        case 'table':
          return `<table><tbody>${(d.content || [])
            .map((row) => `<tr>${row.map((c) => `<td>${normalizeInline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`;
        case 'image': {
          const url = d.file?.url;
          const cap = d.caption || '';
          const sz = imageSizes[url];
          const dims = sz
            ? ` width="${sz.width}" height="${sz.height}" style="max-width: 100%; aspect-ratio: ${sz.width} / ${sz.height};"`
            : '';
          return `<figure class="editor-fig-img"><img class="editor-img   " src="${escAttr(url)}" alt="${escAttr(stripTags(cap))}"${dims}><figcaption class="editor-fig-cap">${normalizeInline(cap)}</figcaption></figure>`;
        }
        default:
          throw new Error('Desteklenmeyen blok tipi: ' + b.type);
      }
    })
    .join('');
}

export const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');

export function wrapContent(innerHtml) {
  return `<html lang="en">\n          <style>${IKAS_EDITOR_STYLE}</style>\n          <div class="ikas-editor-v1">\n          ${innerHtml}\n          </div>\n          </html>\n  `;
}

let blockCounter = 0;
export const blockId = () =>
  (Date.now().toString(36).slice(-5) + (++blockCounter).toString(36).padStart(5, '0')).slice(0, 10);

export function toContentData(blocks) {
  return JSON.stringify({
    time: Date.now(),
    blocks: blocks.map((b) => ({ id: b.id || blockId(), type: b.type, data: b.data })),
    version: '2.28.2',
  });
}

// GitHub issue önizlemesi için Markdown'a çevirir.
export function blocksToMarkdown(blocks) {
  const md = (s) =>
    String(s ?? '')
      .replace(/<b>(.*?)<\/b>/g, '**$1**')
      .replace(/<i>(.*?)<\/i>/g, '_$1_')
      .replace(/<a href="([^"]+)">(.*?)<\/a>/g, (m, h, t) => `[${t}](${h.startsWith('/') ? 'https://soydasmotosiklet.com' + h : h})`)
      .replace(/<[^>]+>/g, '');
  const out = [];
  for (const b of blocks) {
    const d = b.data;
    if (b.type === 'paragraph') out.push(md(d.text));
    else if (b.type === 'header') out.push('#'.repeat(d.level) + ' ' + md(d.text));
    else if (b.type === 'list') out.push(d.items.map((it, i) => (d.style === 'ordered' ? `${i + 1}. ` : '- ') + md(it)).join('\n'));
    else if (b.type === 'table') {
      const rows = d.content.map((r) => '| ' + r.map((c) => md(c).replace(/\|/g, '/')).join(' | ') + ' |');
      rows.splice(1, 0, '|' + d.content[0].map(() => ' --- ').join('|') + '|');
      out.push(rows.join('\n'));
    } else if (b.type === 'image') out.push(`![${stripTags(d.caption)}](${d.file.url})\n_${md(d.caption)}_`);
  }
  return out.join('\n\n');
}
