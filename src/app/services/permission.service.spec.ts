import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { ModelPermission, MyPermissionsResponse, PermissionService } from './permission.service';

/**
 * The permission service's synchronous decision functions and load sharing.
 *
 * Bug under guard: the null result of a failed first load stayed in the in-flight reference; guards
 * did not retry until logout, and the user was turned away from every model screen.
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

  it('rejects everything before loading and returns the default landing page', () => {
    expect(service.isAdmin()).toBeFalse();
    expect(service.can('Siparis', 'read')).toBeFalse();
    expect(service.canNavigate('Siparis')).toBeFalse();
    expect(service.getLandingPage()).toBe('/models');
  });

  it('concurrent ensureLoaded calls send a single request', () => {
    const results: unknown[] = [];
    service.ensureLoaded().subscribe(r => results.push(r));
    service.ensureLoaded().subscribe(r => results.push(r));

    respond({ isAdmin: false, permissions: [], landingPage: null });

    expect(results.length).toBe(2);
    expect(results[0]).not.toBeNull();
  });

  it('sends no new request while data is loaded', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    let value: unknown;
    service.ensureLoaded().subscribe(r => (value = r));
    httpMock.expectNone(url);
    expect(value).toEqual(jasmine.objectContaining({ isAdmin: true }));
  });

  it('the next call retries after a failed load', () => {
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

  it('can: model name matches case-insensitively and checks the action bits', () => {
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

  it('admin passes every action and every model', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    expect(service.isAdmin()).toBeTrue();
    expect(service.can('HerhangiBir', 'delete')).toBeTrue();
    expect(service.canNavigate('HerhangiBir')).toBeTrue();
  });

  it('canNavigate reads the canShowInNav flag independently of Read', () => {
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

  it('after clear the data is dropped and ensureLoaded requests again', () => {
    service.ensureLoaded().subscribe();
    respond({ isAdmin: true, permissions: [], landingPage: null });

    service.clear();
    expect(service.isAdmin()).toBeFalse();

    service.ensureLoaded().subscribe();
    respond({ isAdmin: false, permissions: [], landingPage: null });
  });
});
