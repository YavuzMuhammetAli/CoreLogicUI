import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserProfile, ProfileUpdateDto, ChangePasswordDto } from '../models/userProfile';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Profile`;

  /**
   * Last known profile of the session user — null means not loaded yet.
   * The topbar avatar reads it; the profile screen updates it when the photo/name changes so
   * the top-right corner shows the new state without a page reload.
   */
  private readonly _current = signal<UserProfile | null>(null);
  readonly current = this._current.asReadonly();

  constructor(private http: HttpClient) {}

  /** Returns the logged-in user's profile (GET /Profile/me). */
  getMe(): Observable<DataResponseModel<UserProfile>> {
    return this.http.get<DataResponseModel<UserProfile>>(`${this.baseUrl}/me`).pipe(
      tap(res => {
        if (res.success && res.data) this._current.set(res.data);
      })
    );
  }

  /** Reflects a change saved on the profile screen into the shared profile. */
  setCurrent(profile: UserProfile): void {
    this._current.set(profile);
  }

  /** Clears the shared profile (when a new session shell opens). */
  clearCurrent(): void {
    this._current.set(null);
  }

  /** Updates the profile info (PUT /Profile/update). */
  updateProfile(dto: ProfileUpdateDto): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/update`, dto);
  }

  /** Changes the password (POST /Profile/change-password). */
  changePassword(dto: ChangePasswordDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/change-password`, dto);
  }

  /**
   * Uploads the profile photo (POST /Profile/upload-photo).
   * Response: { success, message, data: photoUrl }
   */
  uploadPhoto(file: File): Observable<DataResponseModel<string>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/upload-photo`, form);
  }

  /**
   * Writes the UI language to the backend (PUT /Profile/language). Notification emails
   * are sent in the background, so there is no request Accept-Language; this is where
   * the language the user receives mail in is learned.
   *
   * This method was NOT PUT in LanguageService: languageInterceptor uses that service,
   * and injecting HttpClient there would create a circular DI.
   */
  setLanguage(language: 'tr' | 'en'): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/language`, { language });
  }

  /** Deletes the profile photo (DELETE /Profile/photo). */
  deletePhoto(): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(`${this.baseUrl}/photo`);
  }

  /**
   * Converts a relative PhotoUrl into a full URL.
   * The backend returns /uploads/avatars/...; this completes it with apiBaseUrl.
   */
  resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    return `${environment.apiBaseUrl}${photoUrl}`;
  }
}
