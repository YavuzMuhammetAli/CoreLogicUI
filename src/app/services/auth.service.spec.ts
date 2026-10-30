import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AuthService, SessionInfo } from './auth.service';

/**
 * Oturum HttpOnly çerezdedir: arayüz token'ı hiç görmez, oturumu ve kullanıcıyı /Auth/session'dan
 * öğrenir. Korunan kural: token tarayıcı depolamasına yazılmaz.
 */
describe('AuthService', () => {
  const base = `${environment.apiBaseUrl}/Auth`;
  const session: SessionInfo = {
    authenticated: true, expiration: '2026-11-01T00:00:00Z', userId: 42,
    name: 'Ayşe Yılmaz', email: 'ayse@acme.test', tenantId: 'acme', companyId: '7'
  };
  const anonymous: SessionInfo = {
    authenticated: false, expiration: null, userId: null, name: null, email: null, tenantId: null, companyId: null
  };

  let service: AuthService;
  let httpMock: HttpTestingController;

  function create(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  function flushSession(data: SessionInfo): void {
    httpMock.expectOne(`${base}/session`).flush({ success: true, message: '', data });
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('access_token');
  });

  it('çerezli girişi ister, başarıda oturumu sunucudan okur', () => {
    create();
    service.login({ email: 'a@b', password: 'x' }).subscribe();

    const login = httpMock.expectOne(r => r.url === `${base}/login`);
    expect(login.request.params.get('useCookie')).toBe('true');
    login.flush({ success: true, message: '', data: { expiration: session.expiration } });
    flushSession(session);

    expect(service.isLoggedIn()).toBeTrue();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('başarısız girişte oturum açılmaz, session sorulmaz', () => {
    create();
    service.login({ email: 'a@b', password: 'x' }).subscribe();
    httpMock.expectOne(r => r.url === `${base}/login`).flush({ success: false, message: 'Hatalı' });

    expect(service.isLoggedIn()).toBeFalse();
  });

  it('kullanıcı bilgisi oturumdan gelir', () => {
    create();
    service.ensureSession().subscribe();
    flushSession(session);

    const user = service.getSessionUser();
    expect(user?.name).toBe('Ayşe Yılmaz');
    expect(user?.email).toBe('ayse@acme.test');
    expect(user?.tenantId).toBe('acme');
    expect(user?.companyId).toBe('7');
    expect(service.getCurrentUserId()).toBe(42);
  });

  it('ad yoksa e-postanın @ öncesi görünen ad olur', () => {
    create();
    service.ensureSession().subscribe();
    flushSession({ ...session, name: '' });

    expect(service.getSessionUser()?.name).toBe('ayse');
  });

  it('anonim ziyaretçide oturum yok', () => {
    create();
    service.ensureSession().subscribe();
    flushSession(anonymous);

    expect(service.isLoggedIn()).toBeFalse();
    expect(service.getSessionUser()).toBeNull();
    expect(service.sessionKey()).toBeNull();
  });

  it('ensureSession aynı anda gelen çağrıları tek isteğe indirir, sonra yeniden sormaz', () => {
    create();
    const seen: unknown[] = [];
    service.ensureSession().subscribe(s => seen.push(s));
    service.ensureSession().subscribe(s => seen.push(s));
    flushSession(session);
    service.ensureSession().subscribe(s => seen.push(s));

    expect(seen.length).toBe(3);
    expect(seen.every(s => (s as SessionInfo).userId === 42)).toBeTrue();
  });

  it('session hatasında anonim sayılır, guard takılmaz', () => {
    create();
    let result: unknown = 'bekliyor';
    service.ensureSession().subscribe(s => (result = s));
    httpMock.expectOne(`${base}/session`).flush(null, { status: 500, statusText: 'err' });

    expect(result).toBeNull();
  });

  it('çıkış sunucudan çerezi siler, yerel oturum hemen biter', () => {
    create();
    service.ensureSession().subscribe();
    flushSession(session);

    let done = false;
    service.logout().subscribe(() => (done = true));
    expect(service.isLoggedIn()).toBeFalse();

    httpMock.expectOne(`${base}/logout`).flush({ success: true, message: '' });
    expect(done).toBeTrue();
  });

  it('çıkış isteği başarısız olsa da akış tamamlanır', () => {
    create();
    let done = false;
    service.logout().subscribe(() => (done = true));
    httpMock.expectOne(`${base}/logout`).flush(null, { status: 500, statusText: 'err' });

    expect(done).toBeTrue();
  });

  it('clearSession oturumun açık olup olmadığını bildirir', () => {
    create();
    service.ensureSession().subscribe();
    flushSession(session);

    expect(service.clearSession()).toBeTrue();
    expect(service.clearSession()).toBeFalse();
  });

  it('önbellek sahibi kullanıcıya bağlıdır', () => {
    create();
    service.ensureSession().subscribe();
    flushSession(session);
    const first = service.sessionKey();

    service.clearSession();
    service.login({ email: 'b@b', password: 'x' }).subscribe();
    httpMock.expectOne(r => r.url === `${base}/login`).flush({ success: true, message: '' });
    flushSession({ ...session, userId: 43 });

    expect(service.sessionKey()).not.toBe(first);
  });

  it('otomatik giriş oturumu sunucudan açar', () => {
    create();
    service.startProvisionSession('abc').subscribe();
    httpMock.expectOne(`${base}/provision-session/abc`).flush({ success: true, message: '' });
    flushSession(session);

    expect(service.isLoggedIn()).toBeTrue();
  });

  it('eski sürümün localStorage token\'ı silinir', () => {
    localStorage.setItem('access_token', 'eski');
    create();

    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
