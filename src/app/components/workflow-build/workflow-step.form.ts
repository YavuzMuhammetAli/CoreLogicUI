import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  RecordField,
  WorkflowAssignment,
  WorkflowBranch,
  WorkflowSla,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * Form builders for flow steps — used by the step pop-up.
 *
 * Pure functions: FormBuilder is taken as a parameter, no component state is
 * kept. When the pop-up opens a group is built from the step object (WorkflowStep);
 * on save the group value is converted back to a step with `stepFromFormValue`
 * (see designer/workflow-step.mapper.ts). The step in the design document is not touched
 * until the pop-up is saved — "İptal" (Cancel) does not have to undo anything.
 */

/** Step/branch/form field key pattern — same as backend SqlIdentifier. */
export const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Shape of form field values (step.form.fields item). */
export interface StepFieldValue {
  name: string;
  dataType: string;
  label?: string | null;
  isRequired: boolean;
  maxLength?: number | null;
  enumValues?: string | null;
}

/**
 * Builds the assignment object from form values. Since step and branch use the same
 * field names, both go through the same function.
 */
export function buildAssignment(source: Record<string, unknown>): WorkflowAssignment {
  const mode = source['assignMode'] as 'role' | 'user' | 'creator';
  return {
    mode,
    roleId: mode === 'role' ? Number(source['roleId']) || null : null,
    userId: mode === 'user' ? Number(source['userId']) || null : null
  };
}

/**
 * SLA is only produced if actually entered; an empty object would fail the validator
 * with "must be greater than zero".
 */
export function buildSla(source: Record<string, unknown>): WorkflowSla | null {
  const dueHours = source['dueHours'] as number | null;
  const escalateAfterHours = source['escalateAfterHours'] as number | null;

  if (!dueHours && !escalateAfterHours) return null;

  return {
    dueHours: dueHours || null,
    escalateAfterHours: escalateAfterHours || null,
    onTimeout: (source['onTimeout'] as 'escalate' | 'autoApprove' | 'autoReject') ?? 'escalate'
  };
}

export function newFieldGroup(fb: FormBuilder, field?: StepFieldValue): FormGroup {
  return fb.group({
    name: [field?.name ?? '', Validators.required],
    dataType: [field?.dataType ?? 'string'],
    label: [field?.label ?? ''],
    isRequired: [field?.isRequired ?? false],
    // Maximum length of the text field. Previously the form had no control for it and it
    // was silently deleted on every save.
    maxLength: [field?.maxLength ?? null],
    enumValues: [field?.enumValues ?? '']
  });
}

/**
 * The step's record field: the model column the assignee fills in at this step. While the
 * flow runs the record is locked; only these columns are opened to the assignee.
 */
export function newRecordFieldGroup(fb: FormBuilder, field?: RecordField): FormGroup {
  return fb.group({
    column: [field?.column ?? '', Validators.required],
    isRequired: [field?.isRequired ?? false]
  });
}

export function newBranchGroup(fb: FormBuilder, branch?: Partial<WorkflowBranch>): FormGroup {
  return fb.group({
    key: [branch?.key ?? '', [Validators.required, Validators.pattern(KEY_PATTERN)]],
    name: [branch?.name ?? '', Validators.required],
    assignMode: [branch?.assignment?.mode ?? 'role'],
    roleId: [branch?.assignment?.roleId ?? null],
    userId: [branch?.assignment?.userId ?? null],
    // SLA per branch: "finance 24 hours, legal 72 hours" is a real need.
    dueHours: [branch?.sla?.dueHours ?? null],
    escalateAfterHours: [branch?.sla?.escalateAfterHours ?? null],
    onTimeout: [branch?.sla?.onTimeout ?? 'escalate'],
    // The branch's task form is not edited in the pop-up (it can be defined via API/AI).
    // It is carried as is in a hidden control; it used to be deleted on every save.
    form: fb.control(branch?.form ?? null)
  });
}

/**
 * Builds a form group from a step (WorkflowStep) in the definition graph.
 * `statusLabel` is passed separately because it lives in a separate map in the graph.
 */
export function newStepGroup(
  fb: FormBuilder, key: string, step?: WorkflowStep, statusLabel = ''
): FormGroup {
  const group = fb.group({
    key: [step?.key ?? key, [Validators.required, Validators.pattern(KEY_PATTERN)]],
    name: [step?.name ?? '', Validators.required],
    type: [step?.type ?? 'approval'],
    // Progress rule in a parallel step; ignored in a single step.
    mode: [step?.mode ?? 'all'],
    assignMode: [step?.assignment?.mode ?? 'role'],
    roleId: [step?.assignment?.roleId ?? null],
    userId: [step?.assignment?.userId ?? null],
    dueHours: [step?.sla?.dueHours ?? null],
    escalateAfterHours: [step?.sla?.escalateAfterHours ?? null],
    onTimeout: [step?.sla?.onTimeout ?? 'escalate'],
    // Written as onApprove/onReject in a single step, onComplete/onAnyReject in a parallel
    // step; the form keeps a single control pair and the mapper splits them.
    onApprove: [step?.onApprove ?? step?.onComplete ?? ''],
    onReject: [step?.onReject ?? step?.onAnyReject ?? ''],
    statusLabel: [statusLabel],
    // Buttons on the record screen. Empty label = step name / "Reddet" (Reject).
    approveLabel: [step?.form?.approveLabel ?? ''],
    rejectLabel: [step?.form?.rejectLabel ?? ''],
    allowReject: [step?.form?.allowReject ?? true],
    fields: fb.array([]),
    recordFields: fb.array([]),
    branches: fb.array([])
  });

  const fields = group.get('fields') as FormArray;
  for (const field of step?.form?.fields ?? []) {
    fields.push(newFieldGroup(fb, field));
  }

  const recordFields = group.get('recordFields') as FormArray;
  for (const field of step?.form?.recordFields ?? []) {
    recordFields.push(newRecordFieldGroup(fb, field));
  }

  const branches = group.get('branches') as FormArray;
  for (const branch of step?.branches ?? []) {
    branches.push(newBranchGroup(fb, branch));
  }

  return group;
}
