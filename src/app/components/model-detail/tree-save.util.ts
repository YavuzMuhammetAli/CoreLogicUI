import { TreeSaveResult } from '../../services/published-model.service';
import { StagedNode, flattenNodes } from './staged-tree.util';

/**
 * A single server step in the "Kaydet" (Save) flow.
 *
 * A save may consist of two different request kinds: `addTree`, where new rows are
 * written in a SINGLE transaction, and a separate `update` for every saved but modified
 * row. Both run together via `forkJoin` and their results are collected in this
 * common shape.
 */
export interface TreeStep {
  kind: 'tree' | 'update';
  ok: boolean;
  message: string;
  /** The server's ID/error dictionary for `kind: 'tree'`. */
  data?: TreeSaveResult;
  /** Target node for `kind: 'update'`. */
  node?: StagedNode;
}

/** Summary of the non-tree (update) steps of a save round. */
export interface UpdateOutcome {
  /** "type: message" lines to show to the user. */
  errors: string[];
}

/**
 * Writes the real IDs and row-level errors from the server response into the tree.
 * Mapping is done via the client's temporary `localId` (clientId).
 *
 * Mutates the nodes IN PLACE (savedId/error) and returns the error lines to show
 * to the user. Being a separate function lets the id/error mapping be tested
 * independently of the HTTP setup.
 */
export function applyTreeResult(rootNode: StagedNode, data: TreeSaveResult): string[] {
  const errors: string[] = [];

  for (const node of flattenNodes(rootNode)) {
    const key = String(node.localId);
    const savedId = data.savedIds?.[key];
    const error = data.errors?.[key];

    if (savedId != null) {
      node.savedId = savedId;
      node.error = null;
    }

    if (error) {
      node.error = error;
      errors.push(`${node.typeName}: ${error}`);
    } else if (savedId != null) {
      node.error = null;
    }
  }

  return errors;
}

/**
 * Writes the results of the `update` steps to the nodes and returns the error summary.
 * On a successful step the node's `dirty` flag is cleared — otherwise saving again
 * without any change would resend the same request.
 */
export function applyUpdateResults(steps: TreeStep[]): UpdateOutcome {
  const errors: string[] = [];

  for (const step of steps) {
    if (step.kind !== 'update' || !step.node) continue;

    if (step.ok) {
      step.node.error = null;
      step.node.dirty = false;
    } else {
      step.node.error = step.message;
      errors.push(`${step.node.typeName}: ${step.message}`);
    }
  }

  return { errors };
}
