import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/**
 * Oturum token'ı ve JWT payload okuması.
 *
 * Korunan hatalar: düz `atob` base64url ('-', '_') içeren token'da patlıyordu ve UTF-8
 * çözmediği için Türkçe adlar bozuk görünüyordu; backend claim'leri kısa adla değil
 * .NET ClaimTypes URI'siyle yazar.
 */
describe('AuthService', () => {
  const ns = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/';
  let service: AuthService;
  let httpMock: HttpTestingController;

  /** Payload'ı UTF-8 → base64url kodlayıp imzasız bir JWT üretir. */
  function jwt(payload: object): string {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `e30.${b64}.sig`;
  }

  beforeEach(() => {
    localStorage.removeItem('access_token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('access_token');
  });

  it('başarılı girişte token saklanır, başarısızda saklanmaz', () => {
    service.login({ email: 'a@b', password: 'x' }).subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/Auth/login`)
      .flush({ success: false, message: 'Hatalı', data: null });
    expect(service.isLoggedIn()).toBeFalse();

    service.login({ email: 'a@b', password: 'y' }).subscribe();
    httpMock.expectOne(`${environment.apiBaseUrl}/Auth/login`)
      .flush({ success: true, message: '', data: { token: 't1', expiration: '' } });
    expect(localStorage.getItem('access_token')).toBe('t1');

    service.logout();
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('URI anahtarlı claim\'leri ve UTF-8 adı okur', () => {
    // Çok baytlı UTF-8 harfler: atob tek başına bunları Latin-1 olarak bozardı.
    service.storeToken(jwt({
      [`${ns}name`]: 'Işıl Şahin',
      [`${ns}emailaddress`]: 'isil@acme.test',
      [`${ns}nameidentifier`]: '42',
      tenant_id: 'acme',
      company_id: '7'
    }));

    const user = service.getUserFromToken();
    expect(user?.name).toBe('Işıl Şahin');
    expect(user?.email).toBe('isil@acme.test');
    expect(user?.tenantId).toBe('acme');
    expect(user?.companyId).toBe('7');
    expect(service.getCurrentUserId()).toBe(42);
  });

  it('kısa claim adlarını da okur; ad yoksa e-postanın yerel kısmı görünür', () => {
    service.storeToken(jwt({ email: 'mehmet@acme.test', nameid: 5 }));
    expect(service.getUserFromToken()?.name).toBe('mehmet');
    expect(service.getCurrentUserId()).toBe(5);
  });

  it('geçersiz ya da eksik kullanıcı kimliğinde null', () => {
    service.storeToken(jwt({ nameid: 'abc' }));
    expect(service.getCurrentUserId()).toBeNull();

    service.storeToken(jwt({ nameid: 0 }));
    expect(service.getCurrentUserId()).toBeNull();
  });

  it('bozuk ya da olmayan token\'da null döner, hata fırlatmaz', () => {
    expect(service.getUserFromToken()).toBeNull();

    service.storeToken('bozuk-token');
    expect(service.getUserFromToken()).toBeNull();
    expect(service.getCurrentUserId()).toBeNull();
  });
});
