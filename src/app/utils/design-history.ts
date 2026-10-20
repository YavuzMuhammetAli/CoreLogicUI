/**
 * Geri al / yinele geçmişi — SAF, değişmez anlık görüntü yığını.
 *
 * Belge değişmez olduğu için her adım yalnızca bir referanstır; 50 adımlık bir
 * akışın 100 anlık görüntüsü birkaç yüz KB eder.
 *
 * Birleştirme: aynı `reason` ile `windowMs` içinde gelen kayıtlar öncekinin
 * yerine geçer, üstüne eklenmez. Böylece bir alana yazılan her harf ayrı bir
 * geri al adımı olmaz ("Ctrl+Z bir kelimeyi geri alır, tek harfi değil").
 * Boş `reason` hiçbir zaman birleşmez.
 */
export interface DesignHistory<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Son kaydın sebebi ve zamanı — birleştirme kararı için. */
  readonly lastReason: string | null;
  readonly lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 600;

export function createHistory<T>(present: T): DesignHistory<T> {
  return { past: [], present, future: [], lastReason: null, lastAt: 0 };
}

/**
 * Yeni durumu kaydeder. Durum değişmediyse (aynı referans) geçmiş aynen döner —
 * hiçbir şey yapmayan komut boş bir geri al adımı üretmesin.
 */
export function record<T>(
  history: DesignHistory<T>,
  next: T,
  reason: string,
  now: number,
  windowMs = COALESCE_WINDOW_MS,
  limit = HISTORY_LIMIT
): DesignHistory<T> {
  if (next === history.present) return history;

  const coalesce = reason !== ''
    && reason === history.lastReason
    && now - history.lastAt <= windowMs;

  if (coalesce) {
    return { past: history.past, present: next, future: [], lastReason: reason, lastAt: now };
  }

  const past = [...history.past, history.present];
  if (past.length > limit) past.splice(0, past.length - limit);

  return { past, present: next, future: [], lastReason: reason, lastAt: now };
}

export function undo<T>(history: DesignHistory<T>): DesignHistory<T> {
  if (history.past.length === 0) return history;

  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];

  // Geri alınan adımdan sonra gelen yazım birleştirilmemeli: aksi halde
  // kullanıcının yeni yazdığı harf, geri aldığı durumun üzerine yazılırdı.
  return { past, present, future: [history.present, ...history.future], lastReason: null, lastAt: 0 };
}

export function redo<T>(history: DesignHistory<T>): DesignHistory<T> {
  if (history.future.length === 0) return history;

  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future, lastReason: null, lastAt: 0 };
}

export function canUndo<T>(history: DesignHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: DesignHistory<T>): boolean {
  return history.future.length > 0;
}
