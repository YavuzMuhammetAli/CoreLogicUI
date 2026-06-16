import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { PublishedModelService } from '../../services/published-model.service';

interface DraftEntry {
  id: number;
  tableName: string;
  description: string;
  version: number;
  publishing: boolean;
  publishMessage: string | null;
  publishSuccess: boolean | null;
}

@Component({
  selector: 'app-draft-models',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './draft-models.component.html',
  styleUrls: ['./draft-models.component.scss']
})
export class DraftModelsComponent implements OnInit {
  drafts: DraftEntry[] = [];
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
            publishing: false,
            publishMessage: null,
            publishSuccess: null
          }));
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
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

        // Başarılı yayınlama sonrası listeden kaldır
        if (res.success) {
          setTimeout(() => {
            this.drafts = this.drafts.filter(d => d.id !== draft.id);
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
}
