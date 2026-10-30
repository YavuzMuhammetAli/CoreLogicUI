import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataResponseModel } from '../models/dataResponseModel';
import { ResponseModel } from '../models/responseModel';
import { CompanyRegisterDto, CompanyRegistrationResult, ProvisionStatus } from '../models/provision.model';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';
import { initialsFromFullName } from '../utils/user-initials';

export interface LoginDto {
  email: string;
  password: string;
}

/** GET /Auth/session yanıtı. Token HttpOnly çerezdedir, JavaScript onu göremez. */
export interface SessionInfo {
  authenticated: boolean;
  expiration: string | null;
  /** Tenant-local kullanıcı kimliği; master kimliği DEĞİL. */
  userId: number | null;
  name: string | null;
  email: string | null;
  tenantId: string | null;
  companyId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Auth`;
  private readonly platformId = inject(PLATFORM_ID);

  /** Açık oturum; null ise anonim. Sunucuya sorulana dek `loaded` false kalır. */
  private readonly session = signal<SessionInfo | null>(null);
  private loaded = false;
  private loading$: Observable<SessionInfo | null> | null = null;

  constructor(private http: HttpClient) {
    // Çerez öncesi sürümün token'ı: artık okunmuyor, tarayıcıda kalmasın.
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem('access_token');
  }

  login(dto: LoginDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/login`, dto, { params: { useCookie: true } })
      .pipe(switchMap(res => this.afterSessionStarted(res)));
  }

  // NOT: `register()` kaldırıldı. Şirkete kullanıcı ekleme /users ekranından
  // UserAdminService üzerinden yapılır (bkz. CLAUDE.md "Şirket İçi Kullanıcı
  // Yönetimi"); dışarıdan mevcut bir şirkete kayıt akışı YOKTUR.

  /**
   * Yeni şirket başvurusu. Kurulum e-postadaki bağlantı açılınca başlar (bkz. verifyCompany);
   * e-posta kayıtlı olsa da yanıt aynıdır, ekran hangisi olduğunu bilemez.
   */
  registerCompany(dto: CompanyRegisterDto): Observable<DataResponseModel<CompanyRegistrationResult>> {
    return this.http.post<DataResponseModel<CompanyRegistrationResult>>(`${this.baseUrl}/register-company`, dto);
  }

  /** E-postadaki bağlantının token'ıyla kurulumu başlatır; data alanı provisionId döner. */
  verifyCompany(token: string): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/verify-company`, { token });
  }

  /** Kurulum durumu — adım listesi + süreler; tamamlandıysa otomatik girişin açık olduğunu bildirir. */
  getProvisionStatus(provisionId: string): Observable<DataResponseModel<ProvisionStatus>> {
    return this.http.get<DataResponseModel<ProvisionStatus>>(
      `${this.baseUrl}/provision-status/${provisionId}`
    );
  }

  /** Yeni kurulan şirketin yöneticisine oturum açar (wizard'daki otomatik giriş). */
  startProvisionSession(provisionId: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/provision-session/${provisionId}`, {})
      .pipe(switchMap(res => this.afterSessionStarted(res)));
  }

  /**
   * Oturumun sunucudan okunmuş olmasını garantiler. Guard'lar ve açılış aynı isteği paylaşır:
   * router'ın ilk gezinmesi APP_INITIALIZER ile paralel başlar.
   */
  ensureSession(): Observable<SessionInfo | null> {
    if (this.loaded) return of(this.session());

    this.loading$ ??= this.loadSession().pipe(
      finalize(() => { this.loading$ = null; }),
      shareReplay(1)
    );
    return this.loading$;
  }

  /** Çerez HttpOnly olduğundan yalnız sunucu silebilir. Hata yerel çıkışı engellemez. */
  logout(): Observable<void> {
    this.clearSession();
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  /** Yerel oturumu bitirir (401 sonrası errorInterceptor). Oturum açık mıydı? */
  clearSession(): boolean {
    const hadSession = this.session() !== null;
    this.session.set(null);
    this.loaded = true;
    return hadSession;
  }

  isLoggedIn(): boolean {
    return this.session() !== null;
  }

  /** Kullanıcıya bağlı önbelleklerin sahibi: başka kullanıcıyla girilince değişir. */
  sessionKey(): string | null {
    const session = this.session();
    return session ? `${session.tenantId}|${session.userId}|${session.expiration}` : null;
  }

  /**
   * Oturumdaki kullanıcının TENANT-LOCAL ID'si.
   *
   * Roller, izinler ve FK'ler bu ID'ye bağlıdır — master kullanıcı ID'si DEĞİLDİR.
   * Kullanıcı yönetimi ekranı "bu benim hesabım mı" kontrolü için kullanır.
   */
  getCurrentUserId(): number | null {
    return this.session()?.userId ?? null;
  }

  /** Oturumdaki kullanıcının görünen bilgileri. */
  getSessionUser(): { name: string; email: string; initials: string; tenantId: string | null; companyId: string | null } | null {
    const session = this.session();
    if (!session) return null;
    const name = (session.name ?? '').trim();
    const email = (session.email ?? '').trim();
    // Ad yoksa e-postanın @ öncesi kısmını görünen ad olarak kullan
    const display = name || email.split('@')[0] || '';
    return {
      name: display,
      email,
      initials: initialsFromFullName(name, email),
      tenantId: session.tenantId,
      companyId: session.companyId
    };
  }

  private afterSessionStarted<T extends ResponseModel>(res: T): Observable<T> {
    return res.success ? this.loadSession().pipe(map(() => res)) : of(res);
  }

  private loadSession(): Observable<SessionInfo | null> {
    // Askıya alınmış şirkette 403 döner: giriş ekranına düşülür, /models'e yönlendirilmez.
    const context = new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true);
    return this.http.get<DataResponseModel<SessionInfo>>(`${this.baseUrl}/session`, { context }).pipe(
      map(res => (res.data?.authenticated ? res.data : null)),
      catchError(() => of(null)),
      tap(session => {
        this.session.set(session);
        this.loaded = true;
      })
    );
  }
}
