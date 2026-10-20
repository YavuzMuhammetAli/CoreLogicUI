import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataResponseModel } from '../models/dataResponseModel';
import { CompanyRegisterDto, ProvisionStatus } from '../models/provision.model';
import { initialsFromFullName } from '../utils/user-initials';

export interface LoginDto {
  email: string;
  password: string;
}

export interface AccessTokenResponse {
  success: boolean;
  message: string;
  data: {
    token: string;
    expiration: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Auth`;
  private readonly platformId = inject(PLATFORM_ID);

  constructor(private http: HttpClient) {}

  private get storage(): Storage | null {
    return isPlatformBrowser(this.platformId) ? localStorage : null;
  }

  login(dto: LoginDto): Observable<AccessTokenResponse> {
    return this.http.post<AccessTokenResponse>(`${this.baseUrl}/login`, dto).pipe(
      tap(res => {
        if (res.success && res.data?.token) {
          this.storage?.setItem('access_token', res.data.token);
        }
      })
    );
  }

  // NOT: `register()` kaldırıldı. Şirkete kullanıcı ekleme /users ekranından
  // UserAdminService üzerinden yapılır (bkz. CLAUDE.md "Şirket İçi Kullanıcı
  // Yönetimi"); dışarıdan mevcut bir şirkete kayıt akışı YOKTUR.

  /**
   * Yeni şirket kaydı — kurulum backend'de arka planda ilerler; data alanı
   * provisionId (GUID) döner, ilerleme getProvisionStatus ile poll'lanır.
   */
  registerCompany(dto: CompanyRegisterDto): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/register-company`, dto);
  }

  /** Kurulum durumu — adım listesi + süreler; tamamlandıysa otomatik login token'ı içerir. */
  getProvisionStatus(provisionId: string): Observable<DataResponseModel<ProvisionStatus>> {
    return this.http.get<DataResponseModel<ProvisionStatus>>(
      `${this.baseUrl}/provision-status/${provisionId}`
    );
  }

  /** Token'ı saklar — wizard'daki otomatik login akışı kullanır (login() ile aynı anahtar). */
  storeToken(token: string): void {
    this.storage?.setItem('access_token', token);
  }

  logout(): void {
    this.storage?.removeItem('access_token');
  }

  isLoggedIn(): boolean {
    return !!this.storage?.getItem('access_token');
  }

  /**
   * Oturumdaki kullanıcının TENANT-LOCAL ID'si (JWT nameidentifier claim'i).
   *
   * Roller, izinler ve FK'ler bu ID'ye bağlıdır — master kullanıcı ID'si DEĞİLDİR.
   * Kullanıcı yönetimi ekranı "bu benim hesabım mı" kontrolü için kullanır.
   */
  getCurrentUserId(): number | null {
    const payload = this.readPayload();
    if (!payload) return null;
    const raw = payload['nameid'] ?? payload[`${AuthService.ClaimNs}nameidentifier`];
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  /** JWT payload'ını çözümleyip kullanıcı bilgisini döndürür (tenant claim'leri dahil). */
  getUserFromToken(): { name: string; email: string; initials: string; tenantId: string | null; companyId: string | null } | null {
    const payload = this.readPayload();
    if (!payload) return null;
    // Backend token'ı `new JwtSecurityToken(claims)` ile kurar; claim'ler kısa adlara
    // eşlenmez, URI anahtarıyla gelir. Kısa adlar da okunur (eşleyen bir handler'a karşı).
    const name: string = (payload['unique_name'] ?? payload['name']
      ?? payload[`${AuthService.ClaimNs}name`] ?? '').trim();
    const email: string = (payload['email']
      ?? payload[`${AuthService.ClaimNs}emailaddress`] ?? '').trim();
    // Multi-tenant claim'leri — backend JwtHelper.SetClaims her token'a ekler
    const tenantId: string | null = payload['tenant_id'] ?? null;
    const companyId: string | null = payload['company_id'] ?? null;
    // Ad yoksa e-postanın @ öncesi kısmını görünen ad olarak kullan
    const display = name || email.split('@')[0] || '';
    const initials = initialsFromFullName(name, email);
    return { name: display, email, initials, tenantId, companyId };
  }

  /** .NET ClaimTypes önekleri (ClaimTypes.Name, Email, NameIdentifier). */
  private static readonly ClaimNs = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/';

  /**
   * Oturum token'ının payload'ı; token yoksa ya da çözülemezse null.
   *
   * JWT base64url kodludur: düz `atob` '-' / '_' içeren token'da hata fırlatır, UTF-8
   * çözmediği için de "Kullanıcı" gibi adlar bozuk gelirdi.
   */
  private readPayload(): Record<string, any> | null {
    const token = this.storage?.getItem('access_token');
    if (!token) return null;
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }
}
