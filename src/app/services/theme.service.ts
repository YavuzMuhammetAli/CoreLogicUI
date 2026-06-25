import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

/**
 * Açık/koyu tema durumunu yönetir.
 * Kullanıcı seçimi localStorage'da saklanır; seçim yoksa işletim sistemi
 * tercihi (prefers-color-scheme) kullanılır. `index.html`'deki anti-FOUC
 * script tema attribute'unu Angular boot olmadan önce zaten uygular —
 * bu servis sonradan senkronize olur ve toggle/değiştirme API'sini sağlar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Aktif tema (sinyal) — topbar toggle butonu bunu okur */
  readonly theme = signal<Theme>(this.resolveInitial());

  constructor() {
    this.apply(this.theme());
  }

  private get storage(): Storage | null {
    return isPlatformBrowser(this.platformId) ? localStorage : null;
  }

  /** localStorage'daki kullanıcı seçimi, yoksa OS tercihi */
  private resolveInitial(): Theme {
    if (!isPlatformBrowser(this.platformId)) return 'light';

    const stored = this.storage?.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(theme: Theme): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.documentElement.setAttribute('data-theme', theme);
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.storage?.setItem(THEME_KEY, next);
    this.apply(next);
  }
}
