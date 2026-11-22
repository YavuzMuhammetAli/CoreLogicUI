/**
 * Named role (RBAC) — GET /Role/getall response item.
 * Matches the backend RoleDto.
 */
export interface Role {
  id: number;
  name: string;
  /** Number of active users who are members of this role. */
  userCount: number;
  /** Route the members of this role are redirected to after login; null if none. */
  defaultLandingPage?: string | null;
}
