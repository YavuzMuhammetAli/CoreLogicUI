/**
 * Yapay Zeka modülünün (G4) veri modelleri.
 * Backend `Entities.DTOs.AiDtos` ile bire bir eşleşir.
 */

// ── Sohbet ─────────────────────────────────────────────────────────────────

/** GET /Ai/conversations satırı (sol panel). */
export interface AiConversationListItem {
  id: number;
  title: string;
  createdOn: string;
  totalTokens: number;
}

/** GET /Ai/conversations/{id}. */
export interface AiConversationDetail {
  id: number;
  title: string;
  messages: AiMessage[];
  proposals: AiProposal[];
}

export interface AiMessage {
  id: number;
  /** user | assistant */
  role: 'user' | 'assistant';
  content: string;
  /** Özetlenmiş düşünme çıktısı — yalnız gösterim. */
  thinkingSummary?: string | null;
  inputTokens: number;
  outputTokens: number;
  createdOn: string;
}

/** POST /Ai/chat gövdesi. conversationId yoksa yeni sohbet açılır. */
export interface AiChatRequest {
  conversationId?: number | null;
  message: string;
}

// ── Öneriler ───────────────────────────────────────────────────────────────

export type AiProposalKind = 'model' | 'report' | 'dashboard';

/**
 * proposed → imported → published, ya da herhangi bir adımda failed.
 * `imported` yalnız model önerileri için geçerlidir (metadata yazıldı, taslak halde).
 */
export type AiProposalStatus = 'proposed' | 'imported' | 'published' | 'failed';

export interface AiProposal {
  id: number;
  kind: AiProposalKind;
  name: string;
  /** Tool girdisinin ham JSON'u; `parseProposalPayload` ile çözülür. */
  payloadJson: string;
  status: AiProposalStatus;
  errorMessage?: string | null;
  importedEntityId?: number | null;
}

/** POST /Ai/proposals/{id}/status gövdesi. */
export interface AiProposalStatusUpdate {
  status: AiProposalStatus;
  errorMessage?: string | null;
  importedEntityId?: number | null;
}

// ── Öneri yükleri (PayloadJson içeriği) ────────────────────────────────────
// Şekiller backend'deki CoreLogicToolCatalog tool şemalarıyla eşleşir.

export interface AiProposedColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  label: string;
  maxLength?: number;
  enumValues?: string;
  lookupTargetTable?: string;
  lookupDisplayColumn?: string;
}

export interface AiProposedRelationship {
  targetModel: string;
  /** 1=OneToOne 2=OneToMany 3=ManyToOne 4=ManyToMany 5=SelfReference */
  relationshipType: number;
  propertyName: string;
  inverseProperty?: string;
  required: boolean;
  cascadeDelete: boolean;
}

export interface AiProposedSubModel {
  entityName: string;
  columns: AiProposedColumn[];
}

export interface AiModelPayload {
  entityName: string;
  description: string;
  columns: AiProposedColumn[];
  subModels?: AiProposedSubModel[];
  relationships?: AiProposedRelationship[];
}

export interface AiReportPayload {
  name: string;
  modelName: string;
  selectedColumns: string[];
  filters?: { field: string; operator: string; value: string }[];
  groupBy?: string[];
  aggregates?: { field: string; function: string }[];
  sortBy?: { field: string; direction: string }[];
  chartType: string;
}

export interface AiDashboardPayload {
  name: string;
  widgets: {
    /** Rapor ADIYLA referanslanır; ID yayınlama sırasında çözülür. */
    reportName: string;
    chartType: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[];
}

// ── Kota ───────────────────────────────────────────────────────────────────

/**
 * GET /Ai/usage. `entitled` false ise planda `ai_tokens_per_month` satırı yok
 * demektir (deny-by-default) — satırın yokluğu erişimin yokluğudur.
 */
export interface AiUsage {
  entitled: boolean;
  limit?: number | null;
  used: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
}

// ── Akış olayları ──────────────────────────────────────────────────────────

/** POST /Ai/chat'in SSE olayları. */
export type AiStreamEvent =
  /** Akışın ilk olayı; yeni sohbetin kimliğini taşır. */
  | { type: 'meta'; conversationId: number }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  /** Bir öneri kaydedildi; sağ paneli tazelemek için işaret. */
  | { type: 'tool'; name: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  /** Güvenlik denetimi isteği reddetti. */
  | { type: 'refusal' }
  | { type: 'error'; message: string }
  | { type: 'done' };
