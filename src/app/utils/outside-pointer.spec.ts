import { Component, ElementRef, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { closeOnOutsidePointer } from './outside-pointer';

@Component({ changeDetection: ChangeDetectionStrategy.Eager,
 template: '<span class="inside">x</span>' })
class HostComponent {
  readonly open = signal(false);
  closed = 0;
  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    closeOnOutsidePointer(this.open, () => this.el.nativeElement, () => { this.closed++; this.open.set(false); });
  }
}

/**
 * Dinleyici yalnız açıkken bağlıdır: kapalı seçiciler sayfadaki dokunuşlarda hiç çalışmamalı,
 * içeriye dokunmak kapatmamalı, yok edilen bileşen dinleyici bırakmamalı.
 */
describe('closeOnOutsidePointer', () => {
  const pointerOn = (target: EventTarget) =>
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  let addSpy: jasmine.Spy;

  beforeEach(() => {
    addSpy = spyOn(document, 'addEventListener').and.callThrough();
  });

  const pointerAdds = () => addSpy.calls.allArgs().filter(a => a[0] === 'pointerdown').length;

  it('kapalıyken dinleyici bağlamaz', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(pointerAdds()).toBe(0);
  });

  it('açıkken dışarı dokununca kapatır, içeri dokununca kapatmaz', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.open.set(true);
    fixture.detectChanges();
    expect(pointerAdds()).toBe(1);

    pointerOn(fixture.nativeElement.querySelector('.inside'));
    expect(host.closed).toBe(0);

    pointerOn(document.body);
    expect(host.closed).toBe(1);

    // Kapandıktan sonra dinleyici kalkar: ikinci dışarı dokunuş işleyiciyi çalıştırmaz.
    fixture.detectChanges();
    pointerOn(document.body);
    expect(host.closed).toBe(1);
  });

  it('yok edilince dinleyiciyi kaldırır', () => {
    const removeSpy = spyOn(document, 'removeEventListener').and.callThrough();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    fixture.destroy();
    expect(removeSpy.calls.allArgs().some(a => a[0] === 'pointerdown')).toBeTrue();
  });
});
