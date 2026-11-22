/**
 * Workflow domain types — one to one with the backend Entities.DTOs.Workflow*.
 *
 * DefinitionJson and TriggerConditionJson are carried as RAW STRINGS on the server, so that
 * the DTO does not have to change every time the shape of the step graph grows in
 * Phase 3/4. The same choice on the client: `WorkflowDefinition` holds a string,
 * typed reading is done only inside `parseDefinition()`.
 */

// ── Sabitler ────────────────────────────────────────────────────────────────

/** Definition lifecycle — same as the backend WorkflowDefinitionStatus. */
export type WorkflowStatus = 'Draft' | 'Published' | 'Archived';

/** Instance status — same as the backend WorkflowInstanceStatus. */
export type WorkflowInstanceStatus =
  | 'Running' | 'Completed' | 'Rejected' | 'Cancelled' | 'Failed';

/** Task status — same as the backend WorkflowTaskStatus. */
export type WorkflowTaskStatus =
  | 'Pending' | 'Completed' | 'Rejected' | 'Skipped' | 'Expired' | 'Cancelled';

export type WorkflowTriggerEvent = 'onCreate' | 'onUpdate' | 'manual';

export type WorkflowAssignmentMode = 'user' | 'role' | 'creator';

export type WorkflowTimeoutPolicy = 'escalate' | 'autoApprove' | 'autoReject';

/**
 * Terminal step keys. Not real steps but pseudo targets describing where the
 * workflow ended up — same as the backend WorkflowTerminals.
 */
export const WORKFLOW_TERMINAL_COMPLETED = '__completed';
export const WORKFLOW_TERMINAL_REJECTED = '__rejected';

/**
 * Option tables used in dropdowns.
 * `labelKey` is resolved in the template with `| t` — same as the OPERATORS pattern in report-build.
 */
export const TRIGGER_EVENT_OPTIONS: ReadonlyArray<{ value: WorkflowTriggerEvent; labelKey: string }> = [
  { value: 'onCreate', labelKey: 'workflow.trigger.onCreate' },
  { value: 'onUpdate', labelKey: 'workflow.trigger.onUpdate' },
  { value: 'manual',   labelKey: 'workflow.trigger.manual' }
];

export const ASSIGNMENT_MODE_OPTIONS: ReadonlyArray<{ value: WorkflowAssignmentMode; labelKey: string }> = [
  { value: 'role',    labelKey: 'workflow.assign.role' },
  { value: 'user',    labelKey: 'workflow.assign.user' },
  { value: 'creator', labelKey: 'workflow.assign.creator' }
];

export const TIMEOUT_POLICY_OPTIONS: ReadonlyArray<{ value: WorkflowTimeoutPolicy; labelKey: string }> = [
  { value: 'escalate',    labelKey: 'workflow.timeout.escalate' },
  { value: 'autoApprove', labelKey: 'workflow.timeout.autoApprove' },
  { value: 'autoReject',  labelKey: 'workflow.timeout.autoReject' }
];

/** Trigger condition operators — the SAME set as the report filter (deliberately). */
export const WORKFLOW_OPERATORS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'eq',         labelKey: 'report.operator.eq' },
  { value: 'ne',         labelKey: 'report.operator.ne' },
  { value: 'gt',         labelKey: 'report.operator.gt' },
  { value: 'ge',         labelKey: 'report.operator.ge' },
  { value: 'lt',         labelKey: 'report.operator.lt' },
  { value: 'le',         labelKey: 'report.operator.le' },
  { value: 'contains',   labelKey: 'report.operator.contains' },
  { value: 'startswith', labelKey: 'report.operator.startswith' }
];

// ── Server DTOs ─────────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  id: number;
  name: string;
  code: string;
  modelName: string;
  version: number;
  status: WorkflowStatus;
  definitionJson: string;
  triggerEvent: WorkflowTriggerEvent;
  triggerConditionJson?: string | null;
  isEnabled: boolean;
  createdOn: string;
  /**
   * The row's last write stamp. Editing starts with this version and it is sent back as
   * `expectedLastModifiedOn` on update (optimistic lock). Kept as text —
   * converting it to a date would reduce the precision to milliseconds.
   */
  lastModifiedOn?: string;
  /** In an update request: the version the client started editing from. No check if empty. */
  expectedLastModifiedOn?: string | null;
  runningInstanceCount: number;
}

