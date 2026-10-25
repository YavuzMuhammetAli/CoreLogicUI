import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { PublishedModelService } from '../../services/published-model.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';

interface DraftEntry {
  id: number;
  tableName: string;
  description: string;
  version: number;
  /** D-FK: üst modelin id'si. null ise bu bir ana (kök) modeldir. */
  parentTableId: number | null;
  /** Model ağacındaki derinlik. Kök = 1. */
  depth: number;
  /** Bu düğümün alt modelleri (ağaç yapısı, form-build'deki gibi). */
  children: DraftEntry[];
  publishing: boolean;
  publishMessage: string | null;
  publishSuccess: boolean | null;
  deleting: boolean;
  deleteMessage: string | null;
  deleteSuccess: boolean | null;
  /**
   * true ise bu düğümün gerçek parent'ı taslak listesinde yok (zaten yayınlanmış) —
   * yani yayınlama yarım kalmış: ana model yayınlandı ama bu alt model yayınlanamadı.
   * Ağaçta kök gibi görünür (parent'ı bu listede bulunamadığı için) ama aslında bir alt modeldir.
   */
  isOrphanChild: boolean;
  /** isOrphanChild ise ata zinciri, kökten gerçek parent'a: "AnaModel → AltModel1" */
  parentPath: string | null;
}

/** getAllTables() yanıtındaki tek tablo girdisi — parentPath için ata zinciri çözümlemesinde kullanılır. */
interface TableRef {
  id: number;
  tableName: string;
  parentTableId: number | null;
}

