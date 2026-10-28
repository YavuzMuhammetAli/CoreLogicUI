import manifest from './model-icons.manifest.json';
import { MODEL_ICON_CATEGORIES, MODEL_ICON_CATEGORY_OF, MODEL_ICON_PATH_LOADERS } from './model-icons.generated';
import { isModelIcon, loadAllModelIconPaths, peekModelIconPath, resolveModelIconPath } from './model-icon-catalog';

describe('model ikonu kataloğu', () => {
  it('üretilen dizin manifest ile eşit (npm run icons koşulmuş)', () => {
    const fromManifest = (manifest.categories as unknown as { key: string; icons: Record<string, string> }[])
      .map(c => ({ key: c.key, icons: Object.keys(c.icons) }));
    const generated = MODEL_ICON_CATEGORIES.map(c => ({ key: c.key, icons: c.icons.map(i => i.name) }));
    expect(generated).toEqual(fromManifest);
    expect(Object.keys(MODEL_ICON_PATH_LOADERS)).toEqual(fromManifest.map(c => c.key));
  });

  it('her ad tek kategoride ve sunucu desenine uyuyor (^[a-z0-9_]{1,40}$)', () => {
    const names = MODEL_ICON_CATEGORIES.flatMap(c => c.icons.map(i => i.name));
    expect(new Set(names).size).toBe(names.length);
    names.forEach(n => expect(n).toMatch(/^[a-z0-9_]{1,40}$/));
    names.forEach(n => expect(isModelIcon(n)).toBeTrue());
  });

  it('her kategori parçası kendi adlarının path\'ini taşır', async () => {
    const all = await loadAllModelIconPaths();
    for (const name of Object.keys(MODEL_ICON_CATEGORY_OF)) {
      expect(all[name]).withContext(name).toMatch(/^[Mm]/);
    }
  });

  it('bilinmeyen ya da boş ad null döner; yüklenen kategori senkron okunur', async () => {
    expect(isModelIcon('yok_boyle_ikon')).toBeFalse();
    expect(await resolveModelIconPath('yok_boyle_ikon')).toBeNull();
    expect(await resolveModelIconPath(null)).toBeNull();
    expect(isModelIcon('constructor')).toBeFalse();

    const d = await resolveModelIconPath('inventory_2');
    expect(d).toMatch(/^[Mm]/);
    expect(peekModelIconPath('inventory_2')).toBe(d);
  });
});
