/**
 * Şirket kaydı / tenant provisioning modelleri — backend Entities.DTOs
 * (CompanyRegisterDto, ProvisionStatusDto) ile bire bir eşleşir.
 */

/** POST /Auth/register-company isteği. */
export interface CompanyRegisterDto {
  companyName: string;
  /** Küçük harfe normalize edilir; ^[a-z0-9]{2,20}$ — DB adının kaynağı, değişmez. */
  companyCode: string;
  adminName: string;
  adminSurname: string;
  email: string;
  password: string;
}

/** Tek kurulum adımı — ProvisionLog satırının UI izdüşümü. */
export interface ProvisionStep {
  /** Backend adım sabiti (örn. "CreateDatabase") — i18n anahtarına eşlenir. */
  stepName: string;
  status: 'Started' | 'Completed' | 'Failed';
  durationMs: number | null;
  error: string | null;
}

/** GET /Auth/provision-status/{id} yanıtındaki data alanı. */
export interface ProvisionStatus {
  provisionId: string;
  status: 'Running' | 'Completed' | 'Failed' | 'RolledBack';
  steps: ProvisionStep[];
  error: string | null;
  /** Yalnızca Completed + ~10 dk penceresinde dolu gelir — otomatik login için. */
  token: { token: string; expiration: string } | null;
}

/** Kurulum sırasında UI'da gösterilen adımların sabit sırası (backend adım adları). */
export const PROVISION_STEP_ORDER: readonly string[] = [
  'ValidateAndReserve',
  'CreateDatabase',
  'ApplySchema',
  'SeedDefaults',
  'CreateAdminUser',
  'CreateMasterUser',
  'Activate'
];
