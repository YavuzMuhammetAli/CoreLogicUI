import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TRANSLATIONS } from '../i18n';

export type Lang = 'tr' | 'en';

const LANG_KEY = 'lang';

/**
 * Arayüz dili tercihini yönetir (TR/EN). ThemeService ile birebir aynı desen:
 * kullanıcı seçimi localStorage'da saklanır, seçim yoksa varsayılan 'tr' kullanılır.
 *
 * language.interceptor.ts bu tercihi (localStorage üzerinden) okuyup her HTTP isteğine
 * Accept-Language header'ı ekler; backend bunu Business.Constants.Messages üzerinden
 * lokalize mesaj seçimi için kullanır (bkz. Program.cs UseRequestLocalization).
 *
 * Statik UI metinleri (şablonlar + TS mesajları) için `t()` metodu kullanılır —
 * src/app/i18n altındaki TRANSLATIONS sözlüğünden aktif dile göre metni döner.
 * Şablonlarda doğrudan çağırmak yerine TranslatePipe (`| t`) kullanılması önerilir.
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

  /** localStorage'daki kullanıcı seçimi, yoksa varsayılan 'tr' */
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
   * Çeviri anahtarını aktif dile çevirir; `{param}` yer tutucularını `params` ile doldurur.
   * Anahtar sözlükte yoksa geliştirme kolaylığı için anahtarın kendisi döner.
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
