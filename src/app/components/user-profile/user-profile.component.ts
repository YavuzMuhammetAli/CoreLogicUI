import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, OnInit, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { UserProfileService } from '../../services/user-profile.service';
import { LanguageService } from '../../services/language.service';
import { UserProfile } from '../../models/userProfile';
import { environment } from '../../../environments/environment';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { userInitials } from '../../utils/user-initials';
import { IconComponent } from '../shared/icon/icon.component';

/** Şifre tekrar eşleşme validasyonu */
function passwordsMatch(control: AbstractControl) {
  const group = control as import('@angular/forms').FormGroup;
  const pw  = group.get('newPassword')?.value;
  const pw2 = group.get('confirmPassword')?.value;
  return pw && pw2 && pw !== pw2 ? { mismatch: true } : null;
}

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, IconComponent],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserProfileComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('photoInput') photoInputRef!: ElementRef<HTMLInputElement>;

  private readonly fb            = inject(FormBuilder);
  private readonly profileSvc    = inject(UserProfileService);
  private readonly notif         = inject(NotificationService);
  private readonly platformId    = inject(PLATFORM_ID);
  private readonly languageService = inject(LanguageService);

  /* ── Profil verisi ── */
  profile        = signal<UserProfile | null>(null);
  loading        = signal(true);
  loadError      = signal('');

  /* ── Fotoğraf ── */
  photoPreview   = signal<string | null>(null);   // önizleme URL'si
  photoUploading = signal(false);

  /* ── Bilgiler formu ── */
  infoSaving     = signal(false);
  infoForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName:  ['', [Validators.required, Validators.maxLength(100)]],
    email:     ['', [Validators.required, Validators.email]],
    tc:        ['', [Validators.pattern(/^\d{11}$/)]],
    birthDay:  ['']
  });

  /* ── Şifre formu ── */
  pwSaving       = signal(false);
  pwSuccess      = signal(false);
  pwForm = this.fb.group({
    currentPassword:  ['', Validators.required],
    newPassword:      ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword:  ['', Validators.required]
  }, { validators: passwordsMatch });

  /* ── Getter kısa yollar ── */
  get fi() { return this.infoForm.controls; }
  get fp() { return this.pwForm.controls; }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadProfile();
  }

  /* ──────────────── Profil yükleme ──────────────── */

  loadProfile(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.profileSvc.getMe().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.profile.set(res.data);
          this.photoPreview.set(this.resolvePhotoUrl(res.data.photoUrl));
          this.patchInfoForm(res.data);
        } else {
          this.loadError.set(res.message || this.languageService.t('profile.loadFailed'));
        }
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.languageService.t('profile.loadFailedRetry'));
        this.loading.set(false);
      }
    });
  }

  private patchInfoForm(p: UserProfile): void {
    // BirthDay ISO string → date input değeri (YYYY-MM-DD)
    const bd = p.birthDay ? p.birthDay.substring(0, 10) : '';
    this.infoForm.patchValue({
      firstName: p.firstName,
      lastName:  p.lastName,
      email:     p.email,
      tc:        p.tc,
      birthDay:  bd
    });
  }

  /* ──────────────── Fotoğraf ──────────────── */

  triggerPhotoInput(): void {
    this.photoInputRef?.nativeElement.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    // Anlık önizleme
    const reader = new FileReader();
    reader.onload = e => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    // Yükle
    this.photoUploading.set(true);
    this.profileSvc.uploadPhoto(file).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.photoUploading.set(false);
        if (res.success && res.data) {
          const p = this.profile();
          if (p) {
            this.applyProfile({ ...p, photoUrl: res.data });
            this.photoPreview.set(this.resolvePhotoUrl(res.data));
          }
          this.notif.success(this.languageService.t('profile.photoUpdated'));
        } else {
          this.notif.warn(res.message || this.languageService.t('profile.photoUploadFailed'));
          // Önizlemeyi geri al
          const p = this.profile();
          this.photoPreview.set(this.resolvePhotoUrl(p?.photoUrl ?? null));
        }
        input.value = '';
      },
      error: () => {
        this.photoUploading.set(false);
        this.notif.warn(this.languageService.t('profile.photoUploadFailedRetry'));
        const p = this.profile();
        this.photoPreview.set(this.resolvePhotoUrl(p?.photoUrl ?? null));
        input.value = '';
      }
    });
  }

  removePhoto(): void {
    if (!this.profile()?.photoUrl) return;
    this.photoUploading.set(true);
    this.profileSvc.deletePhoto().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.photoUploading.set(false);
        if (res.success) {
          const p = this.profile();
          if (p) this.applyProfile({ ...p, photoUrl: null });
          this.photoPreview.set(null);
          this.notif.success(this.languageService.t('profile.photoDeleted'));
        } else {
          this.notif.warn(res.message || this.languageService.t('profile.photoDeleteFailed'));
        }
      },
      error: () => {
        this.photoUploading.set(false);
        this.notif.warn(this.languageService.t('profile.photoDeleteFailedRetry'));
      }
    });
  }

  /* ──────────────── Bilgiler formu ──────────────── */

  saveInfo(): void {
    if (this.infoForm.invalid || this.infoSaving()) return;

    this.infoSaving.set(true);
    const { firstName, lastName, email, tc, birthDay } = this.infoForm.value;

    this.profileSvc.updateProfile({
      firstName: firstName ?? '',
      lastName:  lastName  ?? '',
      email:     email     ?? '',
      tc:        tc        ?? '',
      birthDay:  birthDay  ? new Date(birthDay).toISOString() : ''
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.infoSaving.set(false);
        if (res.success) {
          // Profil verisini güncelle
          const p = this.profile();
          if (p) {
            this.applyProfile({
              ...p,
              firstName: firstName ?? '',
              lastName:  lastName  ?? '',
              email:     email     ?? '',
              tc:        tc        ?? '',
              birthDay:  birthDay ? new Date(birthDay).toISOString() : p.birthDay
            });
          }
          this.notif.success(this.languageService.t('profile.infoSaved'));
        } else {
          this.notif.warn(res.message || this.languageService.t('profile.updateFailed'));
        }
      },
      error: () => {
        this.infoSaving.set(false);
        this.notif.warn(this.languageService.t('profile.genericErrorRetry'));
      }
    });
  }

  /* ──────────────── Şifre formu ──────────────── */

  changePassword(): void {
    if (this.pwForm.invalid || this.pwSaving()) return;

    this.pwSaving.set(true);
    this.pwSuccess.set(false);

    const { currentPassword, newPassword } = this.pwForm.value;
    this.profileSvc.changePassword({
      currentPassword: currentPassword ?? '',
      newPassword:     newPassword     ?? ''
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.pwSaving.set(false);
        if (res.success) {
          this.pwSuccess.set(true);
          this.pwForm.reset();
          this.notif.success(this.languageService.t('profile.passwordChanged'));
        } else {
          this.notif.warn(res.message || this.languageService.t('profile.passwordChangeFailed'));
        }
      },
      error: () => {
        this.pwSaving.set(false);
        this.notif.warn(this.languageService.t('profile.passwordChangeFailedRetry'));
      }
    });
  }

  /* ──────────────── Yardımcı ──────────────── */

  /** Göreli PhotoUrl'yi tam URL'ye çevirir. */
  resolvePhotoUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${environment.apiBaseUrl}${url}`;
  }

  /** Profildeki ad ve soyadın baş harfleri (topbar ile aynı kural) */
  get initials(): string {
    const p = this.profile();
    return p ? userInitials(p.firstName, p.lastName, p.email) : '?';
  }

  /**
   * Kaydedilen değişikliği hem bu ekrana hem paylaşılan profile yazar —
   * topbar avatarı (fotoğraf / baş harfler / ad) sayfa yenilenmeden güncellenir.
   */
  private applyProfile(p: UserProfile): void {
    this.profile.set(p);
    this.profileSvc.setCurrent(p);
  }

  /** Tarih string'ini okunabilir biçime çevirir */
  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
    } catch {
      return iso;
    }
  }
}
