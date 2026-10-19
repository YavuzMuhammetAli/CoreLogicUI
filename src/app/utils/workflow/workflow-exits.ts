import {
  WORKFLOW_TERMINAL_COMPLETED,
  WORKFLOW_TERMINAL_REJECTED,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * Bir adımın çıkışları — tek sözlük.
 *
 * Tekil (onay) adım `onApprove/onReject`, paralel adım `onComplete/onAnyReject`,
 * koşul her durum için `cases[i].to` + `defaultTo` kullanır; Bitiş'in çıkışı
 * yoktur. Tasarım ekranı, canvas, yerleşim ve doğrulama aynı listeyi görür —
 * yeni düğüm tipi yalnız buraya eklenir.
 *
 * Port adları backend `WorkflowPorts` / `WorkflowExits` ile AYNIDIR —
 * doğrulama bulguları (`WorkflowIssue.port`) ve olay verisi bu adlarla gelir.
 */
export type ExitPort = 'approve' | 'reject' | 'complete' | 'anyReject' | 'default' | 'next' | `case:${string}`;

/**
 * Canvas'taki port türü: olumlu (onay/tamamlanma), olumsuz (red) ya da nötr
 * (koşul yolları — biri ötekinden "iyi" değil).
 */
export type ExitKind = 'approve' | 'reject' | 'neutral';

export interface WorkflowExit {
  port: ExitPort;
  kind: ExitKind;
  /** Hedef adım anahtarı; boşsa akış `fallback` terminaline düşer (varsa). */
  target: string | null;
  /**
   * Boş hedefin düştüğü terminal. Koşul yollarında null: hedefsiz yol bir
   * doğrulama hatasıdır, sessizce bir terminale düşmez.
   */
  fallback: typeof WORKFLOW_TERMINAL_COMPLETED | typeof WORKFLOW_TERMINAL_REJECTED | null;
  /**
   * Bu çıkışa bağlantı kurulabilir mi. Red kapalı onay adımında ya da hiçbir
   * dalı reddedemeyen paralel adımda red çıkışı yoktur — doğrulayıcı oraya
   * hedef yazılmasını reddediyor.
   */
  enabled: boolean;
  /** Koşul durumunun etiketi ("Evet"); varsayılan yolda ve onay/red'de null. */
  label?: string | null;
}

const CASE_PREFIX = 'case:';

export function casePort(caseKey: string): ExitPort {
  return `${CASE_PREFIX}${caseKey}`;
}

/** Port bir koşul durumuna aitse durumun anahtarı; değilse null. */
export function caseKeyOf(port: string | null | undefined): string | null {
  return port?.startsWith(CASE_PREFIX) ? port.slice(CASE_PREFIX.length) : null;
}

/** Adımın çıkışları, çizim sırasıyla (olumlu önce; koşulda durum sırası, varsayılan en sonda). */
export function exitsOf(step: WorkflowStep): WorkflowExit[] {
  switch (step.type) {
    case 'parallel':
      return [
        {
          port: 'complete', kind: 'approve', target: step.onComplete || null,
          fallback: WORKFLOW_TERMINAL_COMPLETED, enabled: true
        },
        {
          port: 'anyReject', kind: 'reject', target: step.onAnyReject || null,
          fallback: WORKFLOW_TERMINAL_REJECTED,
          enabled: (step.branches ?? []).some(b => b.form?.allowReject !== false)
        }
      ];

    case 'condition':
      return [
        ...(step.cases ?? []).map(c => ({
          port: casePort(c.key), kind: 'neutral' as const, target: c.to || null,
          fallback: null, enabled: true, label: c.label || c.key
        })),
        { port: 'default' as const, kind: 'neutral' as const, target: step.defaultTo || null, fallback: null, enabled: true, label: null }
      ];

    case 'end':
      return [];

    // Alan güncelle / bildirim / bekleme: tek "sonraki" çıkışı; hedefsiz kalırsa doğrulama hatası.
    case 'action':
    case 'notify':
    case 'timer':
      return [{ port: 'next', kind: 'neutral', target: step.next || null, fallback: null, enabled: true, label: null }];

    default:
      return [
        {
          port: 'approve', kind: 'approve', target: step.onApprove || null,
          fallback: WORKFLOW_TERMINAL_COMPLETED, enabled: true
        },
        {
          port: 'reject', kind: 'reject', target: step.onReject || null,
          fallback: WORKFLOW_TERMINAL_REJECTED, enabled: step.form?.allowReject !== false
        }
      ];
  }
}

/** Canvas port türünü (olumlu/olumsuz) adımın ilk eşleşen çıkışına çevirir. */
export function exitForKind(step: WorkflowStep, kind: ExitKind): WorkflowExit | undefined {
  return exitsOf(step).find(exit => exit.kind === kind);
}

/** Çıkışın hedefini yazar; adımın KOPYASINI döner. Adıma ait olmayan port yok sayılır. */
export function setExit(step: WorkflowStep, port: ExitPort, target: string | null): WorkflowStep {
  const value = target || null;

  if (step.type === 'condition') {
    if (port === 'default') return step.defaultTo === value ? step : { ...step, defaultTo: value };

    const key = caseKeyOf(port);
    const index = key === null ? -1 : (step.cases ?? []).findIndex(c => c.key === key);
    if (index < 0 || (step.cases![index].to || null) === value) return step;

    const cases = step.cases!.slice();
    cases[index] = { ...cases[index], to: value };
    return { ...step, cases };
  }

  if (step.type === 'action' || step.type === 'notify' || step.type === 'timer') {
    return port === 'next' && (step.next || null) !== value ? { ...step, next: value } : step;
  }

  const isParallel = step.type === 'parallel';
  switch (port) {
    case 'approve':   return isParallel || step.type === 'end' ? step : { ...step, onApprove: value };
    case 'reject':    return isParallel || step.type === 'end' ? step : { ...step, onReject: value };
    case 'complete':  return isParallel ? { ...step, onComplete: value } : step;
    case 'anyReject': return isParallel ? { ...step, onAnyReject: value } : step;
    default:          return step;
  }
}

/**
 * Adımın tüm çıkış hedeflerini `map` üzerinden yeniden yazar (yeniden adlandırma,
 * silme). `map` yeni anahtarı ya da hedefi temizlemek için null döner. Hiçbir
 * hedef değişmezse AYNI nesne döner — değişmeyen adımlar yeniden çizilmesin.
 */
export function mapRefs(step: WorkflowStep, map: (key: string) => string | null): WorkflowStep {
  let next = step;
  for (const exit of exitsOf(step)) {
    if (!exit.target) continue;
    const mapped = map(exit.target);
    if (mapped !== exit.target) next = setExit(next, exit.port, mapped);
  }
  return next;
}

/** Anahtar karşılaştırması büyük/küçük harf duyarsız — backend FindStep ile aynı. */
export function sameKey(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}
