import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable, of } from 'rxjs';
import { authGuard } from './auth.guard';
import { adminGuard } from './admin.guard';
import { modelPermissionGuard } from './model-permission.guard';
import { AuthService, SessionInfo } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { NotificationService } from '../services/notification.service';
import { LanguageService } from '../services/language.service';

/**
 * Route guards. The admin/model guards decide AFTER ensureLoaded() —
 * so no wrong redirect happens on a page reload while the permission signal is still empty.
 */
describe('route guards', () => {
  const state = {} as RouterStateSnapshot;
  let auth: jasmine.SpyObj<AuthService>;
  let permissions: jasmine.SpyObj<PermissionService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let platformId: string;

  beforeEach(() => {
    platformId = 'browser';
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['ensureSession']);
    permissions = jasmine.createSpyObj<PermissionService>('PermissionService', ['ensureLoaded', 'isAdmin', 'can']);
    notify = jasmine.createSpyObj<NotificationService>('NotificationService', ['warn']);
    permissions.ensureLoaded.and.returnValue(of(null));
    localStorage.removeItem('lang');

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useFactory: () => platformId },
        { provide: AuthService, useValue: auth },
        { provide: PermissionService, useValue: permissions },
        { provide: NotificationService, useValue: notify }
      ]
    });
  });

  afterEach(() => localStorage.removeItem('lang'));

  function route(typeName?: string): ActivatedRouteSnapshot {
    return { paramMap: convertToParamMap(typeName ? { typeName } : {}) } as ActivatedRouteSnapshot;
  }

  /** Runs the guard in an injection context and resolves it if it returns an Observable. */
  async function run(guard: (r: ActivatedRouteSnapshot, s: RouterStateSnapshot) => unknown, r = route()): Promise<unknown> {
    const result = TestBed.runInInjectionContext(() => guard(r, state));
    return isObservable(result) ? firstValueFrom(result as Observable<unknown>) : result;
  }

  function serialized(result: unknown): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  describe('authGuard', () => {
    it('lets through with a session, otherwise /login', async () => {
      auth.ensureSession.and.returnValue(of({ authenticated: true } as SessionInfo));
      expect(await run(authGuard)).toBeTrue();

      auth.ensureSession.and.returnValue(of(null));
      expect(serialized(await run(authGuard))).toBe('/login');
    });

    it('leaves the decision to the client outside the browser', async () => {
      platformId = 'server';
      expect(await run(authGuard)).toBeTrue();
      expect(auth.ensureSession).not.toHaveBeenCalled();
    });
  });

  describe('adminGuard', () => {
    it('decides after the permissions are loaded', async () => {
      permissions.isAdmin.and.returnValue(true);
      expect(await run(adminGuard)).toBeTrue();
      expect(permissions.ensureLoaded).toHaveBeenCalled();
    });

    it('/login if not admin', async () => {
      permissions.isAdmin.and.returnValue(false);
      expect(serialized(await run(adminGuard))).toBe('/login');
    });
  });

  describe('modelPermissionGuard', () => {
    it('lets through when the requested action is permitted', async () => {
      permissions.can.and.returnValue(true);
      expect(await run(modelPermissionGuard('create'), route('Siparis'))).toBeTrue();
      expect(permissions.can).toHaveBeenCalledWith('Siparis', 'create');
      expect(notify.warn).not.toHaveBeenCalled();
    });

    it('warns and returns to /models without permission', async () => {
      permissions.can.and.returnValue(false);
      expect(serialized(await run(modelPermissionGuard('delete'), route('Siparis')))).toBe('/models');
      expect(notify.warn).toHaveBeenCalledWith("'Siparis' modeli için silme yetkiniz yok.");
    });

    it('the warning is in the active language', async () => {
      localStorage.setItem('lang', 'en');
      TestBed.inject(LanguageService).lang.set('en');
      permissions.can.and.returnValue(false);
      await run(modelPermissionGuard('read'), route('Siparis'));
      expect(notify.warn).toHaveBeenCalledWith("You do not have read permission for the 'Siparis' model.");
    });

    it('gives a generic warning without a model name, does not check permission', async () => {
      expect(serialized(await run(modelPermissionGuard('read')))).toBe('/models');
      expect(permissions.can).not.toHaveBeenCalled();
      expect(notify.warn).toHaveBeenCalledWith('Bu modele erişim yetkiniz yok.');
    });
  });
});
