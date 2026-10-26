import '../../../i18n/lazy/datatype-help'; // help.* sözlüğü bu parçayla iner
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { HelpTopic, HelpTopicId, resolveHelpTopic } from './datatype-help.data';
import { REGEX_LAB_MAX_LENGTH, REGEX_PRESETS, REGEX_SYNTAX, RegexPreset } from './regex-presets';

/** Canlı regex testinin sonucu. */
type RegexTestResult = 'idle' | 'match' | 'nomatch' | 'invalid';

/**
 * DatatypeHelpComponent — bir veri tipi, ilişki tipi veya kavram için
 * tam ekran kılavuz diyaloğu.
 *
 * Kolon popup'ındaki "Veri Tipi" ve ilişki popup'ındaki "İlişki Tipi"
 * seçicilerinin yanındaki "i" düğmesi ile açılır; sekme araç çubuklarındaki
 * "Nasıl çalışır?" düğmesi kavram konularını açar.
 *
 * Kısa, tek cümlelik ipuçları için bunun yerine `<app-help-hint>` kullanılır.
 *
 * ÖNEMLİ: Bu diyalog her zaman mevcut bir popup'ın ÜSTÜNDE açılır. Bu yüzden
 * overlay z-index'i 1100'dür (diğer diyaloglar 1000) ve ESC olayı yakalanınca
 * `stopPropagation()` yapılır — aksi halde tek ESC basışı alttaki popup'ı da
 * kapatır (bkz. table-detail `onEscape()` zinciri).
 */
@Component({
  selector: 'app-datatype-help',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './datatype-help.component.html',
  styleUrls: ['./datatype-help.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DatatypeHelpComponent {
  private readonly languageService = inject(LanguageService);

  /** Diyalog açık mı. */
  open = input(false);

  /** Gösterilecek konu: veri tipi anahtarı, 'subModels'/'relationships' veya 'rel:<Tip>'. */
  topic = input.required<HelpTopicId>();

  closed = output<void>();

  /** Kullanıcı bir hazır desende "Kullan"a bastığında — çağıran forma yazar. */
  patternPicked = output<RegexPreset>();

  readonly presets = REGEX_PRESETS;
  readonly syntax = REGEX_SYNTAX;
  readonly maxLabLength = REGEX_LAB_MAX_LENGTH;

  /**
   * Üç FK mekanizmasının constraint ad kalıpları (fkMechanisms şemasında yazılır).
   * Şablona düz metin olarak gömülemezler: Angular derleyicisi süslü parantezi
   * ICU mesajı sanır, bu yüzden interpolasyonla basılırlar.
   */
  readonly fkNames = {
    tree: 'FK_{tablo}_{üst}',
    lookup: 'FK_{tablo}_{kolon}',
    relationship: 'FK_{tablo}_{kolon}_Rel'
  };

  /** Aktif konunun içeriği; bilinmeyen anahtarda genel bir konuya düşer. */
  content = computed<HelpTopic>(() => resolveHelpTopic(this.topic()));

  // ─── Canlı regex testi ──────────────────────────────────────────────────────

  testPattern = signal('');
  testValue = signal('');

  /**
   * Deseni test değerine uygular. Kullanıcının yazdığı desen tarayıcıda çalıştığı
   * için uzunluk sınırı (REGEX_LAB_MAX_LENGTH) katastrofik backtracking'e karşı
   * kaba ama yeterli bir korumadır; geçersiz desen try/catch ile yakalanır.
   */
  testResult = computed<RegexTestResult>(() => {
    const pattern = this.testPattern().trim();
    const value = this.testValue();
    if (!pattern || !value) return 'idle';
    if (pattern.length > REGEX_LAB_MAX_LENGTH || value.length > REGEX_LAB_MAX_LENGTH) return 'invalid';

    try {
      return new RegExp(pattern).test(value) ? 'match' : 'nomatch';
    } catch {
      return 'invalid';
    }
  });

  onTestPatternInput(event: Event): void {
    this.testPattern.set((event.target as HTMLInputElement).value);
  }

  onTestValueInput(event: Event): void {
    this.testValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * "Kullan" — deseni çağıran forma bildirir ve aynı deseni canlı test kutusuna
   * da yazar, böylece kullanıcı çalıştığını anında görür.
   */
  usePreset(preset: RegexPreset): void {
    this.testPattern.set(preset.pattern);
    this.testValue.set(preset.sampleOk);
    this.patternPicked.emit(preset);
  }

  /** "Kullan" düğmesinin erişilebilir etiketi — desen adını içerir. */
  useAria(preset: RegexPreset): string {
    return this.languageService.t('help.regex.useAria', {
      name: this.languageService.t(`help.regex.preset.${preset.key}`)
    });
  }

  // ─── Kapatma ────────────────────────────────────────────────────────────────

  close(): void {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.open()) return;
    // Alttaki popup'ın ESC işleyicisi aynı basışla tetiklenmesin. Her iki
    // işleyici de `document` üzerinde olduğundan stopPropagation yetmez —
    // aynı hedefteki diğer dinleyicileri yalnızca bu durdurur.
    event.stopImmediatePropagation();
    this.close();
  }
}