@Component({
  selector: 'app-draft-models',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './draft-models.component.html',
  styleUrls: ['./draft-models.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftModelsComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  /** Düz liste — publish/delete sonrası ağacı yeniden kurmak için saklanır. */
  private drafts: DraftEntry[] = [];
  /** Ana (kök) modeller; her birinin alt modelleri children dizisinde iç içe durur. */
  tree: DraftEntry[] = [];
  loading = false;
  loadError: string | null = null;

  private readonly languageService = inject(LanguageService);

  constructor(
    private publishedTable: PublishedTableService,
    private publishedModel: PublishedModelService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.drafts = [];
    this.tree = [];

    // Kayıtlı tabloları ve yayınlanmış modelleri paralel çek
    forkJoin({
      tables: this.publishedTable.getAllTables(),
      published: this.publishedModel.getModels()
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ tables, published }) => {
        this.loading = false;

        if (!tables.success) {
          this.loadError = tables.message ?? this.languageService.t('draft.tablesLoadFailed');
          return;
        }

        // Yayınlanmış model adlarını set olarak tut
        const publishedNames = new Set(
          (published.success ? (published.data ?? []) : []).map(m => m.typeName)
        );

        // Tüm tablolar (yayınlanmış + taslak) — orphan alt modellerin ata zincirini
        // (parent zaten yayınlanmış olsa da) çözebilmek için tam liste saklanır.
        const allTables = tables.data ?? [];
        const allById = new Map<number, TableRef>(allTables.map(t => [t.id, t]));

        // Yalnızca yayınlanmamış olanları göster
        this.drafts = allTables
          .filter(t => !publishedNames.has(t.tableName))
          .map(t => ({
            id: t.id,
            tableName: t.tableName,
            description: t.description,
            version: t.version,
            parentTableId: t.parentTableId,
            depth: t.depth,
            children: [],
            publishing: false,
            publishMessage: null,
            publishSuccess: null,
            deleting: false,
            deleteMessage: null,
            deleteSuccess: null,
            isOrphanChild: false,
            parentPath: null
          }));

        // Parent'ı taslak listesinde olmayan (= zaten yayınlanmış) düğümler için
        // "yarım yayınlama" işaretini ve ata zincirini hesapla.
        const draftIds = new Set(this.drafts.map(d => d.id));
        for (const draft of this.drafts) {
          if (draft.parentTableId != null && !draftIds.has(draft.parentTableId)) {
            draft.isOrphanChild = true;
            draft.parentPath = this.buildParentPath(draft.parentTableId, allById);
          }
        }

        this.tree = this.buildTree(this.drafts);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('draft.serverConnectionError');
      }
    });
  }

  /**
   * Düz taslak listesini, ana model → alt model ağacına dönüştürür (form-build'deki
   * model-node yapısının aynısı). Parent'ı taslak listesinde olmayan (örn. parent zaten
   * yayınlanmış) düğümler de kök gibi gösterilir.
   */
  private buildTree(flat: DraftEntry[]): DraftEntry[] {
    const byId = new Map(flat.map(d => [d.id, d]));
    const roots: DraftEntry[] = [];

    for (const draft of flat) {
      draft.children = [];
    }

    for (const draft of flat) {
      const parent = draft.parentTableId != null ? byId.get(draft.parentTableId) : undefined;
      if (parent) {
        parent.children.push(draft);
      } else {
        roots.push(draft);
      }
    }

    const sortByName = (a: DraftEntry, b: DraftEntry) => a.tableName.localeCompare(b.tableName);
    const sortTree = (nodes: DraftEntry[]) => {
      nodes.sort(sortByName);
      for (const node of nodes) {
        sortTree(node.children);
      }
    };
    sortTree(roots);

    return roots;
  }

  /**
   * startId'den köke kadar ata zincirini (kök → ... → startId) isim listesi olarak döner.
   * allById TÜM tabloları (yayınlanmış + taslak) içerir — orphan bir alt modelin parent'ı
   * yayınlanmış olduğu için (ve dolayısıyla this.drafts'ta bulunmadığı için) zincir yalnızca
   * bu tam liste üzerinden çözülebilir.
   */
  private buildParentPath(startId: number, allById: Map<number, TableRef>): string {
    const names: string[] = [];
    let current: TableRef | undefined = allById.get(startId);

    while (current) {
      names.unshift(current.tableName);
      current = current.parentTableId != null ? allById.get(current.parentTableId) : undefined;
    }

    return names.join(' → ');
  }

  publish(draft: DraftEntry): void {
    if (draft.publishing) return;

    draft.publishing = true;
    draft.publishMessage = null;
    draft.publishSuccess = null;

    this.publishedTable.publish(draft.tableName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        draft.publishing = false;
        draft.publishSuccess = res.success;
        draft.publishMessage = res.message ?? (res.success
          ? this.languageService.t('draft.publishedSuccess')
          : this.languageService.t('draft.publishFailed'));

        // Başarılı yayınlama sonrası ağaçtan kaldır (ana model + tüm alt modelleri birlikte)
        if (res.success) {
          setTimeout(() => {
            this.removeFromTree(draft.id);
            this.cdr.markForCheck();   // OnPush: zamanlayici callback'i CD tetiklemez
          }, 1500);
        }
      },
      error: err => {
        draft.publishing = false;
        draft.publishSuccess = false;
        draft.publishMessage = err?.error?.message ?? this.languageService.t('draft.publishServerError');
      }
    });
  }

  /** Onay diyaloğu açıkken pasif yapılacak taslak; null ise diyalog kapalı. */
  pendingDelete: DraftEntry | null = null;

  /** Onay diyaloğunun metni — alt modeli olan taslakta "ve alt modellerini" eki alır. */
  deleteConfirmMessage(): string {
    const draft = this.pendingDelete;
    if (!draft) return '';
    return this.languageService.t('draft.deactivateConfirm', {
      name: draft.tableName,
      childrenSuffix: draft.children.length > 0 ? this.languageService.t('draft.andSubModels') : ''
    });
  }

  askDelete(draft: DraftEntry): void {
    if (draft.publishing || draft.deleting) return;
    this.pendingDelete = draft;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  /**
   * Taslağı pasif yapar (soft-delete). PublishedTable/PublishedTableMember kayıtları
   * Active=false olur; SQL'e hiç dokunulmaz (taslak hiç yayınlanmadığı için zaten SQL
   * tablosu yoktur). "Silinen Taslaklar" sayfasından geri yüklenebilir.
   */
  confirmDelete(): void {
    const draft = this.pendingDelete;
    this.pendingDelete = null;
    if (!draft || draft.publishing || draft.deleting) return;

    draft.deleting = true;
    draft.deleteMessage = null;
    draft.deleteSuccess = null;

    this.publishedTable.deleteModel(draft.tableName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        draft.deleting = false;
        if (res.success) {
          this.removeFromTree(draft.id);
        } else {
          draft.deleteSuccess = false;
          draft.deleteMessage = res.message ?? this.languageService.t('draft.deactivateFailed');
        }
      },
      error: err => {
        draft.deleting = false;
        draft.deleteSuccess = false;
        draft.deleteMessage = err?.error?.message ?? this.languageService.t('draft.serverConnectionError');
      }
    });
  }

  /** Bir kök modeli (ve ona bağlı tüm alt model ağacını) düz listeden ve ağaçtan kaldırır. */
  private removeFromTree(rootId: number): void {
    this.drafts = this.drafts.filter(d => d.id !== rootId);
    this.tree = this.tree.filter(d => d.id !== rootId);
  }
}
