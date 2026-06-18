/**
 * Kullanıcının kendi profil bilgilerini tutan model.
 * GET /Profile/me yanıtının `data` alanıyla birebir eşleşir.
 */
export interface UserProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  tc: string;
  birthDay: string;       // ISO 8601 tarih string (backend DateTime → JSON string)
  status: boolean;
  isAdmin: boolean;
  createdOn: string;      // ISO 8601
  photoUrl: string | null;
}

/** PUT /Profile/update gövdesi */
export interface ProfileUpdateDto {
  firstName: string;
  lastName: string;
  email: string;
  tc: string;
  birthDay: string;       // ISO 8601 tarih string
}

/** POST /Profile/change-password gövdesi */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
