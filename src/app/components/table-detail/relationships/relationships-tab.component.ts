import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter,
  Input, OnChanges, Output, SimpleChanges, ViewChild, inject
} from '@angular/core';
import { from, concatMap } from 'rxjs';
import { RelationshipService } from '../../../services/relationship.service';
import { PublishedTableService } from '../../../services/published-table.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { RelationshipDialogComponent } from './relationship-dialog.component';
import { PublishPreviewDialogComponent } from './publish-preview-dialog.component';
import {
  RelationshipDefinition,
  RelationshipType,
  RelationshipUpsert,
  RelationshipValidationResult,
  RELATIONSHIP_TYPE_OPTIONS
} from '../../../models/relationship.model';
import { markDirty } from '../../../utils/change-detection';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * "İlişkiler" sekmesi — model ilişkilerinin (G1) tüm yaşam döngüsü.
 *
 * table-detail'den ayrıldı: ana ekran artık ilişki modelini hiç bilmez, yalnızca
 * kaydetme akışında <c>flush()</c> çağırır. Sekme, listeyi, canlı graph
 * doğrulamasını, silme onayını ve YENİ MODEL modundaki staging'i kendisi yönetir.
 *
 * Staging neden burada: model ilk kez kaydedilene kadar tablo ID'si yoktur ve
 * ilişkiler sunucuya gönderilemez. Bekleyen kayıtlar bellekte tutulup ilk
 * kayıttan sonra sırayla POST edilir.
 */
