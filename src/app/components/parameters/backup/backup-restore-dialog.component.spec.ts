import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BackupRestoreDialogComponent } from './backup-restore-dialog.component';
import { AuthService } from '../../../services/auth.service';
import { PermissionService } from '../../../services/permission.service';
import { environment } from '../../../../environments/environment';
import { BackupHistoryItem } from '../../../models/parameter.model';

/**
 * Restore dialog — a destructive operation, hence double confirmation and a mandatory re-login when done.
 */
describe('BackupRestoreDialogComponent', () => {
  const base = `${environment.apiBaseUrl}/Parameter`;
  let fixture: ComponentFixture<BackupRestoreDialogComponent>;
  let component: BackupRestoreDialogComponent;
  let httpMock: HttpTestingController;
  const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getSessionUser', 'logout']);
  const permissions = jasmine.createSpyObj<PermissionService>('PermissionService', ['clear']);

  const backup: BackupHistoryItem = {
    id: 7, type: 'Manual', status: 'Completed', sizeBytes: 1024,
    startedAt: '2026-10-01T10:00:00Z', completedAt: '2026-10-01T10:01:00Z', canRestore: true
  };

  beforeEach(() => {
    auth.getSessionUser.and.returnValue({ name: 'A', email: 'a@acme', initials: 'A', tenantId: 'acme', companyId: 'acme' });
    auth.logout.and.returnValue(of(undefined));
    TestBed.configureTestingModule({
      imports: [BackupRestoreDialogComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: PermissionService, useValue: permissions }
      ]
    });
    fixture = TestBed.createComponent(BackupRestoreDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('backup', backup);
    fixture.detectChanges();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('cannot be submitted until the company code is typed exactly and a password is entered', () => {
    expect(component.canSubmit()).toBeFalse();
    component.codeInput.set(' ACME ');
    expect(component.canSubmit()).toBeFalse();
    component.passwordInput.set('gizli');
    expect(component.canSubmit()).toBeTrue();
    component.codeInput.set('acm');
    expect(component.canSubmit()).toBeFalse();
  });

  it('stays on the confirm step if the server rejects; the password is cleared', () => {
    component.codeInput.set('acme');
    component.passwordInput.set('yanlis');
    component.submit();

    httpMock.expectOne(`${base}/backup/7/restore`).flush({ success: false, message: 'Parola doğrulanamadı.', data: 0 });

    expect(component.step()).toBe('confirm');
    expect(component.error()).toBe('Parola doğrulanamadı.');
    expect(component.passwordInput()).toBe('');
  });

  it('once queued it polls the status, shows the summary when done and sends to re-login', fakeAsync(() => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    component.codeInput.set('acme');
    component.passwordInput.set('dogru');
    component.submit();

    const request = httpMock.expectOne(`${base}/backup/7/restore`);
    expect(request.request.body).toEqual({ companyCodeConfirmation: 'acme', password: 'dogru' });
    request.flush({ success: true, message: '', data: 3 });
    expect(component.step()).toBe('progress');

    httpMock.expectOne(`${base}/backup/restore/3`).flush({
      success: true, message: '', data: { id: 3, backupId: 7, status: 'Running', phase: 'Swap', fromVersion: 21, requestedAt: '' }
    });
    expect(component.currentPhaseIndex()).toBe(2);

    tick(2000);
    httpMock.expectOne(`${base}/backup/restore/3`).flush({
      success: true, message: '', data: {
        id: 3, backupId: 7, status: 'Completed', phase: 'Done', fromVersion: 21, requestedAt: '',
        reconcile: { updated: 2, created: 1, removed: 0, conflicts: [] }
      }
    });
    expect(component.step()).toBe('done');

    // A finished dialog cannot be closed — the only way out is re-login.
    component.close();
    expect(component.step()).toBe('done');

    component.signInAgain();
    expect(auth.logout).toHaveBeenCalled();
    expect(permissions.clear).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'tenant_restored' } });
  }));

  it('shows the error on a failed restore and can be closed', fakeAsync(() => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    component.codeInput.set('acme');
    component.passwordInput.set('dogru');
    component.submit();
    httpMock.expectOne(`${base}/backup/7/restore`).flush({ success: true, message: '', data: 4 });
    httpMock.expectOne(`${base}/backup/restore/4`).flush({
      success: true, message: '', data: { id: 4, backupId: 7, status: 'Failed', phase: 'SideRestore', fromVersion: 21, requestedAt: '', error: 'admin değil' }
    });

    expect(component.step()).toBe('failed');
    expect(component.error()).toBe('admin değil');
    component.close();
    expect(closed).toHaveBeenCalled();
  }));
});
