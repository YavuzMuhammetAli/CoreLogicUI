import { MODEL_ICON_CATEGORY_OF, MODEL_ICON_PATH_LOADERS } from './model-icons.generated';

/**
 * Model ikonu kataloğunun path yükleyicisi. Path'ler kategori başına ayrı lazy parçada durur
 * (bkz. scripts/generate-icons.mjs): model kartı yalnız kendi kategorisini indirir, seçici hepsini.
 * Yüklenen kategori uygulama ömrü boyunca bellekte kalır.
 */
const loaded = new Map<string, Readonly<Record<string, string>>>();
const pending = new Map<string, Promise<Readonly<Record<string, string>>>>();

/** Ad katalogda mı (kayıtlı ikon katalogdan çıkarılmışsa varsayılan çizilir). */
export function isModelIcon(name: string | null | undefined): name is string {
  return !!name && Object.prototype.hasOwnProperty.call(MODEL_ICON_CATEGORY_OF, name);
}

/** Kategorisi zaten yüklenmişse path'i hemen verir (yeniden çizimde titreme olmasın). */
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
      pending.delete(key);   // ağ hatası kalıcı olmasın; sonraki çizim yeniden dener
      throw err;
    });
    pending.set(key, p);
  }
  return p;
}

/** İkonun path'i; ad katalogda yoksa ya da yüklenemezse null (çağıran varsayılanı çizer). */
export async function resolveModelIconPath(name: string | null | undefined): Promise<string | null> {
  if (!isModelIcon(name)) return null;
  try {
    return (await loadCategory(MODEL_ICON_CATEGORY_OF[name]))[name] ?? null;
  } catch {
    return null;
  }
}

/** Tüm kategorileri yükler (seçici); ad → path. */
export async function loadAllModelIconPaths(): Promise<Readonly<Record<string, string>>> {
  const all = await Promise.all(Object.keys(MODEL_ICON_PATH_LOADERS).map(loadCategory));
  return Object.assign({}, ...all);
}
