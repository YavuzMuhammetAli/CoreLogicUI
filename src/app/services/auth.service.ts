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

/** GET /Auth/session response. The token is in an HttpOnly cookie; JavaScript cannot see it. */
export interface SessionInfo {
  authenticated: boolean;
  expiration: string | null;
  /** Tenant-local user ID; NOT the master ID. */
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

  /** Open session; null means anonymous. `loaded` stays false until the server is asked. */
  private readonly session = signal<SessionInfo | null>(null);
  private loaded = false;
  private loading$: Observable<SessionInfo | null> | null = null;

  constructor(private http: HttpClient) {
    // Token from the pre-cookie version: no longer read, don't leave it in the browser.
    if (isPlatformBrowser(this.platformId)) localStorage.removeItem('access_token');
  }

  login(dto: LoginDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/login`, dto, { params: { useCookie: true } })
      .pipe(switchMap(res => this.afterSessionStarted(res)));
  }

  // NOTE: `register()` was removed. Users are added to a company from the /users screen
  // via UserAdminService (see CLAUDE.md "Şirket İçi Kullanıcı
  // Yönetimi" (In-company user management)); there is NO flow for signing up to an existing company from outside.

  /**
   * New company application. Provisioning starts when the link in the email is opened (see verifyCompany);
   * the response is the same even if the email is already registered, so the screen cannot tell which.
   */
  registerCompany(dto: CompanyRegisterDto): Observable<DataResponseModel<CompanyRegistrationResult>> {
    return this.http.post<DataResponseModel<CompanyRegistrationResult>>(`${this.baseUrl}/register-company`, dto);
  }

  /** Starts provisioning with the token from the email link; the data field returns the provisionId. */
  verifyCompany(token: string): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/verify-company`, { token });
  }

  /** Provisioning status — step list + durations; when complete, reports that auto-login is available. */
  getProvisionStatus(provisionId: string): Observable<DataResponseModel<ProvisionStatus>> {
    return this.http.get<DataResponseModel<ProvisionStatus>>(
      `${this.baseUrl}/provision-status/${provisionId}`
    );
  }

  /** Logs in the administrator of the newly provisioned company (auto-login in the wizard). */
  startProvisionSession(provisionId: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/provision-session/${provisionId}`, {})
      .pipe(switchMap(res => this.afterSessionStarted(res)));
  }

  /**
   * Guarantees the session has been read from the server. Guards and startup share the same request:
   * the router's first navigation starts in parallel with APP_INITIALIZER.
   */
  ensureSession(): Observable<SessionInfo | null> {
    if (this.loaded) return of(this.session());

    this.loading$ ??= this.loadSession().pipe(
      finalize(() => { this.loading$ = null; }),
      shareReplay(1)
    );
    return this.loading$;
  }

  /** The cookie is HttpOnly, so only the server can delete it. An error does not block local logout. */
  logout(): Observable<void> {
    this.clearSession();
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined))
    );
  }

  /** Ends the local session (errorInterceptor after a 401). Was a session open? */
  clearSession(): boolean {
    const hadSession = this.session() !== null;
    this.session.set(null);
    this.loaded = true;
    return hadSession;
  }

  isLoggedIn(): boolean {
    return this.session() !== null;
  }

  /** Owner of the user-bound caches: changes when another user logs in. */
  sessionKey(): string | null {
    const session = this.session();
    return session ? `${session.tenantId}|${session.userId}|${session.expiration}` : null;
  }

  /**
   * TENANT-LOCAL ID of the session user.
   *
   * Roles, permissions and FKs are bound to this ID — it is NOT the master user ID.
   * The user management screen uses it for the "is this my account" check.
   */
  getCurrentUserId(): number | null {
    return this.session()?.userId ?? null;
  }

  /** Display info of the session user. */
  getSessionUser(): { name: string; email: string; initials: string; tenantId: string | null; companyId: string | null } | null {
    const session = this.session();
    if (!session) return null;
    const name = (session.name ?? '').trim();
    const email = (session.email ?? '').trim();
    // Without a name, use the part of the email before @ as the display name
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
    // A suspended company returns 403: fall back to the login screen, don't redirect to /models.
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
