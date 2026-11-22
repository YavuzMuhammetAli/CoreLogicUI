import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

/**
 * Manages the light/dark theme state.
 * The user's choice is stored in localStorage; without a choice the operating system
 * preference (prefers-color-scheme) is used. The anti-FOUC script in `index.html`
 * already applies the theme attribute before Angular boots —
 * this service syncs afterwards and provides the toggle/change API.
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

  /** The user's choice from localStorage, otherwise the OS preference */
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
