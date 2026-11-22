import { MODEL_ICON_CATEGORY_OF, MODEL_ICON_PATH_LOADERS } from './model-icons.generated';

/**
 * Path loader for the model icon catalog. Paths live in a separate lazy chunk per category
 * (see scripts/generate-icons.mjs): a model card downloads only its own category, the picker all of them.
 * A loaded category stays in memory for the lifetime of the app.
 */
const loaded = new Map<string, Readonly<Record<string, string>>>();
const pending = new Map<string, Promise<Readonly<Record<string, string>>>>();

/** Whether the name is in the catalog (if a saved icon was removed from the catalog, the default is drawn). */
export function isModelIcon(name: string | null | undefined): name is string {
  return !!name && Object.prototype.hasOwnProperty.call(MODEL_ICON_CATEGORY_OF, name);
}

/** Returns the path immediately if its category is already loaded (no flicker on re-render). */
export function peekModelIconPath(name: string | null | undefined): string | null {
  if (!isModelIcon(name)) return null;
  return loaded.get(MODEL_ICON_CATEGORY_OF[name])?.[name] ?? null;
}

function loadCategory(key: string): Promise<Readonly<Record<string, string>>> {
  const hit = loaded.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = MODEL_ICON_PATH_LOADERS[key]().then(paths => {
      loaded.set(key, paths);
      pending.delete(key);
      return paths;
    }, err => {
      pending.delete(key);   // a network error must not stick; the next render retries
      throw err;
    });
    pending.set(key, p);
  }
  return p;
}

/** The icon's path; null if the name isn't in the catalog or can't be loaded (the caller draws the default). */
export async function resolveModelIconPath(name: string | null | undefined): Promise<string | null> {
  if (!isModelIcon(name)) return null;
  try {
    return (await loadCategory(MODEL_ICON_CATEGORY_OF[name]))[name] ?? null;
  } catch {
    return null;
  }
}

/** Loads all categories (picker); name → path. */
export async function loadAllModelIconPaths(): Promise<Readonly<Record<string, string>>> {
  const all = await Promise.all(Object.keys(MODEL_ICON_PATH_LOADERS).map(loadCategory));
  return Object.assign({}, ...all);
}
