import { LayoutDesignerStore } from './layout-designer.store';

interface Doc { readonly value: string }

const serialize = (d: Doc) => JSON.stringify(d);

describe('LayoutDesignerStore', () => {
  it('yüklenen belge kirli değildir; değişince kirlenir, geri alınca temizlenir', () => {
    const store = new LayoutDesignerStore<Doc>({ value: 'a' }, serialize);
    store.load({ value: 'b' }, '2026-10-20T10:00:00');
    expect(store.dirty()).toBeFalse();
    expect(store.lastModifiedOn()).toBe('2026-10-20T10:00:00');

    store.dispatch('', () => ({ value: 'c' }), 1000);
    expect(store.dirty()).toBeTrue();
    expect(store.canUndo()).toBeTrue();

    store.undo();
    expect(store.doc().value).toBe('b');
    expect(store.dirty()).toBeFalse();
    store.redo();
    expect(store.doc().value).toBe('c');
  });

  it('aynı sebeple ardışık değişiklikler tek geri al adımıdır', () => {
    const store = new LayoutDesignerStore<Doc>({ value: '' }, serialize);
    store.dispatch('inspector:title:t1', () => ({ value: 'A' }), 1000);
    store.dispatch('inspector:title:t1', () => ({ value: 'Ab' }), 1200);
    store.undo();
    expect(store.doc().value).toBe('');
  });

  it('kayıt, istek gönderilirken kullanılan belgeyi kaydedilmiş sayar', () => {
    const store = new LayoutDesignerStore<Doc>({ value: 'a' }, serialize);
    store.dispatch('', () => ({ value: 'b' }), 1000);
    const sent = store.doc();
    store.dispatch('', () => ({ value: 'c' }), 2000);   // istek sürerken düzenleme
    store.markSaved(sent, 'damga');
    expect(store.dirty()).toBeTrue();
    expect(store.lastModifiedOn()).toBe('damga');
  });

  it('yükleme seçimi temizler', () => {
    const store = new LayoutDesignerStore<Doc>({ value: 'a' }, serialize);
    store.selection.set('f1');
    store.load({ value: 'a' }, null);
    expect(store.selection()).toBeNull();
  });
});
