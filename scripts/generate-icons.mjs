// Material Symbols Outlined ikon kaydını üretir (wght 500 — 14–16 px düğmelerde 400 fazla ince kalıyor).
//
//   npm run icons
//
// Okur : src/app/components/shared/icon/icons.manifest.json  ({ outlined: [...], filled: [...] })
// Yazar: src/app/components/shared/icon/icons.generated.ts
//
// Ayrıca (dosya varsa) model ikonu kataloğu — admin'in yayınlarken seçtiği ikonlar:
// Okur : src/app/components/shared/model-icon/model-icons.manifest.json
//        ({ categories: [{ key, icons: { ad: "tr anahtar kelimeler" } }] })
// Yazar: src/app/components/shared/model-icon/model-icons.generated.ts (dizin) + paths/{kategori}.generated.ts (lazy parçalar)
//
// SVG'ler sabit sürümden CDN'den çekilir; paket devDependency DEĞİL (23 bin dosya, Docker `npm ci`'ı
// yavaşlatırdı). Üretilen dosya commit'lenir — build bu script'e ve ağa bağımlı değildir.
// Yeni ikon: adı manifest'e ekle (https://fonts.google.com/icons adıyla aynı), script'i koş.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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

// CDN'e aynı anda en fazla bu kadar istek (yüzlerce ikonda hız sınırına takılmasın).
const CONCURRENCY = 16;
let active = 0;
const waiting = [];
async function limited(fn) {
  if (active >= CONCURRENCY) await new Promise(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

async function path(file) {
  const res = await limited(() => fetch(`${BASE}/${file}.svg`));
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

// ── Model ikonu kataloğu ───────────────────────────────────────────────────────────
const modelDir = resolve(root, 'src/app/components/shared/model-icon');
const modelManifestPath = resolve(modelDir, 'model-icons.manifest.json');
if (await access(modelManifestPath).then(() => true, () => false)) {
  const { categories } = JSON.parse(await readFile(modelManifestPath, 'utf8'));
  const names = categories.flatMap(c => Object.keys(c.icons));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) fail(`model ikonu birden çok kategoride: ${[...new Set(dup)].join(', ')}`);

  const quote = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const cats = categories.map(c => [
    `  { key: ${quote(c.key)}, icons: [`,
    ...Object.entries(c.icons).map(([n, k]) => `    { name: ${quote(n)}, keywords: ${quote(k)} },`),
    '  ] },'
  ].join('\n')).join('\n');

  // Path'ler kategori başına ayrı parçada: model kartı yalnız kendi kategorisini (~5 KB gzip) indirir,
  // 250+ ikonun tamamı (~70 KB gzip) yalnız seçici açılınca iner.
  const header = `// OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: model-icons.manifest.json, komut: \`npm run icons\`.
// Material Symbols Outlined (wght 500, opsz 48) · @material-symbols/svg-500@${VERSION} · Apache-2.0`;
  await mkdir(resolve(modelDir, 'paths'), { recursive: true });
  for (const c of categories) {
    await writeFile(resolve(modelDir, 'paths', `${c.key}.generated.ts`), `${header}
// viewBox "0 -960 960 960". Yalnız model-icons.generated.ts → MODEL_ICON_PATH_LOADERS dinamik import eder.

export const PATHS: Readonly<Record<string, string>> = {
${await entries(Object.keys(c.icons).sort(), '')}
};
`);
  }

  const categoryOf = categories.flatMap(c => Object.keys(c.icons).sort().map(n => `  ${quote(n)}: ${quote(c.key)},`)).join('\n');
  const loaders = categories.map(c => `  ${quote(c.key)}: () => import('./paths/${c.key}.generated').then(m => m.PATHS),`).join('\n');

  await writeFile(resolve(modelDir, 'model-icons.generated.ts'), `${header}
// Katalog dizini (ad, anahtar kelime, kategori) — path YOK; path'ler kategori başına lazy parçada.

export interface ModelIconEntry { readonly name: string; readonly keywords: string; }
export interface ModelIconCategory { readonly key: string; readonly icons: readonly ModelIconEntry[]; }

export const MODEL_ICON_CATEGORIES: readonly ModelIconCategory[] = [
${cats}
];

/** İkon adı → kategori anahtarı. */
export const MODEL_ICON_CATEGORY_OF: Readonly<Record<string, string>> = {
${categoryOf}
};

/** Kategori anahtarı → o kategorinin path'lerini yükleyen dinamik import. */
export const MODEL_ICON_PATH_LOADERS: Readonly<Record<string, () => Promise<Readonly<Record<string, string>>>>> = {
${loaders}
};
`);
  console.log(`generate-icons: ${names.length} model ikonu, ${categories.length} kategori yazıldı.`);
}