/** error: blocks publishing (the draft is still saved) · warning: only draws attention. */
export type WorkflowIssueSeverity = 'error' | 'warning';

/**
 * Structured validation finding. `code` is the translation key
 * (`workflow.issue.{code}`); `message` is the server's Turkish fallback text.
 */
export interface WorkflowIssue {
  code: string;
  severity: WorkflowIssueSeverity;
  message: string;
  stepKey?: string | null;
  branchKey?: string | null;
  /** approve | reject | complete | anyReject */
  port?: string | null;
  field?: string | null;
  args: Record<string, string>;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  /** Plain text of the errors (old contract). */
  errors: string[];
  /** Errors + warnings, in a form that can be attached to a node/port. */
  issues?: WorkflowIssue[];
}

export interface WorkflowEvent {
  id: number;
  eventType: string;
  stepKey?: string | null;
  userId?: number | null;
  dataJson?: string | null;
  createdAt: string;
}

export interface WorkflowInstance {
  id: number;
  definitionId: number;
  definitionVersion: number;
  definitionName: string;
  /** The workflow's code, stable across versions. */
  definitionCode?: string;
  /** Definition of the version the instance STARTED on — filled only on single reads (the diagram is drawn from it). */
  definitionJson?: string | null;
  /** Incident: the instance failed at an automatic step and is waiting. */
  hasIncident?: boolean;
  entityType: string;
  entityId: number;
  status: WorkflowInstanceStatus;
  currentStepKey?: string | null;
  startedBy?: number | null;
  /** Display name of the starter — filled only on single reads. */
  startedByName?: string | null;
  startedAt: string;
  completedAt?: string | null;
  errorMessage?: string | null;
  timeline: WorkflowEvent[];
  tasks: WorkflowTask[];
}

export interface WorkflowTask {
  id: number;
  instanceId: number;
  stepKey: string;
  branchKey?: string | null;
  name: string;
  assignedUserId?: number | null;
  assignedRoleId?: number | null;
  assignedRoleName?: string | null;
  status: WorkflowTaskStatus;
  dueAt?: string | null;
  escalateAt?: string | null;
  escalatedAt?: string | null;
  formSchemaJson?: string | null;
  formDataJson?: string | null;
  decision?: string | null;
  comment?: string | null;
  completedBy?: number | null;
  completedAt?: string | null;
  // Display names — filled only in instance detail (WorkflowInstance/get); a regular
  // user cannot call the /User and /Role endpoints.
  assignedUserName?: string | null;
  completedByName?: string | null;
  /** For a role-assigned task still pending, the role's active members (whose approval is awaited). */
  candidates?: string[] | null;
  createdOn: string;
  entityType: string;
  entityId: number;
  workflowName: string;
  /** The delay is computed on the server — the client clock may be wrong. */
  isOverdue: boolean;
}

/** Instance list filter (admin, GET /WorkflowInstance/list paged mode). */
export interface WorkflowInstanceQuery {
  status?: WorkflowInstanceStatus | '';
  incident?: boolean;
  model?: string;
  code?: string;
  page: number;
  pageSize: number;
}

/** Event log chain verification result. */
export interface WorkflowChain {
  isValid: boolean;
  eventCount: number;
  /** ID of the first corrupted row; null if the chain is intact. */
  brokenAtEventId?: number | null;
  reason?: string | null;
}

export interface StartWorkflowRequest {
  entityType: string;
  entityId: number;
  code?: string;
}

export interface CompleteTaskRequest {
  taskId: number;
  decision: 'approve' | 'reject';
  comment?: string | null;
  formDataJson?: string | null;
  /**
   * Values to write to the step's RECORD fields (column → value JSON object).
   * Only on approval and only the step's columns are written; in the same transaction as the approval.
   */
  recordValuesJson?: string | null;
}

/** The assignee saving the step fields without advancing the step. */
export interface SaveTaskRecordRequest {
  entityType: string;
  entityId: number;
  recordValuesJson: string;
}

