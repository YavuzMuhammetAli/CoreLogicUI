import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { DesignHistory, canRedo, canUndo, createHistory, record, redo, undo } from '../../../utils/design-history';

/**
 * Ekran tasarımcısının belge deposu — bir görünüm (form ya da liste) için.
 *
 * İş akışı tasarımcısının deposuyla aynı ilke: belge DEĞİŞMEZ, tek değiştirme yolu
 * `dispatch(sebep, komut)`; geri al / yinele `utils/design-history` ile, aynı sebeple
 * 600 ms içinde gelen değişiklikler tek adımda birleşir (inceleyicide yazılan her harf ayrı
 * adım olmaz). "Kaydedilmemiş değişiklik" içerik karşılaştırmasıyla bulunur: geri alıp
 * kaydedilmiş hâle dönmek kirliliği siler.
 *
 * Bileşene bağlı değil, düz bir sınıf: tasarımcı iki örnek tutar (form + liste), her biri
 * kendi kirliliği ve iyimser kilit damgasıyla.
 */
export class LayoutDesignerStore<T> {
  // Başlatma yapıcıda: alan başlatıcıları parametre özelliklerinden önce çalışabilir.
  private readonly history: WritableSignal<DesignHistory<T>>;
  private readonly savedSnapshot: WritableSignal<string>;

  readonly doc: Signal<T>;
  readonly canUndo: Signal<boolean>;
  readonly canRedo: Signal<boolean>;
  readonly dirty: Signal<boolean>;

  /** Seçili öğe/bölüm/sekme kimliği (form) ya da kolon adı (liste). */
  readonly selection = signal<string | null>(null);

  /** Sunucudaki satırın iyimser kilit damgası; satır yoksa null. */
  readonly lastModifiedOn = signal<string | null>(null);

  private readonly serialize: (doc: T) => string;

  constructor(initial: T, serialize: (doc: T) => string) {
    this.serialize = serialize;
    this.history = signal(createHistory(initial));
    this.savedSnapshot = signal(serialize(initial));
    this.doc = computed(() => this.history().present);
    this.canUndo = computed(() => canUndo(this.history()));
    this.canRedo = computed(() => canRedo(this.history()));
    this.dirty = computed(() => this.serialize(this.doc()) !== this.savedSnapshot());
  }

  /** Belgeyi yükler: geçmiş sıfırlanır, belge "kaydedilmiş" sayılır. */
  load(doc: T, lastModifiedOn: string | null): void {
    this.history.set(createHistory(doc));
    this.savedSnapshot.set(this.serialize(doc));
    this.lastModifiedOn.set(lastModifiedOn);
    this.selection.set(null);
  }

  dispatch(reason: string, command: (doc: T) => T, now = Date.now()): void {
    const current = this.history();
    const next = command(current.present);
    this.history.set(record(current, next, reason, now));
  }

  undo(): void {
    this.history.set(undo(this.history()));
  }

  redo(): void {
    this.history.set(redo(this.history()));
  }

  /**
   * Kayıt başarılı. İstek gönderilirken kullanılan belge verilir: istek sürerken yapılan
   * düzenleme kaydedilmiş sayılmasın.
   */
  markSaved(sent: T, lastModifiedOn: string | null): void {
    this.savedSnapshot.set(this.serialize(sent));
    this.lastModifiedOn.set(lastModifiedOn);
  }

  /**
   * Belgeye dokunmayan bir yazım (ad/rol/öncelik) satırın damgasını yeniledi — kirlilik
   * korunur, sonraki kayıt yeni damgayla gider (yoksa kendi değişikliğimiz çakışma sayılırdı).
   */
  restamp(lastModifiedOn: string | null): void {
    this.lastModifiedOn.set(lastModifiedOn);
  }
}
