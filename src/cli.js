#!/usr/bin/env node
// Kullanım:
//   node src/cli.js test-ikas                 → ikas API bağlantısını ve blog yetkisini test eder
//   node src/cli.js draft [--topic "..."] [--feedback "..."] [--dry]
//   node src/cli.js publish <slug>
//   node src/cli.js discard <slug>
import fs from 'node:fs';
import * as ikas from './ikas.js';
import { createDraft, draftIssueBody, publishDraft, discardDraft, getDraft } from './pipeline.js';

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
  let schema;
  try {
    schema = await ikas.introspect();
  } catch (e) {
    console.log('   ! Şema okunamadı:', e.message);
  }
  if (schema) {
    const pick = (l) => l.filter((n) => /blog|image|upload|storefront/i.test(n));
    console.log('   Blog/görsel sorguları :', pick(schema.queries).join(', ') || '(yok)');
    console.log('   Blog/görsel işlemleri :', pick(schema.mutations).join(', ') || '(yok)');
    for (const t of ['BlogInput', 'Blog']) {
      try {
        const d = await ikas.describeType(t);
        if (d) console.log(`   ${t} alanları:`, (d.inputFields || d.fields || []).map((f) => f.name).join(', '));
      } catch {}
    }
  }
  console.log('3) Blog listesi okunuyor…');
  try {
    const blogs = await ikas.listBlogs();
    console.log(`   ✓ ${blogs.length} blog bulundu:`, blogs.map((b) => b.title).join(' | '));
  } catch (e) {
    console.log('   ✗ Blog listesi okunamadı:', e.message);
  }
  console.log('4) Görsel yükleme adresi isteniyor (dosya yüklenmez)…');
  try {
    const d = await ikas.gql(
      `query getImageUploadUrl($imageDir: String, $imageId: String!) { getImageUploadUrl(imageDir: $imageDir, imageId: $imageId) }`,
      { imageId: crypto.randomUUID() },
      'getImageUploadUrl',
    );
    console.log(d.getImageUploadUrl ? '   ✓ Görsel yükleme destekleniyor.' : '   ✗ Boş yanıt.');
  } catch (e) {
    console.log('   ✗ Görsel yükleme adresi alınamadı:', e.message);
  }
}

async function main() {
  switch (cmd) {
    case 'test-ikas':
      return testIkas();
    case 'draft': {
      const draft = await createDraft({ topic: arg('topic'), feedback: arg('feedback'), skipIkas: rest.includes('--dry') });
      const body = draftIssueBody(draft);
      fs.mkdirSync('out', { recursive: true });
      fs.writeFileSync('out/issue.md', body);
      setOutput('slug', draft.slug);
      setOutput('title', draft.title);
      console.log(`Taslak hazır: ${draft.title} (${draft.slug})`);
      return;
    }
    case 'publish': {
      const slug = rest[0];
      const r = await publishDraft(slug);
      setOutput('url', r.url);
      console.log(`Yayınlandı: ${r.url}`);
      return;
    }
    case 'discard':
      discardDraft(rest[0]);
      console.log('Taslak silindi:', rest[0]);
      return;
    case 'topic-of': {
      const d = getDraft(rest[0]);
      setOutput('topic', d?.topic || '');
      console.log(d?.topic || '');
      return;
    }
    default:
      console.log('Komutlar: test-ikas | draft [--topic] [--feedback] [--dry] | publish <slug> | discard <slug>');
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