@Component({
    selector: 'app-relationships-tab',
    imports: [
        TranslatePipe, ConfirmDialogComponent,
        RelationshipDialogComponent, PublishPreviewDialogComponent, IconComponent
    ],
    templateUrl: './relationships-tab.component.html',
    styleUrls: ['./relationships.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipsTabComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly relationshipService = inject(RelationshipService);
  private readonly publishedTableService = inject(PublishedTableService);
  private readonly languageService = inject(LanguageService);

  /**
   * Kaynak modelin PublishedTable.ID değeri; ilişki uçlarının route parametresi.
   * Yeni model modunda ilk kayıt tamamlanana kadar null'dır.
   */
  @Input() tableId: number | null = null;

  /** Bu ekranda düzenlenen modelin adı (SelfReference hedefi + staged satırlar). */
  @Input() modelName = '';

  /** Yeni model oluşturma modu mu. */
  @Input() isNew = false;

  /** Autocomplete kaynağı — yalnızca yayınlanmış modeller. */
  @Input() publishedModelNames: string[] = [];

  /**
   * Sekme görünür mü. Component sekme kapalıyken de CANLI tutulur: ilişki sayısı
   * ve doğrulama durumu sekme çubuğundaki rozette gösterilir, dolayısıyla veri
   * sekme ilk kez açılmadan da yüklenmiş olmalıdır.
   */
  @Input() active = false;

  /**
   * Sunucuda kalıcılaşan bir ilişki değişikliği oldu. Ana ekran bunu
   * "model yayınlanabilir" işaretlemek için kullanır.
   */
  @Output() persisted = new EventEmitter<void>();

  /** Sekme çubuğundaki rozet için: ilişki sayısı + graph geçerli mi. */
  @Output() statusChanged = new EventEmitter<{ count: number; isValid: boolean }>();

  /** İlişki kılavuzunu ana ekran açar (kılavuz sütunlarla paylaşılır). */
  @Output() helpRequested = new EventEmitter<void>();
  @Output() typeHelpRequested = new EventEmitter<RelationshipType>();

  @ViewChild(RelationshipDialogComponent) private dialog?: RelationshipDialogComponent;
  @ViewChild(PublishPreviewDialogComponent) private previewDialog?: PublishPreviewDialogComponent;

  /** Sunucudaki (düzenleme modu) veya bellekte bekleyen (yeni model) ilişkiler. */
  relationships: RelationshipDefinition[] = [];

  /** Canlı doğrulama sonucu — kullanıcı kaydetmeden önce döngü/derinlik uyarısı görür. */
  validation: RelationshipValidationResult | null = null;

  errorMessage: string | null = null;
  isSaving = false;
  isDeleting = false;

  /** Onay bekleyen silme hedefi; null ise onay diyaloğu kapalıdır. */
  toRemove: RelationshipDefinition | null = null;

  relationshipTypeOptions = RELATIONSHIP_TYPE_OPTIONS;

  /**
   * Geçici kimlik → bekleyen ilişki. Dizi + paralel index yerine Map kullanılır:
   * `relationships` ile bu koleksiyon arasındaki index eşleşmesine dayanmak,
   * araya kaydedilmiş bir ilişki girdiğinde sessizce yanlış kaydı günceller.
   *
   * Ekleme sırası korunur (Map insertion order) — flush sırası publish için önemlidir.
   */
  private pending = new Map<string, RelationshipUpsert>();

  /**
   * Bekleyen ilişkilere geçici kimlik üreten MONOTON sayaç.
   *
   * Map boyutu kullanılamaz: bir ilişki silinip yenisi eklendiğinde aynı kimlik
   * ikinci kez üretilir; mevcut giriş üzerine yazılır ve @for ... track duplicate
   * anahtarla bozulur.
   */
  private pendingIdSeq = 0;

  ngOnChanges(changes: SimpleChanges): void {
    // Tablo ID'si ilk kez çözüldüğünde (veya değiştiğinde) ilişkiler yüklenir.
    if (changes['tableId'] && this.tableId !== null) {
      this.load();
    }
  }

  /** İlişki eklemek için modelin kaydedilmiş (tablo ID'si oluşmuş) olması gerekir. */
  get canManage(): boolean {
    return this.tableId !== null || this.isNew;
  }

  // ─── Liste + doğrulama ──────────────────────────────────────────────────────

  private load(): void {
    if (this.tableId === null) return;

    this.relationshipService.list(this.tableId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.relationships = res.success ? (res.data ?? []) : [];
        this.emitStatus();
        this.runValidation();
      },
      error: () => { this.relationships = []; this.emitStatus(); }
    });
  }

  /** Sekme rozetini besleyen durum — liste veya doğrulama her değiştiğinde. */
  private emitStatus(): void {
    this.statusChanged.emit({
      count: this.relationships.length,
      isValid: this.validation?.isValid ?? true
    });
  }

  /** Graph doğrulamasını çalıştırır — kullanıcı yayınlamadan önce hatayı görür. */
  private runValidation(): void {
    if (this.tableId === null) {
      this.validation = null;
      return;
    }

    this.relationshipService.validateGraph(this.tableId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.validation = res.data ?? null;
        this.emitStatus();
      },
      error: (err: { error?: { data?: RelationshipValidationResult } }) => {
        // Doğrulama hatası 400 ile de dönebilir; gövdedeki sonuç yine kullanılır.
        this.validation = err?.error?.data ?? null;
        this.emitStatus();
      }
    });
  }

  // ─── Popup akışı ────────────────────────────────────────────────────────────

  openAdd(): void {
    this.errorMessage = null;
    this.dialog?.openForCreate(this.relationships.length + 1);
  }

  openEdit(relationship: RelationshipDefinition): void {
    this.errorMessage = null;
    this.dialog?.openForEdit(relationship);
  }

  onDialogSave(body: RelationshipUpsert): void {
    // Model henüz kaydedilmediyse ilişki bellekte bekletilir; ilk kayıttan
    // sonra tablo ID'si oluşunca toplu gönderilir.
    if (this.tableId === null) {
      this.stagePending(body);
      return;
    }

    const editingId = this.dialog?.editingRelationshipId ?? null;

    this.isSaving = true;
    this.errorMessage = null;

    const request$ = editingId
      ? this.relationshipService.update(this.tableId, editingId, body)
      : this.relationshipService.add(this.tableId, body);

    request$.pipe(markDirty(this.cdr)).subscribe({
      next: () => {
        this.isSaving = false;
        this.dialog?.close();
        this.load();
        this.persisted.emit();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isSaving = false;
        this.errorMessage =
          err?.error?.message ?? err?.message ?? this.languageService.t('common.error');
      }
    });
  }

  /** Yeni model modunda ilişkiyi bellekte tutar ve listede gösterir. */
  private stagePending(body: RelationshipUpsert): void {
    const editingId = this.dialog?.editingRelationshipId ?? null;

    if (editingId) {
      this.pending.set(editingId, body);
      this.relationships = this.relationships.map(r =>
        r.relationshipId === editingId ? this.toStagedDefinition(body, editingId) : r);
    } else {
      const stagedId = `pending-${++this.pendingIdSeq}`;
      this.pending.set(stagedId, body);
      this.relationships = [...this.relationships, this.toStagedDefinition(body, stagedId)];
    }

    this.emitStatus();

    this.dialog?.close();
  }

  /** Bellekte bekleyen ilişkiyi listede göstermek için görüntüleme nesnesine çevirir. */
  private toStagedDefinition(body: RelationshipUpsert, stagedId: string): RelationshipDefinition {
    const now = new Date().toISOString();
    return {
      relationshipId:   stagedId,
      sourceModel:      this.modelName,
      targetModel:      body.targetModel,
      relationshipType: body.relationshipType,
      propertyName:     body.propertyName,
      inverseProperty:  body.inverseProperty ?? null,
      foreignKeyName:   body.foreignKeyName ?? null,
      joinTableName:    body.joinTableName ?? null,
      cascadeDelete:    body.cascadeDelete,
      required:         body.required,
      depth:            0,
      order:            body.order,
      displayName:      body.displayName ?? null,
      createdAt:        now,
      updatedAt:        now
    };
  }

  // ─── Silme ──────────────────────────────────────────────────────────────────

  /**
   * Silme onayını açar. Silme geri alınamaz (kalıcılaşmış ilişkinin SQL FK'sı bir
   * sonraki yayınlamada düşer), bu yüzden doğrudan DELETE atılmaz.
   */
  askRemove(relationship: RelationshipDefinition): void {
    this.toRemove = relationship;
  }

  cancelRemove(): void {
    this.toRemove = null;
  }

  confirmRemove(): void {
    const relationship = this.toRemove;
    if (!relationship) return;

    // Bellekte bekleyen (henüz kaydedilmemiş) ilişki
    if (this.tableId === null) {
      this.pending.delete(relationship.relationshipId);
      this.relationships = this.relationships
        .filter(r => r.relationshipId !== relationship.relationshipId);
      this.toRemove = null;
      this.emitStatus();
      return;
    }

    this.isDeleting = true;

    this.relationshipService.delete(this.tableId, relationship.relationshipId)
      .pipe(markDirty(this.cdr)).subscribe({
        next: () => {
          this.isDeleting = false;
          this.toRemove = null;
          this.load();
          this.persisted.emit();
        },
        error: (err: { error?: { message?: string } }) => {
          this.isDeleting = false;
          this.toRemove = null;
          this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
        }
      });
  }

  // ─── Önizleme ───────────────────────────────────────────────────────────────

  openPreview(): void {
    this.previewDialog?.show();
  }

  // ─── Kaydetme akışıyla dikiş ────────────────────────────────────────────────

  /**
   * Model ilk kez kaydedildikten sonra bekleyen ilişkileri sunucuya gönderir.
   * Ana ekran onSave() tamamlandığında çağırır.
   *
   * Dönüş yok: hata durumunda kullanıcıya bu sekmede mesaj gösterilir; ana
   * ekranın kaydetme sonucu ilişkilerden bağımsızdır (model kaydedilmiştir).
   */
  flush(rootName: string): void {
    if (this.pending.size === 0) return;

    this.publishedTableService.getAllTables().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const match = (res.data ?? []).find(
          t => t.tableName.toLowerCase() === rootName.toLowerCase());

        // Model kaydedildi ama tablosu listede bulunamadı — bekleyen ilişkiler
        // gönderilemez. Sessizce dönmek yerine kullanıcıyı bilgilendir; aksi halde
        // ilişkiler kaybolmuş gibi görünür ve neden olduğu anlaşılmaz.
        if (!match) {
          this.errorMessage = this.languageService.t('relationship.flushTableNotFound');
          return;
        }

        this.tableId = match.id;
        const pending = [...this.pending.values()];
        this.pending.clear();

        from(pending).pipe(
          concatMap(body => this.relationshipService.add(match.id, body))
        ).pipe(markDirty(this.cdr)).subscribe({
          complete: () => this.load(),
          error: (err: { error?: { message?: string } }) => {
            this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
            this.load();
          }
        });
      },
      // Tablo listesi alınamazsa kullanıcı hiçbir geri bildirim almamalı değil.
      error: (err: { error?: { message?: string } }) => {
        this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
      }
    });
  }

  // ─── Ana ekranla dikiş: sıfırlama ve ESC ────────────────────────────────────

  /**
   * Sekmeyi boş duruma döndürür. Ana ekran, aynı route üzerinde başka bir modele
   * geçildiğinde (alt model satırına tıklama) çağırır: component yeniden
   * oluşturulmadığı için önceki modelin ilişkileri aksi halde ekranda kalır.
   *
   * `tableId` ayrıca ana ekrandan input olarak null'lanır; yeni ID çözüldüğünde
   * ngOnChanges listeyi kendi yükler.
   */
  reset(): void {
    this.relationships = [];
    this.validation    = null;
    this.errorMessage  = null;
    this.toRemove      = null;
    this.isSaving      = false;
    this.isDeleting    = false;
    this.pending.clear();
    this.pendingIdSeq  = 0;
    this.emitStatus();
  }

  /**
   * ESC — ana ekranın HostListener'ından çağrılır. Bu sekmenin açık en üstteki
   * diyaloğunu kapatır ve true döner; kapatacak bir şey yoksa false döner, ana
   * ekran kendi popup'larıyla devam eder.
   *
   * Silme onayı burada yoktur: ConfirmDialogComponent kendi ESC işleyicisine sahiptir.
   */
  handleEscape(): boolean {
    if (this.previewDialog?.open) {
      this.previewDialog.close();
      return true;
    }
    if (this.dialog?.open) {
      this.dialog.close();
      return true;
    }
    return false;
  }

  // ─── Görüntüleme yardımcıları ───────────────────────────────────────────────

  /** İlişki tipinin çeviri anahtarını döner. */
  relationshipTypeLabel(type: RelationshipType): string {
    return this.relationshipTypeOptions.find(o => o.value === type)?.labelKey ?? '';
  }

  hasErrorFor(relationshipId: string): boolean {
    return !!this.validation?.errors.some(i => i.relationshipId === relationshipId);
  }
}
