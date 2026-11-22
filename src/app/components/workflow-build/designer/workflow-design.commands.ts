import { WorkflowCondition, WorkflowStep } from '../../../models/workflow.model';
import { ExitPort, exitsOf, mapRefs, sameKey, setExit } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc, WorkflowDesignMeta } from './workflow-design.doc';

/**
 * Design document commands — PURE. Each command returns a new document; the input
 * is not mutated. The component only decides which command to call when;
 * all the rules live here and are covered by specs.
 *
 * Key comparisons are case-insensitive (same as backend FindStep):
 * "Mudur" and "mudur" are the same step.
 */

/** Returns the SAME document if the value is the same — an empty change should not land in undo history as a step. */
export function setMeta(doc: WorkflowDesignDoc, patch: Partial<WorkflowDesignMeta>): WorkflowDesignDoc {
  const changed = (Object.keys(patch) as Array<keyof WorkflowDesignMeta>)
    .some(key => patch[key] !== doc.meta[key]);
  return changed ? { ...doc, meta: { ...doc.meta, ...patch } } : doc;
}

export function setConditions(doc: WorkflowDesignDoc, conditions: WorkflowCondition[]): WorkflowDesignDoc {
  return JSON.stringify(conditions) === JSON.stringify(doc.conditions)
    ? doc
    : { ...doc, conditions };
}

export function setStart(doc: WorkflowDesignDoc, key: string): WorkflowDesignDoc {
  return doc.graph.startStep === key
    ? doc
    : { ...doc, graph: { ...doc.graph, startStep: key } };
}

export function findStep(doc: WorkflowDesignDoc, key: string): WorkflowStep | undefined {
  return doc.graph.steps.find(step => sameKey(step.key, key));
}

/**
 * Adds or updates a step.
 *
 * - If `originalKey` is empty the step is appended; if there is no start step it becomes it
 *   (so the user does not have to pick it separately).
 * - If the key changed, other steps' exits, the start step and the status
 *   label move to the new key — otherwise connections would silently break.
 * - `statusLabel` is the step's `entityStatusMap` entry; if empty the entry is deleted.
 *   Other entries in the map (end labels included) are KEPT.
 */
export function upsertStep(
  doc: WorkflowDesignDoc, originalKey: string | null, step: WorkflowStep, statusLabel: string
): WorkflowDesignDoc {
  const index = originalKey ? doc.graph.steps.findIndex(s => sameKey(s.key, originalKey)) : -1;

  let next: WorkflowDesignDoc;
  if (index < 0) {
    next = {
      ...doc,
      graph: {
        ...doc.graph,
        steps: [...doc.graph.steps, step],
        startStep: doc.graph.startStep || step.key
      }
    };
  } else {
    const steps = doc.graph.steps.slice();
    steps[index] = step;
    next = { ...doc, graph: { ...doc.graph, steps } };

    if (originalKey && originalKey !== step.key) {
      next = renameReferences(next, originalKey, step.key);
    }
  }

  return setStatusLabel(next, step.key, statusLabel);
}

/**
 * Deletes a step. Exits connected to it are cleared (fall to the terminal); if it was the start
 * step the first remaining step becomes the start; the status label is deleted.
 */
export function removeStep(doc: WorkflowDesignDoc, key: string): WorkflowDesignDoc {
  const removed = findStep(doc, key);
  if (!removed) return doc;

  const steps = doc.graph.steps
    .filter(step => step !== removed)
    .map(step => mapRefs(step, target => sameKey(target, removed.key) ? null : target));

  const startStep = sameKey(doc.graph.startStep, removed.key)
    ? steps[0]?.key ?? ''
    : doc.graph.startStep;

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  deleteKey(entityStatusMap, removed.key);

  return { ...doc, graph: { ...doc.graph, steps, startStep, entityStatusMap } };
}

/**
 * Connects an exit to a target. Self-connections and closed exits (reject while
 * rejection is disabled) are ignored — the validator rejects both; so that a connection drawn on
 * the canvas does not silently vanish on save, it is never written.
 */
export function connect(doc: WorkflowDesignDoc, from: string, port: ExitPort, to: string | null): WorkflowDesignDoc {
  if (to && sameKey(from, to)) return doc;

  const source = findStep(doc, from);
  if (!source) return doc;

  const exit = exitsOf(source).find(e => e.port === port);
  if (!exit || !exit.enabled) return doc;

  return replaceStep(doc, source, setExit(source, port, to));
}

/** Writes the node's position (rounded to whole pixels). */
export function moveStep(doc: WorkflowDesignDoc, key: string, x: number, y: number): WorkflowDesignDoc {
  return moveSteps(doc, [{ key, x, y }]);
}

/**
 * Writes the positions of several nodes in A SINGLE change — so multi-drag and
 * "pin all positions on the first manual move" are a single undo step.
 */
export function moveSteps(
  doc: WorkflowDesignDoc, moves: ReadonlyArray<{ key: string; x: number; y: number }>
): WorkflowDesignDoc {
  let changed = false;

  const steps = doc.graph.steps.map(step => {
    const move = moves.find(m => sameKey(m.key, step.key));
    if (!move) return step;

    const x = Math.round(move.x);
    const y = Math.round(move.y);
    if (step.x === x && step.y === y) return step;

    changed = true;
    return { ...step, x, y };
  });

  return changed ? { ...doc, graph: { ...doc.graph, steps } } : doc;
}

