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
  { value: 'eq',         labelKey: 'report.operator.eq' },
  { value: 'ne',         labelKey: 'report.operator.ne' },
  { value: 'gt',         labelKey: 'report.operator.gt' },
  { value: 'ge',         labelKey: 'report.operator.ge' },
  { value: 'lt',         labelKey: 'report.operator.lt' },
  { value: 'le',         labelKey: 'report.operator.le' },
  { value: 'contains',   labelKey: 'report.operator.contains' },
  { value: 'startswith', labelKey: 'report.operator.startswith' }
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
  /**
   * Satırın son yazılma damgası. Düzenleme bu sürümle başlar ve güncellemede
   * `expectedLastModifiedOn` olarak geri gönderilir (iyimser kilit). Metin olarak
   * saklanır — tarihe çevirmek hassasiyeti milisaniyeye düşürür.
   */
  lastModifiedOn?: string;
  /** Güncelleme isteğinde: istemcinin düzenlemeye başladığı sürüm. Boşsa denetim yok. */
  expectedLastModifiedOn?: string | null;
  runningInstanceCount: number;
}

/** error: yayını engeller (taslak yine kaydedilir) · warning: yalnız dikkat çeker. */
export type WorkflowIssueSeverity = 'error' | 'warning';

/**
 * Yapılandırılmış doğrulama bulgusu. `code` çeviri anahtarıdır
 * (`workflow.issue.{code}`); `message` sunucunun Türkçe yedek metni.
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
  /** Hataların düz metni (eski sözleşme). */
  errors: string[];
  /** Hatalar + uyarılar, düğüme/porta bağlanabilir biçimde. */
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
  /** Akışın sürümler arası sabit kodu. */
  definitionCode?: string;
  /** Sürecin BAŞLADIĞI sürümün tanımı — yalnız tekil okumada dolu (şema bununla çizilir). */
  definitionJson?: string | null;
  /** Olay (incident): süreç bir otomatik adımda hata verip bekliyor. */
  hasIncident?: boolean;
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

/** Süreç listesi filtresi (admin, GET /WorkflowInstance/list sayfalı mod). */
export interface WorkflowInstanceQuery {
  status?: WorkflowInstanceStatus | '';
  incident?: boolean;
  model?: string;
  code?: string;
  page: number;
  pageSize: number;
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
  /**
   * Adımın KAYIT alanlarına yazılacak değerler (kolon → değer JSON nesnesi).
   * Yalnız onayda ve yalnız adımın kolonları yazılır; onayla aynı transaction'da.
   */
  recordValuesJson?: string | null;
}

/** Görevlinin adım alanlarını, adımı ilerletmeden kaydetmesi. */
export interface SaveTaskRecordRequest {
  entityType: string;
  entityId: number;
  recordValuesJson: string;
}

// ── Kayıt ekranının süreç durumu (GET /WorkflowInstance/recordState) ─────────

/** Elle başlatılabilen akış — kayıt ekranındaki "{Akış} Başlat" butonu. */
export interface StartableWorkflow {
  code: string;
  name: string;
}

export interface RecordField {
  column: string;
  isRequired: boolean;
}

/** Kullanıcının kayıttaki bekleyen görevi — Kaydet'in yanındaki adım butonu. */
export interface MyRecordTask {
  taskId: number;
  stepKey: string;
  branchKey?: string | null;
  stepName: string;
  approveLabel?: string | null;
  rejectLabel?: string | null;
  canReject: boolean;
  recordFields: RecordField[];
  /** Serbest karar alanları var mı — varsa buton önce diyalog açar. */
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
  /** Süreç bir üst kayıtta koşuyor (alt satır ekranı). */
  onParentRecord: boolean;
}

