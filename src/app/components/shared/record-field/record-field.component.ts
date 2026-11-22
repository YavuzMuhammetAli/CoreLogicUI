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
 * RecordFieldComponent — a SINGLE field of the dynamic record form: label (required marker,
 * description, ƒx auto-value badge, type tag), a control suited to the type, and the error text.
 *
 * The record page (model-detail) and the child record pop-up (record-form-dialog) used to
 * copy this block verbatim; since the screen designer draws the same field too, it was
 * consolidated in one place. The form control belongs to the caller — the component only draws it
 * and writes file selections to the control's value.
 *
 * The host element itself is `.field`: it becomes a direct cell of the parent grid.
 *
 * CHANGE DETECTION IS DELIBERATELY `Default`: callers are OnPush and call `markAllAsTouched()`
 * on Save — which changes none of the inputs. With OnPush the field wouldn't show
 * its error text. A Default component is checked on every round its OnPush ancestor is
 * checked; i.e. the behaviour matches the old state where the fields lived in the ancestor template.
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

  /** Column to draw (type, label, description, enum/lookup target). */
  readonly column = input.required<PublishedColumn>();
  /** The column's form control — the caller builds the form. */
  readonly control = input.required<AbstractControl>();
  /** Schema rule (required, regex message, file limit); undefined if not loaded. */
  readonly rule = input<PublishedColumnSchema | undefined>(undefined);
  /** Unique id prefix on the screen — so the same column name doesn't collide in nested pop-ups. */
  readonly idPrefix = input('field-');
  /** Field to be filled by the assignee whose turn it is (workflow step) — highlighted. */
  readonly step = input(false);
  /** The column's auto-value rule — the ƒx badge in the label. */
  readonly autoValueRule = input<AutoValueRule | undefined>(undefined);
  /** Field whose number is assigned on save (SEQ) — the "Kaydedince atanır" (Assigned on save) hint. */
  readonly autoValuePending = input(false);
  /** Display widget from the screen design: multiline text or option buttons. */
  readonly widget = input<FieldWidget | null>(null);
  /** Number of visible rows for multiline text. */
  readonly rows = input<number | null>(null);

  /** Name of the selected file — so a download saves it under its original name. */
  private readonly fileName = signal<string | null>(null);
  /** Error text for a file rejected because of the size limit. */
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
  /** The widget is applied only to a suitable type (design validation requires this too). */
  readonly isMultiline = computed(() =>
    this.column().dataType === 'text' || (this.widget() === 'multiline' && this.column().dataType === 'string'));
  /** A long text field starts with room for its content; the row count from the designer takes precedence. */
  readonly textareaRows = computed(() => this.rows() ?? (this.column().dataType === 'text' ? 6 : 3));
  readonly isRadio = computed(() => this.widget() === 'radio' && this.column().dataType === 'enum');

  readonly isImage = isImage;
  readonly imageSrc = imageSrc;
  readonly asFileRef = asFileRef;
  readonly fileUrl = fileRefUrl;

  constructor() {
    // When the form is rebuilt (new control), traces of the previous file selection must not carry over.
    effect(() => {
      this.control();
      untracked(() => {
        this.fileName.set(null);
        this.fileError.set(null);
      });
    });
  }

  /** Error text to show if the field has been touched. */
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
   * File selection. The size is checked BEFORE reading the file; if it exceeds the limit the previous value is kept.
   * The value is written to the control as base64 and the control is marked dirty — "{Akış} Başlat" (Start {workflow})
   * reads whether a save is needed from `form.dirty`; if it weren't marked, the process would start
   * without saving the selected file.
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
      // FileReader is not a template event: OnPush ancestors aren't checked automatically.
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
