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
 * Tasarlanmış kenar çubuğu menüsü — admin'in Tasarım sayfasında kurduğu, kullanıcının rolüne düşen
 * navigasyon (çözümlenmiş ağaç: `resolveNav`). Tek seviye klasörler açılır/kapanır; kullanıcının
 * seçimi tarayıcıda hatırlanır, etkin sayfayı içeren klasör kendiliğinden açılır.
 *
 * `preview` kipinde (tasarımcı önizlemesi) bağlantılar gezinmez — kap `inert`'tir.
 */
@Component({
  selector: 'app-sidebar-nav',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TranslatePipe, IconComponent, ModelIconComponent],
  templateUrl: './sidebar-nav.component.html',
  styleUrls: ['./sidebar-nav.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarNavComponent {
  private readonly router = inject(Router);

  readonly nodes = input.required<readonly ResolvedNavNode[]>();
  /** Klasör aç/kapa hafızasının anahtarı — farklı tasarımlarda aynı klasör kimliği olabilir. */
  readonly layoutId = input<number | null>(null);
  readonly pendingTaskCount = input(0);
  readonly preview = input(false);

  readonly exact = EXACT;
  readonly subset = SUBSET;

  /** Kullanıcının elle açtığı/kapattığı klasörler (kimlik → açık mı). */
  private readonly toggled = signal<Record<string, boolean>>({});
  /** Etkin sayfayı içeren klasörler — her gezinmede yeniden hesaplanır. */
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
    // Tasarım değişince hafızayı o tasarımın kaydından yükle.
    effect(() => {
      const key = this.storageKey();
      untracked(() => this.toggled.set(key ? readState(key) : {}));
    }, { allowSignalWrites: true });

    effect(() => {
      this.nodes();
      untracked(() => this.syncActiveFolders());
    }, { allowSignalWrites: true });

    const sub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.syncActiveFolders());
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  isOpen(folder: ResolvedNavFolder): boolean {
    return this.openState().get(folder.id) ?? true;
  }

  toggle(folder: ResolvedNavFolder): void {
    const next = { ...this.toggled(), [folder.id]: !this.isOpen(folder) };
    this.toggled.set(next);
    // Kullanıcı etkin klasörü kapatabilsin: otomatik açma bir sonraki gezinmeye kadar susar.
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

// Kullanıcı başına küçük bir kolaylık — tarayıcı deposu yoksa/engelliyse menü yine çalışır.
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
    // Özel pencere / kota — hatırlanmaz, sorun değil.
  }
}
