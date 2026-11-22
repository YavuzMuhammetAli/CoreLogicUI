import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../services/language.service';

/**
 * Translates a translation key into the active UI language (TR/EN).
 * Marked impure — when the LanguageService.lang() signal changes (language toggle)
 * Angular re-evaluates this pipe on every change detection run.
 *
 * Usage:
 *   {{ 'menu.models' | t }}
 *   {{ 'role.created' | t:{ name: roleName } }}
 *   [attr.aria-label]="'menu.modelList' | t"
 */
@Pipe({
  name: 't',
  pure: false
})
export class TranslatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(key: string, params?: Record<string, string | number>): string {
    return this.languageService.t(key, params);
  }
}
