import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TableDetailComponent } from './table-detail.component';
import { PublishedTableService } from '../../services/published-table.service';
import { NotificationService } from '../../services/notification.service';

/** Model icon flow: Publish first asks for the icon; the icon (if changed) is written BEFORE publishing. */
describe('TableDetailComponent — model icon', () => {
  let component: TableDetailComponent;
  let service: PublishedTableService;
  let calls: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableDetailComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { mode: 'new' }, paramMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({}))
          }
        }
      ]
    });
    component = TestBed.createComponent(TableDetailComponent).componentInstance;
    service = TestBed.inject(PublishedTableService);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    calls = [];
    spyOn(service, 'setTableIcon').and.callFake((name, icon) => { calls.push(`icon:${name}:${icon}`); return of({ success: true, message: '' }); });
    spyOn(service, 'publish').and.callFake(name => { calls.push(`publish:${name}`); return of({ success: true, message: '' }); });

    // Saved model without an icon.
    component.isSaved = true;
    component.savedRootName = 'Siparis';
    component.editTypeName = 'Siparis';
  });

  it('Publish opens the picker in publish mode and does not publish yet', () => {
    component.onPublish();
    expect(component.iconPickerMode).toBe('publish');
    expect(calls).toEqual([]);
  });

  it('the selected icon is written before publishing', () => {
    component.onPublish();
    component.onIconConfirmed('receipt_long');
    expect(calls).toEqual(['icon:Siparis:receipt_long', 'publish:Siparis']);
    expect(component.iconPickerMode).toBeNull();
  });

  it('only publishes when the icon did not change', () => {
    component.onPublish();
    component.onIconConfirmed(null);
    expect(calls).toEqual(['publish:Siparis']);
  });

  it('warns when the icon cannot be written but still publishes', () => {
    (service.setTableIcon as jasmine.Spy).and.returnValue(of({ success: false, message: '025' }));
    const warn = spyOn(TestBed.inject(NotificationService), 'warn');

    component.onPublish();
    component.onIconConfirmed('payments');

    expect(warn).toHaveBeenCalled();
    expect(service.publish).toHaveBeenCalledWith('Siparis');
  });

  it('selecting from the header writes immediately on a saved model and does not publish', () => {
    component.openIconPicker();
    component.onIconConfirmed('warehouse');
    expect(calls).toEqual(['icon:Siparis:warehouse']);
    expect(component.modelIcon).toBe('warehouse');
  });

  it('on an unsaved model, selecting from the header is kept only in memory', () => {
    component.isSaved = false;
    component.savedRootName = null;
    component.editTypeName = null;

    component.openIconPicker();
    component.onIconConfirmed('warehouse');

    expect(calls).toEqual([]);
    expect(component.modelIcon).toBe('warehouse');
  });
});
