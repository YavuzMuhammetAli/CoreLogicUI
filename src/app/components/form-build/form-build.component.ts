import { Component, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { ModelNodeComponent, MAX_DEPTH } from '../model-node/model-node.component';

/** Kaydetme akışında kullanılan düzleştirilmiş düğüm verisi */
interface TreeNode {
  entityName: string;
  parentName: string | null;
  columns: {
    columnName: string;
    dataType: string;
    isNullable: boolean;
    minLength?: number | null;
    maxLength?: number | null;
    min?: number | null;
    max?: number | null;
    regex?: string;
    regexMessage?: string;
  }[];
}

@Component({
  selector: 'app-form-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ModelNodeComponent],
  templateUrl: './form-build.component.html',
  styleUrls: ['./form-build.component.scss']
})
export class FormBuildComponent implements OnDestroy {
  /** Kök model FormGroup — entityName + columns + subModels */
  rootGroup: FormGroup;

  // Geri bildirim mesajları
  submitMessage: string | null = null;
  submitSuccess: boolean | null = null;

  // Adım bazlı yükleme bayrakları
  isSaving = false;
  isPublishing = false;

  /**
   * Kaydetme durumu — zorunlu iş kuralı:
   *   "Kaydedilmemiş model yayınlanamaz."
   *   Herhangi bir form düzenlemesi bu bayrağı sıfırlar.
   */
  isSaved = false;
  savedRootName: string | null = null;

  private formChangeSub: Subscription;

  constructor(
    private fb: FormBuilder,
    private _publishedTableService: PublishedTableService,
    private _router: Router
  ) {
    // Kök düğüm FormGroup'u oluştur
    this.rootGroup = ModelNodeComponent.buildModelGroupStatic(this.fb, 'MyEntity');

    // Herhangi bir form değişikliği kayıt durumunu geçersiz kılar
    this.formChangeSub = this.rootGroup.valueChanges.subscribe(() => {
      if (this.isSaved) {
        this.isSaved = false;
        this.savedRootName = null;
      }
    });
  }

  ngOnDestroy(): void {
    this.formChangeSub.unsubscribe();
  }

  // ─── Yardımcı: ağacı BFS ile düzleştir ────────────────────────────────────

  /**
   * FormGroup ağacını parent-first sırada düz bir TreeNode listesine çevirir.
   * Yalnızca geçerli (columnName dolu) sütunları dahil eder.
   */
  private flattenTree(group: FormGroup, parentName: string | null): TreeNode[] {
    const result: TreeNode[] = [];
    const entityName: string = group.get('entityName')?.value ?? '';
    const columnsArr = group.get('columns') as FormArray;
    const subModelsArr = group.get('subModels') as FormArray;

    const cols = (columnsArr?.value ?? []).filter((c: any) => c.columnName?.trim());

    result.push({ entityName, parentName, columns: cols });

    // Alt modelleri BFS sırasında ekle (parent her zaman önce)
    for (let i = 0; i < (subModelsArr?.length ?? 0); i++) {
      const subGroup = subModelsArr.at(i) as FormGroup;
      result.push(...this.flattenTree(subGroup, entityName));
    }

    return result;
  }

  // ─── ADIM 1: KAYDET ───────────────────────────────────────────────────────

  /**
   * Tüm model ağacını (kök + alt modeller) parent-first sırada kaydeder.
   * Her düğüm: addTable + her kolon için addMember.
   * Başarı sonrası isSaved = true olur ve Yayınla butonu aktifleşir.
   */
  onSave(): void {
    if (this.rootGroup.invalid || this.isSaving || this.isPublishing) {
      this.rootGroup.markAllAsTouched();
      return;
    }

    const nodes = this.flattenTree(this.rootGroup, null);
    if (nodes.length === 0) return;

    const rootName = nodes[0].entityName;

    this.isSaving = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    // Her düğüm için sırayla: dup kontrol → addTable → addMember'lar
    from(nodes).pipe(
      concatMap(node =>
        // Dup kontrol
        this._publishedTableService.getSchema(node.entityName).pipe(
          catchError((err: { status?: number }) => {
            if (err?.status === 400 || err?.status === 404) {
              return of({ success: false as const, message: 'bulunamadı', data: null as any });
            }
            return throwError(() => new Error('Kontrol sırasında sunucu hatası oluştu.'));
          }),
          switchMap(checkRes => {
            if (checkRes.success) {
              return throwError(() => new Error(
                `"${node.entityName}" adında kayıtlı bir model zaten mevcut. Farklı bir ad seçin.`
              ));
            }
            // addTable — alt model ise parentTableName gönderilir
            return this._publishedTableService.addTable({
              tableName:       node.entityName,
              description:     `${node.entityName} dinamik modeli`,
              version:         1,
              parentTableName: node.parentName ?? undefined
            });
          }),
          switchMap(res =>
            res.success
              ? of(res)
              : throwError(() => new Error(res.message ?? 'Tablo metadata kaydı başarısız.'))
          ),
          // Her kolon için addMember
          switchMap(() =>
            from(node.columns).pipe(
              concatMap(col =>
                this._publishedTableService.addMember(
                  node.entityName,
                  col.columnName,
                  col.dataType,
                  !col.isNullable,
                  col.minLength ?? null,
                  col.maxLength ?? null,
                  col.min ?? null,
                  col.max ?? null,
                  col.regex || null,
                  col.regexMessage || null
                ).pipe(
                  switchMap(r =>
                    r.success
                      ? of(r)
                      : throwError(() => new Error(r.message ?? `'${col.columnName}' üye kaydı başarısız.`))
                  )
                )
              ),
              concatMap(() => of(null))
            )
          )
        )
      )
    ).subscribe({
      next: () => {},
      error: (err: Error) => {
        this.isSaving = false;
        this.isSaved = false;
        this.savedRootName = null;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? 'Kayıt sırasında sunucu hatası oluştu.';
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;
        const nodeCount = nodes.length;
        this.submitMessage = nodeCount > 1
          ? `${nodeCount} model (${nodes.map(n => n.entityName).join(', ')}) kaydedildi. Yayınlamak için "Yayınla"ya basın.`
          : `Model kaydedildi. Yayınlamak için "Yayınla"ya basın.`;
      }
    });
  }

  // ─── ADIM 2: YAYINLA ──────────────────────────────────────────────────────

  /**
   * Kaydedilmiş ağacı backend'e yayınlatır.
   * Backend kök adından tüm ağacı BFS ile çekip parent-first derler ve SQL tabloları oluşturur.
   */
  onPublish(): void {
    if (!this.isSaved || !this.savedRootName) {
      this.submitSuccess = false;
      this.submitMessage = 'Önce modeli kaydedin. Kaydedilmemiş model yayınlanamaz.';
      return;
    }

    if (this.isPublishing || this.isSaving) return;

    this.isPublishing = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    this._publishedTableService.publish(this.savedRootName).subscribe({
      next: res => {
        this.isPublishing = false;
        if (res.success) {
          this.submitSuccess = true;
          this.submitMessage = res.message ?? 'Model(ler) başarıyla yayınlandı.';
          this._router.navigate(['/models']);
        } else {
          this.submitSuccess = false;
          this.submitMessage = res.message ?? 'Yayınlama başarısız.';
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isPublishing = false;
        this.submitSuccess = false;
        this.submitMessage = err?.error?.message ?? err?.message ?? 'Yayınlama sırasında sunucu hatası oluştu.';
      }
    });
  }
}
