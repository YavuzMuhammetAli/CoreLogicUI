import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserProfile, ProfileUpdateDto, ChangePasswordDto } from '../models/userProfile';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Profile`;

  constructor(private http: HttpClient) {}

  /** Giriş yapmış kullanıcının profilini döndürür (GET /Profile/me). */
  getMe(): Observable<DataResponseModel<UserProfile>> {
    return this.http.get<DataResponseModel<UserProfile>>(`${this.baseUrl}/me`);
  }

  /** Profil bilgilerini günceller (PUT /Profile/update). */
  updateProfile(dto: ProfileUpdateDto): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/update`, dto);
  }

  /** Şifre değiştirir (POST /Profile/change-password). */
  changePassword(dto: ChangePasswordDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/change-password`, dto);
  }

  /**
   * Profil fotoğrafı yükler (POST /Profile/upload-photo).
   * Yanıt: { success, message, data: photoUrl }
   */
  uploadPhoto(file: File): Observable<DataResponseModel<string>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/upload-photo`, form);
  }

  /**
   * Arayüz dilini backend'e yazar (PUT /Profile/language). Bildirim e-postaları
   * arka planda gönderildiği için isteğin Accept-Language'ı yoktur; kullanıcının
   * hangi dilde mail alacağı buradan öğrenilir.
   *
   * Bu metot LanguageService'e KONMADI: languageInterceptor o servisi kullanıyor,
   * HttpClient enjekte etmek döngüsel DI oluştururdu.
   */
  setLanguage(language: 'tr' | 'en'): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/language`, { language });
  }

  /** Profil fotoğrafını siler (DELETE /Profile/photo). */
  deletePhoto(): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(`${this.baseUrl}/photo`);
  }

  /**
   * Göreli PhotoUrl'yi tam URL'ye dönüştürür.
   * Backend /uploads/avatars/... döndürür; bunu apiBaseUrl ile tamamlar.
   */
  resolvePhotoUrl(photoUrl: string | null | undefined): string | null {
    if (!photoUrl) return null;
    if (photoUrl.startsWith('http')) return photoUrl;
    return `${environment.apiBaseUrl}${photoUrl}`;
  }
}
