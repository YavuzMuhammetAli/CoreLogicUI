import { Observable, Subscription } from 'rxjs';

/** Çalışan bir yoklama; `stop()` zamanlayıcıyı ve görünürlük dinleyicisini kaldırır. */
export interface VisiblePoll {
  stop(): void;
}

/** Hatada aralık katlanarak bu üst sınıra kadar uzar. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Sekme GÖRÜNÜRKEN düzenli yoklama (rozet sayaçları vb.).
 *
 * Görev rozeti ve bildirim zili her açık sekmede 30 sn'de bir, sekme arka planda olsa da istek
 * atıyordu: kullanıcı × sekme × saat başına 240 istek, hepsi sunucuda sorgu. Burada:
 *  - sekme gizlenince durur, görünür olunca HEMEN bir kez tazeler ve kaldığı yerden sürer;
 *  - görev hata verirse aralık ikiye katlanır (en fazla {@link MAX_BACKOFF_MS}), ilk başarıda düzelir;
 *  - bir istek sürerken yenisi başlatılmaz.
 * İlk çalıştırma hemen yapılır (sayfa açılışında rozet dolsun).
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
    // Senkron biten akışta geri çağrılar subscribe dönmeden çalıştı; kapalı aboneliği tutma.
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
