import { ValidatorFn, Validators } from '@angular/forms';
import { DynamicTreeNodeDto, PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema, PublishedTableSchema } from '../../services/published-table.service';
import { fieldValue, sanitizePayload } from '../model-data/model-data.util';
import { isFileType, maxFileSizeValidator } from '../../utils/file-size';
import { isTextColumn } from '../../utils/column-rules';
import { isColumnRequired } from '../../utils/record-field/column-required';

/** Dynamic table row — field name → value. */
export type DataRow = Record<string, unknown>;

/**
 * A record waiting in memory (not saved yet) together with its whole subtree.
 *
 * The user can build the main model + sub-models + grandchildren chain without saving
 * anything; when "Kaydet" (Save) is pressed the tree is processed IN ORDER from root to leaves.
 * A saved node gets a `savedId` and is SKIPPED on later attempts — so retrying after a
 * partial failure does not create duplicate records.
 */
export interface StagedNode {
  /** Temporary id unique within the tree (not the real ID). */
  localId: number;
  typeName: string;
  /** Form values (EXCLUDING the FK column — it is added at save time). */
  values: DataRow;
  /** subTypeName → pending nodes of that type. */
  children: Map<string, StagedNode[]>;
  /** Real server ID once saved; null while still in memory. */
  savedId: number | null;
  /** Error message of the last save attempt; null on success. */
  error: string | null;
  /**
   * Whether the user changed this node's values.
   *
   * Only meaningful on nodes with `savedId` set: `addTree` does NOT UPDATE an
   * existing record (it skips nodes with `existingId`), so changed saved nodes
   * must be sent separately via `update()`. Without this flag the user's correction
   * is silently lost.
   */
  dirty: boolean;
}

let localIdSeq = 0;

/** Creates a new pending node. */
export function createStagedNode(typeName: string, values: DataRow): StagedNode {
  return {
    localId: ++localIdSeq,
    typeName,
    values,
    children: new Map<string, StagedNode[]>(),
    savedId: null,
    error: null,
    dirty: false
  };
}

/**
 * Normalizes a row coming from the server to the SCHEMA column names.
 *
 * The backend returns column meta names in PascalCase (`UnitPrice`) but row data
 * in camelCase (`unitPrice`) with the default `System.Text.Json` policy
 * (see the `fieldValue` doc). Since `StagedNode.values` is where these two worlds meet,
 * the row must be reduced to a SINGLE casing:
 *
 * - Form controls are built with `col.columnName` (PascalCase) → without normalizing,
 *   every field opens empty.
 * - `sanitizePayload` also recognizes PascalCase keys → without normalizing, the camelCase
 *   original and the PascalCase copy go into the payload TOGETHER and the existing value is nulled.
 *
 * Fields not in the schema are left untouched — meta fields such as `ID` are preserved.
 */
export function normalizeRow(columns: PublishedColumn[], row: DataRow): DataRow {
  const out: DataRow = {};
  for (const col of columns) {
    out[col.columnName] = fieldValue(row, col.columnName) ?? null;
  }
  const id = fieldValue(row, 'ID');
  if (id !== undefined) out['ID'] = id;
  return out;
}

/** Returns a node's child nodes of the given type (empty array if none). */
export function childrenOf(node: StagedNode, childTypeName: string): StagedNode[] {
  return node.children.get(childTypeName) ?? [];
}

/** Adds a child node or replaces the one with the same localId. */
export function upsertChild(node: StagedNode, childTypeName: string, child: StagedNode): void {
  const list = [...childrenOf(node, childTypeName)];
  const idx = list.findIndex(n => n.localId === child.localId);
  if (idx >= 0) list[idx] = child;
  else list.push(child);
  node.children.set(childTypeName, list);
}

/** Removes a child node. */
export function removeChild(node: StagedNode, childTypeName: string, localId: number): void {
  node.children.set(childTypeName, childrenOf(node, childTypeName).filter(n => n.localId !== localId));
}

/** Total number of pending — not yet saved — nodes in the tree (root excluded). */
export function pendingCount(node: StagedNode): number {
  let total = 0;
  for (const [, list] of node.children) {
    for (const child of list) {
      if (child.savedId === null) total++;
      total += pendingCount(child);
    }
  }
  return total;
}

