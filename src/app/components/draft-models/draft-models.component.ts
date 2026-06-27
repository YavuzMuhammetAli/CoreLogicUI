import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { PublishedModelService } from '../../services/published-model.service';

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
}

@Component({
  selector: 'app-draft-models',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './draft-models.component.html',
  styleUrls: ['./draft-models.component.scss']
})
export class DraftModelsComponent implements OnInit {
  /** Düz liste — publish/delete sonrası ağacı yeniden kurmak için saklanır. */
  private drafts: DraftEntry[] = [];
  /** Ana (kök) modeller; her birinin alt modelleri children dizisinde iç içe durur. */
  tree: DraftEntry[] = [];
  loading = false;
  loadError: string | null = null;

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
    }).subscribe({
      next: ({ tables, published }) => {
        this.loading = false;

        if (!tables.success) {
          this.loadError = tables.message ?? 'Tablolar yüklenemedi.';
          return;
        }

        // Yayınlanmış model adlarını set olarak tut
        const publishedNames = new Set(
          (published.success ? (published.data ?? []) : []).map(m => m.typeName)
        );

        // Yalnızca yayınlanmamış olanları göster
        this.drafts = (tables.data ?? [])
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
            deleteSuccess: null
          }));

        this.tree = this.buildTree(this.drafts);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
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

  publish(draft: DraftEntry): void {
    if (draft.publishing) return;

    draft.publishing = true;
    draft.publishMessage = null;
    draft.publishSuccess = null;

    this.publishedTable.publish(draft.tableName).subscribe({
      next: res => {
        draft.publishing = false;
        draft.publishSuccess = res.success;
        draft.publishMessage = res.message ?? (res.success ? 'Başarıyla yayınlandı.' : 'Yayınlama başarısız.');

        // Başarılı yayınlama sonrası ağaçtan kaldır (ana model + tüm alt modelleri birlikte)
        if (res.success) {
          setTimeout(() => {
            this.removeFromTree(draft.id);
          }, 1500);
        }
      },
      error: err => {
        draft.publishing = false;
        draft.publishSuccess = false;
        draft.publishMessage = err?.error?.message ?? 'Yayınlama sırasında sunucu hatası oluştu.';
      }
    });
  }

  /**
   * Taslağı pasif yapar (soft-delete). PublishedTable/PublishedTableMember kayıtları
   * Active=false olur; SQL'e hiç dokunulmaz (taslak hiç yayınlanmadığı için zaten SQL
   * tablosu yoktur). "Silinen Taslaklar" sayfasından geri yüklenebilir.
   */
  onDelete(draft: DraftEntry): void {
    if (draft.publishing || draft.deleting) return;

    const hasChildren = draft.children.length > 0;
    const confirmed = confirm(
      `'${draft.tableName}'${hasChildren ? ' ve alt modellerini' : ''} pasif yapmak istediğinize emin misiniz?\n\n` +
      `Yanlışlıkla sildiyseniz "Silinen Taslaklar" sayfasından geri yükleyebilirsiniz.`
    );
    if (!confirmed) return;

    draft.deleting = true;
    draft.deleteMessage = null;
    draft.deleteSuccess = null;

    this.publishedTable.deleteModel(draft.tableName).subscribe({
      next: res => {
        draft.deleting = false;
        if (res.success) {
          this.removeFromTree(draft.id);
        } else {
          draft.deleteSuccess = false;
          draft.deleteMessage = res.message ?? 'Taslak pasif yapılamadı.';
        }
      },
      error: err => {
        draft.deleting = false;
        draft.deleteSuccess = false;
        draft.deleteMessage = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  /** Bir kök modeli (ve ona bağlı tüm alt model ağacını) düz listeden ve ağaçtan kaldırır. */
  private removeFromTree(rootId: number): void {
    this.drafts = this.drafts.filter(d => d.id !== rootId);
    this.tree = this.tree.filter(d => d.id !== rootId);
  }
}
