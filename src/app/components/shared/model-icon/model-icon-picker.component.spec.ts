import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelIconPickerComponent } from './model-icon-picker.component';
import { loadAllModelIconPaths } from './model-icon-catalog';

describe('ModelIconPickerComponent', () => {
  let fixture: ComponentFixture<ModelIconPickerComponent>;
  let picker: ModelIconPickerComponent;

  beforeEach(async () => {
    await loadAllModelIconPaths();   // load the chunks up front so the opening renders synchronously
    fixture = TestBed.createComponent(ModelIconPickerComponent);
    picker = fixture.componentInstance;
    fixture.componentRef.setInput('current', 'warehouse');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const cells = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.picker-cell'));

  it('the saved icon is selected on open', () => {
    expect(picker.selected()).toBe('warehouse');
    const selected = cells().filter(c => c.getAttribute('aria-checked') === 'true');
    expect(selected.map(c => c.getAttribute('aria-label'))).toEqual(['warehouse']);
  });

  it('search filters by name and Turkish keywords', () => {
    picker.onSearch('SEPET');
    fixture.detectChanges();
    const names = cells().map(c => c.getAttribute('aria-label'));
    expect(names).toContain('shopping_cart');
    expect(names).not.toContain('warehouse');

    picker.onSearch('local ship');
    fixture.detectChanges();
    expect(cells().map(c => c.getAttribute('aria-label'))).toEqual(['local_shipping']);
  });

  it('confirm emits the selected name, null for the default', () => {
    const emitted: (string | null)[] = [];
    picker.confirmed.subscribe(v => emitted.push(v));

    cells().find(c => c.getAttribute('aria-label') === 'payments')!.click();
    picker.confirm();
    picker.select(null);
    picker.confirm();

    expect(emitted).toEqual(['payments', null]);
  });

  it('confirm and cancel are not emitted while busy', () => {
    fixture.componentRef.setInput('busy', true);
    let count = 0;
    picker.confirmed.subscribe(() => count++);
    picker.cancelled.subscribe(() => count++);
    picker.confirm();
    picker.cancel();
    expect(count).toBe(0);
  });
});
