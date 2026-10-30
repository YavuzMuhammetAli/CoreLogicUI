import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelIconComponent } from './model-icon.component';
import { resolveModelIconPath } from './model-icon-catalog';
import { ICONS } from '../icon/icons.generated';

@Component({
    imports: [ModelIconComponent],
    template: `<app-model-icon [icon]="icon()" size="16" />`
})
class HostComponent {
  icon = signal<string | null>(null);
}

describe('ModelIconComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const d = () => (fixture.nativeElement as HTMLElement).querySelector('path')!.getAttribute('d');

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('ikon yoksa varsayılan tablo ikonunu çizer', () => {
    expect(d()).toBe(ICONS.table);
  });

  it('katalog dışı adda varsayılana düşer', async () => {
    fixture.componentInstance.icon.set('yok_boyle_ikon');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(d()).toBe(ICONS.table);
  });

  it('katalogdaki ikonun path\'ini çizer', async () => {
    const expected = await resolveModelIconPath('shopping_cart');
    fixture.componentInstance.icon.set('shopping_cart');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(d()).toBe(expected!);
  });
});
