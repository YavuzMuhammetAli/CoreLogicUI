import { ChangeDetectorRef, Component, computed, effect, inject, input, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule } from '@angular/forms';
import { PublishedColumn } from '../../../services/published-model.service';
import { PublishedColumnSchema } from '../../../services/published-table.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { HelpHintComponent } from '../help-hint/help-hint.component';
import { LookupPickerComponent } from '../lookup-picker/lookup-picker.component';
import {
  downloadFile, imageSrc, inputTypeFor, isImage, parseEnumValues, stepFor
} from '../../model-data/model-data.util';
import { AutoValueRule } from '../../../utils/auto-value/auto-value';
import { fileAccept, fileSizeError } from '../../../utils/file-size';
import { asFileRef, fileRefUrl } from '../../../utils/record-file';
import { isColumnRequired } from '../../../utils/record-field/column-required';
import { fieldErrorText } from '../../../utils/record-field/field-error';
import { FieldWidget } from '../../../utils/screen-layout/screen-layout.model';
import { IconComponent } from '../icon/icon.component';

/**
 * RecordFieldComponent — dinamik kayıt formunun TEK bir alanı: etiket (zorunlu işareti,
 * açıklama, ƒx otomatik değer rozeti, tip etiketi), tipe uygun kontrol ve hata metni.
 *
 * Kayıt sayfası (model-detail) ile alt kayıt pop-up'ı (record-form-dialog) bu bloğu
 * eskiden birebir kopyalıyordu; ekran tasarımcısı da aynı alanı çizeceği için tek yere
 * toplandı. Form kontrolü çağıranındır — bileşen yalnız onu çizer ve dosya seçimini
 * kontrolün değerine yazar.
 *
 * Host elementin kendisi `.field`'dır: üstteki ızgaranın doğrudan hücresi olur.
 *
 * DEĞİŞİKLİK ALGILAMA BİLİNÇLİ OLARAK `Default`: çağıranlar OnPush ve Kaydet'te
 * `markAllAsTouched()` diyor — bu, girdilerin hiçbirini değiştirmez. OnPush olsaydı alan
 * hata metnini göstermezdi. Default bileşen, OnPush ata kontrol edildiği her turda
 * kontrol edilir; yani davranış alanların ata şablonda durduğu eski hâliyle aynıdır.
 */
