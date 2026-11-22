---
name: angular-api-service
description: >
  CoreLogicUI'ye yeni Angular API servisi eklerken kullan.
  Injectable, HttpClient, environment, Observable/RxJS, ResponseModel ve interceptor
  desenlerini tanımlar. Mevcut servislere başvuru linkleri içerir.
---

# Angular API Servis Deseni

## Temel Yapı

Tüm servisler şu kalıbı takip eder:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })  // Root-level singleton
export class XService {
  private readonly baseUrl = `${environment.apiBaseUrl}/X`;

  constructor(private http: HttpClient) {}

  // GET — liste
  getAll(): Observable<ListResponseModel<XDto>> {
    return this.http.get<ListResponseModel<XDto>>(`${this.baseUrl}/getall`);
  }

  // GET — tek kayıt (query string parametresi)
  get(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.get<ResponseModel>(`${this.baseUrl}/get`, { params });
  }

  // POST — body
  add(dto: XDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/add`, dto);
  }

  // POST — query string parametresi
  addWithParams(name: string, type: string): Observable<ResponseModel> {
    const params = new HttpParams().set('name', name).set('type', type);
    return this.http.post<ResponseModel>(`${this.baseUrl}/add`, null, { params });
  }
}
```

---

## Ortam Yapılandırması

**`src/environments/environment.ts`** (development):
```typescript
export const environment = {
  production: false,
  apiBaseUrl: 'https://localhost:7254'
};
```

**`src/environments/environment.prod.ts`** (production):
```typescript
export const environment = {
  production: true,
  apiBaseUrl: 'https://localhost:7254'  // Prod URL buraya güncellenir
};
```

Her servis `environment.apiBaseUrl` kullanır — URL'yi asla hard-code etme.

---

## Yanıt Tipleri

**`src/app/models/responseModel.ts`**:
```typescript
export interface ResponseModel {
  success: boolean;
  message: string;
}
```
Backend `IResult` → `{ Success, Message }` ile eşleşir.

**`src/app/models/responseModelList.ts`**:
```typescript
export interface ListResponseModel<T> extends ResponseModel {
  data: T[];
}
```
Backend `IDataResult<T>` → `{ Success, Message, Data }` ile eşleşir.

> **Not:** Backend C# PascalCase döner (`Success`, `Message`, `Data`).
> Angular JSON deserializer case-insensitive çalışır — TypeScript interface'lerde
> camelCase kullanılabilir.

---

## Interceptor Farkındalığı

`app.config.ts`'te kayıtlı iki interceptor **otomatik** çalışır — servislerde elle eklemen gerekmez:

| Interceptor | Dosya | Ne Yapar |
|-------------|-------|----------|
| `authInterceptor` | `src/app/interceptors/auth.interceptor.ts` | `localStorage`'dan JWT alır, `Authorization: Bearer <token>` header'ı ekler (SSR-safe) |
| `errorInterceptor` | `src/app/interceptors/error.interceptor.ts` | HTTP hata yanıtlarını yakalar |

Servis içinde manuel header ya da hata yakalama **ekleme** — interceptor'lar halleder.

---

## HttpParams Kullanım Şekilleri

```typescript
// Tek parametre
const params = new HttpParams().set('typeName', typeName);

// Zincirleme (immutable API)
const params = new HttpParams()
  .set('typeName', typeName)
  .set('memberName', memberName)
  .set('isRequired', isRequired);  // boolean otomatik 'true'/'false' olur

// POST body + query string birlikte
return this.http.post<ResponseModel>(url, null, { params });

// GET + query string
return this.http.get<ListResponseModel<T>>(url, { params });
```

---

## Mevcut Servisler (Referans)

| Servis | Dosya | Kapsadığı Backend Endpoint |
|--------|-------|---------------------------|
| `AuthService` | `src/app/services/auth.service.ts` | `/Auth/login`, `/Auth/register` — JWT yönetimi, `localStorage('access_token')` |
| `PublishedTableService` | `src/app/services/published-table.service.ts` | `/Published/addTable`, `/Published/addMember` |
| `PublishedModelService` | `src/app/services/published-model.service.ts` | `/PublishedModel/getall`, `get`, `add`, `update`, `delete` |
| `PublishModelService` | `src/app/services/publish-model.service.ts` | `/PublishModel` — Roslyn derleme |
| `DatabaseService` | `src/app/services/database.service.ts` | `/Database/createtable`, `/Database/checkdatabase` |
| `PermissionService` | `src/app/services/permission.service.ts` | `/Permission` — kendi izin durumu; signal tabanlı (`isAdmin()`, `can()`), APP_INITIALIZER ile önyüklenir (bkz. `angular-standalone-component` skill) |
| `PermissionAdminService` | `src/app/services/permission-admin.service.ts` | `/Permission` — admin: kullanıcı bazlı izin atama |
| `RoleAdminService` | `src/app/services/role-admin.service.ts` | `/Role` — RBAC rol CRUD, izin/üyelik yönetimi |
| `UserProfileService` | `src/app/services/user-profile.service.ts` | `/Profile` — me/update/change-password/upload-photo |
| `ModelColumnSettingService` | `src/app/services/model-column-setting.service.ts` | `/ModelColumnSetting` — get/set kolon görünürlüğü |
| `ReportService` | `src/app/services/report.service.ts` | `/Report` — define/update/list/run/export (excel/pdf) |
| `DashboardService` | `src/app/services/dashboard.service.ts` | `/Dashboard` — define/get/list |
| `ThemeService` | `src/app/services/theme.service.ts` | HTTP yok — açık/koyu tema tercihi, `localStorage` |
| `NotificationService` | `src/app/services/notification.service.ts` | HTTP yok — global toast/uyarı bildirimleri |

`ModelRegistryService` (localStorage tabanlı yerel model kaydı) kaldırıldı — model kaydı artık
tamamen backend `PublishedModelService` üzerinden yönetiliyor.

Yeni bir servis eklemeden önce yukarıdaki listeyi kontrol et — benzer işlevi karşılayan servis zaten olabilir.

---

## Component'te Servis Kullanımı

```typescript
import { Component, inject } from '@angular/core';
import { PublishedTableService } from '../../services/published-table.service';
import { ResponseModel } from '../../models/responseModel';

@Component({ standalone: true, ... })
export class MyComponent {
  // inject() ile DI (constructor injection da kabul edilir)
  private tableService = inject(PublishedTableService);

  yukleniyor = false;
  hata: string | null = null;
  basari: string | null = null;

  kaydet(dto: PublishedTableDto) {
    this.yukleniyor = true;
    this.hata = null;

    this.tableService.addTable(dto).subscribe({
      next: (res: ResponseModel) => {
        this.yukleniyor = false;
        if (res.success) {
          this.basari = res.message;
        } else {
          this.hata = res.message;
        }
      },
      error: () => {
        this.yukleniyor = false;
        this.hata = 'Sunucuya bağlanılamadı.';
      }
    });
  }
}
```

---

## Yeni Servis Oluştururken Kontrol Listesi

- [ ] `@Injectable({ providedIn: 'root' })` — root-level singleton
- [ ] `constructor(private http: HttpClient)` — HttpClient inject et
- [ ] `private readonly baseUrl = \`${environment.apiBaseUrl}/Endpoint\`` — ortam değişkeni
- [ ] Her metot `Observable<ResponseModel>` veya `Observable<ListResponseModel<T>>` döner
- [ ] GET parametreleri `HttpParams` ile, body POST olarak geç
- [ ] `auth.interceptor` ve `error.interceptor` otomatik çalışır — elle ekleme
- [ ] İngilizce JSDoc yorum satırları ekle (`/** Description */`)
- [ ] Yeni servis dosyasını `src/app/services/` altına ekle
