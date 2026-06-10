import { Component } from '@angular/core';
import { ReactiveFormsModule, FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-form-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule], // ReactiveFormsModule dahil edildi
  templateUrl: './form-build.component.html',
  styleUrls: ['./form-build.component.scss'] // Doğru yazım: styleUrls
})
export class FormBuildComponent {
  tableForm: FormGroup;
  dataTypes: string[] = ['string', 'int', 'float', 'datetime', 'boolean'];

  constructor(private fb: FormBuilder) {
    this.tableForm = this.fb.group({
      columns: this.fb.array([]),
    });

    // İlk Kolonu Otomatik Olarak Ekleyelim
    this.addColumn();
  }

  get columns() {
    return this.tableForm.get('columns') as FormArray;
  }

  addColumn() {
    const columnGroup = this.fb.group({
      columnName: [''], // Kolon adı
      dataType: [''], // Veri tipi
      isNullable: [false], // Null olabilir mi
    });
    this.columns.push(columnGroup);
  }

  removeColumn(index: number) {
    this.columns.removeAt(index);
  }

  onSubmit() {
    console.log(this.tableForm.value);
    // Burada form verilerini işleyebilirsiniz, örneğin bir API'ye gönderebilirsiniz
  }
}
