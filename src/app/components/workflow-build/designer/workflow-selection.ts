import { ExitPort, sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/** Seçili kenar: kaynak adım + çıkış portu (kenar kimliği). */
export interface EdgeRef {
  from: string;
  port: ExitPort;
}

/**
 * Tasarımcı seçimi. Ya düğümler ya tek bir kenar seçilidir — ikisi birden
 * değil: Delete'in neyi sileceği tartışmasız olmalı.
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
 * Düğüme tıklamanın seçime etkisi.
 * - Ek tuşla (Shift/Ctrl): düğüm seçime eklenir ya da çıkarılır.
 * - Ek tuşsuz: düğüm zaten seçiliyse seçim KORUNUR (birden çok düğümü birlikte
 *   sürüklemek için), değilse yalnız o seçilir.
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
 * Belgede artık olmayan anahtarları seçimden atar (silme, geri alma sonrası).
 * Değişiklik yoksa AYNI nesne döner.
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
