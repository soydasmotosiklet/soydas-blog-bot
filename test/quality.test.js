import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPost, wordCount, trimBlogLinks, autoFix } from '../src/quality.js';

const ctx = {
  inStock: new Set(['/p1', '/p2', '/p3']),
  allProducts: new Set(['/p1', '/p2', '/p3', '/tukendi']),
  collections: new Set(['/c1', '/c2']),
  blogPosts: new Set(['/blog/b1', '/blog/b2', '/blog/b3']),
  topic: 'Honda Dio Bakım ve Yedek Parça Rehberi',
};
const long = Array.from({ length: 820 }, () => 'kelime').join(' ');
const good = {
  slug: 'honda-dio-bakim-rehberi',
  seoTitle: 'Honda Dio Bakım Rehberi | Soydaş Motosiklet',
  seoDescription: 'x'.repeat(150),
  blocks: [
    { type: 'paragraph', text: long },
    { type: 'list', items: ['<a href="/p1">a</a>', '<a href="/p2">b</a>', '<a href="/p3">c</a>'] },
    { type: 'paragraph', text: '<a href="/c1">k1</a> <a href="/c2">k2</a> <a href="/blog/b1">yazı</a>' },
  ],
};

test('kılavuza uyan yazı geçer', () => {
  assert.deepEqual(checkPost(good, ctx), []);
  assert.ok(wordCount(good.blocks) >= 800);
});

test('eksikler tek tek yakalanır', () => {
  const bad = {
    ...good,
    slug: 'honda-dio-rehberi-2026',
    seoTitle: 'Honda Dio Bakım ve Yedek Parça Rehberi Uzun Başlık | Soydaş Motosiklet',
    seoDescription: 'kısa',
    blocks: [{ type: 'paragraph', text: 'Teknisyen gözüyle kısa yazı <a href="/tukendi">ürün</a> <a href="/blog/b1">1</a> <a href="/blog/b2">2</a> <a href="/blog/b3">3</a>' }],
  };
  const issues = checkPost(bad, ctx).join('\n');
  for (const k of ['kelime', 'ürün linki', 'Kategori linki', 'blog yazısı linki', 'stokta olmayan', 'SEO başlığı', 'Meta açıklama', 'yıl', 'Yasak ifade']) {
    assert.match(issues, new RegExp(k, 'i'), k);
  }
});

test('fazla blog linki düz metne çevrilir', () => {
  const p = { blocks: [{ type: 'paragraph', text: '<a href="/blog/b1">1</a> <a href="/blog/b2">2</a> <a href="/blog/b3">3</a> <a href="/blog/b1">1 tekrar</a> <a href="/p1">ürün</a>' }] };
  trimBlogLinks(p, ctx.blogPosts);
  assert.equal(p.blocks[0].text, '<a href="/blog/b1">1</a> <a href="/blog/b2">2</a> 3 <a href="/blog/b1">1 tekrar</a> <a href="/p1">ürün</a>');
});

test('küçük sorunlar otomatik düzeltilir', () => {
  const p = JSON.parse(JSON.stringify(good));
  p.slug = 'honda-dio-rehberi-2026';
  p.seoTitle = 'Honda Dio 2026 Bakım ve Yedek Parça Rehberi Çok Uzun Başlık | Soydaş Motosiklet';
  p.seoDescription = 'y '.repeat(100).trim();
  p.blocks.push({ type: 'paragraph', text: '<a href="/tukendi">ürün</a> <a href="/blog/b2">2</a> <a href="/blog/b3">3</a>' });
  autoFix(p, ctx);
  assert.deepEqual(checkPost(p, ctx), []);
  assert.ok(p.seoTitle.length <= 60 && p.seoTitle.endsWith('| Soydaş Motosiklet'));
  assert.equal(p.slug, 'honda-dio-rehberi');
});
