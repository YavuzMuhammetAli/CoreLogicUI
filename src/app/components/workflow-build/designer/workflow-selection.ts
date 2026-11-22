import { ExitPort, sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/** Selected edge: source step + exit port (edge identity). */
export interface EdgeRef {
  from: string;
  port: ExitPort;
}

/**
 * Designer selection. Either nodes or a single edge are selected — never both:
 * what Delete deletes must be unambiguous.
 */
export interface DesignSelection {
  nodes: string[];
  edge: EdgeRef | null;
}

export const EMPTY_SELECTION: DesignSelection = { nodes: [], edge: null };

export function selectNodes(keys: string[]): DesignSelection {
  return { nodes: uniqueKeys(keys), edge: null };
}

export function selectEdge(edge: EdgeRef): DesignSelection {
  return { nodes: [], edge };
}

export function isNodeSelected(selection: DesignSelection, key: string): boolean {
  return selection.nodes.some(k => sameKey(k, key));
}

/**
 * Effect of a node click on the selection.
 * - With a modifier (Shift/Ctrl): the node is added to or removed from the selection.
 * - Without a modifier: if the node is already selected the selection is KEPT (to drag
 *   several nodes together), otherwise only that node is selected.
 */
export function clickNode(selection: DesignSelection, key: string, additive: boolean): DesignSelection {
  if (additive) {
    return isNodeSelected(selection, key)
      ? selectNodes(selection.nodes.filter(k => !sameKey(k, key)))
      : selectNodes([...selection.nodes, key]);
  }

  return isNodeSelected(selection, key) ? selection : selectNodes([key]);
}

/**
 * Drops keys no longer in the document from the selection (after delete, undo).
 * Returns the SAME object when nothing changes.
 */
export function pruneSelection(selection: DesignSelection, doc: WorkflowDesignDoc): DesignSelection {
  const exists = (key: string) => doc.graph.steps.some(step => sameKey(step.key, key));

  const nodes = selection.nodes.filter(exists);
  const edge = selection.edge && exists(selection.edge.from) ? selection.edge : null;

  return nodes.length === selection.nodes.length && edge === selection.edge
    ? selection
    : { nodes, edge };
}

function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  return keys.filter(key => {
    const lower = key.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}
