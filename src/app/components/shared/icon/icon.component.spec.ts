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

  it('draws the path for the name and writes the size to the svg', () => {
    host.name.set('delete');
    host.size.set(14);
    fixture.detectChanges();
    expect(d()).toBe(ICONS.delete);
    const svg = el().querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('filled: uses the filled variant if present, otherwise the outlined path', () => {
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

  it('is decorative without a label (aria-hidden), role=img + aria-label with one', () => {
    expect(el().getAttribute('aria-hidden')).toBe('true');
    expect(el().getAttribute('role')).toBeNull();

    host.label.set('Uyarı');
    fixture.detectChanges();
    expect(el().getAttribute('aria-hidden')).toBeNull();
    expect(el().getAttribute('role')).toBe('img');
    expect(el().getAttribute('aria-label')).toBe('Uyarı');
  });

  it('the generated registry matches the manifest (npm run icons has been run)', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...manifest.outlined].sort());
    expect(Object.keys(ICONS_FILLED).sort()).toEqual([...manifest.filled].sort());
  });
});
