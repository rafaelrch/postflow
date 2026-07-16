/**
 * Migração única: encontra imagens salvas como data-URL (base64) nas tabelas
 * carousels (profile_badge / global_settings / corners) e slides
 * (background_image_url / grid_image_url / content_image_url), sobe cada uma
 * pro Storage (bucket postflow-assets) e substitui o campo pela URL pública.
 *
 * Seguro e idempotente: o campo só é atualizado depois do upload confirmado
 * (verificado com um GET na URL pública), imagens idênticas viram um arquivo
 * só (hash do conteúdo) e rodar de novo não duplica nada (x-upsert).
 *
 * Uso: node scripts/migrate-base64-images.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no .env.local');
  process.exit(1);
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const BUCKET = 'postflow-assets';

async function rest(path, opts = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return opts.method ? null : res.json();
}

const uploaded = new Map(); // hash -> public URL
let bytesSaved = 0;

async function uploadDataUrl(dataUrl, userId) {
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/s);
  if (!match) return null;
  const [, mime, b64] = match;
  const hash = createHash('sha256').update(b64).digest('hex').slice(0, 16);
  if (uploaded.has(hash)) {
    bytesSaved += dataUrl.length;
    return uploaded.get(hash);
  }
  const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
  const path = `${userId}/migrated/${hash}.${ext}`;
  const bytes = Buffer.from(b64, 'base64');

  const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': mime, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!up.ok) throw new Error(`upload ${path}: ${up.status} ${await up.text()}`);

  const publicUrl = `${URL_BASE}/storage/v1/object/public/${BUCKET}/${path}`;
  const check = await fetch(publicUrl, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  if (!check.ok) throw new Error(`URL pública inacessível (${check.status}): ${publicUrl}`);

  uploaded.set(hash, publicUrl);
  bytesSaved += dataUrl.length;
  console.log(`  ↑ ${path} (${(bytes.length / 1024).toFixed(0)} KB)`);
  return publicUrl;
}

/** Substitui recursivamente strings data:image/... dentro de um JSON. */
async function replaceInJson(value, userId) {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/')) {
      const url = await uploadDataUrl(value, userId);
      return { value: url ?? value, changed: url !== null };
    }
    return { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = [];
    for (const item of value) {
      const r = await replaceInJson(item, userId);
      out.push(r.value);
      changed = changed || r.changed;
    }
    return { value: out, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = await replaceInJson(v, userId);
      out[k] = r.value;
      changed = changed || r.changed;
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

// ── Carrosséis ───────────────────────────────────────────────────────────────
const carousels = await rest('carousels?select=id,user_id,profile_badge,global_settings,corners');
const userByCarousel = new Map(carousels.map((c) => [c.id, c.user_id]));
let carouselsChanged = 0;

for (const c of carousels) {
  const patch = {};
  for (const field of ['profile_badge', 'global_settings', 'corners']) {
    const r = await replaceInJson(c[field], c.user_id);
    if (r.changed) patch[field] = r.value;
  }
  if (Object.keys(patch).length) {
    await rest(`carousels?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    carouselsChanged++;
    console.log(`✔ carousel ${c.id.slice(0, 8)}: ${Object.keys(patch).join(', ')}`);
  }
}

// ── Slides ───────────────────────────────────────────────────────────────────
const slides = await rest('slides?select=id,carousel_id,background_image_url,grid_image_url,content_image_url');
let slidesChanged = 0;

for (const s of slides) {
  const userId = userByCarousel.get(s.carousel_id);
  if (!userId) continue;
  const patch = {};
  for (const field of ['background_image_url', 'grid_image_url', 'content_image_url']) {
    const v = s[field];
    if (typeof v === 'string' && v.startsWith('data:image/')) {
      const url = await uploadDataUrl(v, userId);
      if (url) patch[field] = url;
    }
  }
  if (Object.keys(patch).length) {
    await rest(`slides?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    slidesChanged++;
    console.log(`✔ slide ${s.id.slice(0, 8)}: ${Object.keys(patch).join(', ')}`);
  }
}

console.log('\n── Resultado ──');
console.log(`Carrosséis atualizados: ${carouselsChanged}/${carousels.length}`);
console.log(`Slides atualizados: ${slidesChanged}/${slides.length}`);
console.log(`Arquivos únicos enviados ao Storage: ${uploaded.size}`);
console.log(`Base64 removido do banco: ${(bytesSaved / 1024 / 1024).toFixed(1)} MB`);
