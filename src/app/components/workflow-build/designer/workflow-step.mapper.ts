import {
  RecordField,
  WorkflowBranch,
  WorkflowForm,
  WorkflowFormField,
  WorkflowJoinMode,
  WorkflowStep
} from '../../../models/workflow.model';
import { StepFieldValue, buildAssignment, buildSla } from '../workflow-step.form';

/** Raw value of the pop-up form (newStepGroup shape, getRawValue). */
export type StepFormValue = Record<string, unknown>;

export interface MappedStep {
  step: WorkflowStep;
  /** The step's `entityStatusMap` entry; empty = no entry. */
  statusLabel: string;
}

/** Fields that belong only to a parallel step — deleted when it turns into an approval step. */
const PARALLEL_ONLY = ['branches', 'mode', 'onComplete', 'onAnyReject'] as const;
/** Fields that belong only to an approval step — deleted when it turns into a parallel step. */
const APPROVAL_ONLY = ['onApprove', 'onReject'] as const;

/**
 * Converts the pop-up form value into a step object.
 *
 * The rules are the SAME as the old `buildGraph()` (compared against a frozen copy
 * in the spec); there are two deliberate differences:
 *  1) The result is built ON TOP of the original step (`original`): fields without a
 *     counterpart in the form (unknown properties, the parallel branch's form, the form field's
 *     maxLength) are preserved. They used to be deleted on every save.
 *  2) Position (x/y) belongs to the canvas, not the pop-up; it is taken from the original step.
 *
 * When the type changes, fields of the old type are deleted: if `branches` remained on a step
 * turned from parallel into approval, the validator would say "a single step cannot define branches".
 */
export function stepFromFormValue(raw: StepFormValue, original?: WorkflowStep | null): MappedStep {
  const key = String(raw['key'] ?? '');
  const name = String(raw['name'] ?? '');
  const statusLabel = String(raw['statusLabel'] ?? '').trim();
  const isParallel = raw['type'] === 'parallel';

  const approveTarget = String(raw['onApprove'] ?? '') || null;
  const rejectTarget = String(raw['onReject'] ?? '') || null;

  const base = omit(original ?? {}, isParallel ? APPROVAL_ONLY : PARALLEL_ONLY);
  const position = { x: original?.x ?? null, y: original?.y ?? null };

  if (isParallel) {
    const branches = (raw['branches'] ?? []) as Array<Record<string, unknown>>;

    return {
      statusLabel,
      step: {
        ...base,
        key,
        type: 'parallel',
        name,
        mode: (raw['mode'] as WorkflowJoinMode) ?? 'all',
        branches: branches.map(branchFromFormValue),
        // The parallel step's OWN assignment/form is not sent — the validator
        // rejects it; tasks are created from the branches.
        assignment: null,
        sla: null,
        form: null,
        onComplete: approveTarget,
        onAnyReject: rejectTarget,
        ...position
      }
    };
  }

  const fields = (raw['fields'] ?? []) as StepFieldValue[];
  const recordFields = (raw['recordFields'] ?? []) as RecordField[];
  const approveLabel = String(raw['approveLabel'] ?? '').trim();
  const allowReject = raw['allowReject'] !== false;
  const rejectLabel = allowReject ? String(raw['rejectLabel'] ?? '').trim() : '';

  // The form is produced if there is a free field OR a record field/button setting; otherwise
  // it stays null and the task schema copy is empty too (old behaviour).
  const hasForm = fields.length > 0 || recordFields.length > 0
    || !!approveLabel || !!rejectLabel || !allowReject;

  const form: WorkflowForm | null = hasForm
    ? {
        ...(original?.form ?? {}),
        fields: fields.map(fieldFromFormValue),
        recordFields: recordFields.map(field => ({
          column: String(field.column ?? ''),
          isRequired: !!field.isRequired
        })),
        approveLabel: approveLabel || null,
        rejectLabel: rejectLabel || null,
        allowReject
      }
    : null;

  return {
    statusLabel,
    step: {
      ...base,
      key,
      type: 'approval',
      name,
      assignment: buildAssignment(raw),
      sla: buildSla(raw),
      form,
      onApprove: approveTarget,
      // With rejection disabled the target is not sent — the validator rejects the dead edge.
      onReject: allowReject ? rejectTarget : null,
      ...position
    }
  };
}

function branchFromFormValue(raw: Record<string, unknown>): WorkflowBranch {
  const form = (raw['form'] ?? null) as WorkflowForm | null;
  return {
    key: String(raw['key'] ?? ''),
    name: String(raw['name'] ?? ''),
    assignment: buildAssignment(raw),
    sla: buildSla(raw),
    // The branch form is not edited in the pop-up; it is carried in a hidden control and written back unchanged.
    ...(form ? { form } : {})
  };
}

function fieldFromFormValue(field: StepFieldValue): WorkflowFormField {
  const maxLength = Number(field.maxLength) || null;
  return {
    name: String(field.name ?? ''),
    dataType: String(field.dataType ?? 'string'),
    label: String(field.label ?? '') || null,
    isRequired: !!field.isRequired,
    ...(maxLength ? { maxLength } : {}),
    enumValues: String(field.enumValues ?? '') || null
  };
}

function omit(source: Partial<WorkflowStep>, keys: readonly string[]): Partial<WorkflowStep> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as Partial<WorkflowStep>;
}
