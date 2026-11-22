import { WorkflowEvent, WorkflowGraph, WorkflowInstanceStatus } from '../../models/workflow.model';
import { WorkflowOverlay, edgeId } from './workflow-overlay';

/** Just what is needed for the instance's path on the diagram. */
export interface RuntimeInstance {
  status: WorkflowInstanceStatus;
  currentStepKey?: string | null;
  errorMessage?: string | null;
}

interface TrailEntry {
  step: string;
  /** The edge that led to this step; null for the first step. */
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
 * Path of a running (or finished) instance on the diagram — from the event log, PURE.
 *
 * - Entering a step (StepEntered) builds the trail; the decision before it determines the edge
 *   leading to that step: task approval/rejection (for parallel, completion/any
 *   rejection), condition evaluation and admin skip come from the port;
 *   update field / notification from the "next" exit.
 * - A branch cancellation (branchCancelled) is not a decision.
 * - A rollback (RolledBack) cuts the trail back to the target step — everything after "never happened".
 * - The step the instance is on is "current", "failed" if in an incident; "end" if it finished on an End node.
 * - If it finished via an exit with no target, that exit also goes into the edge list (end marker on the canvas).
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
        // Re-entry after a rollback: the trail already ends at the target.
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
        // Cancelling the remaining parallel branches is not a decision; an admin skip advances like an approval.
        if (key && dataOf(event)['reason'] !== 'branchCancelled') pending = { from: key, port: exitFor(key, true) };
        break;
      // Update field / notification completed → continue via the single "next" exit.
      case 'FieldsUpdated':
      case 'NotificationQueued':
      case 'TimerFired':
        if (key) pending = { from: key, port: 'next' };
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

  // An instance finishing via an exit with no target (empty approve/reject target → completed/rejected):
  // the last decision was not closed by entering any step; that exit's end is also part of the path taken.
  const finished = instance.status === 'Completed' || instance.status === 'Rejected';
  if (finished && pending && pending.from === trail[trail.length - 1]?.step) {
    edges.push(edgeId(pending.from, pending.port));
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
