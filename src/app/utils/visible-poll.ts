import { Observable, Subscription } from 'rxjs';

/** A running poll; `stop()` removes the timer and the visibility listener. */
export interface VisiblePoll {
  stop(): void;
}

/** On error the interval doubles up to this cap. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Regular polling while the tab is VISIBLE (badge counters etc.).
 *
 * The task badge and the notification bell sent a request every 30 s in every open tab, even with the tab
 * in the background: 240 requests per user × tab × hour, each a server query. Here:
 *  - it stops when the tab is hidden, refreshes once IMMEDIATELY when visible and continues from there;
 *  - if the task errors the interval doubles (at most {@link MAX_BACKOFF_MS}), resetting on the first success;
 *  - a new request is not started while one is in flight.
 * The first run happens immediately (so the badge fills on page load).
 */
export function startVisiblePoll(
  task: () => Observable<unknown>,
  intervalMs: number,
  doc: Document = document
): VisiblePoll {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Subscription | null = null;
  let busy = false;
  let delay = intervalMs;
  let stopped = false;

  const clear = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    clear();
    if (!stopped && !doc.hidden) timer = setTimeout(run, delay);
  };

  const run = () => {
    timer = null;
    if (stopped || busy) return;
    busy = true;
    const finished = () => {
      busy = false;
      inFlight = null;
      schedule();
    };
    const subscription = task().subscribe({
      next: () => { delay = intervalMs; },
      error: () => {
        delay = Math.min(delay * 2, MAX_BACKOFF_MS);
        finished();
      },
      complete: finished
    });
    // For a synchronously completing stream the callbacks ran before subscribe returned; don't keep a closed subscription.
    inFlight = busy ? subscription : null;
  };

  const onVisibility = () => {
    if (doc.hidden) clear();
    else run();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  if (!doc.hidden) run();

  return {
    stop: () => {
      stopped = true;
      clear();
      inFlight?.unsubscribe();
      inFlight = null;
      doc.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
