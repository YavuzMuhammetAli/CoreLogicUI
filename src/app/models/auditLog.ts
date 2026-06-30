/** İşlem tipi — backend AuditSaveChangesInterceptor tarafından yazılır. */
export type AuditAction = 'Added' | 'Modified' | 'Deleted';

/**
 * Tüm CRUD işlemlerinin değişmez kaydı. Backend `Entities.Concrete.AuditLog` ile eşleşir.
 * Salt-okunur — yazma kanalı EF interceptor'dır, UI'dan oluşturulamaz/değiştirilemez.
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
