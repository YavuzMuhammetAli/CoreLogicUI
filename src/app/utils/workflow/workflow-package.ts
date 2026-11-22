import { WorkflowDefinition, WorkflowTriggerEvent } from '../../models/workflow.model';

/**
 * Workflow package — to export a workflow to a file and move it to another company/environment.
 * PURE: no Angular.
 *
 * The package carries the definition's DESIGN (name, code, model, trigger, diagram); id, version,
 * status and dates are not carried — an imported workflow always becomes a new DRAFT and
 * is re-validated against the target company's model before publishing. Role/user
 * assignments carry ids, so they usually end up empty in the target; validation shows them
 * as missing assignments.
 */
export const WORKFLOW_PACKAGE_FORMAT = 'corelogic.workflow';
export const WORKFLOW_PACKAGE_VERSION = 1;

export interface WorkflowPackage {
  format: typeof WORKFLOW_PACKAGE_FORMAT;
  version: number;
  exportedAt: string;
  workflow: {
    name: string;
    code: string;
    modelName: string;
    triggerEvent: WorkflowTriggerEvent;
    triggerConditionJson?: string | null;
    isEnabled: boolean;
    definitionJson: string;
  };
}

/** Import result: the package or an error code (`workflow.package.error.{code}`). */
export type PackageParseResult =
  | { ok: true; workflow: WorkflowPackage['workflow'] }
  | { ok: false; error: 'json' | 'format' | 'version' | 'fields' | 'definition' };

export function toPackage(definition: Pick<WorkflowDefinition,
  'name' | 'code' | 'modelName' | 'triggerEvent' | 'triggerConditionJson' | 'isEnabled' | 'definitionJson'>,
  now: Date = new Date()): WorkflowPackage {
  return {
    format: WORKFLOW_PACKAGE_FORMAT,
    version: WORKFLOW_PACKAGE_VERSION,
    exportedAt: now.toISOString(),
    workflow: {
      name: definition.name,
      code: definition.code,
      modelName: definition.modelName,
      triggerEvent: definition.triggerEvent,
      triggerConditionJson: definition.triggerConditionJson ?? null,
      isEnabled: definition.isEnabled,
      definitionJson: definition.definitionJson
    }
  };
}

/** Readable JSON — so the file is easy to inspect/compare by hand. */
export function serializePackage(pack: WorkflowPackage): string {
  return JSON.stringify(pack, null, 2);
}

export function packageFileName(code: string): string {
  return `workflow-${code.replace(/[^A-Za-z0-9_-]/g, '_') || 'package'}.json`;
}

export function parsePackage(text: string): PackageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }

  const pack = parsed as Partial<WorkflowPackage> | null;
  if (!pack || typeof pack !== 'object' || pack.format !== WORKFLOW_PACKAGE_FORMAT) return { ok: false, error: 'format' };
  if (typeof pack.version !== 'number' || pack.version > WORKFLOW_PACKAGE_VERSION) return { ok: false, error: 'version' };

  const workflow = pack.workflow;
  if (!workflow || typeof workflow !== 'object'
      || !isText(workflow.name) || !isText(workflow.code) || !isText(workflow.modelName)
      || !isText(workflow.triggerEvent) || typeof workflow.definitionJson !== 'string') {
    return { ok: false, error: 'fields' };
  }

  try {
    const graph = JSON.parse(workflow.definitionJson) as { steps?: unknown };
    if (!graph || !Array.isArray(graph.steps)) return { ok: false, error: 'definition' };
  } catch {
    return { ok: false, error: 'definition' };
  }

  return {
    ok: true,
    workflow: {
      name: workflow.name.trim(),
      code: workflow.code.trim(),
      modelName: workflow.modelName.trim(),
      triggerEvent: workflow.triggerEvent,
      triggerConditionJson: workflow.triggerConditionJson ?? null,
      isEnabled: workflow.isEnabled !== false,
      definitionJson: workflow.definitionJson
    }
  };
}

/**
 * A code unused in the target: if the same code exists, `_2`, `_3`… is appended. The code is the workflow's
 * identity across versions; an existing workflow must not be overwritten.
 */
export function freeCode(code: string, taken: ReadonlyArray<string>): string {
  const used = new Set(taken.map(c => c.toLowerCase()));
  if (!used.has(code.toLowerCase())) return code;

  // Only a short counter suffix (_2 … _999) is stripped: "satinalma_2" → "satinalma_3";
  // the code's own long numeric tail (e.g. a timestamp) is kept.
  const base = code.replace(/_\d{1,3}$/, '');
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
