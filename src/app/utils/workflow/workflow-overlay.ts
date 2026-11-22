import { WorkflowSimulation } from '../../models/workflow.model';

/**
 * Path overlay on the diagram — the canvas draws the same overlay from three sources: simulation
 * (8b), running instance (Phase 9) and version diff (Phase 11). PURE.
 */
export type OverlayNodeState = 'visited' | 'current' | 'failed' | 'end' | 'added' | 'changed';

export interface WorkflowOverlay {
  /** Step key (lowercase) → state. */
  nodes: Record<string, OverlayNodeState>;
  /** Traversed edges: `edgeId(source, port)`. */
  edges: string[];
}

/** Edge id: source step + exit port (approve, reject, case:x, default…). */
export function edgeId(from: string, port: string): string {
  return `${from.toLowerCase()}|${port}`;
}

/**
 * Overlay from a simulation result: visited steps and exited ports; the last step
 * by outcome (waiting → current, incident/error → failed, end → end).
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
