import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelIconPickerComponent } from './model-icon-picker.component';
import { loadAllModelIconPaths } from './model-icon-catalog';

describe('ModelIconPickerComponent', () => {
  let fixture: ComponentFixture<ModelIconPickerComponent>;
  let picker: ModelIconPickerComponent;

  beforeEach(async () => {
    await loadAllModelIconPaths();   // parçalar önceden gelsin; açılış senkron çizilsin
    fixture = TestBed.createComponent(ModelIconPickerComponent);
    picker = fixture.componentInstance;
    fixture.componentRef.setInput('current', 'warehouse');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const cells = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.picker-cell'));

  it('açılışta kayıtlı ikon seçili gelir', () => {
    expect(picker.selected()).toBe('warehouse');
    const selected = cells().filter(c => c.getAttribute('aria-checked') === 'true');
    expect(selected.map(c => c.getAttribute('aria-label'))).toEqual(['warehouse']);
  });

  it('arama ad ve Türkçe anahtar kelimede süzer', () => {
    picker.onSearch('SEPET');
    fixture.detectChanges();
    const names = cells().map(c => c.getAttribute('aria-label'));
    expect(names).toContain('shopping_cart');
    expect(names).not.toContain('warehouse');

    picker.onSearch('local ship');
    fixture.detectChanges();
    expect(cells().map(c => c.getAttribute('aria-label'))).toEqual(['local_shipping']);
  });

  it('onay seçili adı, varsayılan için null yayar', () => {
    const emitted: (string | null)[] = [];
    picker.confirmed.subscribe(v => emitted.push(v));

    cells().find(c => c.getAttribute('aria-label') === 'payments')!.click();
    picker.confirm();
    picker.select(null);
    picker.confirm();

    expect(emitted).toEqual(['payments', null]);
  });

  it('meşgulken onay ve iptal yayılmaz', () => {
    fixture.componentRef.setInput('busy', true);
    let count = 0;
    picker.confirmed.subscribe(() => count++);
    picker.cancelled.subscribe(() => count++);
    picker.confirm();
    picker.cancel();
    expect(count).toBe(0);
  });
});
