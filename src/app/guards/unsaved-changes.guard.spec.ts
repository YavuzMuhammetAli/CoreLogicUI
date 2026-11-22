import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { HasUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  const run = (component: HasUnsavedChanges | null) =>
    unsavedChangesGuard(component as HasUnsavedChanges, route, state, state);

  it('returns the screen\'s answer as is', async () => {
    expect(run({ canLeave: () => true })).toBeTrue();
    expect(run({ canLeave: () => false })).toBeFalse();
    expect(await run({ canLeave: () => Promise.resolve(false) })).toBeFalse();
  });

  it('does not block leaving on a component that does not implement the contract or is destroyed', () => {
    expect(run(null)).toBeTrue();
    expect(run({} as HasUnsavedChanges)).toBeTrue();
  });
});
