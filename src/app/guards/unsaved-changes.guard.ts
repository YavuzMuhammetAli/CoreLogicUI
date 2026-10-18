import { CanDeactivateFn } from '@angular/router';

/**
 * Kaydedilmemiş değişikliği olan ekranların sözleşmesi. Ekran soruyu KENDİSİ
 * sorar (kendi `app-confirm-dialog`'u ile) ve cevabı döner: guard bir
 * component render edemez, native `confirm()` ise projede yasak.
 */
export interface HasUnsavedChanges {
  /** true → ayrılmak serbest; false → ekranda kal. Soru açıksa cevap gelene kadar bekler. */
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Ekrandan ayrılmadan önce kaydedilmemiş değişikliği sorar. Sekme kapatma ve
 * sayfa yenileme bu guard'a uğramaz; onları ekranın `beforeunload` dinleyicisi
 * yakalar.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = component =>
  typeof component?.canLeave === 'function' ? component.canLeave() : true;
