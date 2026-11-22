import { LayoutDesignerStore } from './layout-designer.store';

interface Doc { readonly value: string }

const serialize = (d: Doc) => JSON.stringify(d);

describe('LayoutDesignerStore', () => {
  it('a loaded document is not dirty; it gets dirty on change and clean again on undo', () => {
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

  it('consecutive changes with the same reason are a single undo step', () => {
    const store = new LayoutDesignerStore<Doc>({ value: '' }, serialize);
    store.dispatch('inspector:title:t1', () => ({ value: 'A' }), 1000);
    store.dispatch('inspector:title:t1', () => ({ value: 'Ab' }), 1200);
    store.undo();
    expect(store.doc().value).toBe('');
  });

  it('save treats the document used when sending the request as saved', () => {
    const store = new LayoutDesignerStore<Doc>({ value: 'a' }, serialize);
    store.dispatch('', () => ({ value: 'b' }), 1000);
    const sent = store.doc();
    store.dispatch('', () => ({ value: 'c' }), 2000);   // edit while the request is in flight
    store.markSaved(sent, 'damga');
    expect(store.dirty()).toBeTrue();
    expect(store.lastModifiedOn()).toBe('damga');
  });

  it('loading clears the selection', () => {
    const store = new LayoutDesignerStore<Doc>({ value: 'a' }, serialize);
    store.selection.set('f1');
    store.load({ value: 'a' }, null);
    expect(store.selection()).toBeNull();
  });
});
