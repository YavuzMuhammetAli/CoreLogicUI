import { fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAX_BACKOFF_MS, startVisiblePoll } from './visible-poll';

/** Fake document whose visibility can be changed manually. */
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
  it('runs immediately and then at the interval', fakeAsync(() => {
    const doc = fakeDocument();
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return of(1); }, 1000, doc as unknown as Document);

    expect(calls).toBe(1);
    tick(1000);
    expect(calls).toBe(2);
    poll.stop();
  }));

  it('stops while the tab is hidden, refreshes immediately when visible', fakeAsync(() => {
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

  it('doubles the interval on error, resets it on success', fakeAsync(() => {
    const doc = fakeDocument();
    let fail = true;
    let calls = 0;
    const poll = startVisiblePoll(() => { calls++; return fail ? throwError(() => new Error('x')) : of(1); },
      1000, doc as unknown as Document);

    tick(1999);
    expect(calls).toBe(1);          // first error: next one after 2 s
    tick(1);
    expect(calls).toBe(2);          // second error: next one after 4 s
    fail = false;
    tick(4000);
    expect(calls).toBe(3);          // success: interval back to 1 s
    tick(1000);
    expect(calls).toBe(4);
    poll.stop();
  }));

  it('backoff does not exceed the cap and stop removes the listener', fakeAsync(() => {
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
