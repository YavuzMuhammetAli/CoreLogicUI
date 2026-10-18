import { Injectable, computed, signal } from '@angular/core';
import { WorkflowGraph } from '../../../models/workflow.model';
import { Camera } from '../../shared/workflow-canvas/workflow-canvas.camera';
import { WorkflowDesignDoc, emptyDoc, serializeDoc } from './workflow-design.doc';
import { DesignSelection, EMPTY_SELECTION, pruneSelection } from './workflow-selection';
import {
  DesignHistory,
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  undo
} from './workflow-design.history';

/**
 * Akış tasarım ekranının durumu — tasarım belgesi, geri al/yinele geçmişi,
 * kaydedilmemiş değişiklik bayrağı ve seçim.
 *
 * Bileşen kapsamlıdır (`providers: [WorkflowDesignerStore]`): her tasarım
 * ekranı kendi örneğini alır, ekrandan çıkınca durum da gider.
 *
 * Belgeyi değiştirmenin TEK yolu `dispatch`'tir; kurallar saf komutlarda
 * (workflow-design.commands.ts), store yalnız kayıt tutar.
 */
@Injectable()
export class WorkflowDesignerStore {
  private readonly history = signal<DesignHistory<WorkflowDesignDoc>>(createHistory(emptyDoc()));

  /** Son kaydedilen (ya da yüklenen) belgenin serileştirilmiş hali. */
  private readonly savedSnapshot = signal(serializeDoc(emptyDoc()));

  readonly doc = computed(() => this.history().present);
  readonly graph = computed<WorkflowGraph>(() => this.doc().graph);

  readonly canUndo = computed(() => canUndo(this.history()));
  readonly canRedo = computed(() => canRedo(this.history()));

  /**
   * Kaydedilmemiş değişiklik var mı. Referans değil içerik karşılaştırılır:
   * geri alıp kayıtlı hale dönen ya da bir değeri eski haline yazan kullanıcı
   * "kaydedilmemiş" uyarısı görmemeli.
   */
  readonly dirty = computed(() => serializeDoc(this.doc()) !== this.savedSnapshot());

  /** Yayınlanmış/arşiv sürüm salt-okunur açılır. */
  readonly readonly = signal(false);

  /** Seçim — canvas ve adım listesi aynı seçimi gösterir. */
  readonly selection = signal<DesignSelection>(EMPTY_SELECTION);

  /**
   * Tuvalin kamerası. Tuval sekme değişiminde DOM'dan kalkar (gizli sekmede
   * sıfır boyutlu olur, sığdırma bozulur); dönüşte kaldığı yerden açılsın diye
   * kamera burada saklanır. null → tuval ilk açılışta şemayı sığdırır.
   */
  readonly camera = signal<Camera | null>(null);

  /** Belgeyi yükler; geçmiş, seçim ve "kaydedilmemiş" bayrağı sıfırlanır. */
  load(doc: WorkflowDesignDoc): void {
    this.history.set(createHistory(doc));
    this.savedSnapshot.set(serializeDoc(doc));
    this.selection.set(EMPTY_SELECTION);
  }

  /**
   * Komutu uygular ve geçmişe kaydeder. Aynı `reason` ile kısa aralıkla gelen
   * değişiklikler tek geri al adımında birleşir (yazarken her harf ayrı adım
   * olmasın). Komut belgeyi değiştirmediyse hiçbir şey kaydedilmez.
   */
  dispatch(reason: string, command: (doc: WorkflowDesignDoc) => WorkflowDesignDoc, now = Date.now()): void {
    if (this.readonly()) return;
    const current = this.history();
    this.history.set(record(current, command(current.present), reason, now));
    this.pruneSelection();
  }

  undo(): void {
    if (this.readonly()) return;
    this.history.update(undo);
    this.pruneSelection();
  }

  redo(): void {
    if (this.readonly()) return;
    this.history.update(redo);
    this.pruneSelection();
  }

  /** Belgede artık olmayan adımlar seçimden düşer (silme, geri alma). */
  private pruneSelection(): void {
    this.selection.update(selection => pruneSelection(selection, this.doc()));
  }

  /**
   * Başarılı kayıttan sonra: GÖNDERİLEN belge "kaydedilmiş" sayılır. İstek
   * sürerken yapılan düzenlemeler kaydedilmiş görünmesin diye anlık görüntü
   * gönderim anında alınıp buraya verilir.
   */
  markSaved(doc: WorkflowDesignDoc = this.doc()): void {
    this.savedSnapshot.set(serializeDoc(doc));
  }
}
