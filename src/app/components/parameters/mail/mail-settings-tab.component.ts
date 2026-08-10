import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { MASKED_PASSWORD, MailSetting } from '../../../models/parameter.model';

/**
 * E-posta sekmesi — sistemin mail gönderirken kullanacağı adres ve SMTP ayarları.
 *
 * Parola özel muamele görür: backend kayıtlı parolayı asla düz metin döndürmez,
 * yerine maske gönderir. Form bu maskeyi olduğu gibi taşır; kullanıcı dokunmazsa
 * maske geri gider ve backend mevcut parolayı korur.
 */
@Component({
  selector: 'app-mail-settings-tab',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
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

  /** Etkin olup olmadığı — zorunlu alan kurallarını buna göre uygularız. */
  readonly enabled = signal(false);

  readonly form: FormGroup = this.fb.group({
    enabled: [false],
    host: [''],
    port: [587, [Validators.min(1), Validators.max(65535)]],
    user: [''],
    password: [''],
    from: ['', Validators.email],
    fromName: [''],
    useSsl: [false]
  });

  readonly testForm: FormGroup = this.fb.group({
    to: ['', [Validators.required, Validators.email]]
  });

  get f() { return this.form.controls; }
  get tf() { return this.testForm.controls; }

  /** Kapalıyken sunucu/gönderen boş bırakılabilir; yalnız açıkken zorunlu. */
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
            // Maske olduğu gibi tutulur; değişmeden geri giderse parola korunur.
            password: setting.password ?? '',
            from: setting.from ?? '',
            fromName: setting.fromName ?? '',
            useSsl: setting.useSsl
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

  /** Kullanıcı parola alanına ilk dokunduğunda maskeyi temizle. */
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
      // Kullanıcı alanı boşalttıysa parolayı gerçekten sil; maske geldiyse koru.
      password: value.password === '' ? null : value.password,
      from: String(value.from ?? '').trim(),
      fromName: String(value.fromName ?? '').trim() || null,
      useSsl: !!value.useSsl
    };

    this.saving.set(true);
    this.parameterService.saveMailSetting(body).subscribe({
      next: res => {
        if (res.success) {
          this.formSuccess.set(res.message);
          // Parola kaydedildiyse formu tekrar maskeye çevir — düz metin ekranda kalmasın.
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
        // SMTP hatasının kendisi mesajda gelir (yanlış port, kimlik reddi vb.) —
        // teşhis için en yararlı bilgi odur, genel mesajla değiştirilmez.
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
