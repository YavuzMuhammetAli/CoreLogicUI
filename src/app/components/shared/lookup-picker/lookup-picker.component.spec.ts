import { Component, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { LookupPickerComponent } from './lookup-picker.component';

/**
 * Clipping regression: when the list opened inside a clipping container (`.panel { overflow: hidden }`)
 * only the first row was visible on screen.
 *
 * The host here mimics that situation exactly: a narrow `overflow: hidden` box.
 */
@Component({
    imports: [LookupPickerComponent, ReactiveFormsModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
    <div class="clipping-panel" style="overflow: hidden; height: 60px; width: 300px;">
      <app-lookup-picker
        [typeName]="'Depo'"
        [displayColumn]="'Ad'"
        [formControl]="control">
      </app-lookup-picker>
    </div>
  `
})
class HostComponent {
  control = new FormControl<number | null>(null);
  @ViewChild(LookupPickerComponent) picker!: LookupPickerComponent;
}

describe('LookupPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/PublishedModel/lookupOptions`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function openAndRespond(items: { id: number; label: string }[], total = items.length): void {
    fixture.componentInstance.picker.open();
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base && r.params.get('page') === '1');
    req.flush({ success: true, message: '', data: { items, total, page: 1, pageSize: 50 } });
    fixture.detectChanges();
  }

  function listEl(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.lk-list');
  }

  it('requests 50 records on open (NOT the whole table)', () => {
    fixture.componentInstance.picker.open();
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base);
    expect(req.request.params.get('pageSize')).toBe('50');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('typeName')).toBe('Depo');
    req.flush({ success: true, message: '', data: { items: [], total: 0, page: 1, pageSize: 50 } });
  });

  it('CLIPPING REGRESSION: the list is positioned with position:fixed', () => {
    openAndRespond([
      { id: 1, label: 'Adana Depo' },
      { id: 2, label: 'Ankara Bölge Depo' },
      { id: 3, label: 'Merkez Depo' }
    ]);

    const list = listEl();
    expect(list).withContext('the list should be rendered').toBeTruthy();

    // With position:absolute it would be cut off by the overflow:hidden host and
    // only the first row would be visible — exactly the reported bug.
    expect(getComputedStyle(list!).position).toBe('fixed');

    // Coordinates are written inline from JS; they must not stay zero/empty.
    expect(list!.style.top).toMatch(/px$/);
    expect(list!.style.left).toMatch(/px$/);
    expect(list!.style.width).toMatch(/px$/);
    expect(parseFloat(list!.style.maxHeight)).toBeGreaterThan(0);

    // All options must be in the DOM (not just the first).
    expect(list!.querySelectorAll('.lk-option').length).toBe(3);
  });

  it('opens upwards when there is no room below', () => {
    const picker = fixture.componentInstance.picker;

    // Move the input to the very bottom of the viewport: no room is left below.
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    spyOn(input, 'getBoundingClientRect').and.returnValue({
      top: window.innerHeight - 30, bottom: window.innerHeight - 10,
      left: 20, right: 320, width: 300, height: 20, x: 20, y: window.innerHeight - 30,
      toJSON: () => ({})
    } as DOMRect);

    openAndRespond([{ id: 1, label: 'Adana Depo' }]);

    // If it opened upwards, the list's top edge is above the input.
    const top = parseFloat(listEl()!.style.top);
    expect(top).toBeLessThan(window.innerHeight - 30);
    expect(picker.isOpen()).toBeTrue();
  });

  it('search goes to the server and returns to page 1', fakeAsync(() => {
    openAndRespond([{ id: 1, label: 'Adana Depo' }], 12);

    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    input.value = 'Merkez';
    input.dispatchEvent(new Event('input'));

    tick(300);   // debounce
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base && r.params.get('search') === 'Merkez');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ success: true, message: '', data: { items: [{ id: 3, label: 'Merkez Depo' }], total: 1, page: 1, pageSize: 50 } });
    fixture.detectChanges();

    expect(fixture.componentInstance.picker.options().length).toBe(1);
  }));

  it('SILENT FK LOSS REGRESSION: the selected id label is resolved even if not on the first page', () => {
    // An id that is not among the first 50 is written to the control (writeValue → ?ids=).
    fixture.componentInstance.control.setValue(9999);
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base && r.params.get('ids') === '9999');
    req.flush({
      success: true, message: '',
      data: { items: [{ id: 9999, label: 'Uzak Depo' }], total: 1, page: 1, pageSize: 1 }
    });
    fixture.detectChanges();

    // The label shows in the box; the user doesn't see an empty box and wipe the FK.
    expect(fixture.componentInstance.picker.selectedLabel()).toBe('Uzak Depo');
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Uzak Depo');
    expect(fixture.componentInstance.control.value).toBe(9999);
  });

  it('selection writes the ID to the form control', () => {
    openAndRespond([{ id: 7, label: 'Transit Depo' }]);

    const option = (fixture.nativeElement as HTMLElement).querySelector('.lk-option') as HTMLElement;
    option.dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe(7);
    expect(listEl()).withContext('the list should close after selection').toBeNull();
  });
});
