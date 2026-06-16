/**
 * GET /User/getall yanıt öğesi — hassas alanlar (PasswordHash/Salt) içermez.
 * Backend UserForListDto ile eşleşir.
 */
export interface AppUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: boolean;
  /** 'admin' OperationClaim'ine sahip olup olmadığı. Değişiklik yeni JWT'de etkinleşir. */
  isAdmin: boolean;
}
