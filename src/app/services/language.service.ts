import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TRANSLATIONS } from '../i18n';

export type Lang = 'tr' | 'en';

const LANG_KEY = 'lang';

/**
 * Manages the UI language preference (TR/EN). Exactly the same pattern as ThemeService:
 * the user's choice is stored in localStorage; without a choice the default 'tr' is used.
 *
 * language.interceptor.ts reads this preference (via localStorage) and adds an
 * Accept-Language header to every HTTP request; the backend uses it through
 * Business.Constants.Messages to pick localized messages (see Program.cs UseRequestLocalization).
 *
 * For static UI text (templates + TS messages) the `t()` method is used —
 * it returns the text for the active language from the TRANSLATIONS dictionary under src/app/i18n.
 * In templates, prefer TranslatePipe (`| t`) over calling it directly.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly platformId = inject(PLATFORM_ID);

  /** Aktif dil (sinyal) — topbar toggle butonu bunu okur */
  readonly lang = signal<Lang>(this.resolveInitial());

  constructor() {
    this.apply(this.lang());
  }

  private get storage(): Storage | null {
    return isPlatformBrowser(this.platformId) ? localStorage : null;
  }

  /** The user's choice from localStorage, otherwise the default 'tr' */
  private resolveInitial(): Lang {
    if (!isPlatformBrowser(this.platformId)) return 'tr';

    const stored = this.storage?.getItem(LANG_KEY);
    return stored === 'en' ? 'en' : 'tr';
  }

  private apply(lang: Lang): void {
    if (!isPlatformBrowser(this.platformId)) return;
    document.documentElement.lang = lang;
  }

  toggle(): void {
    const next: Lang = this.lang() === 'tr' ? 'en' : 'tr';
    this.lang.set(next);
    this.storage?.setItem(LANG_KEY, next);
    this.apply(next);
  }

  /**
   * Translates a key into the active language; fills `{param}` placeholders from `params`.
   * If the key is not in the dictionary, the key itself is returned as a development aid.
   */
  t(key: string, params?: Record<string, string | number>): string {
    const entry = TRANSLATIONS[key];
    let text = entry ? entry[this.lang()] : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  }
}
