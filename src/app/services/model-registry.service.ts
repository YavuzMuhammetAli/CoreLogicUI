import { Injectable } from '@angular/core';

export interface RegisteredColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
}

export interface RegisteredModel {
  typeName: string;
  columns: RegisteredColumn[];
  registeredAt: string; // ISO tarih
}

const STORAGE_KEY = 'cl_model_registry';

@Injectable({ providedIn: 'root' })
export class ModelRegistryService {

  /** Tüm kayıtlı modelleri döndürür */
  list(): RegisteredModel[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as RegisteredModel[]) : [];
    } catch {
      return [];
    }
  }

  /** typeName ile tek model döndürür */
  get(typeName: string): RegisteredModel | undefined {
    return this.list().find(m => m.typeName === typeName);
  }

  /** Yeni model kaydeder (aynı typeName varsa günceller) */
  register(model: Omit<RegisteredModel, 'registeredAt'>): void {
    const models = this.list().filter(m => m.typeName !== model.typeName);
    models.push({ ...model, registeredAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  }

  /** Modeli kayıttan kaldırır */
  remove(typeName: string): void {
    const models = this.list().filter(m => m.typeName !== typeName);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  }
}
