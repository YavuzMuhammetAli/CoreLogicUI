/**
 * GET /User/getall response item — contains no sensitive fields (PasswordHash/Salt).
 * Matches the backend UserForListDto.
 */
export interface AppUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: boolean;
  /** Whether the user has the 'admin' OperationClaim. A change takes effect in the new JWT. */
  isAdmin: boolean;
  /** Registration date (UTC ISO text). */
  createdOn?: string;
}
