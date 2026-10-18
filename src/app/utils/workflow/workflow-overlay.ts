import { WorkflowSimulation } from '../../models/workflow.model';

/**
 * Şema üstü yol katmanı — tuval aynı katmanı üç kaynaktan çizer: simülasyon
 * (8b), çalışan süreç (Faz 9) ve sürüm farkı (Faz 11). SAF.
 */
export type OverlayNodeState = 'visited' | 'current' | 'failed' | 'end';

export interface WorkflowOverlay {
  /** Adım anahtarı (küçük harf) → durum. */
  nodes: Record<string, OverlayNodeState>;
  /** Geçilen kenarlar: `edgeId(kaynak, port)`. */
  edges: string[];
}

/** Kenar kimliği: kaynak adım + çıkış portu (approve, reject, case:x, default…). */
export function edgeId(from: string, port: string): string {
  return `${from.toLowerCase()}|${port}`;
}

/**
 * Simülasyon sonucundan katman: geçilen adımlar ve çıkılan portlar; son adım
 * sonuca göre (bekliyor → current, olay/hata → failed, bitiş → end).
 */
export function simulationOverlay(result: WorkflowSimulation): WorkflowOverlay {
  const nodes: Record<string, OverlayNodeState> = {};
  const edges: string[] = [];

  for (const step of result.path) {
    nodes[step.stepKey.toLowerCase()] = 'visited';
    if (step.port) edges.push(edgeId(step.stepKey, step.port));
  }

  const stop = result.stopStepKey?.toLowerCase();
  switch (result.outcome) {
    case 'waiting':
      if (stop) nodes[stop] = 'current';
      break;
    case 'incident':
    case 'failed':
    case 'limit':
      if (stop) nodes[stop] = 'failed';
      break;
    default:
      if (result.endStepKey) nodes[result.endStepKey.toLowerCase()] = 'end';
  }

  return { nodes, edges };
}
