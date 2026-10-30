import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { LookupPickerComponent } from './lookup-picker.component';

/**
 * Kırpılma regresyonu: liste kırpan bir kapsayıcının (`.panel { overflow: hidden }`)
 * içinde açıldığında ekranda yalnız ilk satır görünüyordu.
 *
 * Host burada o durumu birebir taklit eder: dar, `overflow: hidden` bir kutu.
 */
@Component({
    imports: [LookupPickerComponent, ReactiveFormsModule],
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

  it('acilista 50 kayit ister (tum tabloyu DEGIL)', () => {
    fixture.componentInstance.picker.open();
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base);
    expect(req.request.params.get('pageSize')).toBe('50');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('typeName')).toBe('Depo');
    req.flush({ success: true, message: '', data: { items: [], total: 0, page: 1, pageSize: 50 } });
  });

  it('KIRPILMA REGRESYONU: liste position:fixed ile konumlanir', () => {
    openAndRespond([
      { id: 1, label: 'Adana Depo' },
      { id: 2, label: 'Ankara Bölge Depo' },
      { id: 3, label: 'Merkez Depo' }
    ]);

    const list = listEl();
    expect(list).withContext('liste render edilmeli').toBeTruthy();

    // position:absolute olsaydı overflow:hidden host tarafından kesilir ve
    // yalnızca ilk satır görünürdü — bildirilen hata tam olarak buydu.
    expect(getComputedStyle(list!).position).toBe('fixed');

    // Koordinatlar JS'ten inline yazılır; sıfır/boş kalmamalı.
    expect(list!.style.top).toMatch(/px$/);
    expect(list!.style.left).toMatch(/px$/);
    expect(list!.style.width).toMatch(/px$/);
    expect(parseFloat(list!.style.maxHeight)).toBeGreaterThan(0);

    // Tüm seçenekler DOM'da olmalı (yalnız ilki değil).
    expect(list!.querySelectorAll('.lk-option').length).toBe(3);
  });

  it('altta yer yoksa yukari acilir', () => {
    const picker = fixture.componentInstance.picker;

    // Input'u viewport'un en altına taşı: aşağıda yer kalmaz.
    const input = (fixture.nativeElement as HTMLElement).querySelector('input')!;
    spyOn(input, 'getBoundingClientRect').and.returnValue({
      top: window.innerHeight - 30, bottom: window.innerHeight - 10,
      left: 20, right: 320, width: 300, height: 20, x: 20, y: window.innerHeight - 30,
      toJSON: () => ({})
    } as DOMRect);

    openAndRespond([{ id: 1, label: 'Adana Depo' }]);

    // Yukarı açıldıysa listenin üst kenarı input'un üstünde kalır.
    const top = parseFloat(listEl()!.style.top);
    expect(top).toBeLessThan(window.innerHeight - 30);
    expect(picker.isOpen()).toBeTrue();
  });

  it('arama sunucuya gider ve sayfa 1e doner', fakeAsync(() => {
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

  it('SESSIZ FK KAYBI REGRESYONU: secili id ilk sayfada olmasa da etiketi cozulur', () => {
    // Kontrole ilk 50 arasında olmayan bir id yazılır (writeValue → ?ids=).
    fixture.componentInstance.control.setValue(9999);
    fixture.detectChanges();

    const req = httpMock.expectOne(r => r.url === base && r.params.get('ids') === '9999');
    req.flush({
      success: true, message: '',
      data: { items: [{ id: 9999, label: 'Uzak Depo' }], total: 1, page: 1, pageSize: 1 }
    });
    fixture.detectChanges();

    // Kutuda etiket görünür; kullanıcı boş kutu görüp FK'yi silmez.
    expect(fixture.componentInstance.picker.selectedLabel()).toBe('Uzak Depo');
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Uzak Depo');
    expect(fixture.componentInstance.control.value).toBe(9999);
  });

  it('secim form kontrolune ID yazar', () => {
    openAndRespond([{ id: 7, label: 'Transit Depo' }]);

    const option = (fixture.nativeElement as HTMLElement).querySelector('.lk-option') as HTMLElement;
    option.dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe(7);
    expect(listEl()).withContext('secimden sonra liste kapanmali').toBeNull();
  });
});