// ── Instance state of the record screen (GET /WorkflowInstance/recordState) ───

/** A manually startable workflow — the "{Akış} Başlat" (Start {workflow}) button on the record screen. */
export interface StartableWorkflow {
  code: string;
  name: string;
}

export interface RecordField {
  column: string;
  isRequired: boolean;
}

/** The user's pending task on the record — the step button next to Kaydet (Save). */
export interface MyRecordTask {
  taskId: number;
  stepKey: string;
  branchKey?: string | null;
  stepName: string;
  approveLabel?: string | null;
  rejectLabel?: string | null;
  canReject: boolean;
  recordFields: RecordField[];
  /** Are there free decision fields — if so, the button opens a dialog first. */
  hasExtraFields: boolean;
  formSchemaJson?: string | null;
  dueAt?: string | null;
  isOverdue: boolean;
}

export interface RunningWorkflow {
  instanceId: number;
  definitionName: string;
  currentStepKey?: string | null;
  currentStepName?: string | null;
  /** The instance runs on a parent record (child row screen). */
  onParentRecord: boolean;
}

export interface RecordWorkflowState {
  /** The record is inside a form-based workflow — fields are locked. */
  isLocked: boolean;
  /** The user can override the lock (admin). */
  canBypass: boolean;
  /** Locked and the user cannot edit any field. */
  lockedForMe: boolean;
  running?: RunningWorkflow | null;
  /** Columns the user can edit while locked. */
  editableColumns: string[];
  myTasks: MyRecordTask[];
  /** Empty while an instance is running. */
  startable: StartableWorkflow[];
}

// ── Definition graph (typed form of DefinitionJson) ──────────────────────────

export interface WorkflowAssignment {
  mode: WorkflowAssignmentMode;
  userId?: number | null;
  roleId?: number | null;
}

export interface WorkflowSla {
  dueHours?: number | null;
  escalateAfterHours?: number | null;
  onTimeout: WorkflowTimeoutPolicy;
}

/**
 * Form field. The `dataType` vocabulary is THE SAME as the model columns (CoreLogicTypeMap) —
 * this is the condition for the task screen to use the existing dynamic form generator
 * (inputTypeFor / validatorsFor / sanitizePayload) without any change.
 */
export interface WorkflowFormField {
  name: string;
  dataType: string;
  label?: string | null;
  isRequired: boolean;
  maxLength?: number | null;
  enumValues?: string | null;
}

/**
 * Step form. COPIED into the task's `formSchemaJson` when the task is opened; old
 * copies lack the new fields (a missing allowReject counts as true).
 */
export interface WorkflowForm {
  /** Free decision fields — their values are written to the instance context, NOT the record. */
  fields: WorkflowFormField[];
  /** RECORD columns the assignee fills in at this step (the record is locked while the workflow runs). */
  recordFields?: RecordField[];
  /** Text of the advance button; the step name if empty. */
  approveLabel?: string | null;
  /** Text of the reject button; "Reddet" (Reject) if empty. */
  rejectLabel?: string | null;
  /** Whether rejection is allowed at this step; true if missing. */
  allowReject?: boolean;
}

export type WorkflowStepType = 'approval' | 'parallel' | 'condition' | 'end' | 'action' | 'notify' | 'timer';

/** Wait mode — same as the backend WorkflowTimerModes. */
export type WorkflowTimerMode = 'duration' | 'untilField';
export type WorkflowTimerUnit = 'minutes' | 'hours' | 'days';

/** Settings of the Wait node. */
export interface WorkflowTimerConfig {
  mode?: WorkflowTimerMode | null;
  /** Duration amount (duration). */
  amount?: number | null;
  unit?: WorkflowTimerUnit | null;
  /** Date field (untilField) — in Istanbul time; midnight if date only. */
  field?: string | null;
  /** Hours to add to the date; negative = before. */
  offsetHours?: number | null;
  /** If the date is empty: continue without waiting, or raise an incident. */
  onMissing?: 'continue' | 'incident' | null;
}

/** A wait can last at most this many days (backend MaxDuration). */
export const TIMER_MAX_DAYS = 366;

