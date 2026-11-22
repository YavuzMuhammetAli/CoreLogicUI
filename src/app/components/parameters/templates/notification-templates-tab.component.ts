import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit,
  computed, inject, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, of, switchMap, catchError } from 'rxjs';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import {
  NOTIFICATION_TEMPLATE_KINDS,
  NotificationLanguage,
  NotificationTemplate,
  NotificationTemplateContent,
  NotificationTemplateKind
} from '../../../models/parameter.model';
import { IconComponent } from '../../shared/icon/icon.component';

/** A switch requested while there are unsaved changes — applied after confirmation. */
interface PendingSwitch {
  kind: NotificationTemplateKind;
  lang: NotificationLanguage;
}

/**
 * Notification Templates tab — the email subject and HTML of each notification kind.
 *
 * If the admin does nothing, the embedded corporate template is used. A saved
 * template applies only to that kind + language; "Varsayılana Dön" (Reset to default) deletes the custom record.
 *
 * The preview is rendered ON THE SERVER (with sample data) — so it goes through the same
 * engine as real sending and unknown-placeholder errors show up before saving.
 */
@Component({
    selector: 'app-notification-templates-tab',
    imports: [ReactiveFormsModule, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './notification-templates-tab.component.html',
    styleUrls: ['../parameters.shared.scss', './notification-templates-tab.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationTemplatesTabComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parameterService = inject(ParameterService);
  private readonly languageService = inject(LanguageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly kinds = NOTIFICATION_TEMPLATE_KINDS;
  readonly languages: NotificationLanguage[] = ['tr', 'en'];

  readonly selectedKind = signal<NotificationTemplateKind>('TaskAssigned');
  /** Language of the template being edited — independent of the UI language. */
  readonly selectedLang = signal<NotificationLanguage>(
    this.languageService.lang() === 'en' ? 'en' : 'tr');

  /** Kind → whether a custom template exists (for the selected language). */
  readonly customKinds = signal<ReadonlySet<string>>(new Set());

  readonly template = signal<NotificationTemplate | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly resetting = signal(false);
  readonly testing = signal(false);
  readonly previewing = signal(false);

  readonly loadError = signal('');
  readonly formError = signal('');
  readonly formSuccess = signal('');
  readonly previewError = signal('');
  readonly testError = signal('');
  readonly testSuccess = signal('');

  readonly previewSubject = signal('');
  readonly previewHtml = signal<SafeHtml | null>(null);

  readonly resetConfirmOpen = signal(false);
  readonly pendingSwitch = signal<PendingSwitch | null>(null);

  readonly form = this.fb.nonNullable.group({
    subject: ['', [Validators.required, Validators.maxLength(200)]],
    html: ['', Validators.required]
  });

  readonly testForm = this.fb.nonNullable.group({
    to: ['', [Validators.required, Validators.email]]
  });

  /** Loaded (server) content — for detecting unsaved changes. */
  private readonly original = signal<NotificationTemplateContent>({ subject: '', html: '' });
  private readonly current = signal<NotificationTemplateContent>({ subject: '', html: '' });

  readonly dirty = computed(() =>
    this.current().subject !== this.original().subject || this.current().html !== this.original().html);

  /** The field to insert into when a placeholder chip is pressed — the last focused one. */
  private lastField: 'subject' | 'html' = 'html';
  private readonly subjectInput = viewChild<ElementRef<HTMLInputElement>>('subjectInput');
  private readonly htmlInput = viewChild<ElementRef<HTMLTextAreaElement>>('htmlInput');

  private readonly previewRequests = new Subject<void>();

  ngOnInit(): void {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.current.set(this.form.getRawValue()));

    // The preview refreshes itself while typing; switchMap cancels the old request so
    // a late response does not overwrite the newer content.
    this.previewRequests
      .pipe(
        debounceTime(600),
        switchMap(() => {
          if (this.form.invalid) return of(null);
          this.previewing.set(true);
          return this.parameterService
            .previewNotificationTemplate(this.selectedKind(), this.selectedLang(), this.form.getRawValue())
            .pipe(catchError(err => of(this.errorMessage(err, 'parameter.templates.previewFailed'))));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(res => {
        this.previewing.set(false);
        if (res === null) return;
        if (typeof res === 'string') {
          this.previewError.set(res);
          return;
        }
        if (res.success) {
          this.previewError.set('');
          this.previewSubject.set(res.data.subject);
          this.previewHtml.set(this.trustPreview(res.data.html));
        } else {
          this.previewError.set(res.message);
        }
      });

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.previewRequests.next());

    this.loadList();
    this.loadTemplate();
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  selectKind(kind: NotificationTemplateKind): void {
    if (kind === this.selectedKind()) return;
    this.requestSwitch({ kind, lang: this.selectedLang() });
  }

  selectLang(lang: NotificationLanguage): void {
    if (lang === this.selectedLang()) return;
    this.requestSwitch({ kind: this.selectedKind(), lang });
  }

  private requestSwitch(target: PendingSwitch): void {
    if (this.dirty()) {
      this.pendingSwitch.set(target);
      return;
    }
    this.applySwitch(target);
  }

  confirmSwitch(): void {
    const target = this.pendingSwitch();
    this.pendingSwitch.set(null);
    if (target) this.applySwitch(target);
  }

  cancelSwitch(): void {
    this.pendingSwitch.set(null);
  }

  private applySwitch(target: PendingSwitch): void {
    const langChanged = target.lang !== this.selectedLang();
    this.selectedKind.set(target.kind);
    this.selectedLang.set(target.lang);
    if (langChanged) this.loadList();
    this.loadTemplate();
  }

  isCustom(kind: string): boolean {
    return this.customKinds().has(kind);
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  private loadList(): void {
    this.parameterService.listNotificationTemplates(this.selectedLang()).subscribe({
      next: res => {
        if (res.success) {
          this.customKinds.set(new Set(res.data.filter(t => t.isCustom).map(t => t.kind)));
        }
      },
      // The list only feeds the badges; if it fails the editor still works.
      error: () => {}
    });
  }

  private loadTemplate(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.clearMessages();

    this.parameterService.getNotificationTemplate(this.selectedKind(), this.selectedLang()).subscribe({
      next: res => {
        if (res.success) {
          this.template.set(res.data);
          this.setContent({ subject: res.data.subject, html: res.data.html });
        } else {
          this.loadError.set(res.message);
        }
        this.loading.set(false);
      },
      error: err => {
        this.loadError.set(this.errorMessage(err, 'parameter.templates.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  private setContent(content: NotificationTemplateContent): void {
    this.original.set(content);
    this.form.setValue(content);
    this.current.set(content);
    this.previewRequests.next();
  }

  // ── Editing ───────────────────────────────────────────────────────────────

  /** Text shown on the chip — writing `{{ }}` in the template would clash with Angular interpolation. */
  token(name: string): string {
    return `{{${name}}}`;
  }

  onFieldFocus(field: 'subject' | 'html'): void {
    this.lastField = field;
  }

  /** Inserts `{{name}}` text at the cursor position in the last focused field. */
  insertPlaceholder(name: string): void {
    const field = this.lastField;
    const element = field === 'subject'
      ? this.subjectInput()?.nativeElement
      : this.htmlInput()?.nativeElement;
    const control = this.form.controls[field];
    const token = `{{${name}}}`;

    const value = control.value;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;

    control.setValue(value.slice(0, start) + token + value.slice(end));
    control.markAsDirty();

    if (element) {
      // After the value is written, move the cursor to the end of the inserted text.
      queueMicrotask(() => {
        element.focus();
        element.setSelectionRange(start + token.length, start + token.length);
      });
    }
  }

  /** Replaces the editor content with the embedded default (does not save). */
  loadDefaultIntoEditor(): void {
    const t = this.template();
    if (!t) return;
    this.form.setValue({ subject: t.defaultSubject, html: t.defaultHtml });
  }

  refreshPreview(): void {
    this.previewRequests.next();
  }

  // ── Save / reset to default ──────────────────────────────────────────────

  save(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const content = this.form.getRawValue();
    this.saving.set(true);
    this.parameterService.saveNotificationTemplate(this.selectedKind(), this.selectedLang(), content).subscribe({
      next: res => {
        if (res.success) {
          this.formSuccess.set(res.message);
          this.original.set(content);
          this.template.update(t => t ? { ...t, ...content, isCustom: true } : t);
          this.customKinds.update(set => new Set(set).add(this.selectedKind()));
        } else {
          this.formError.set(res.message);
        }
        this.saving.set(false);
      },
      error: err => {
        this.formError.set(this.errorMessage(err, 'parameter.templates.saveFailed'));
        this.saving.set(false);
      }
    });
  }

  requestReset(): void {
    this.resetConfirmOpen.set(true);
  }

  cancelReset(): void {
    this.resetConfirmOpen.set(false);
  }

  confirmReset(): void {
    this.clearMessages();
    this.resetting.set(true);
    this.parameterService.resetNotificationTemplate(this.selectedKind(), this.selectedLang()).subscribe({
      next: res => {
        this.resetting.set(false);
        this.resetConfirmOpen.set(false);
        if (!res.success) {
          this.formError.set(res.message);
          return;
        }
        const t = this.template();
        if (t) {
          this.template.set({ ...t, isCustom: false, subject: t.defaultSubject, html: t.defaultHtml });
          this.setContent({ subject: t.defaultSubject, html: t.defaultHtml });
        }
        this.customKinds.update(set => {
          const next = new Set(set);
          next.delete(this.selectedKind());
          return next;
        });
        this.formSuccess.set(res.message);
      },
      error: err => {
        this.resetting.set(false);
        this.resetConfirmOpen.set(false);
        this.formError.set(this.errorMessage(err, 'parameter.templates.resetFailed'));
      }
    });
  }

  // ── Test mail ─────────────────────────────────────────────────────────────

  sendTest(): void {
    this.testError.set('');
    this.testSuccess.set('');

    if (this.testForm.invalid || this.form.invalid) {
      this.testForm.markAllAsTouched();
      this.form.markAllAsTouched();
      return;
    }

    this.testing.set(true);
    this.parameterService.sendNotificationTemplateTest(this.selectedKind(), this.selectedLang(), {
      ...this.form.getRawValue(),
      to: this.testForm.getRawValue().to.trim()
    }).subscribe({
      next: res => {
        // SMTP's own error comes in the message — the most useful diagnostic information.
        if (res.success) this.testSuccess.set(res.message);
        else this.testError.set(res.message);
        this.testing.set(false);
      },
      error: err => {
        this.testError.set(this.errorMessage(err, 'parameter.mail.testFailed'));
        this.testing.set(false);
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * The backend returns a failed result with 400 (ApiControllerBase.Respond); the message in the body
   * ("Tanınmayan yer tutucu: {{x}}" — Unknown placeholder) is far more useful than generic text —
   * if present it is shown, otherwise (network error, etc.) we fall back to the translation key.
   */
  private errorMessage(err: unknown, fallbackKey: string): string {
    const message = (err as HttpErrorResponse)?.error?.message;
    return typeof message === 'string' && message.trim()
      ? message
      : this.languageService.t(fallbackKey);
  }

  private clearMessages(): void {
    this.formError.set('');
    this.formSuccess.set('');
  }

  /**
   * The preview is shown inside `<iframe sandbox="">`: the sandbox runs no scripts,
   * submits no forms and gives the iframe a separate (opaque) origin — the content cannot access
   * the app's DOM, cookies or token. So Angular's HTML
   * sanitizer can be bypassed; otherwise the email template's inline styles would be
   * stripped and the preview would not resemble the real mail. This is the only iframe in the project.
   */
  private trustPreview(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
