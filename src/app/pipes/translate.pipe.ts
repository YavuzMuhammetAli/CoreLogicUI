import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../services/language.service';

/**
 * Çeviri anahtarını aktif arayüz diline (TR/EN) çevirir.
 * Impure işaretlenir — LanguageService.lang() signal'i değiştiğinde (dil toggle'ı)
 * Angular bu pipe'ı her change detection turunda yeniden değerlendirir.
 *
 * Kullanım:
 *   {{ 'menu.models' | t }}
 *   {{ 'role.created' | t:{ name: roleName } }}
 *   [attr.aria-label]="'menu.modelList' | t"
 */
@Pipe({
  name: 't',
  standalone: true,
  pure: false
})
export class TranslatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.languageService.t(key, params);
  }
}
