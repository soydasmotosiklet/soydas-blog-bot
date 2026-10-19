#!/usr/bin/env node
// Kullanım:
//   node src/cli.js draft [--topic "..."] [--feedback "..."]
//   node src/cli.js approve <slug>
//   node src/cli.js discard <slug>
//   node src/cli.js topic-of <slug>
//   node src/cli.js sync            → sitede yayına girenleri temizler (out/synced.json)
//   node src/cli.js refresh-images <slug> --title "..." --cover "eng query" [--inline "eng query"]
//                                   → fixes/<slug>/ (yayındaki yazının görsellerini yenilemek için)
//   node src/cli.js test-ikas       → ikas resmi API kontrolü (bilgi amaçlı)
import fs from 'node:fs';
import * as ikas from './ikas.js';
import path from 'node:path';
import { createDraft, draftIssueBody, approveDraft, discardDraft, getDraft, syncPublished, overdueDrafts, markAlerted, makePhotos } from './pipeline.js';
import { credit } from './images.js';

const [, , cmd, ...rest] = process.argv;
const arg = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const setOutput = (k, v) => {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<__EOF__\n${v}\n__EOF__\n`);
};

async function testIkas() {
  console.log('1) Token alınıyor…');
  await ikas.getToken();
  console.log('   ✓ Token alındı.');
  console.log('2) API şeması inceleniyor…');
  const schema = await ikas.introspect();
  const pick = (l) => l.filter((n) => /blog|image|upload/i.test(n));
  console.log('   Blog/görsel sorguları :', pick(schema.queries).join(', ') || '(yok)');
  console.log('   Blog/görsel işlemleri :', pick(schema.mutations).join(', ') || '(yok)');
}

async function main() {
  switch (cmd) {
    case 'test-ikas':
      return testIkas();
    case 'draft': {
      const draft = await createDraft({ topic: arg('topic'), feedback: arg('feedback') });
      fs.mkdirSync('out', { recursive: true });
      if (draft.skipped) {
        setOutput('skipped', draft.quiet ? 'quiet' : 'true');
        console.log('Yeni yazı üretilmedi:', draft.reason);
        return;
      }
      fs.writeFileSync('out/issue.md', draftIssueBody(draft));
      setOutput('slug', draft.slug);
      setOutput('title', draft.title);
      console.log(`Taslak hazır: ${draft.title} (${draft.slug})`);
      return;
    }
    case 'approve': {
      const d = approveDraft(rest[0]);
      console.log('Onaylandı:', d.title);
      return;
    }
    case 'discard':
      discardDraft(rest[0]);
      console.log('Taslak silindi:', rest[0]);
      return;
    case 'topic-of': {
      const d = getDraft(rest[0]);
      console.log(d?.topic || '');
      return;
    }
    case 'sync': {
      const done = await syncPublished();
      fs.mkdirSync('out', { recursive: true });
      fs.writeFileSync('out/synced.json', JSON.stringify(done));
      const late = overdueDrafts();
      late.forEach((d) => markAlerted(d.slug));
      fs.writeFileSync('out/overdue.json', JSON.stringify(late.map((d) => ({ slug: d.slug }))));
      if (late.length) console.log('Gecikenler:', late.map((d) => d.slug).join(', '));
      console.log(done.length ? `Yayına girenler: ${done.map((d) => d.slug).join(', ')}` : 'Yeni yayın yok.');
      return;
    }
    case 'refresh-images': {
      const slug = rest[0];
      if (!slug || !arg('title') || !arg('cover')) throw new Error('Kullanım: refresh-images <slug> --title "..." --cover "query" [--inline "query"]');
      const post = { title: arg('title'), coverQuery: arg('cover'), coverQueryAlt: arg('cover-alt') || arg('inline'), inlineQuery: arg('inline') || arg('cover') };
      const { coverPhoto, coverBuf, inlinePhoto, inlineBuf } = await makePhotos(post);
      if (!coverPhoto) throw new Error('Uygun fotoğraf bulunamadı (PIXABAY_API_KEY tanımlı mı?)');
      const dir = path.join('fixes', slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'cover.jpg'), coverBuf);
      const fix = { slug, coverCredit: credit(coverPhoto, 'Kapak fotoğrafı'), images: { cover: 'cover.jpg' } };
      if (inlinePhoto) {
        fs.writeFileSync(path.join(dir, 'inline.jpg'), inlineBuf);
        fix.images.inline = 'inline.jpg';
        fix.inlineCredit = credit(inlinePhoto);
        fix.inlineSize = { width: 1080, height: 675 };
      }
      fs.writeFileSync(path.join(dir, 'fix.json'), JSON.stringify(fix, null, 2));
      console.log('Görseller hazır:', dir, coverPhoto.links.html, inlinePhoto?.links.html || '');
      return;
    }
    default:
      console.log('Komutlar: draft | approve <slug> | discard <slug> | topic-of <slug> | sync | refresh-images <slug> | test-ikas');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
