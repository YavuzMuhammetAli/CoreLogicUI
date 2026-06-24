/**
 * İsimli rol (RBAC) — GET /Role/getall yanıt öğesi.
 * Backend RoleDto ile eşleşir.
 */
export interface Role {
  id: number;
  name: string;
  /** Bu role üye olan aktif kullanıcı sayısı. */
  userCount: number;
}
