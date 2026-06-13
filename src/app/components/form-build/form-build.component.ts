import { Component } from '@angular/core';
import { ReactiveFormsModule, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PublishModelService } from '../../services/publish-model.service';
import { ModelRegistryService } from '../../services/model-registry.service';
import { PublishedTableService } from '../../services/published-table.service';
import { DatabaseService } from '../../services/database.service';
import { from, concatMap, switchMap, throwError, of } from 'rxjs';

interface ColumnForm {
  columnName: string;
  dataType: string;
  isNullable: boolean;
}

/** C# tipi eşlemesi */
const CSHARP_TYPE_MAP: Record<string, string> = {
  string: 'string',
  int: 'int',
  float: 'float',
  decimal: 'decimal',
  datetime: 'DateTime',
  boolean: 'bool',
};

@Component({
  selector: 'app-form-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './form-build.component.html',
  styleUrls: ['./form-build.component.scss']
})
export class FormBuildComponent {
  tableForm: FormGroup;
  dataTypes = Object.keys(CSHARP_TYPE_MAP);

  submitMessage: string | null = null;
  submitSuccess: boolean | null = null;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private publishService: PublishModelService,
    private publishedTableService: PublishedTableService,
    private databaseService: DatabaseService,
    private registry: ModelRegistryService,
    private router: Router
  ) {
    this.tableForm = this.fb.group({
      entityName: ['MyEntity', [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]],
      columns: this.fb.array([]),
    });
    this.addColumn();
  }

  get columns(): FormArray {
    return this.tableForm.get('columns') as FormArray;
  }

  get entityNameCtrl() {
    return this.tableForm.get('entityName')!;
  }

  addColumn(): void {
    this.columns.push(this.fb.group({
      columnName: ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      dataType: ['string'],
      isNullable: [true],
    }));
  }

  removeColumn(index: number): void {
    this.columns.removeAt(index);
  }

  onSubmit(): void {
    if (this.tableForm.invalid || this.isLoading) {
      this.tableForm.markAllAsTouched();
      return;
    }

    const entityName: string = this.tableForm.value.entityName;
    const cols: ColumnForm[] = (this.tableForm.value.columns ?? []).filter(
      (c: ColumnForm) => c.columnName?.trim()
    );
    const csharpCode = this.buildCsharpCode(entityName, cols);

    this.isLoading = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    // Adım 1: PublishedTable metadata kaydı ekle
    this.publishedTableService.addTable({
      tableName: entityName,
      description: `${entityName} dinamik modeli`,
      version: 1
    }).pipe(
      // addTable başarısız olursa zinciri kes
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? 'Tablo metadata kaydı başarısız.'))
      ),
      // Adım 2: Her kolon için sırayla addMember
      switchMap(() =>
        from(cols).pipe(
          concatMap(col =>
            this.publishedTableService.addMember(
              entityName,
              col.columnName,
              col.dataType,
              !col.isNullable   // isRequired = isNullable'ın tersi
            ).pipe(
              switchMap(r =>
                r.success
                  ? of(r)
                  : throwError(() => new Error(r.message ?? `'${col.columnName}' üye kaydı başarısız.`))
              )
            )
          ),
          // Tüm kolonlar bitti → tek değer emit et
          concatMap(() => of(null))
        )
      ),
      // Adım 3: C# derle (tip belleğe yüklenir)
      switchMap(() => this.publishService.publishModel(csharpCode)),
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? 'Model derleme başarısız.'))
      ),
      // Adım 4: SQL tablosu oluştur (tip bellekte olduğundan EF şimdi tablo üretebilir)
      switchMap(() => this.databaseService.createTable()),
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? 'SQL tablo oluşturma başarısız.'))
      )
    ).subscribe({
      next: res => {
        this.isLoading = false;
        this.submitSuccess = true;
        this.submitMessage = res.message;
        // LocalStorage registry'ye kaydet
        this.registry.register({ typeName: entityName, columns: cols });
        // 1.5 sn sonra model listesine yönlendir
        setTimeout(() => this.router.navigate(['/models']), 1500);
      },
      error: (err: Error) => {
        this.isLoading = false;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? 'Sunucu hatası oluştu.';
      }
    });
  }

  private buildCsharpCode(entityName: string, columns: ColumnForm[]): string {
    const props = columns
      .filter(c => c.columnName?.trim())
      .map(c => {
        const csType = CSHARP_TYPE_MAP[c.dataType] ?? 'string';
        const nullable = c.isNullable && csType !== 'string' ? '?' : '';
        return `    public ${csType}${nullable} ${c.columnName} { get; set; }`;
      })
      .join('\n');

    return `using Core.Entities;
using Entities.Concrete;

public class ${entityName} : DbBaseObject, IEntity
{
${props}
}`.trim();
  }

  getColumnGroup(index: number): FormGroup {
    return this.columns.at(index) as FormGroup;
  }
}
