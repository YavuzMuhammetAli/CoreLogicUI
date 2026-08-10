/**
 * İş akışı (workflow) domain tipleri — backend Entities.DTOs.Workflow* ile birebir.
 *
 * DefinitionJson ve TriggerConditionJson sunucuda HAM STRING olarak taşınır; adım
 * grafiğinin şekli Faz 3/4'te genişleyeceği için DTO'yu her seferinde değiştirmek
 * gerekmesin diye. İstemci tarafında da aynı tercih: `WorkflowDefinition` string
 * tutar, tipli okuma yalnızca `parseDefinition()` içinde yapılır.
 */

// ── Sabitler ────────────────────────────────────────────────────────────────

/** Tanımın yaşam döngüsü — backend WorkflowDefinitionStatus ile aynı. */
export type WorkflowStatus = 'Draft' | 'Published' | 'Archived';

/** Süreç durumu — backend WorkflowInstanceStatus ile aynı. */
export type WorkflowInstanceStatus =
  | 'Running' | 'Completed' | 'Rejected' | 'Cancelled' | 'Failed';

/** Görev durumu — backend WorkflowTaskStatus ile aynı. */
export type WorkflowTaskStatus =
  | 'Pending' | 'Completed' | 'Rejected' | 'Skipped' | 'Expired' | 'Cancelled';

export type WorkflowTriggerEvent = 'onCreate' | 'onUpdate' | 'manual';

export type WorkflowAssignmentMode = 'user' | 'role' | 'creator';

export type WorkflowTimeoutPolicy = 'escalate' | 'autoApprove' | 'autoReject';

/**
 * Terminal adım anahtarları. Gerçek adım değil, akışın nereye düştüğünü anlatan
 * sözde hedeflerdir — backend WorkflowTerminals ile aynı.
 */
export const WORKFLOW_TERMINAL_COMPLETED = '__completed';
export const WORKFLOW_TERMINAL_REJECTED = '__rejected';

/**
 * Açılır listelerde kullanılan seçenek tabloları.
 * `labelKey` şablonda `| t` ile çözülür — report-build'deki OPERATORS deseniyle aynı.
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

/** Tetikleme koşulu operatörleri — rapor filtresiyle AYNI küme (bilinçli). */
export const WORKFLOW_OPERATORS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: 'eq',         labelKey: 'report.build.opEq' },
  { value: 'ne',         labelKey: 'report.build.opNe' },
  { value: 'gt',         labelKey: 'report.build.opGt' },
  { value: 'ge',         labelKey: 'report.build.opGe' },
  { value: 'lt',         labelKey: 'report.build.opLt' },
  { value: 'le',         labelKey: 'report.build.opLe' },
  { value: 'contains',   labelKey: 'report.build.opContains' },
  { value: 'startswith', labelKey: 'report.build.opStartsWith' }
];

// ── Sunucu DTO'ları ─────────────────────────────────────────────────────────

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
  runningInstanceCount: number;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: string[];
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
  entityType: string;
  entityId: number;
  status: WorkflowInstanceStatus;
  currentStepKey?: string | null;
  startedBy?: number | null;
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
  createdOn: string;
  entityType: string;
  entityId: number;
  workflowName: string;
  /** Gecikme sunucuda hesaplanır — istemci saati yanlış olabilir. */
  isOverdue: boolean;
}

/** Olay günlüğü zincir doğrulama sonucu. */
export interface WorkflowChain {
  isValid: boolean;
  eventCount: number;
  /** İlk bozuk satırın ID'si; zincir sağlamsa null. */
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
}

// ── Tanım grafiği (DefinitionJson'ın tipli hali) ─────────────────────────────

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
 * Form alanı. `dataType` sözlüğü model kolonlarıyla AYNIDIR (CoreLogicTypeMap) —
 * görev ekranının mevcut dinamik form üreticisini (inputTypeFor / validatorsFor /
 * sanitizePayload) hiç değiştirmeden kullanabilmesinin şartı budur.
 */
export interface WorkflowFormField {
  name: string;
  dataType: string;
  label?: string | null;
  isRequired: boolean;
  maxLength?: number | null;
  enumValues?: string | null;
}

export interface WorkflowForm {
  fields: WorkflowFormField[];
}

export type WorkflowStepType = 'approval' | 'parallel';

/** Paralel adımda ilerleme kuralı — backend WorkflowJoinModes ile aynı. */
export type WorkflowJoinMode = 'all' | 'any';

export const JOIN_MODE_OPTIONS: ReadonlyArray<{ value: WorkflowJoinMode; labelKey: string }> = [
  { value: 'all', labelKey: 'workflow.join.all' },
  { value: 'any', labelKey: 'workflow.join.any' }
];

/** Paralel adımın tek bir dalı; kendi ataması, süresi ve formu vardır. */
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

  // ── Yalnızca type = parallel ──────────────────────────────────────────────
  branches?: WorkflowBranch[];
  mode?: WorkflowJoinMode | null;
  onComplete?: string | null;
  onAnyReject?: string | null;

  /**
   * Canvas'ta elle taşınmış konum. YOKSA otomatik yerleşim kullanılır —
   * bu sayede canvas'tan önce oluşturulmuş tanımlar da düzgün çizilir ve
   * form tabanlı düzenleme konum belirtmek zorunda kalmaz.
   */
  x?: number | null;
  y?: number | null;
}

/** Bir adımdan çıkan geçişler — tekil ve paralel adımda farklı alanlar kullanılır. */
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
 * DefinitionJson'ı tipli grafiğe çevirir. Bozuk JSON'da null döner — tanım
 * kullanıcıdan geliyor ve bozuk girdi beklenen bir durum, istisna fırlatılmaz.
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

/** Rollback hedefi seçiminde gösterilen adım özeti. */
export interface WorkflowStepInfo {
  key: string;
  name: string;
  isParallel: boolean;
}

/** Görevi başka bir kullanıcıya/role devretme isteği. */
export interface ReassignTaskRequest {
  taskId: number;
  userId?: number | null;
  roleId?: number | null;
  reason?: string | null;
}
