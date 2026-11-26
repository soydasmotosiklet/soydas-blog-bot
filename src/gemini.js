// Gemini (Nano Banana) ile gerçekçi blog görseli üretimi + Claude ile görsel kontrolü.
import sharp from 'sharp';
import { config } from './config.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Yanıttaki ilk görseli (base64) bulur; API sürümünden bağımsız olsun diye JSON'u gezer.
export function findImage(obj) {
  let found = null;
  const walk = (o) => {
    if (found || !o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    const mime = o.mime_type || o.mimeType || '';
    if (typeof o.data === 'string' && o.data.length > 1000 && (/^image\//.test(mime) || o.type === 'image')) {
      found = o.data;
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(obj);
  return found ? Buffer.from(found, 'base64') : null;
}

const STYLE = [
  'Photorealistic editorial photograph, indistinguishable from a real photo taken by a professional photographer',
  'full-frame DSLR, 35mm lens, natural light, true-to-life materials, reflections and proportions, slight depth of field',
  'wide 16:9 landscape composition, main subject centred with breathing room on all sides (the image is cropped to a wide banner and a white title is overlaid in the middle)',
  'setting feels like Turkey: an Istanbul street, a parking area or a clean, organised local motorcycle service workshop',
  'NO text, NO captions, NO watermarks, NO brand logos or badges, NO readable licence plates, NO visible faces',
  'no cartoon, no 3D render look, no oversaturated HDR, no extra or melted parts',
].join('. ');

async function callInteractions(prompt, refs, { aspect, size, search }) {
  const input = [{ type: 'text', text: prompt }, ...refs.map((b) => ({ type: 'image', mime_type: 'image/jpeg', data: b.toString('base64') }))];
  const body = { model: config.gemini.model, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: aspect, image_size: size } };
  if (search) body.tools = [{ type: 'google_search' }];
  const res = await fetch(`${BASE}/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return findImage(j);
}

async function callGenerateContent(prompt, refs, { aspect }) {
  const parts = [{ text: prompt }, ...refs.map((b) => ({ inline_data: { mime_type: 'image/jpeg', data: b.toString('base64') } }))];
  const res = await fetch(`${BASE}/models/${config.gemini.fallbackModel}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': config.gemini.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini (yedek) HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return findImage(j);
}

/** Tek görsel üretir. refs: referans olarak verilecek (ör. mağaza ürün) fotoğrafları. */
export async function geminiImage(scene, { refs = [], aspect = '16:9', size = '2K', search = false, extra = '' } = {}) {
  if (!config.gemini.apiKey) return null;
  const refNote = refs.length
    ? ' The attached reference photos are real products sold by the store: reproduce those exact parts faithfully (shape, colour, material) inside the scene, as if photographed on location.'
    : '';
  const prompt = `${scene}.${refNote} ${extra ? extra + '. ' : ''}${STYLE}.`;
  const small = await Promise.all(refs.slice(0, 3).map((b) => sharp(b).flatten({ background: '#fff' }).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer()));
  try {
    return await callInteractions(prompt, small, { aspect, size, search });
  } catch (e) {
    console.log('  Gemini interactions başarısız, yedek uç deneniyor:', e.message);
    return callGenerateContent(prompt, small, { aspect });
  }
}

/**
 * Claude ile üretilen görseli puanlar (0-10). Model detaylarında küçük farklar kabul; ciddi sorunlar puanı düşürür.
 */
export async function checkImage(buf, { topic, scene, purpose }) {
  if (!config.claude.apiKey) return { score: 8, reason: 'denetim yok' };
  const prev = await sharp(buf).resize(1024, 640, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const { pickModel } = await import('./content.js');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.claude.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: await pickModel(),
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: prev.toString('base64') } },
          {
            type: 'text',
            text: `Bu görsel bir motosiklet yedek parça mağazasının "${topic}" başlıklı blog yazısının ${purpose} görseli olacak. İstenen sahne: "${scene}".
Bir blog editörü gibi 0-10 arası puan ver. Ölçüt: okuyucu bunu gerçek bir fotoğraf sanar mı ve konuya uygun mu?
PUANI CİDDİ DÜŞÜREN (en fazla 4) sorunlar: çizim/3D/plastik oyuncak görünümü; yanlış araç tipi (scooter yerine motosiklet vb.); bariz bozukluk (eriyen/fazla/eksik parça, bozuk tekerlek, anlamsız mekanik); üstüne bindirilmiş yazı/filigran; okunur plaka; konu dışı sahne.
KÜÇÜK kusurlar (puanı en fazla 1-2 düşürür): modelin far/kaporta detayında küçük farklar, araç üzerindeki doğal model yazısı veya amblem, biraz fazla temiz/parlak görünüm.
Yanıt biçimi — ilk satır: PUAN: <sayı>
ikinci satır: varsa en önemli sorunlar için İngilizce, kısa düzeltme talimatı.`,
          },
        ],
      }],
    }),
  });
  const j = await res.json().catch(() => ({}));
  const txt = String(j.content?.find?.((x) => x.type === 'text')?.text || '').trim();
  const m = txt.match(/PUAN\s*:\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return { score: 6, reason: txt.slice(0, 200) || 'denetim yanıtı yok' };
  return { score: parseFloat(m[1].replace(',', '.')), reason: txt.split('\n').slice(1).join(' ').trim() };
}

export const AI_MIN_SCORE = 7; // bu puan ve üstü hemen kabul
export const AI_FLOOR = 6; // denemelerin en iyisi en az bu puandaysa kullanılır

/**
 * Üret → puanla → gerekirse düzeltme notuyla yeniden üret (en fazla `tries` kez).
 * ≥7 olan ilk görsel kabul edilir; yoksa en iyi deneme ≥6 ise o, değilse null (stok fotoğrafa düşülür).
 * saveDir verilirse tüm denemeler incelemek için kaydedilir.
 */
export async function makeAiPhoto(scene, { topic, purpose, refs = [], search = false, tries = 3, log = console.log, saveDir = null } = {}) {
  let extra = '';
  let best = null;
  for (let i = 1; i <= tries; i++) {
    let buf;
    try {
      buf = await geminiImage(scene, { refs, search, extra });
    } catch (e) {
      log(`  Gemini hatası (${purpose}, deneme ${i}):`, e.message);
      continue;
    }
    if (!buf) { log(`  Gemini görsel döndürmedi (${purpose}, deneme ${i})`); continue; }
    const v = await checkImage(buf, { topic, scene, purpose });
    log(`  ${purpose} denetimi (deneme ${i}): PUAN ${v.score} - ${v.reason}`);
    if (saveDir) {
      const fs = await import('node:fs');
      fs.mkdirSync(saveDir, { recursive: true });
      fs.writeFileSync(`${saveDir}/${purpose.replace(/\W+/g, '-')}-${i}-puan${v.score}.jpg`, await sharp(buf).resize(1280, 720, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer());
    }
    if (!best || v.score > best.score) best = { buf, score: v.score };
    if (v.score >= AI_MIN_SCORE) return buf;
    extra = `Fix these problems from the previous attempt: ${v.reason}`;
  }
  if (best && best.score >= AI_FLOOR) { log(`  ${purpose}: en iyi deneme kullanılıyor (puan ${best.score})`); return best.buf; }
  return null;
}

export const aiPhoto = (id) => ({ provider: 'gemini', id, user: { name: 'Gemini', links: { html: '' } }, links: { html: '' } });
