import { ChangeDetectorRef } from '@angular/core';
import { MonoTypeOperatorFunction, tap } from 'rxjs';

/**
 * Marks the view "dirty" in OnPush components when asynchronous data arrives.
 *
 * WHY IT IS NEEDED: under OnPush a component is checked only when (a) an @Input reference
 * changes, (b) an event bound in its template fires, (c) a signal it reads
 * changes, or (d) markForCheck() is called. Writing `this.rows = ...` in an HTTP response
 * callback is NONE of these — the data arrives but
 * the screen does not update.
 *
 * Not needed in signal-based components (reading a signal is already case (c)); this
 * operator moves existing field-based components to OnPush without converting
 * 550 assignments to signals one by one.
 *
 * Usage:
 *   this.service.getAll().pipe(markDirty(this.cdr)).subscribe({ next: res => ... });
 *
 * tap runs BEFORE the subscriber's next handler; since markForCheck only raises a flag
 * and the actual check happens after the current task finishes, the assignment
 * order is not a problem.
 */
export function markDirty<T>(cdr: ChangeDetectorRef): MonoTypeOperatorFunction<T> {
  return tap<T>({
    next: () => cdr.markForCheck(),
    error: () => cdr.markForCheck(),
    complete: () => cdr.markForCheck()
  });
}
