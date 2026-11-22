/**
 * Model holding the user's own profile info.
 * Matches the `data` field of the GET /Profile/me response one to one.
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

/** Body of PUT /Profile/update */
export interface ProfileUpdateDto {
  firstName: string;
  lastName: string;
  email: string;
  tc: string;
  birthDay: string;       // ISO 8601 tarih string
}

/** Body of POST /Profile/change-password */
export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
