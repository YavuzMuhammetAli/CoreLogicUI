import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { HasUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  const run = (component: HasUnsavedChanges | null) =>
    unsavedChangesGuard(component as HasUnsavedChanges, route, state, state);

  it('ekranın cevabını aynen döner', async () => {
    expect(run({ canLeave: () => true })).toBeTrue();
    expect(run({ canLeave: () => false })).toBeFalse();
    expect(await run({ canLeave: () => Promise.resolve(false) })).toBeFalse();
  });

  it('sözleşmeyi uygulamayan ya da kapanmış bileşende ayrılmayı engellemez', () => {
    expect(run(null)).toBeTrue();
    expect(run({} as HasUnsavedChanges)).toBeTrue();
  });
});
