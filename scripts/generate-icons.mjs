// Generates the Material Symbols Outlined icon registry (wght 500 — 400 is too thin on 14–16 px buttons).
//
//   npm run icons
//
// Reads : src/app/components/shared/icon/icons.manifest.json  ({ outlined: [...], filled: [...] })
// Writes: src/app/components/shared/icon/icons.generated.ts
//
// Also (if the file exists) the model icon catalog — the icons the admin picks when publishing:
// Reads : src/app/components/shared/model-icon/model-icons.manifest.json
//        ({ categories: [{ key, icons: { name: "tr keywords" } }] })
// Writes: src/app/components/shared/model-icon/model-icons.generated.ts (index) + paths/{category}.generated.ts (lazy chunks)
//
// SVGs are fetched from the CDN at a pinned version; the package is NOT a devDependency (23k files, it would
// slow down Docker `npm ci`). The generated file is committed — the build does not depend on this script or the network.
// New icon: add its name to the manifest (same as the name on https://fonts.google.com/icons), run the script.
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
if (unknownFilled.length) fail(`name in the "filled" list is missing from "outlined": ${unknownFilled.join(', ')}`);

// At most this many concurrent requests to the CDN (so hundreds of icons don't hit the rate limit).
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
  if (!res.ok) fail(`could not fetch ${file}.svg (${res.status}) — does the name exist in Material Symbols?`);
  const svg = await res.text();
  const ds = [...svg.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
  if (!ds.length) fail(`no path in ${file}.svg`);
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

const out = `// AUTO-GENERATED — do not edit by hand. Source: icons.manifest.json, command: \`npm run icons\`.
// Material Symbols Outlined (wght 500, opsz 48) · @material-symbols/svg-500@${VERSION} · Apache-2.0
// viewBox "0 -960 960 960"

export const ICONS = {
${await entries(outlined, '')}
} as const;

export type IconName = keyof typeof ICONS;

/** Filled (FILL=1) variant — only icons marked "filled" in the manifest. */
export const ICONS_FILLED: Partial<Record<IconName, string>> = {
${await entries(filled, '-fill')}
};
`;

await writeFile(resolve(dir, 'icons.generated.ts'), out);
console.log(`generate-icons: wrote ${outlined.length} icons, ${filled.length} filled variants.`);

// ── Model icon catalog ─────────────────────────────────────────────────────────────
const modelDir = resolve(root, 'src/app/components/shared/model-icon');
const modelManifestPath = resolve(modelDir, 'model-icons.manifest.json');
if (await access(modelManifestPath).then(() => true, () => false)) {
  const { categories } = JSON.parse(await readFile(modelManifestPath, 'utf8'));
  const names = categories.flatMap(c => Object.keys(c.icons));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) fail(`model icon in more than one category: ${[...new Set(dup)].join(', ')}`);

  const quote = s => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const cats = categories.map(c => [
    `  { key: ${quote(c.key)}, icons: [`,
    ...Object.entries(c.icons).map(([n, k]) => `    { name: ${quote(n)}, keywords: ${quote(k)} },`),
    '  ] },'
  ].join('\n')).join('\n');

  // Paths are in a separate chunk per category: a model card downloads only its own category (~5 KB gzip),
  // all 250+ icons (~70 KB gzip) load only when the picker opens.
  const header = `// AUTO-GENERATED — do not edit by hand. Source: model-icons.manifest.json, command: \`npm run icons\`.
// Material Symbols Outlined (wght 500, opsz 48) · @material-symbols/svg-500@${VERSION} · Apache-2.0`;
  await mkdir(resolve(modelDir, 'paths'), { recursive: true });
  for (const c of categories) {
    await writeFile(resolve(modelDir, 'paths', `${c.key}.generated.ts`), `${header}
// viewBox "0 -960 960 960". Dynamically imported only by model-icons.generated.ts → MODEL_ICON_PATH_LOADERS.

export const PATHS: Readonly<Record<string, string>> = {
${await entries(Object.keys(c.icons).sort(), '')}
};
`);
  }

  const categoryOf = categories.flatMap(c => Object.keys(c.icons).sort().map(n => `  ${quote(n)}: ${quote(c.key)},`)).join('\n');
  const loaders = categories.map(c => `  ${quote(c.key)}: () => import('./paths/${c.key}.generated').then(m => m.PATHS),`).join('\n');

  await writeFile(resolve(modelDir, 'model-icons.generated.ts'), `${header}
// Catalog index (name, keywords, category) — NO paths; paths live in lazy per-category chunks.

export interface ModelIconEntry { readonly name: string; readonly keywords: string; }
export interface ModelIconCategory { readonly key: string; readonly icons: readonly ModelIconEntry[]; }

export const MODEL_ICON_CATEGORIES: readonly ModelIconCategory[] = [
${cats}
];

/** Icon name → category key. */
export const MODEL_ICON_CATEGORY_OF: Readonly<Record<string, string>> = {
${categoryOf}
};

/** Category key → dynamic import that loads that category's paths. */
export const MODEL_ICON_PATH_LOADERS: Readonly<Record<string, () => Promise<Readonly<Record<string, string>>>>> = {
${loaders}
};
`);
  console.log(`generate-icons: wrote ${names.length} model icons, ${categories.length} categories.`);
}
