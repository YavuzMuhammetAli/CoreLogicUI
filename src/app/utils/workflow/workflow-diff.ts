import { WorkflowGraph, WorkflowStep } from '../../models/workflow.model';
import { exitsOf } from './workflow-exits';
import { WorkflowOverlay, edgeId } from './workflow-overlay';

/**
 * Difference between two versions — PURE. Position (x/y) is not a difference: dragging a node
 * does not change the workflow's behaviour.
 */
export interface WorkflowDiff {
  /** Steps added in the new version. */
  added: string[];
  /** Steps in the old version but not the new — cannot be drawn on the diagram, shown as a list. */
  removed: Array<{ key: string; name: string }>;
  /** Steps in both versions whose settings changed. */
  changed: string[];
  /** Edges added or retargeted in the new version (`edgeId`). */
  edgesChanged: string[];
  /** Whether the start step changed. */
  startChanged: boolean;
}

const POSITION_KEYS = new Set(['x', 'y']);

/** JSON with sorted keys and no position — so a difference in field order does not count as "changed". */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, val) => {
    if (POSITION_KEYS.has(key)) return undefined;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val).sort().reduce<Record<string, unknown>>((sorted, k) => {
        sorted[k] = (val as Record<string, unknown>)[k];
        return sorted;
      }, {});
    }
    return val;
  });
}

function byKey(graph: WorkflowGraph): Map<string, WorkflowStep> {
  return new Map(graph.steps.map(step => [step.key.toLowerCase(), step]));
}

function exitTargets(step: WorkflowStep): Map<string, string> {
  return new Map(exitsOf(step).map(exit => [exit.port, (exit.target ?? '').toLowerCase()]));
}

export function diffGraphs(before: WorkflowGraph, after: WorkflowGraph): WorkflowDiff {
  const old = byKey(before);
  const next = byKey(after);

  const added: string[] = [];
  const changed: string[] = [];
  const edgesChanged: string[] = [];

  for (const [key, step] of next) {
    const previous = old.get(key);
    if (!previous) {
      added.push(step.key);
      for (const exit of exitsOf(step)) {
        if (exit.target) edgesChanged.push(edgeId(step.key, exit.port));
      }
      continue;
    }

    if (canonical(previous) !== canonical(step)) changed.push(step.key);

    const was = exitTargets(previous);
    for (const exit of exitsOf(step)) {
      if (exit.target && was.get(exit.port) !== exit.target.toLowerCase()) edgesChanged.push(edgeId(step.key, exit.port));
    }
  }

  const removed = [...old.entries()]
    .filter(([key]) => !next.has(key))
    .map(([, step]) => ({ key: step.key, name: step.name }));

  return {
    added,
    removed,
    changed,
    edgesChanged,
    startChanged: (before.startStep ?? '').toLowerCase() !== (after.startStep ?? '').toLowerCase()
  };
}

export function hasDifferences(diff: WorkflowDiff): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length + diff.edgesChanged.length > 0 || diff.startChanged;
}

/** On the diagram: added in green, changed in yellow; unchanged faded, changed edges highlighted. */
export function diffOverlay(diff: WorkflowDiff): WorkflowOverlay {
  const nodes: WorkflowOverlay['nodes'] = {};
  for (const key of diff.added) nodes[key.toLowerCase()] = 'added';
  for (const key of diff.changed) nodes[key.toLowerCase()] = 'changed';
  return { nodes, edges: diff.edgesChanged };
}
