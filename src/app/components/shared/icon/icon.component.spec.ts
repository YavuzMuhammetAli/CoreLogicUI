import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';
import { ICONS, ICONS_FILLED, IconName } from './icons.generated';
import manifest from './icons.manifest.json';

@Component({
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `<app-icon [name]="name()" [size]="size()" [filled]="filled()" [label]="label()" />`
})
class HostComponent {
  name = signal<IconName>('add');
  size = signal(18);
  filled = signal(false);
  label = signal<string | null>(null);
}

describe('IconComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement.querySelector('app-icon') as HTMLElement;
  const d = () => el().querySelector('path')!.getAttribute('d');

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('adın path\'ini çizer, boyutu svg\'ye yazar', () => {
    host.name.set('delete');
    host.size.set(14);
    fixture.detectChanges();
    expect(d()).toBe(ICONS.delete);
    const svg = el().querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('filled: dolu varyant varsa onu, yoksa çizgisel path\'i kullanır', () => {
    host.name.set('dashboard');
    host.filled.set(true);
    fixture.detectChanges();
    expect(d()).toBe(ICONS_FILLED.dashboard!);
    expect(d()).not.toBe(ICONS.dashboard);

    host.name.set('add');
    fixture.detectChanges();
    expect(ICONS_FILLED.add).toBeUndefined();
    expect(d()).toBe(ICONS.add);
  });

  it('label yoksa süstür (aria-hidden), varsa role=img + aria-label', () => {
    expect(el().getAttribute('aria-hidden')).toBe('true');
    expect(el().getAttribute('role')).toBeNull();

    host.label.set('Uyarı');
    fixture.detectChanges();
    expect(el().getAttribute('aria-hidden')).toBeNull();
    expect(el().getAttribute('role')).toBe('img');
    expect(el().getAttribute('aria-label')).toBe('Uyarı');
  });

  it('üretilen kayıt manifest ile eşit (npm run icons koşulmuş)', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...manifest.outlined].sort());
    expect(Object.keys(ICONS_FILLED).sort()).toEqual([...manifest.filled].sort());
  });
});
