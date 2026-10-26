import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAX_BACKOFF_MS, startVisiblePoll } from './visible-poll';

/** Görünürlüğü elle değiştirilebilen sahte belge. */
function fakeDocument() {
  const listeners: (() => void)[] = [];
  const doc = {
    hidden: false,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.splice(listeners.indexOf(fn), 1),
    setHidden(hidden: boolean) { this.hidden = hidden; listeners.slice().forEach(fn => fn()); },
    listenerCount: () => listeners.length
  };
  return doc;
}

describe('startVisiblePoll', () => {
  it('hemen ve sonra aralıkla çalışır', fakeAsync(() => {
    const doc = fakeDocument();
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return of(1); }, 1000, doc as unknown as Document);

    expect(calls).toBe(1);
    tick(1000);
    expect(calls).toBe(2);
    poll.stop();
  }));

  it('sekme gizliyken durur, görünür olunca hemen tazeler', fakeAsync(() => {
    const doc = fakeDocument();
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return of(1); }, 1000, doc as unknown as Document);

    doc.setHidden(true);
    tick(5000);
    expect(calls).toBe(1);

    doc.setHidden(false);
    expect(calls).toBe(2);
    poll.stop();
  }));

  it('hatada aralığı katlar, başarıda düzeltir', fakeAsync(() => {
    const doc = fakeDocument();
    let fail = true;
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return fail ? throwError(() => new Error('x')) : of(1); },
      1000, doc as unknown as Document);

    tick(1999);
    expect(calls).toBe(1);          // ilk hata: sonraki 2 sn sonra
    tick(1);
    expect(calls).toBe(2);          // ikinci hata: sonraki 4 sn sonra
    fail = false;
    tick(4000);
    expect(calls).toBe(3);          // başarı: aralık yeniden 1 sn
    tick(1000);
    expect(calls).toBe(4);
    poll.stop();
  }));

  it('geri çekilme üst sınırı aşmaz ve stop dinleyiciyi kaldırır', fakeAsync(() => {
    const doc = fakeDocument();
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return throwError(() => new Error('x')); },
      MAX_BACKOFF_MS, doc as unknown as Document);

    tick(MAX_BACKOFF_MS);
    expect(calls).toBe(2);
    poll.stop();
    expect(doc.listenerCount()).toBe(0);
    tick(MAX_BACKOFF_MS * 2);
    expect(calls).toBe(2);
  }));
});
