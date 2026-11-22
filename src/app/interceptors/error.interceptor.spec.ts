import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor, SKIP_FORBIDDEN_REDIRECT } from './error.interceptor';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

/**
 * Redirect rules of the error interceptor.
 *
 * The main behaviour under guard: a 403 on an auxiliary request must not pull the user off the page.
 * Without this rule a non-admin user could never see the landing dashboard and could not enter the record
 * screen on the first try (the layout's loadAssembly and form rules returned 403).
 */
describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['clearSession']);
    auth.clearSession.and.returnValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Sends the request, responds with the given status code; verifies the error continues down the chain. */
  function failWith(status: number, context?: HttpContext, body: object = { success: false }): void {
    let errored = false;
    http.get('/test', { context }).subscribe({ error: () => (errored = true) });
    httpMock.expectOne('/test').flush(body, { status, statusText: 'err' });
    expect(errored).withContext('hata zinciri devam etmeli').toBeTrue();
  }

  it('403: redirects to /models on an unmarked request', () => {
    failWith(403);
    expect(router.navigate).toHaveBeenCalledWith(['/models']);
  });

  it('403: does not redirect on a request marked SKIP_FORBIDDEN_REDIRECT', () => {
    failWith(403, new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401: with a session, clears it and redirects to login (regardless of the mark)', () => {
    failWith(401, new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true));
    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'session_expired' } });
  });

  it('401: does not redirect without a session', () => {
    auth.clearSession.and.returnValue(false);
    failWith(401);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401 session_invalidated: redirects to login with the data-restored reason', () => {
    failWith(401, undefined, { success: false, code: 'session_invalidated' });
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'tenant_restored' } });
  });

  it('503 tenant_maintenance: keeps the session, only shows a warning', () => {
    const warn = spyOn(TestBed.inject(NotificationService), 'warn');
    failWith(503, undefined, { success: false, code: 'tenant_maintenance', message: 'Geri yükleniyor' });
    expect(router.navigate).not.toHaveBeenCalled();
    expect(auth.clearSession).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Geri yükleniyor');
  });

  it('429: does not redirect, tells the user about the rate limit', () => {
    const warn = spyOn(TestBed.inject(NotificationService), 'warn');
    failWith(429);
    expect(warn).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not redirect on other errors', () => {
    failWith(500);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