/** Deletes several steps (each with removeStep rules). */
export function removeSteps(doc: WorkflowDesignDoc, keys: ReadonlyArray<string>): WorkflowDesignDoc {
  return keys.reduce((current, key) => removeStep(current, key), doc);
}

/** Removes the exit's connection — the flow ends at that exit (falls to the terminal). */
export function disconnect(doc: WorkflowDesignDoc, from: string, port: ExitPort): WorkflowDesignDoc {
  const source = findStep(doc, from);
  if (!source) return doc;

  const exit = exitsOf(source).find(e => e.port === port);
  if (!exit?.target) return doc;

  return replaceStep(doc, source, setExit(source, port, null));
}

/**
 * "Auto arrange": manually set positions are deleted, the canvas falls back to auto
 * layout. null is written (not computed coordinates) — so steps added
 * later join the same arrangement.
 */
export function clearPositions(doc: WorkflowDesignDoc): WorkflowDesignDoc {
  if (doc.graph.steps.every(step => step.x == null && step.y == null)) return doc;

  const steps = doc.graph.steps.map(step =>
    step.x == null && step.y == null ? step : { ...step, x: null, y: null });
  return { ...doc, graph: { ...doc.graph, steps } };
}

/**
 * Transforms a step in place (field changes from the inspector panel). If the transformation
 * returns the same object the document stays the same too — no empty undo step is created.
 */
export function patchStep(
  doc: WorkflowDesignDoc, key: string, transform: (step: WorkflowStep) => WorkflowStep
): WorkflowDesignDoc {
  const step = findStep(doc, key);
  return step ? replaceStep(doc, step, transform(step)) : doc;
}

/** Writes the step's status label; empty text deletes the label. */
export function labelStep(doc: WorkflowDesignDoc, key: string, label: string): WorkflowDesignDoc {
  const step = findStep(doc, key);
  return step ? setStatusLabel(doc, step.key, label) : doc;
}

/**
 * Changes the step's key; all references to it (exits,
 * start, status label) are moved. Validity and uniqueness are the caller's job.
 */
export function renameStep(doc: WorkflowDesignDoc, oldKey: string, newKey: string): WorkflowDesignDoc {
  const step = findStep(doc, oldKey);
  if (!step || step.key === newKey) return doc;

  const steps = doc.graph.steps.map(s => s === step ? { ...step, key: newKey } : s);
  return renameReferences({ ...doc, graph: { ...doc.graph, steps } }, step.key, newKey);
}

/** Suggests a non-colliding key for a new step (step1, step2, …). */
export function suggestKey(doc: WorkflowDesignDoc, prefix = 'step'): string {
  const existing = new Set(doc.graph.steps.map(step => step.key.toLowerCase()));
  let index = doc.graph.steps.length + 1;
  while (existing.has(`${prefix}${index}`)) index++;
  return `${prefix}${index}`;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function replaceStep(doc: WorkflowDesignDoc, oldStep: WorkflowStep, newStep: WorkflowStep): WorkflowDesignDoc {
  if (oldStep === newStep) return doc;
  const steps = doc.graph.steps.map(step => step === oldStep ? newStep : step);
  return { ...doc, graph: { ...doc.graph, steps } };
}

/** Moves all references to the old key (exits, start, status label). */
function renameReferences(doc: WorkflowDesignDoc, oldKey: string, newKey: string): WorkflowDesignDoc {
  const steps = doc.graph.steps.map(step =>
    mapRefs(step, target => sameKey(target, oldKey) ? newKey : target));

  const startStep = sameKey(doc.graph.startStep, oldKey) ? newKey : doc.graph.startStep;

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  const label = takeKey(entityStatusMap, oldKey);
  if (label !== undefined) entityStatusMap[newKey] = label;

  return { ...doc, graph: { ...doc.graph, steps, startStep, entityStatusMap } };
}

function setStatusLabel(doc: WorkflowDesignDoc, key: string, label: string): WorkflowDesignDoc {
  const trimmed = label.trim();
  const map = doc.graph.entityStatusMap;
  const current = Object.keys(map).find(k => sameKey(k, key));

  if (!trimmed && current === undefined) return doc;
  if (trimmed && current === key && map[current] === trimmed) return doc;

  const entityStatusMap = { ...map };
  if (current !== undefined) delete entityStatusMap[current];
  if (trimmed) entityStatusMap[key] = trimmed;

  return { ...doc, graph: { ...doc.graph, entityStatusMap } };
}

function deleteKey(map: Record<string, string>, key: string): void {
  for (const existing of Object.keys(map)) {
    if (sameKey(existing, key)) delete map[existing];
  }
}

function takeKey(map: Record<string, string>, key: string): string | undefined {
  const existing = Object.keys(map).find(k => sameKey(k, key));
  if (existing === undefined) return undefined;
  const value = map[existing];
  delete map[existing];
  return value;
}