export interface RecordWorkflowState {
  /** Kayıt form tabanlı bir akışın içinde — alanlar kilitli. */
  isLocked: boolean;
  /** Kullanıcı kilidi aşabilir (admin). */
  canBypass: boolean;
  /** Kilitli ve kullanıcı hiçbir alanı düzenleyemiyor. */
  lockedForMe: boolean;
  running?: RunningWorkflow | null;
  /** Kilitliyken kullanıcının düzenleyebildiği kolonlar. */
  editableColumns: string[];
  myTasks: MyRecordTask[];
  /** Koşan süreç varken boş. */
  startable: StartableWorkflow[];
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

/**
 * Adım formu. Görev açılırken görevin `formSchemaJson`'ına KOPYALANIR; eski
 * kopyalarda yeni alanlar yoktur (allowReject yoksa true sayılır).
 */
export interface WorkflowForm {
  /** Serbest karar alanları — değerleri kayda DEĞİL, süreç bağlamına yazılır. */
  fields: WorkflowFormField[];
  /** Görevlinin bu adımda dolduracağı KAYIT kolonları (akış sürerken kayıt kilitli). */
  recordFields?: RecordField[];
  /** İlerletme butonunun metni; boşsa adım adı. */
  approveLabel?: string | null;
  /** Red butonunun metni; boşsa "Reddet". */
  rejectLabel?: string | null;
  /** Bu adımda reddetmeye izin var mı; yoksa true. */
  allowReject?: boolean;
}

export type WorkflowStepType = 'approval' | 'parallel' | 'condition' | 'end' | 'action' | 'notify' | 'timer';

/** Bekleme modu — backend WorkflowTimerModes ile aynı. */
export type WorkflowTimerMode = 'duration' | 'untilField';
export type WorkflowTimerUnit = 'minutes' | 'hours' | 'days';

/** Bekleme düğümünün ayarları. */
export interface WorkflowTimerConfig {
  mode?: WorkflowTimerMode | null;
  /** Süre miktarı (duration). */
  amount?: number | null;
  unit?: WorkflowTimerUnit | null;
  /** Tarih alanı (untilField) — İstanbul saatiyle; yalnız tarihse gece yarısı. */
  field?: string | null;
  /** Tarihe eklenecek saat; negatif = önce. */
  offsetHours?: number | null;
  /** Tarih boşsa: beklemeden devam ya da olay. */
  onMissing?: 'continue' | 'incident' | null;
}

/** Bekleme en fazla bu kadar gün sürebilir (backend MaxDuration). */
export const TIMER_MAX_DAYS = 366;

/** Tenant'ın kullanabildiği akış özellikleri (GET /Workflow/capabilities). */
export interface WorkflowCapabilities {
  /** Bekleme düğümü — migrasyon 022. */
  timers: boolean;
}

/** Alan güncelle satırının değer kaynağı — backend WorkflowSetModes ile aynı. */
export type WorkflowSetMode = 'value' | 'formula' | 'clear';

/** Alan güncelle düğümünün tek satırı. */
export interface WorkflowSetField {
  column: string;
  mode?: WorkflowSetMode | null;
  /** Sabit değer (metin) ya da formül; clear'da yok. */
  value?: string | null;
}

/** Bildirim alıcısı türü — backend WorkflowRecipientKinds ile aynı. */
export type WorkflowRecipientKind = 'creator' | 'starter' | 'role' | 'user' | 'stepAssignees';

export interface WorkflowRecipient {
  kind: WorkflowRecipientKind;
  /** role → rol, user → kullanıcı kimliği. */
  id?: number | null;
  /** stepAssignees → adım anahtarı. */
  stepKey?: string | null;
}

/** Bildirim kanalı (backend IWorkflowNotificationChannel.Name). */
export type WorkflowNotifyChannel = 'inapp' | 'email';

export const NOTIFY_CHANNELS: ReadonlyArray<WorkflowNotifyChannel> = ['inapp', 'email'];

/** Bildirim düğümünün ayarları; kanal listesi boşsa yapılandırılmış hepsi. */
export interface WorkflowNotifyConfig {
  recipients: WorkflowRecipient[];
  channels?: WorkflowNotifyChannel[];
  subject?: string | null;
  body?: string | null;
}

/** Bildirim şablonunun sabit yer tutucuları (kayıt alanları `record.{Kolon}`). */
export const NOTIFY_FIXED_PLACEHOLDERS: ReadonlyArray<string> = ['workflow.name', 'step.name', 'instance.id', 'link'];

export const NOTIFY_SUBJECT_MAX = 200;
export const NOTIFY_BODY_MAX = 2000;

/** Koşul durumundaki satırların birleşimi. */
export type WorkflowCaseMatch = 'all' | 'any';

/** Bitiş düğümünün sonucu. */
export type WorkflowEndOutcome = 'completed' | 'rejected';

/**
 * Koşul düğümünün bir durumu: satırlar (hepsi/herhangi biri) ya da formül
 * (otomatik değer dili, sonucu doğru/yanlış). Sırayla denenir, ilk eşleşen kazanır.
 */
export interface WorkflowCase {
  key: string;
  label?: string | null;
  match?: WorkflowCaseMatch | null;
  when: WorkflowCondition[];
  expression?: string | null;
  to?: string | null;
}

/** Koşul satırı operatörleri: tetik operatörleri + boş/dolu denetimi (backend WorkflowCaseOperators). */
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

/** Değer girilmeyen operatörler. */
export const VALUELESS_OPERATORS: ReadonlySet<string> = new Set(['isempty', 'notempty']);

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
  // ── Yalnızca type = condition ─────────────────────────────────────────────
  cases?: WorkflowCase[];
  /** Hiçbir durum eşleşmezse gidilecek adım (zorunlu). */
  defaultTo?: string | null;
  // ── Yalnızca type = end ───────────────────────────────────────────────────
  outcome?: WorkflowEndOutcome | null;
  // ── Yalnızca type = action / notify ───────────────────────────────────────
  /** Alan güncelle: yazılacak alanlar, sırayla. */
  sets?: WorkflowSetField[];
  /** Bildirim gönder: alıcılar, kanallar, şablon. */
  notify?: WorkflowNotifyConfig | null;
  /** Otomatik eylemden sonra gidilecek adım (zorunlu). */
  next?: string | null;
  /** Bekleme ayarları (type = timer). */
  timer?: WorkflowTimerConfig | null;

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
  /** Adım tipi — Bitiş geri alma hedefi olamaz. */
  type?: WorkflowStepType;
}