/** Plan quota (GET /Workflow/usage) — unlimited if limit is null. */
export interface WorkflowUsage {
  entitled: boolean;
  definitionLimit?: number | null;
  definitionsUsed: number;
  runLimit?: number | null;
  runsUsed: number;
  periodStart: string;
  periodEnd: string;
}

/** Workflow features available to the tenant (GET /Workflow/capabilities). */
export interface WorkflowCapabilities {
  /** Wait node — migration 022. */
  timers: boolean;
}

/** Value source of an Update field row — same as the backend WorkflowSetModes. */
export type WorkflowSetMode = 'value' | 'formula' | 'clear';

/** A single row of the Update field node. */
export interface WorkflowSetField {
  column: string;
  mode?: WorkflowSetMode | null;
  /** Constant value (text) or formula; absent for clear. */
  value?: string | null;
}

/** Notification recipient kind — same as the backend WorkflowRecipientKinds. */
export type WorkflowRecipientKind = 'creator' | 'starter' | 'role' | 'user' | 'stepAssignees';

export interface WorkflowRecipient {
  kind: WorkflowRecipientKind;
  /** role → role, user → user ID. */
  id?: number | null;
  /** stepAssignees → step key. */
  stepKey?: string | null;
}

/** Notification channel (backend IWorkflowNotificationChannel.Name). */
export type WorkflowNotifyChannel = 'inapp' | 'email';

export const NOTIFY_CHANNELS: ReadonlyArray<WorkflowNotifyChannel> = ['inapp', 'email'];

/** Settings of the Notification node; if the channel list is empty, all configured ones. */
export interface WorkflowNotifyConfig {
  recipients: WorkflowRecipient[];
  channels?: WorkflowNotifyChannel[];
  subject?: string | null;
  body?: string | null;
}

/** Fixed placeholders of the notification template (record fields are `record.{Column}`). */
export const NOTIFY_FIXED_PLACEHOLDERS: ReadonlyArray<string> = ['workflow.name', 'step.name', 'instance.id', 'link'];

export const NOTIFY_SUBJECT_MAX = 200;
export const NOTIFY_BODY_MAX = 2000;

/** How the rows of a condition case are combined. */
export type WorkflowCaseMatch = 'all' | 'any';

/** Result of the End node. */
export type WorkflowEndOutcome = 'completed' | 'rejected';

/**
 * A case of the condition node: rows (all/any) or a formula
 * (auto value language, result true/false). Tried in order, the first match wins.
 */
export interface WorkflowCase {
  key: string;
  label?: string | null;
  match?: WorkflowCaseMatch | null;
  when: WorkflowCondition[];
  expression?: string | null;
  to?: string | null;
}

/** Condition row operators: trigger operators + empty/non-empty checks (backend WorkflowCaseOperators). */
export const CASE_OPERATORS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'eq',         labelKey: 'report.operator.eq' },
  { value: 'ne',         labelKey: 'report.operator.ne' },
  { value: 'gt',         labelKey: 'report.operator.gt' },
  { value: 'ge',         labelKey: 'report.operator.ge' },
  { value: 'lt',         labelKey: 'report.operator.lt' },
  { value: 'le',         labelKey: 'report.operator.le' },
  { value: 'contains',   labelKey: 'report.operator.contains' },
  { value: 'startswith', labelKey: 'report.operator.startswith' },
  { value: 'isempty',    labelKey: 'workflow.case.operator.isempty' },
  { value: 'notempty',   labelKey: 'workflow.case.operator.notempty' }
];

/** Operators that take no value. */
export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set(['isempty', 'notempty']);

/** Advance rule of a parallel step — same as the backend WorkflowJoinModes. */
export type WorkflowJoinMode = 'all' | 'any';

export const JOIN_MODE_OPTIONS: ReadonlyArray<{ value: WorkflowJoinMode; labelKey: string }> = [
  { value: 'all', labelKey: 'workflow.join.all' },
  { value: 'any', labelKey: 'workflow.join.any' }
];

/** A single branch of a parallel step; it has its own assignment, duration and form. */
export interface WorkflowBranch {
  key: string;
  name: string;
  assignment?: WorkflowAssignment | null;
  sla?: WorkflowSla | null;
  form?: WorkflowForm | null;
}

