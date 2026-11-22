import {
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTriggerEvent,
  parseConditions
} from '../../../models/workflow.model';

/**
 * Design document — the SINGLE source of truth of the flow design screen.
 *
 * Previously the source was the screen's Reactive Forms tree and on save `buildGraph()`
 * REBUILT every step from the form. Anything without a counterpart in the form was lost:
 * the form field's `maxLength`, the parallel branch's form, the end labels in
 * `entityStatusMap`, top-level fields of the definition we don't know. The document carries the raw
 * step objects as they are; only the edited step changes.
 *
 * The document is immutable: every command returns a new document. Undo/redo
 * is therefore just a stack of snapshots.
 */
export interface WorkflowDesignMeta {
  name: string;
  code: string;
  modelName: string;
  triggerEvent: WorkflowTriggerEvent;
  isEnabled: boolean;
}

export interface WorkflowDesignDoc {
  meta: WorkflowDesignMeta;
  /** Trigger conditions (all joined with AND). */
  conditions: WorkflowCondition[];
  graph: WorkflowGraph;
  /**
   * Top-level fields of `definitionJson` we don't manage. Written back UNCHANGED
   * on save — so a field added by another client (e.g. a future designer layout, AI)
   * is not deleted when saving on this screen.
   */
  extras: Record<string, unknown>;
}

/** Initial document of a new flow — same as the design screen's old defaults. */
export function emptyDoc(): WorkflowDesignDoc {
  return {
    meta: { name: '', code: '', modelName: '', triggerEvent: 'onCreate', isEnabled: true },
    conditions: [],
    graph: { startStep: '', steps: [], entityStatusMap: {} },
    extras: {}
  };
}

/** Top-level graph fields we manage; the rest goes to `extras`. */
const GRAPH_KEYS = new Set(['startStep', 'steps', 'entityStatusMap']);

/** Builds a document from the server definition. A broken `definitionJson` yields an empty graph. */
export function docFromDefinition(definition: WorkflowDefinition): WorkflowDesignDoc {
  const raw = parseRawGraph(definition.definitionJson);

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!GRAPH_KEYS.has(key)) extras[key] = value;
  }

  return {
    meta: {
      name: definition.name ?? '',
      code: definition.code ?? '',
      modelName: definition.modelName ?? '',
      triggerEvent: definition.triggerEvent ?? 'onCreate',
      isEnabled: definition.isEnabled ?? true
    },
    conditions: parseConditions(definition.triggerConditionJson),
    graph: {
      startStep: typeof raw['startStep'] === 'string' ? raw['startStep'] : '',
      steps: Array.isArray(raw['steps']) ? raw['steps'] : [],
      entityStatusMap: isRecord(raw['entityStatusMap'])
        ? raw['entityStatusMap'] as Record<string, string>
        : {}
    },
    extras
  };
}

/**
 * Builds the save request from the document. The graph is NOT regenerated, it is
 * serialised as is — unedited steps go to the server exactly as they came.
 */
export function docToPayload(doc: WorkflowDesignDoc, id: number | null): Partial<WorkflowDefinition> {
  return {
    id: id ?? 0,
    name: doc.meta.name,
    code: doc.meta.code,
    modelName: doc.meta.modelName,
    triggerEvent: doc.meta.triggerEvent,
    isEnabled: doc.meta.isEnabled,
    definitionJson: JSON.stringify({
      ...doc.extras,
      startStep: doc.graph.startStep,
      steps: doc.graph.steps,
      entityStatusMap: doc.graph.entityStatusMap
    }),
    triggerConditionJson: doc.conditions.length > 0 ? JSON.stringify(doc.conditions) : null
  };
}

/** Stable text for the unsaved-changes check. */
export function serializeDoc(doc: WorkflowDesignDoc): string {
  return JSON.stringify(doc);
}

/**
 * Position-independent key: dragging a node does not change the validation result,
 * so live validation is only re-requested when this key changes.
 */
export function semanticKey(doc: WorkflowDesignDoc): string {
  return JSON.stringify(doc, (key, value) => (key === 'x' || key === 'y') ? undefined : value);
}

function parseRawGraph(json: string | null | undefined): Record<string, unknown> {
  if (!json?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