@Component({
    selector: 'app-record-field',
    imports: [ReactiveFormsModule, TranslatePipe, HelpHintComponent, LookupPickerComponent, IconComponent],
    templateUrl: './record-field.component.html',
    styleUrls: ['./record-field.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        class: 'field',
        '[class.field--step]': 'step()'
    }
})
export class RecordFieldComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly languageService = inject(LanguageService);

  /** Çizilecek kolon (tip, etiket, açıklama, enum/lookup hedefi). */
  readonly column = input.required<PublishedColumn>();
  /** Kolonun form kontrolü — formu kuran çağırandır. */
  readonly control = input.required<AbstractControl>();
  /** Şema kuralı (zorunluluk, regex mesajı, dosya sınırı); yüklenmemişse undefined. */
  readonly rule = input<PublishedColumnSchema | undefined>(undefined);
  /** Ekrandaki benzersiz id öneki — iç içe pop-up'larda aynı kolon adı çakışmasın. */
  readonly idPrefix = input('field-');
  /** Sırası gelen görevlinin dolduracağı alan (iş akışı adımı) — vurgulanır. */
  readonly step = input(false);
  /** Kolonun otomatik değer kuralı — etiketteki ƒx rozeti. */
  readonly autoValueRule = input<AutoValueRule | undefined>(undefined);
  /** Numarası kayıtta verilecek alan (SEQ) — "Kaydedince atanır" ipucu. */
  readonly autoValuePending = input(false);
  /** Ekran tasarımındaki gösterim biçimi: çok satırlı metin ya da seçenek düğmeleri. */
  readonly widget = input<FieldWidget | null>(null);
  /** Çok satırlı metinde görünen satır sayısı. */
  readonly rows = input<number | null>(null);

  /** Seçilen dosyanın adı — indirmede orijinal adla kaydedilsin. */
  private readonly fileName = signal<string | null>(null);
  /** Boyut sınırı nedeniyle reddedilen dosyanın hata metni. */
  readonly fileError = signal<string | null>(null);

  readonly formControl = computed(() => this.control() as FormControl);
  readonly inputId = computed(() => this.idPrefix() + this.column().columnName);
  readonly errorId = computed(() => this.idPrefix() + 'err-' + this.column().columnName);
  readonly label = computed(() => this.column().label?.trim() || this.column().columnName);
  readonly required = computed(() => isColumnRequired(this.column(), this.rule()));
  readonly inputType = computed(() => inputTypeFor(this.column().dataType));
  readonly enumValues = computed(() => parseEnumValues(this.column().enumValues));
  readonly accept = computed(() => fileAccept(this.column().dataType, this.column().enumValues));
  readonly stepAttr = computed(() => stepFor(this.column().dataType));
  readonly description = computed(() => this.column().description?.trim() ?? '');
  /** Gösterim biçimi yalnız uygun tipte uygulanır (tasarım doğrulaması da bunu ister). */
  readonly isMultiline = computed(() =>
    this.column().dataType === 'text' || (this.widget() === 'multiline' && this.column().dataType === 'string'));
  /** Uzun metin alanı içeriğine yer açılmış başlar; tasarımcıdaki satır sayısı önceliklidir. */
  readonly textareaRows = computed(() => this.rows() ?? (this.column().dataType === 'text' ? 6 : 3));
  readonly isRadio = computed(() => this.widget() === 'radio' && this.column().dataType === 'enum');

  readonly isImage = isImage;
  readonly imageSrc = imageSrc;
  readonly asFileRef = asFileRef;
  readonly fileUrl = fileRefUrl;

  constructor() {
    // Form yeniden kurulunca (yeni kontrol) önceki dosya seçiminin izi taşınmasın.
    effect(() => {
      this.control();
      untracked(() => {
        this.fileName.set(null);
        this.fileError.set(null);
      });
    });
  }

  /** Alan dokunulduysa gösterilecek hata metni. */
  errorText(): string | null {
    const control = this.control();
    if (!control.touched) return null;
    return fieldErrorText(
      control.errors, this.label(), this.rule(),
      (key, params) => this.languageService.t(key, params), this.languageService.lang());
  }

  invalid(): boolean {
    const control = this.control();
    return control.touched && control.invalid;
  }

  value(): unknown {
    return this.control().value;
  }

  /**
   * Dosya seçimi. Boyut dosya OKUNMADAN denetlenir; aşıyorsa önceki değer korunur.
   * Değer base64 olarak kontrole yazılır ve kontrol kirli işaretlenir — "{Akış} Başlat"
   * kaydetme gereğini `form.dirty`'den okuyor; işaretlenmeseydi seçilen dosya kaydedilmeden
   * süreç başlardı.
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const column = this.column();
    const sizeError = fileSizeError(
      file, column.dataType, this.rule()?.maxLength ?? column.maxLength, this.languageService.lang());
    if (sizeError) {
      this.fileError.set(this.languageService.t(sizeError.key, { label: this.label(), ...sizeError.params }));
      input.value = '';
      return;
    }
    this.fileError.set(null);
    this.fileName.set(file.name);

    const control = this.control();
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      control.setValue(result.split(',')[1] ?? result);
      control.markAsDirty();
      // FileReader şablon olayı değildir: OnPush atalar kendiliğinden kontrol edilmez.
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  download(): void {
    const value = this.value();
    if (typeof value !== 'string' || !value) return;
    const columnName = this.column().columnName;
    const name = this.fileName();
    downloadFile(value, columnName, name ? { [columnName]: name } : {});
  }
}
