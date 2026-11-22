import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IsActiveMatchOptions, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ResolvedNavFolder, ResolvedNavLink, ResolvedNavNode } from '../../../utils/nav-layout/nav-layout.resolve';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { IconComponent } from '../../shared/icon/icon.component';
import { ModelIconComponent } from '../../shared/model-icon/model-icon.component';

const EXACT: IsActiveMatchOptions = { paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' };
const SUBSET: IsActiveMatchOptions = { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' };

/**
 * Designed sidebar menu — the navigation the admin built on the Design page that applies to the user's
 * role (resolved tree: `resolveNav`). Single-level folders expand/collapse; the user's
 * choice is remembered in the browser, and the folder containing the active page opens automatically.
 *
 * In `preview` mode (designer preview) links do not navigate — the container is `inert`.
 */
@Component({
    selector: 'app-sidebar-nav',
    imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './sidebar-nav.component.html',
    styleUrls: ['./sidebar-nav.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarNavComponent {
  private readonly router = inject(Router);

  readonly nodes = input.required<readonly ResolvedNavNode[]>();
  /** Key of the folder open/closed memory — different designs may have the same folder id. */
  readonly layoutId = input<number | null>(null);
  readonly pendingTaskCount = input(0);
  readonly preview = input(false);

  readonly exact = EXACT;
  readonly subset = SUBSET;

  /** Folders the user opened/closed manually (id → open?). */
  private readonly toggled = signal<Record<string, boolean>>({});
  /** Folders containing the active page — recomputed on every navigation. */
  private readonly activeFolders = signal<ReadonlySet<string>>(new Set());

  readonly openState = computed(() => {
    const toggled = this.toggled();
    const active = this.activeFolders();
    const state = new Map<string, boolean>();
    for (const node of this.nodes()) {
      if (node.kind !== 'folder') continue;
      state.set(node.id, active.has(node.id) || (toggled[node.id] ?? !node.collapsed));
    }
    return state;
  });

  constructor() {
    // When the design changes, load the memory from that design's record.
    effect(() => {
      const key = this.storageKey();
      untracked(() => this.toggled.set(key ? readState(key) : {}));
    });

    effect(() => {
      this.nodes();
      untracked(() => this.syncActiveFolders());
    });

    const sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.syncActiveFolders());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  isOpen(folder: ResolvedNavFolder): boolean {
    return this.openState().get(folder.id) ?? true;
  }

  toggle(folder: ResolvedNavFolder): void {
    const next = { ...this.toggled(), [folder.id]: !this.isOpen(folder) };
    this.toggled.set(next);
    // So the user can close the active folder: auto-open stays quiet until the next navigation.
    if (this.activeFolders().has(folder.id)) {
      const active = new Set(this.activeFolders());
      active.delete(folder.id);
      this.activeFolders.set(active);
    }
    const key = this.storageKey();
    if (key && !this.preview()) writeState(key, next);
  }

  private storageKey(): string | null {
    const id = this.layoutId();
    return id ? `nav.folders.${id}` : null;
  }

  private syncActiveFolders(): void {
    const active = new Set<string>();
    for (const node of this.nodes()) {
      if (node.kind !== 'folder') continue;
      if (node.children.some(link => this.isLinkActive(link))) active.add(node.id);
    }
    this.activeFolders.set(active);
  }

  private isLinkActive(link: ResolvedNavLink): boolean {
    if (!link.route) return false;
    return this.router.isActive(this.router.createUrlTree([...link.route]), link.exact ? EXACT : SUBSET);
  }
}

// A small per-user convenience — if browser storage is missing/blocked the menu still works.
function readState(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, boolean> : {};
  } catch {
    return {};
  }
}

function writeState(key: string, state: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Private window / quota — not remembered, no problem.
  }
}
