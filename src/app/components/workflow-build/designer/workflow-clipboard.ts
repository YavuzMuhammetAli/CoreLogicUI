import { WorkflowStep } from '../../../models/workflow.model';
import { mapRefs, sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/**
 * Designer clipboard — copy / paste / duplicate. PURE.
 *
 * The clipboard is in-page (not the system clipboard): a step object is not
 * something to paste as text into another application.
 */
export interface DesignClipboard {
  steps: WorkflowStep[];
  /** Status labels of the copied steps (entityStatusMap entries). */
  labels: Record<string, string>;
}

/** Position offset (px) of pasted copies — so a copy does not sit on top of its original. */
export const PASTE_OFFSET = 40;

/** Puts the selected steps on the clipboard (deep copy — later document changes do not affect it). */
export function copySteps(doc: WorkflowDesignDoc, keys: string[]): DesignClipboard | null {
  const steps = doc.graph.steps.filter(step => keys.some(key => sameKey(key, step.key)));
  if (steps.length === 0) return null;

  const labels: Record<string, string> = {};
  for (const step of steps) {
    const labelKey = Object.keys(doc.graph.entityStatusMap).find(k => sameKey(k, step.key));
    if (labelKey) labels[step.key] = doc.graph.entityStatusMap[labelKey];
  }

  return { steps: structuredClone(steps), labels };
}

/**
 * Adds the clipboard steps to the document with new keys.
 *
 * - A key that does not collide is kept, otherwise it gets `{key}_2`, `_3`….
 * - Connections BETWEEN the copied steps are moved to the new keys; outgoing
 *   connections are not copied (they fall to the terminal) — otherwise the copy would
 *   silently connect to the steps its original was connected to.
 * - A copy with a position shifts down-right; one without stays in auto layout.
 * - The start step does not change (if empty, the first copy becomes it).
 */
export function pasteSteps(
  doc: WorkflowDesignDoc, clipboard: DesignClipboard, offset = PASTE_OFFSET
): { doc: WorkflowDesignDoc; keys: string[] } {
  const taken = new Set(doc.graph.steps.map(step => step.key.toLowerCase()));
  const renames = new Map<string, string>();

  for (const step of clipboard.steps) {
    const key = freeKey(step.key, taken);
    taken.add(key.toLowerCase());
    renames.set(step.key.toLowerCase(), key);
  }

  const copies = clipboard.steps.map(step => {
    const remapped = mapRefs(structuredClone(step), target => renames.get(target.toLowerCase()) ?? null);
    return {
      ...remapped,
      key: renames.get(step.key.toLowerCase())!,
      x: step.x != null ? step.x + offset : step.x ?? null,
      y: step.y != null ? step.y + offset : step.y ?? null
    };
  });

  const entityStatusMap = { ...doc.graph.entityStatusMap };
  for (const [original, label] of Object.entries(clipboard.labels)) {
    const renamed = renames.get(original.toLowerCase());
    if (renamed) entityStatusMap[renamed] = label;
  }

  return {
    doc: {
      ...doc,
      graph: {
        ...doc.graph,
        steps: [...doc.graph.steps, ...copies],
        startStep: doc.graph.startStep || copies[0]?.key || '',
        entityStatusMap
      }
    },
    keys: copies.map(copy => copy.key)
  };
}

/**
 * Non-colliding key: itself, otherwise `_2`, `_3`… If an already numbered copy
 * is duplicated again, numbering continues from the root (`onay_2` → `onay_3`, not `onay_2_2`).
 */
function freeKey(key: string, taken: Set<string>): string {
  if (!taken.has(key.toLowerCase())) return key;

  const base = key.replace(/_[0-9]+$/, '') || key;
  let index = 2;
  while (taken.has(`${base}_${index}`.toLowerCase())) index++;
  return `${base}_${index}`;
}
