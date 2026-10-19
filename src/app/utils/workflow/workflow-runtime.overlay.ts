import { WorkflowEvent, WorkflowGraph, WorkflowInstanceStatus } from '../../models/workflow.model';
import { WorkflowOverlay, edgeId } from './workflow-overlay';

/** Sürecin şemadaki yolu için gereken kadarı. */
export interface RuntimeInstance {
  status: WorkflowInstanceStatus;
  currentStepKey?: string | null;
  errorMessage?: string | null;
}

interface TrailEntry {
  step: string;
  /** Bu adıma gelinen kenar; ilk adımda null. */
  edge: string | null;
}

function dataOf(event: WorkflowEvent): Record<string, unknown> {
  if (!event.dataJson) return {};
  try {
    const parsed: unknown = JSON.parse(event.dataJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * Çalışan (ya da bitmiş) sürecin şema üstü yolu — olay günlüğünden, SAF.
 *
 * - Adıma giriş (StepEntered) izi kurar; ondan önceki karar o adıma giden
 *   kenarı belirler: görev onayı/reddi (paralelde tamamlanma/herhangi biri
 *   reddederse), koşul değerlendirmesi ve yönetici atlaması porttan gelir.
 * - Dal iptali (branchCancelled) karar sayılmaz.
 * - Geri alma (RolledBack) izi hedef adıma kadar keser — sonrası "olmamış" sayılır.
 * - Sürecin bulunduğu adım "şu an", olaydaysa "hata"; Bitiş düğümünde sonlandıysa "bitiş".
 */
export function buildRuntimeOverlay(
  graph: WorkflowGraph, timeline: ReadonlyArray<WorkflowEvent>, instance: RuntimeInstance
): WorkflowOverlay {
  const typeOf = new Map(graph.steps.map(step => [step.key.toLowerCase(), step.type]));
  const trail: TrailEntry[] = [];
  let pending: { from: string; port: string } | null = null;

  const exitFor = (stepKey: string, approved: boolean): string =>
    typeOf.get(stepKey) === 'parallel'
      ? (approved ? 'complete' : 'anyReject')
      : (approved ? 'approve' : 'reject');

  for (const event of timeline) {
    const key = event.stepKey?.toLowerCase() ?? null;

    switch (event.eventType) {
      case 'StepEntered': {
        if (!key) break;
        const last = trail[trail.length - 1];
        // Geri almadan sonraki yeniden giriş: iz zaten hedefte bitiyor.
        if (last && last.step === key && !pending) break;
        trail.push({ step: key, edge: pending ? edgeId(pending.from, pending.port) : null });
        pending = null;
        break;
      }
      case 'TaskCompleted':
        if (key) pending = { from: key, port: exitFor(key, true) };
        break;
      case 'TaskRejected':
        if (key) pending = { from: key, port: exitFor(key, false) };
        break;
      case 'TaskSkipped':
        // Paralelde kalan dalların iptali karar değildir; yönetici atlaması onay gibi ilerletir.
        if (key && dataOf(event)['reason'] !== 'branchCancelled') pending = { from: key, port: exitFor(key, true) };
        break;
      case 'ConditionEvaluated':
      case 'StepSkipped': {
        const port = dataOf(event)['port'];
        if (key && typeof port === 'string') pending = { from: key, port };
        break;
      }
      case 'RolledBack': {
        if (!key) break;
        const index = trail.map(entry => entry.step).lastIndexOf(key);
        if (index >= 0) trail.splice(index + 1);
        else trail.push({ step: key, edge: null });
        pending = null;
        break;
      }
    }
  }

  const nodes: WorkflowOverlay['nodes'] = {};
  const edges: string[] = [];
  for (const entry of trail) {
    nodes[entry.step] = 'visited';
    if (entry.edge) edges.push(entry.edge);
  }

  const current = instance.currentStepKey?.toLowerCase();
  if (instance.status === 'Running' && current) {
    nodes[current] = instance.errorMessage ? 'failed' : 'current';
  } else if (instance.status === 'Completed' || instance.status === 'Rejected') {
    const last = trail[trail.length - 1];
    if (last && typeOf.get(last.step) === 'end') nodes[last.step] = 'end';
  } else if (instance.status === 'Failed') {
    const last = trail[trail.length - 1];
    if (last) nodes[last.step] = 'failed';
  }

  return { nodes, edges };
}
