import { ChangeDetectorRef } from '@angular/core';
import { MonoTypeOperatorFunction, tap } from 'rxjs';

/**
 * OnPush component'lerde asenkron veri geldiğinde görünümü "kirli" işaretler.
 *
 * NEDEN GEREKLİ: OnPush stratejisinde bir component yalnızca (a) @Input referansı
 * değiştiğinde, (b) şablonuna bağlı bir olay tetiklendiğinde, (c) okuduğu bir signal
 * değiştiğinde ya da (d) markForCheck() çağrıldığında kontrol edilir. HTTP yanıtının
 * callback'inde `this.rows = ...` demek bunların HİÇBİRİ değildir — veri gelir ama
 * ekran güncellenmez.
 *
 * Signal tabanlı component'lerde gerekmez (signal okuması zaten (c) şıkkıdır); bu
 * operatör, alan tabanlı mevcut component'leri 550 atamayı tek tek signal'e çevirmeden
 * OnPush'a taşımak için kullanılır.
 *
 * Kullanım:
 *   this.service.getAll().pipe(markDirty(this.cdr)).subscribe({ next: res => ... });
 *
 * tap, abonenin next handler'ından ÖNCE çalışır; markForCheck yalnızca bir bayrak
 * kaldırdığı ve gerçek kontrol o an ki görev bittikten sonra yapıldığı için atama
 * sırası sorun oluşturmaz.
 */
export function markDirty<T>(cdr: ChangeDetectorRef): MonoTypeOperatorFunction<T> {
  return tap<T>({
    next: () => cdr.markForCheck(),
    error: () => cdr.markForCheck(),
    complete: () => cdr.markForCheck()
  });
}
