import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { ModelPermission, MyPermissionsResponse, PermissionService } from './permission.service';

/**
 * İzin servisinin senkron karar fonksiyonları ve yükleme paylaşımı.
 *
 * Korunan hata: başarısız ilk yüklemenin null sonucu uçuş referansında kalıyordu; guard'lar
 * çıkış yapılana dek yeniden denemiyor, kullanıcı tüm model ekranlarından geri çevriliyordu.
 */
describe('PermissionService', () => {
  const url = `${environment.apiBaseUrl}/Permission/my`;
  let service: PermissionService;
  let httpMock: HttpTestingController;

  function perm(modelName: string, overrides: Partial<ModelPermission> = {}): ModelPermission {
    return {
      modelName,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canShowInNav: false,
      canOwnOnly: false,
      canViewWorkflow: false,
      ...overrides
    };
  }

  function respond(data: MyPermissionsResponse['data']): void {
    httpMock.expectOne(url).flush({ success: true, message: '', data });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(PermissionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('yüklenmeden önce her şeyi reddeder ve varsayılan açılış sayfasını döner', () => {
    expect(service.isAdmin()).toBeFalse();
    expect(service.can('Siparis', 'read')).toBeFalse();
    expect(service.canNavigate('Siparis')).toBeFalse();
    expect(service.getLandingPage()).toBe('/models');
  });

  it('aynı anda çağrılan ensureLoaded tek istek atar', () => {
    const results: unknown[] = [];
    service.ensureLoaded().subscribe(r => results.push(r));
    service.ensureLoaded().subscribe(r => results.push(r));

    respond({ isAdmin: false, permissions: [], landingPage: null });

    expect(results.length).toBe(2);
    expect(results[0]).not.toBeNull();
  });

  it('yüklü veri varken yeniden istek atmaz', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    let value: unknown;
    service.ensureLoaded().subscribe(r => (value = r));
    httpMock.expectNone(url);
    expect(value).toEqual(jasmine.objectContaining({ isAdmin: true }));
  });

  it('başarısız yüklemeden sonra bir sonraki çağrı yeniden dener', () => {
    let first: unknown = 'bekleniyor';
    service.ensureLoaded().subscribe(r => (first = r));
    httpMock.expectOne(url).flush({ success: false }, { status: 500, statusText: 'err' });
    expect(first).toBeNull();

    let second: unknown;
    service.ensureLoaded().subscribe(r => (second = r));
    respond({ isAdmin: false, permissions: [perm('Siparis', { canRead: true })], landingPage: null });
    expect(second).not.toBeNull();
    expect(service.can('Siparis', 'read')).toBeTrue();
  });

  it('can: model adı büyük/küçük harfe duyarsız eşleşir, işlem bitlerine bakar', () => {
    service.ensureLoaded().subscribe();
    respond({
      isAdmin: false,
      permissions: [perm('Siparis', { canRead: true, canUpdate: true })],
      landingPage: null
    });

    expect(service.can('siparis', 'read')).toBeTrue();
    expect(service.can('SIPARIS', 'update')).toBeTrue();
    expect(service.can('Siparis', 'create')).toBeFalse();
    expect(service.can('Siparis', 'delete')).toBeFalse();
    expect(service.can('Musteri', 'read')).toBeFalse();
  });

  it('admin her işlemi ve her modeli geçer', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    expect(service.isAdmin()).toBeTrue();
    expect(service.can('HerhangiBir', 'delete')).toBeTrue();
    expect(service.canNavigate('HerhangiBir')).toBeTrue();
  });

  it('canNavigate Read\'den bağımsız canShowInNav bayrağını okur', () => {
    service.ensureLoaded().subscribe();
    respond({
      isAdmin: false,
      permissions: [perm('Siparis', { canRead: true }), perm('Rapor', { canShowInNav: true })],
      landingPage: '/dashboard/3'
    });

    expect(service.canNavigate('Siparis')).toBeFalse();
    expect(service.canNavigate('rapor')).toBeTrue();
    expect(service.getLandingPage()).toBe('/dashboard/3');
  });

  it('clear sonrası veri düşer ve ensureLoaded yeniden ister', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    service.clear();
    expect(service.isAdmin()).toBeFalse();

    service.ensureLoaded().subscribe();
    respond({ isAdmin: false, permissions: [], landingPage: null });
  });
});
