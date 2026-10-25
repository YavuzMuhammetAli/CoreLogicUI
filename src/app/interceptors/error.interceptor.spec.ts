import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor, SKIP_FORBIDDEN_REDIRECT } from './error.interceptor';
import { NotificationService } from '../services/notification.service';

/**
 * Hata interceptor'ının yönlendirme kuralları.
 *
 * Asıl korunan davranış: yardımcı bir isteğin 403'ü kullanıcıyı sayfadan koparmamalı.
 * Bu kural yokken admin olmayan kullanıcı açılış dashboard'unu hiç göremiyor ve kayıt
 * ekranına ilk denemede giremiyordu (layout'un loadAssembly'si ve form kuralları 403 dönüyordu).
 */
describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router }
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('access_token');
  });

  /** İsteği atar, verilen durum koduyla yanıtlar; hatanın zincirde devam ettiğini doğrular. */
  function failWith(status: number, context?: HttpContext, body: object = { success: false }): void {
    let errored = false;
    http.get('/test', { context }).subscribe({ error: () => (errored = true) });
    httpMock.expectOne('/test').flush(body, { status, statusText: 'err' });
    expect(errored).withContext('hata zinciri devam etmeli').toBeTrue();
  }

  it('403: işaretsiz istekte /models\'e yönlendirir', () => {
    failWith(403);
    expect(router.navigate).toHaveBeenCalledWith(['/models']);
  });

  it('403: SKIP_FORBIDDEN_REDIRECT işaretli istekte yönlendirmez', () => {
    failWith(403, new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true));
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401: token varken oturumu temizleyip login\'e yönlendirir (işaretten bağımsız)', () => {
    localStorage.setItem('access_token', 'x');
    failWith(401, new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true));
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'session_expired' } });
  });

  it('401: token yokken yönlendirmez', () => {
    failWith(401);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('401 session_invalidated: veri geri yüklendi nedeniyle login\'e yönlendirir', () => {
    localStorage.setItem('access_token', 'x');
    failWith(401, undefined, { success: false, code: 'session_invalidated' });
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'tenant_restored' } });
  });

  it('503 tenant_maintenance: oturumu korur, yalnız uyarı gösterir', () => {
    localStorage.setItem('access_token', 'x');
    const warn = spyOn(TestBed.inject(NotificationService), 'warn');
    failWith(503, undefined, { success: false, code: 'tenant_maintenance', message: 'Geri yükleniyor' });
    expect(router.navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('access_token')).toBe('x');
    expect(warn).toHaveBeenCalledWith('Geri yükleniyor');
  });

  it('diğer hatalarda yönlendirmez', () => {
    failWith(500);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
