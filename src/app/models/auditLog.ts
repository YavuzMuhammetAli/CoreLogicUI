/** Operation type — written by the backend AuditSaveChangesInterceptor. */
export type AuditAction = 'Added' | 'Modified' | 'Deleted';

/**
 * Immutable record of all CRUD operations. Matches the backend `Entities.Concrete.AuditLog`.
 * Read-only — the write channel is the EF interceptor; it cannot be created/changed from the UI.
 */
export interface AuditLog {
  id: number;
  entityName: string;
  entityId: string;
  action: AuditAction;
  oldValues: string | null;
  newValues: string | null;
  userId: number;
  timestamp: string;
  ip: string;
  tenantId: string;
}
