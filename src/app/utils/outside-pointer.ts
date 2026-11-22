import { DestroyRef, Signal, effect, inject } from '@angular/core';

/**
 * "Pointer outside" listener for a dropdown element — bound only while the element is OPEN.
 *
 * `@HostListener('document:pointerdown')` runs for every instance on EVERY tap on the page and
 * (even under OnPush) marks the component and all its ancestors dirty. Since every lookup field in the
 * record form carries a picker, a single click ran the handlers of dozens of closed pickers and
 * re-checked the whole form. Here the listener is added on open and removed on close (and when the
 * component is destroyed).
 *
 * Call within an injection context (field initializer or constructor).
 * pointerdown: iOS Safari may not emit click when tapping empty space, so the list would stay open.
 */
export function closeOnOutsidePointer(
  isOpen: Signal<boolean>,
  host: () => Element | null | undefined,
  onOutside: () => void
): void {
  const handler = (event: PointerEvent): void => {
    const el = host();
    if (el && !el.contains(event.target as Node)) onOutside();
  };
  let bound = false;
  const unbind = (): void => {
    if (!bound) return;
    document.removeEventListener('pointerdown', handler);
    bound = false;
  };

  effect(() => {
    if (isOpen()) {
      if (!bound) {
        document.addEventListener('pointerdown', handler);
        bound = true;
      }
    } else {
      unbind();
    }
  });
  inject(DestroyRef).onDestroy(unbind);
}
