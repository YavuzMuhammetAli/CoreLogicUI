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
 * The listener is bound only while open: closed pickers must not run at all on page taps,
 * tapping inside must not close, and a destroyed component must not leave a listener behind.
 */
describe('closeOnOutsidePointer', () => {
  const pointerOn = (target: EventTarget) =>
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  let addSpy: jasmine.Spy;

  beforeEach(() => {
    addSpy = spyOn(document, 'addEventListener').and.callThrough();
  });

  const pointerAdds = () => addSpy.calls.allArgs().filter(a => a[0] === 'pointerdown').length;

  it('does not bind a listener while closed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    expect(pointerAdds()).toBe(0);
  });

  it('while open, closes on an outside tap but not on an inside tap', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const host = fixture.componentInstance;
    host.open.set(true);
    fixture.detectChanges();
    expect(pointerAdds()).toBe(1);

    pointerOn(fixture.nativeElement.querySelector('.inside'));
    expect(host.closed).toBe(0);

    pointerOn(document.body);
    expect(host.closed).toBe(1);

    // After closing the listener is removed: a second outside tap does not run the handler.
    fixture.detectChanges();
    pointerOn(document.body);
    expect(host.closed).toBe(1);
  });

  it('removes the listener when destroyed', () => {
    const removeSpy = spyOn(document, 'removeEventListener').and.callThrough();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    fixture.destroy();
    expect(removeSpy.calls.allArgs().some(a => a[0] === 'pointerdown')).toBeTrue();
  });
});
