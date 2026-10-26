import { DestroyRef, Signal, effect, inject } from '@angular/core';

/**
 * Açılır bir öğenin "dışarıya dokunuldu" dinleyicisi — yalnız öğe AÇIKKEN bağlıdır.
 *
 * `@HostListener('document:pointerdown')` her örnek için sayfadaki HER dokunuşta çalışır ve
 * (OnPush'ta bile) bileşeni ve tüm atalarını kirli işaretler. Kayıt formunda her lookup alanı
 * bir seçici taşıdığından tek tıklama, kapalı onlarca seçicinin işleyicisini koşturup formun
 * tamamını yeniden kontrol ettiriyordu. Burada dinleyici açılınca eklenir, kapanınca (ve bileşen
 * yok edilince) kaldırılır.
 *
 * Injection context içinde çağrılır (alan ilklendiricisi ya da constructor).
 * pointerdown: iOS Safari boş alana dokunmada click üretmeyebilir, liste açık kalırdı.
 */
export function closeOnOutsidePointer(
  isOpen: Signal<boolean>,
  host: () => Element | null | undefined,
  onOutside: () => void
): void {
  const handler = (event: PointerEvent): void => {
    const el = host();
    if (el && !el.contains(event.target as Node)) onOutside();
  };
  let bound = false;
  const unbind = (): void => {
    if (!bound) return;
    document.removeEventListener('pointerdown', handler);
    bound = false;
  };

  effect(() => {
    if (isOpen()) {
      if (!bound) {
        document.addEventListener('pointerdown', handler);
        bound = true;
      }
    } else {
      unbind();
    }
  });
  inject(DestroyRef).onDestroy(unbind);
}
