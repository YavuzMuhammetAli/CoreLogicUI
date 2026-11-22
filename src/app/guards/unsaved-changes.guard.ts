import { CanDeactivateFn } from '@angular/router';

/**
 * Contract for screens with unsaved changes. The screen asks the question ITSELF
 * (with its own `app-confirm-dialog`) and returns the answer: a guard cannot
 * render a component, and native `confirm()` is banned in the project.
 */
export interface HasUnsavedChanges {
  /** true → free to leave; false → stay on the screen. If the question is open, waits for the answer. */
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Asks about unsaved changes before leaving the screen. Closing the tab and
 * reloading the page do not go through this guard; the screen's `beforeunload` listener
 * catches them.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = component =>
  typeof component?.canLeave === 'function' ? component.canLeave() : true;
