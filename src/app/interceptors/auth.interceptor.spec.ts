import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { languageInterceptor } from './language.interceptor';

/**
 * İstek başlığı interceptor'ları — oturum token'ı ve arayüz dili localStorage'dan okunur.
 */
describe('authInterceptor + languageInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, languageInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('access_token');
    localStorage.removeItem('lang');
  });

  function send(): { authorization: string | null; language: string | null } {
    http.get('/test').subscribe();
    const request = httpMock.expectOne('/test');
    request.flush({});
    return {
      authorization: request.request.headers.get('Authorization'),
      language: request.request.headers.get('Accept-Language')
    };
  }

  it('token varsa Bearer başlığı ekler', () => {
    localStorage.setItem('access_token', 'abc.def.ghi');
    expect(send().authorization).toBe('Bearer abc.def.ghi');
  });

  it('token yoksa Authorization başlığı eklemez', () => {
    expect(send().authorization).toBeNull();
  });

  it('dil yalnız kod olarak gider; seçim yoksa ya da tanınmıyorsa tr', () => {
    expect(send().language).toBe('tr');

    localStorage.setItem('lang', 'en');
    expect(send().language).toBe('en');

    localStorage.setItem('lang', 'de');
    expect(send().language).toBe('tr');
  });
});
