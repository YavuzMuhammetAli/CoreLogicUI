import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, tap, catchError, shareReplay, map, finalize } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ModelPermission {
  modelName: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Should it appear in the user's sidebar navigation? A flag independent of Read. */
  canShowInNav: boolean;
  /** The user can see/change only the records they created (CreatedBy==userId). */
  canOwnOnly: boolean;
  /** Can see the record's workflow (decided on the server — IWorkflowAccessPolicy). */
  canViewWorkflow: boolean;
}

export interface MyPermissionsResponse {
  success: boolean;
  message: string;
  data: {
    isAdmin: boolean;
    permissions: ModelPermission[];
    /** Landing page resolved from the roles the user belongs to; null if not defined. */
    landingPage: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Permission`;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);

  /** The user's permission data — null means not loaded yet */
  private _data = signal<MyPermissionsResponse['data'] | null>(null);

  /**
   * Model name (lower case) → permission. can()/canNavigate() is called several times per row in
   * list rows; scanning the whole permission list with toLowerCase on each call grew with the model count.
   * The map is built only when the permission data changes.
   */
  private readonly byModel = computed(() => {
    const map = new Map<string, ModelPermission>();
    for (const p of this._data()?.permissions ?? []) map.set(p.modelName.toLowerCase(), p);
    return map;
  });

  /**
   * In-flight load request — if several guards run at the same time
   * it is shared as a single HTTP request. Reset on clear().
   */
  private _loadingRef: Observable<MyPermissionsResponse['data'] | null> | null = null;

  /**
   * Guarantees the permission data is loaded.
   *
   * - If the signal is already filled, emits the current data immediately (no HTTP request).
   * - Otherwise calls `loadMyPermissions()`; if several guards run at the same
   *   time, `shareReplay(1)` ensures a single HTTP request.
   * - On error emits `null`; a 401 is handled by `errorInterceptor`
   *   with the login redirect.
   *
   * Usage in guards: `permissions.ensureLoaded().pipe(map(() => ...))`
   */
  ensureLoaded(): Observable<MyPermissionsResponse['data'] | null> {
    // Already filled — return immediately, don't request again
    if (this._data() !== null) {
      return of(this._data());
    }

    // Share the in-flight request; clear the reference on completion. Otherwise the null result of a
    // failed load stays cached until logout and the guards never retry.
    if (!this._loadingRef) {
      this._loadingRef = this.loadMyPermissions().pipe(
        map(() => this._data()),
        catchError(() => of(null)),
        finalize(() => { this._loadingRef = null; }),
        shareReplay(1)
      );
    }

    return this._loadingRef;
  }

  /**
   * Loads the user's permissions from the backend.
   * Not called in SSR since there is no browser.
   * Returns an Observable; a subscriber can use it in the logout flow.
   */
  loadMyPermissions(): Observable<MyPermissionsResponse> {
    return this.http
      .get<MyPermissionsResponse>(`${this.baseUrl}/my`)
      .pipe(
        tap(res => {
          if (res.success && res.data) {
            this._data.set(res.data);
          }
        })
      );
  }

  /**
   * Synchronously returns whether the user is an administrator.
   * Signal-based; returns false if the permission data is not loaded yet.
   */
  isAdmin(): boolean {
    return this._data()?.isAdmin ?? false;
  }

  /**
   * Synchronously checks the given action permission on the given model.
   * Always returns true for an administrator.
   * @param modelName  Model / table name (typeName)
   * @param action     'read' | 'create' | 'update' | 'delete'
   */
  can(
    modelName: string,
    action: 'read' | 'create' | 'update' | 'delete'
  ): boolean {
    const data = this._data();
    if (!data) return false;
    if (data.isAdmin) return true;

    const perm = this.byModel().get(modelName.toLowerCase());
    if (!perm) return false;

    switch (action) {
      case 'read':   return perm.canRead;
      case 'create': return perm.canCreate;
      case 'update': return perm.canUpdate;
      case 'delete': return perm.canDelete;
    }
  }

  /**
   * Synchronously checks whether the given model should appear in the navigation.
   * Always returns true for an administrator (the admin sidebar is rendered in a different branch,
   * this method does not affect admin visibility; it is only for the regular user's nav filter).
   */
  canNavigate(modelName: string): boolean {
    const data = this._data();
    if (!data) return false;
    if (data.isAdmin) return true;

    return this.byModel().get(modelName.toLowerCase())?.canShowInNav ?? false;
  }

  /**
   * Returns the landing page to redirect to after login. If the user's role has no landing page
   * defined (or the permission data is not loaded yet), the default /models is returned.
   */
  getLandingPage(): string {
    return this._data()?.landingPage ?? '/models';
  }

  /** Clears the permission data (called on logout). */
  clear(): void {
    this._data.set(null);
    this._loadingRef = null; // also reset the ensureLoaded in-flight reference
  }

}
