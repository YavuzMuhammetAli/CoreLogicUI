// Material Symbols Outlined ikon kaydını üretir (wght 500 — 14–16 px düğmelerde 400 fazla ince kalıyor).
//
//   npm run icons
//
// Okur : src/app/components/shared/icon/icons.manifest.json  ({ outlined: [...], filled: [...] })
// Yazar: src/app/components/shared/icon/icons.generated.ts
//
// SVG'ler sabit sürümden CDN'den çekilir; paket devDependency DEĞİL (23 bin dosya, Docker `npm ci`'ı
// yavaşlatırdı). Üretilen dosya commit'lenir — build bu script'e ve ağa bağımlı değildir.
// Yeni ikon: adı manifest'e ekle (https://fonts.google.com/icons adıyla aynı), script'i koş.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.48.0';
const BASE = `https://cdn.jsdelivr.net/npm/@material-symbols/svg-500@${VERSION}/outlined`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'src/app/components/shared/icon');
const manifest = JSON.parse(await readFile(resolve(dir, 'icons.manifest.json'), 'utf8'));

const outlined = [...new Set(manifest.outlined)].sort();
const filled = [...new Set(manifest.filled)].sort();
const unknownFilled = filled.filter(n => !outlined.includes(n));
if (unknownFilled.length) fail(`"filled" listesindeki ad "outlined"da yok: ${unknownFilled.join(', ')}`);

async function path(file) {
  const res = await fetch(`${BASE}/${file}.svg`);
  if (!res.ok) fail(`${file}.svg alınamadı (${res.status}) — ad Material Symbols'ta var mı?`);
  const svg = await res.text();
  const ds = [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
  if (!ds.length) fail(`${file}.svg içinde path yok`);
  return ds.join('');
}

function fail(msg) {
  console.error(`generate-icons: ${msg}`);
  process.exit(1);
}

const entries = async (names, suffix) =>
  (await Promise.all(names.map(async n => [n, await path(n + suffix)])))
    .map(([n, d]) => `  ${/^[a-z_]\w*$/.test(n) ? n : `'${n}'`}: '${d}',`)
    .join('\n');

const out = `// OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: icons.manifest.json, komut: \`npm run icons\`.
// Material Symbols Outlined (wght 500, opsz 48) · @material-symbols/svg-500@${VERSION} · Apache-2.0
// viewBox "0 -960 960 960"

export const ICONS = {
${await entries(outlined, '')}
} as const;

export type IconName = keyof typeof ICONS;

/** Dolu (FILL=1) varyantı — yalnız manifest'te "filled" olarak işaretlenenler. */
export const ICONS_FILLED: Partial<Record<IconName, string>> = {
${await entries(filled, '-fill')}
};
`;

await writeFile(resolve(dir, 'icons.generated.ts'), out);
console.log(`generate-icons: ${outlined.length} ikon, ${filled.length} dolu varyant yazıldı.`);
