import {
  WORKFLOW_TERMINAL_COMPLETED,
  WORKFLOW_TERMINAL_REJECTED,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * Bir adımın çıkışları — tek sözlük.
 *
 * Tekil (onay) adım `onApprove/onReject`, paralel adım `onComplete/onAnyReject`
 * alanlarını kullanır. Bu ayrım bugüne dek tasarım ekranında, canvas'ta,
 * yerleşimde ve doğrulayıcıda ayrı ayrı yazılıyordu; tek yerde toplanınca yeni
 * düğüm tipleri (koşul, alan güncelle, bekleme…) yalnız buraya eklenir.
 *
 * Port adları backend `WorkflowPorts` ile AYNIDIR — doğrulama bulguları
 * (`WorkflowIssue.port`) bu adlarla gelir.
 */
export type ExitPort = 'approve' | 'reject' | 'complete' | 'anyReject';

/** Canvas'taki port türü: olumlu (onay/tamamlanma) ya da olumsuz (red). */
export type ExitKind = 'approve' | 'reject';

export interface WorkflowExit {
  port: ExitPort;
  kind: ExitKind;
  /** Hedef adım anahtarı; boşsa akış `fallback` terminaline düşer. */
  target: string | null;
  /** Boş hedefin düştüğü terminal. */
  fallback: typeof WORKFLOW_TERMINAL_COMPLETED | typeof WORKFLOW_TERMINAL_REJECTED;
  /**
   * Bu çıkışa bağlantı kurulabilir mi. Red kapalı onay adımında ya da hiçbir
   * dalı reddedemeyen paralel adımda red çıkışı yoktur — doğrulayıcı oraya
   * hedef yazılmasını reddediyor.
   */
  enabled: boolean;
}

/** Adımın çıkışları, çizim sırasıyla (olumlu önce). */
export function exitsOf(step: WorkflowStep): WorkflowExit[] {
  if (step.type === 'parallel') {
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
  }

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

/** Canvas port türünü (olumlu/olumsuz) adımın gerçek çıkışına çevirir. */
export function exitForKind(step: WorkflowStep, kind: ExitKind): WorkflowExit | undefined {
  return exitsOf(step).find(exit => exit.kind === kind);
}

/** Çıkışın hedefini yazar; adımın KOPYASINI döner. Adıma ait olmayan port yok sayılır. */
export function setExit(step: WorkflowStep, port: ExitPort, target: string | null): WorkflowStep {
  const value = target || null;
  const isParallel = step.type === 'parallel';

  switch (port) {
    case 'approve':   return isParallel ? step : { ...step, onApprove: value };
    case 'reject':    return isParallel ? step : { ...step, onReject: value };
    case 'complete':  return isParallel ? { ...step, onComplete: value } : step;
    case 'anyReject': return isParallel ? { ...step, onAnyReject: value } : step;
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