/** Whether any node in the tree carries a save error. */
export function hasErrors(node: StagedNode): boolean {
  for (const [, list] of node.children) {
    for (const child of list) {
      if (child.error) return true;
      if (hasErrors(child)) return true;
    }
  }
  return false;
}

/**
 * Name of the sub-model FK column. Project convention: `<ParentTypeName>Id`
 * (see model-detail `buildTabState`). The schema side produces the same name.
 *
 * NOTE: the CLIENT DOES NOT ASSIGN this value when saving — on the `addTree` endpoint the server
 * writes the parent record's real ID. This helper is only used for listing/filtering
 * (fetching child records by FK).
 */
export function fkColumnFor(parentTypeName: string): string {
  return parentTypeName + 'Id';
}

/**
 * Converts the pending tree into the `POST /PublishedModel/addTree` body.
 *
 * The node's temporary `localId` is used as `clientId`; the `savedIds` / `errors`
 * dictionaries in the server response come back keyed by it. The FK column is NOT
 * PUT into the payload — the server assigns it itself from the parent's real ID.
 */
export function toTreeDto(
  node: StagedNode,
  columnsOf: (typeName: string) => PublishedColumn[],
  existingId: number | null = null
): DynamicTreeNodeDto {
  const children: DynamicTreeNodeDto[] = [];
  for (const [, list] of node.children) {
    for (const child of list) {
      children.push(toTreeDto(child, columnsOf));
    }
  }

  return {
    typeName: node.typeName,
    clientId: String(node.localId),
    jsonData: sanitizePayload(columnsOf(node.typeName), node.values),
    existingId: existingId ?? node.savedId,
    children
  };
}

/** Flattens all nodes in the tree into a list (for ID/error mapping of the response). */
export function flattenNodes(node: StagedNode): StagedNode[] {
  const out: StagedNode[] = [];
  const walk = (n: StagedNode) => {
    out.push(n);
    for (const [, list] of n.children) list.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * SAVED and MODIFIED nodes in the tree — `addTree` cannot write these, a separate
 * `update()` must be sent for each. The root is included; the caller filters it out if needed.
 */
export function dirtyNodes(root: StagedNode): StagedNode[] {
  return flattenNodes(root).filter(n => n.savedId !== null && n.dirty);
}

/** Whether the tree has any node to be ADDED to the server (not yet saved). */
export function hasInserts(root: StagedNode): boolean {
  return flattenNodes(root).some(n => n.savedId === null);
}

// ─── Validation rules ─────────────────────────────────────────────────────────

/**
 * Converts schema rules (regex / length / range) into Angular validators.
 *
 * The rules come via `PublishedTableService.getSchema()` — they use the SAME source
 * as backend `ValidateDynamicEntity`, so client and server validation match exactly
 * and the user sees errors before anything reaches the server.
 *
 * `Validators.pattern` does not run on empty values; this is intentional — the backend
 * also skips rule checks for null values.
 */
export function validatorsFor(
  col: PublishedColumn,
  rule: PublishedColumnSchema | undefined
): ValidatorFn[] {
  const validators: ValidatorFn[] = [];

  // Required: getModels() returns `isNullable`, getSchema() returns `isRequired` — decided in one place.
  if (isColumnRequired(col, rule)) validators.push(Validators.required);

  // image/file: maxLength = size limit (KB). The platform ceiling applies even without a rule.
  if (isFileType(col.dataType)) {
    validators.push(maxFileSizeValidator(col.dataType, rule?.maxLength ?? col.maxLength));
    return validators;
  }

  if (!rule) return validators;

  if (isTextColumn(col.dataType)) {
    if (rule.minLength != null) validators.push(Validators.minLength(rule.minLength));
    if (rule.maxLength != null) validators.push(Validators.maxLength(rule.maxLength));
    if (rule.regex) {
      try {
        // An invalid pattern must not lock the whole form — the backend also skips broken regexes.
        new RegExp(rule.regex);
        validators.push(Validators.pattern(rule.regex));
      } catch {
        /* broken pattern — skip on the client side */
      }
    }
  }

  if (NUMERIC_TYPES.has(col.dataType)) {
    if (rule.min != null) validators.push(Validators.min(rule.min));
    if (rule.max != null) validators.push(Validators.max(rule.max));
  }

  return validators;
}

const NUMERIC_TYPES = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);
