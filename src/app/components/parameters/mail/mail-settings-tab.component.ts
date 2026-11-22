import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal
} from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MASKED_PASSWORD, MailSetting, NotificationLanguage } from '../../../models/parameter.model';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Absolute http(s) address only — the backend applies the same rule. These addresses
 * are printed into the email as links/images; a relative path does not work in a mail client.
 */
const HTTP_URL = /^https?:\/\/\S+$/i;

/**
 * Email tab — the address and SMTP settings the system uses when sending mail.
 *
 * The password gets special treatment: the backend never returns the saved password as plain text,
 * it sends a mask instead. The form carries this mask as is; if the user does not touch it
 * the mask goes back and the backend keeps the existing password.
 */
@Component({
    selector: 'app-mail-settings-tab',
    imports: [ReactiveFormsModule, TranslatePipe, IconComponent],
    templateUrl: './mail-settings-tab.component.html',
    styleUrls: ['../parameters.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MailSettingsTabComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly parameterService = inject(ParameterService);
  private readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly loadError = signal('');
  readonly formError = signal('');
  readonly formSuccess = signal('');
  readonly testError = signal('');
  readonly testSuccess = signal('');

  /** Whether it is enabled — the required-field rules are applied accordingly. */
  readonly enabled = signal(false);

  readonly form: FormGroup = this.fb.group({
    enabled: [false],
    host: [''],
    port: [587, [Validators.min(1), Validators.max(65535)]],
    user: [''],
    password: [''],
    from: ['', Validators.email],
    fromName: [''],
    useSsl: [false],
    // Notification email — link root, logo and default language
    appUrl: ['', Validators.pattern(HTTP_URL)],
    logoUrl: ['', Validators.pattern(HTTP_URL)],
    defaultLanguage: ['tr' as NotificationLanguage]
  });

  readonly testForm: FormGroup = this.fb.group({
    to: ['', [Validators.required, Validators.email]]
  });

  get f() { return this.form.controls; }
  get tf() { return this.testForm.controls; }

  /** When disabled, server/sender may be left empty; required only when enabled. */
  readonly hostMissing = computed(() =>
    this.enabled() && !String(this.form.value.host ?? '').trim());

  readonly fromMissing = computed(() =>
    this.enabled() && !String(this.form.value.from ?? '').trim());

  ngOnInit(): void {
    this.form.get('enabled')!.valueChanges.subscribe(value => this.enabled.set(!!value));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.parameterService.getMailSetting().subscribe({
      next: res => {
        if (!res.success) {
          this.loadError.set(res.message);
        } else {
          const setting = res.data;
          this.form.patchValue({
            enabled: setting.enabled,
            host: setting.host ?? '',
            port: setting.port ?? 587,
            user: setting.user ?? '',
            // The mask is kept as is; if it goes back unchanged the password is preserved.
            password: setting.password ?? '',
            from: setting.from ?? '',
            fromName: setting.fromName ?? '',
            useSsl: setting.useSsl,
            appUrl: setting.appUrl ?? '',
            logoUrl: setting.logoUrl ?? '',
            defaultLanguage: setting.defaultLanguage ?? 'tr'
          });
          this.enabled.set(setting.enabled);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.languageService.t('parameter.mail.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  /** Clear the mask the first time the user touches the password field. */
  onPasswordFocus(): void {
    if (this.form.value.password === MASKED_PASSWORD) {
      this.form.patchValue({ password: '' });
    }
  }

  save(): void {
    this.formError.set('');
    this.formSuccess.set('');

    if (this.hostMissing()) {
      this.formError.set(this.languageService.t('parameter.mail.hostRequired'));
      return;
    }
    if (this.fromMissing()) {
      this.formError.set(this.languageService.t('parameter.mail.fromRequired'));
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value;
    const body: MailSetting = {
      enabled: !!value.enabled,
      host: String(value.host ?? '').trim(),
      port: Number(value.port) || 587,
      user: String(value.user ?? '').trim() || null,
      // If the user emptied the field, really delete the password; if the mask came back, keep it.
      password: value.password === '' ? null : value.password,
      from: String(value.from ?? '').trim(),
      fromName: String(value.fromName ?? '').trim() || null,
      useSsl: !!value.useSsl,
      appUrl: String(value.appUrl ?? '').trim() || null,
      logoUrl: String(value.logoUrl ?? '').trim() || null,
      defaultLanguage: value.defaultLanguage === 'en' ? 'en' : 'tr'
    };

    this.saving.set(true);
    this.parameterService.saveMailSetting(body).subscribe({
      next: res => {
        if (res.success) {
          this.formSuccess.set(res.message);
          // If the password was saved, turn the form back into the mask — plain text must not stay on screen.
          if (body.password) this.form.patchValue({ password: MASKED_PASSWORD });
        } else {
          this.formError.set(res.message);
        }
        this.saving.set(false);
      },
      error: () => {
        this.formError.set(this.languageService.t('parameter.mail.saveFailed'));
        this.saving.set(false);
      }
    });
  }

  sendTest(): void {
    this.testError.set('');
    this.testSuccess.set('');

    if (this.testForm.invalid) {
      this.testForm.markAllAsTouched();
      return;
    }

    this.testing.set(true);
    this.parameterService.sendTestMail(String(this.testForm.value.to).trim()).subscribe({
      next: res => {
        // The SMTP error itself comes in the message (wrong port, auth rejected, etc.) —
        // that is the most useful diagnostic information, it is not replaced with a generic message.
        if (res.success) this.testSuccess.set(res.message);
        else this.testError.set(res.message);
        this.testing.set(false);
      },
      error: () => {
        this.testError.set(this.languageService.t('parameter.mail.testFailed'));
        this.testing.set(false);
      }
    });
  }
}