// ── Simülasyon (POST /Workflow/simulate) ─────────────────────────────────────

export interface WorkflowSimDecision {
  stepKey: string;
  branchKey?: string | null;
  decision: 'approve' | 'reject';
}

export interface WorkflowSimulateRequest {
  definition: Partial<WorkflowDefinition>;
  /** Örnek kayıt (kolon → değer); entityId verilirse yok sayılır. */
  record?: Record<string, string | number | boolean | null>;
  entityId?: number | null;
  decisions: WorkflowSimDecision[];
}

export type WorkflowSimOutcome = 'completed' | 'rejected' | 'waiting' | 'incident' | 'failed' | 'limit';

export interface WorkflowSimStep {
  seq: number;
  stepKey: string;
  type: string;
  /** Adımdan çıkılan port (approve, reject, case:x, default…). */
  port?: string | null;
  caseKey?: string | null;
  decision?: string | null;
  /** Otomatik eylemin özeti: yazılan alanlar ya da bildirim konusu. */
  note?: string | null;
}

export interface WorkflowSimulation {
  outcome: WorkflowSimOutcome;
  endStepKey?: string | null;
  /** Beklenen ya da hatalı adım. */
  stopStepKey?: string | null;
  message?: string | null;
  path: WorkflowSimStep[];
}

/** Görevi başka bir kullanıcıya/role devretme isteği. */
export interface ReassignTaskRequest {
  taskId: number;
  userId?: number | null;
  roleId?: number | null;
  reason?: string | null;
}
