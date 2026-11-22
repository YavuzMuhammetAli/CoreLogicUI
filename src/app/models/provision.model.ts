/**
 * Company sign-up / tenant provisioning models — match the backend Entities.DTOs
 * (CompanyRegisterDto, ProvisionStatusDto) one to one.
 */

/** POST /Auth/register-company request. */
export interface CompanyRegisterDto {
  companyName: string;
  /** Normalized to lower case; ^[a-z0-9]{2,20}$ — source of the DB name, immutable. */
  companyCode: string;
  adminName: string;
  adminSurname: string;
  email: string;
  password: string;
}

/** POST /Auth/register-company response. If verification is enabled, provisioning has not started yet. */
export interface CompanyRegistrationResult {
  verificationRequired: boolean;
  /** Filled only when verification is disabled (development). */
  provisionId: string | null;
}

/** A single provisioning step — the UI projection of a ProvisionLog row. */
export interface ProvisionStep {
  /** Backend step constant (e.g. "CreateDatabase") — mapped to an i18n key. */
  stepName: string;
  status: 'Started' | 'Completed' | 'Failed';
  durationMs: number | null;
  error: string | null;
}

/** The data field of the GET /Auth/provision-status/{id} response. */
export interface ProvisionStatus {
  provisionId: string;
  status: 'Running' | 'Completed' | 'Failed' | 'RolledBack';
  steps: ProvisionStep[];
  error: string | null;
  /** true only for Completed + within a ~10 min window — the session is opened with startProvisionSession. */
  autoLoginAvailable: boolean;
}

/** Fixed order of the steps shown in the UI during provisioning (backend step names). */
export const PROVISION_STEP_ORDER: readonly string[] = [
  'ValidateAndReserve',
  'CreateDatabase',
  'ApplySchema',
  'SeedDefaults',
  'CreateAdminUser',
  'CreateMasterUser',
  'Activate'
];
