/**
 * Data models of the AI module (G4).
 * Match the backend `Entities.DTOs.AiDtos` one to one.
 */

// ── Sohbet ─────────────────────────────────────────────────────────────────

/** A GET /Ai/conversations row (left panel). */
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
  /** Summarized thinking output — display only. */
  thinkingSummary?: string | null;
  inputTokens: number;
  outputTokens: number;
  createdOn: string;
}

/** Body of POST /Ai/chat. Without a conversationId a new conversation is started. */
export interface AiChatRequest {
  conversationId?: number | null;
  message: string;
}

// ── Proposals ──────────────────────────────────────────────────────────────

export type AiProposalKind = 'model' | 'report' | 'dashboard' | 'model_change';

/**
 * proposed → imported → published, or failed at any step.
 * `imported` applies only to model proposals (metadata written, in draft state).
 */
export type AiProposalStatus = 'proposed' | 'imported' | 'published' | 'failed';

export interface AiProposal {
  id: number;
  kind: AiProposalKind;
  name: string;
  /** Raw JSON of the tool input; decoded with `parseProposalPayload`. */
  payloadJson: string;
  status: AiProposalStatus;
  errorMessage?: string | null;
  importedEntityId?: number | null;
}

/** Body of POST /Ai/proposals/{id}/status. */
export interface AiProposalStatusUpdate {
  status: AiProposalStatus;
  errorMessage?: string | null;
  importedEntityId?: number | null;
}

// ── Proposal payloads (PayloadJson content) ────────────────────────────────
// The shapes match the tool schemas in the backend CoreLogicToolCatalog.

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

/**
 * propose_model_change — metadata change and/or new columns on a SAVED model.
 * `alterColumns` carries only the CHANGED fields; an omitted field keeps its saved value.
 * Name and type do not change (the backend tool schema does not carry them at all).
 */
export interface AiColumnChange {
  columnName: string;
  label?: string;
  description?: string;
  isNullable?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  regex?: string;
  regexMessage?: string;
  /** For enum, ALL allowed values: 'A|B|C'. */
  enumValues?: string;
  lookupDisplayColumn?: string;
}

export interface AiModelChangePayload {
  entityName: string;
  reason: string;
  alterColumns?: AiColumnChange[];
  addColumns?: AiProposedColumn[];
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
    /** Referenced by report NAME; the ID is resolved during publishing. */
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
 * GET /Ai/usage. If `entitled` is false the plan has no `ai_tokens_per_month` row
 * (deny-by-default) — the absence of the row is the absence of access.
 */
export interface AiUsage {
  entitled: boolean;
  limit?: number | null;
  used: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  /**
   * Can a new request be started right now — the SAME rule as the server's pre-check (remaining
   * share, minus what running requests hold, not below `minimumToStart`). The UI does not compute
   * its own threshold: it used to say "remaining ≤ 0" while the server rejected below 20,000.
   */
  canStart: boolean;
  minimumToStart: number;
  /** Share held by this company's running requests (not yet written to consumption). */
  inFlight: number;
}

// ── Stream events ──────────────────────────────────────────────────────────

/** SSE events of POST /Ai/chat. */
export type AiStreamEvent =
  /** The first event of the stream; carries the new conversation's ID. */
  | { type: 'meta'; conversationId: number }
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  /**
   * A tool ran (a proposal was saved or columns were read); to refresh the right panel and show a
   * step line in the stream. `subject` is the model/report name (from the input; empty otherwise).
   */
  | { type: 'tool'; name: string; subject?: string }
  /** Provider busy: retrying / switching to the fallback model (text on the server, in the request language). */
  | { type: 'status'; message: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  /** The safety check rejected the request. */
  | { type: 'refusal' }
  /** Quota ran out during the response; the response was cut off (message on the server, in the request language). */
  | { type: 'quota'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