export interface WorkflowStep {
  key: string;
  type: WorkflowStepType;
  name: string;
  assignment?: WorkflowAssignment | null;
  sla?: WorkflowSla | null;
  form?: WorkflowForm | null;
  onApprove?: string | null;
  onReject?: string | null;

  // ── Only type = parallel ──────────────────────────────────────────────────
  branches?: WorkflowBranch[];
  mode?: WorkflowJoinMode | null;
  onComplete?: string | null;
  onAnyReject?: string | null;
  // ── Only type = condition ─────────────────────────────────────────────────
  cases?: WorkflowCase[];
  /** Step to go to if no case matches (required). */
  defaultTo?: string | null;
  // ── Only type = end ───────────────────────────────────────────────────────
  outcome?: WorkflowEndOutcome | null;
  // ── Only type = action / notify ───────────────────────────────────────────
  /** Update field: the fields to write, in order. */
  sets?: WorkflowSetField[];
  /** Send notification: recipients, channels, template. */
  notify?: WorkflowNotifyConfig | null;
  /** Step to go to after the automatic action (required). */
  next?: string | null;
  /** Wait settings (type = timer). */
  timer?: WorkflowTimerConfig | null;

  /**
   * Position moved by hand on the canvas. If ABSENT, automatic layout is used —
   * so definitions created before the canvas are drawn properly too, and
   * form-based editing does not have to specify a position.
   */
  x?: number | null;
  y?: number | null;
}

/** Transitions out of a step — single and parallel steps use different fields. */
export function outgoingTargets(step: WorkflowStep): { approve?: string | null; reject?: string | null } {
  return step.type === 'parallel'
    ? { approve: step.onComplete, reject: step.onAnyReject }
    : { approve: step.onApprove, reject: step.onReject };
}

export interface WorkflowGraph {
  startStep: string;
  steps: WorkflowStep[];
  entityStatusMap: Record<string, string>;
}

export interface WorkflowCondition {
  field: string;
  operator: string;
  value?: string | null;
}

/**
 * Turns DefinitionJson into a typed graph. Returns null on malformed JSON — the definition
 * comes from the user and malformed input is an expected case, no exception is thrown.
 */
export function parseDefinition(json: string | null | undefined): WorkflowGraph | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as Partial<WorkflowGraph>;
    return {
      startStep: parsed.startStep ?? '',
      steps: parsed.steps ?? [],
      entityStatusMap: parsed.entityStatusMap ?? {}
    };
  } catch {
    return null;
  }
}

export function parseConditions(json: string | null | undefined): WorkflowCondition[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Step summary shown when choosing a rollback target. */
export interface WorkflowStepInfo {
  key: string;
  name: string;
  isParallel: boolean;
  /** Step type — End cannot be a rollback target. */
  type?: WorkflowStepType;
}

// ── Simulation (POST /Workflow/simulate) ─────────────────────────────────────

export interface WorkflowSimDecision {
  stepKey: string;
  branchKey?: string | null;
  decision: 'approve' | 'reject';
}

export interface WorkflowSimulateRequest {
  definition: Partial<WorkflowDefinition>;
  /** Sample record (column → value); ignored if entityId is given. */
  record?: Record<string, string | number | boolean | null>;
  entityId?: number | null;
  decisions: WorkflowSimDecision[];
}

export type WorkflowSimOutcome = 'completed' | 'rejected' | 'waiting' | 'incident' | 'failed' | 'limit';

export interface WorkflowSimStep {
  seq: number;
  stepKey: string;
  type: string;
  /** Port taken out of the step (approve, reject, case:x, default…). */
  port?: string | null;
  caseKey?: string | null;
  decision?: string | null;
  /** Summary of the automatic action: the fields written or the notification subject. */
  note?: string | null;
}

export interface WorkflowSimulation {
  outcome: WorkflowSimOutcome;
  endStepKey?: string | null;
  /** The awaited or failed step. */
  stopStepKey?: string | null;
  message?: string | null;
  path: WorkflowSimStep[];
}

/** Request to reassign a task to another user/role. */
export interface ReassignTaskRequest {
  taskId: number;
  userId?: number | null;
  roleId?: number | null;
  reason?: string | null;
}
