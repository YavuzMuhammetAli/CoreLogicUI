# CoreLogicUI — Angular Frontend for CoreLogic Platform

## Project Overview

CoreLogicUI is the Angular 18 frontend for the **CoreLogic** dynamic model publishing platform.
Backend: ASP.NET Core 8.0 Web API at `C:\CoreLogic\CoreLogic-master`, compiles C# entity
code at runtime via Roslyn and exposes dynamic CRUD endpoints.

Users can:
- Giriş yaparak uygulamaya erişmek (JWT tabanlı auth)
- Dinamik entity şeması tanımlamak (kolon adı, tipi, nullable)
- C# model kodu oluşturup backend'e göndermek (Roslyn derleme)
- Dinamik olarak oluşturulan tablolardaki kayıtları CRUD ile yönetmek (master-detail, alt-model ilişkileri)
- Kayıtlı model listesini ve taslak modelleri görüntülemek
- Kullanıcı/rol bazlı izin yönetimi yapmak (admin)
- Model bazlı kolon görünürlüğü yapılandırmak (admin)
- Metadata-driven rapor oluşturmak ve çalıştırmak (tablo/grafik, filtre, gruplama, export)
- Birden çok raporu dashboard widget'ı olarak bir araya getirmek
- Kendi profilini görüntülemek/güncellemek, açık/koyu tema seçmek

## Tech Stack

| Bileşen | Teknoloji |
|---------|-----------|
| **Framework** | Angular 18.1 (standalone components) |
| **Dil** | TypeScript 5.5 |
| **Stil** | Özel token-tabanlı tasarım sistemi (SCSS) — Bootstrap runtime'da kullanılmaz |
| **Render** | Client-side only — SSR kaldırıldı (bkz. not aşağıda) |
| **Formlar** | Angular Reactive Forms |
| **HTTP** | `HttpClient` (`withFetch()` + interceptor'lar) |
| **State** | Signal (`signal`/`computed`/`effect`) — component-local state ve guard senkronizasyonu için; RxJS hâlâ HTTP servislerinde kullanılır |
| **Test** | Karma + Jasmine (çok az sayıda `*.spec.ts` var, kapsam düşük) |
| **Build** | Angular CLI 18 / `@angular-devkit/build-angular` |

> **Bootstrap notu:** `bootstrap` paketi `package.json`'da production bağımlılığı değildir;
> yalnızca `angular.json`'daki `test` target'ında kullanılır. Runtime build'de Bootstrap yoktur —
> uygulama tamamen özel CSS token sistemi kullanır (bkz. [Tasarım Sistemi](#tasarım-sistemi)).

> **SSR notu:** Proje başlangıçta `@angular/ssr` + Express ile kuruldu, sonradan SSR
> tamamen kaldırıldı. `server.ts`, `src/main.server.ts`, `src/app/app.config.server.ts`
> dosyaları **artık mevcut değil**; `@angular/ssr`, `@angular/platform-server`, `express`,
> `@types/express` bağımlılıkları ve `serve:ssr:CoreLogicUI` script'i de kaldırıldı. Koddaki
> `isPlatformBrowser(platformId)` kontrolleri buna rağmen **kasıtlı olarak korunuyor** —
> detay için `.Codex/skills/angular-standalone-component/SKILL.md`.

## Proje Yapısı

```
CoreLogicUI-master/
├── angular.json                           # Angular CLI yapılandırması
├── package.json
├── tsconfig.json / tsconfig.app.json
└── src/
    ├── index.html                         # Inter / IBM Plex Mono Google Fonts link'leri
    ├── main.ts                            # Tarayıcı bootstrap (tek giriş noktası)
    ├── styles.scss                        # Global tasarım token'ları ve baz stiller
    └── app/
        ├── app.component.ts               # Kök bileşen — RouterOutlet
        ├── app.routes.ts                  # Route tablosu (lazy + authGuard/adminGuard/modelPermissionGuard)
        ├── app.config.ts                  # Provider'lar: router, HttpClient, interceptor'lar, APP_INITIALIZER (izin önyükleme)
        ├── components/
        │   ├── login/                     # Giriş ekranı (public, JWT alır)
        │   ├── layout/                     # App shell (sidebar + topbar CSS Grid, tema toggle)
        │   ├── model-list/                # Kayıtlı model listesi
        │   ├── model-data/                # Dinamik tablo CRUD (liste görünümü)
        │   ├── model-detail/               # Dinamik tablo tekil kayıt görünümü/düzenleme (new + :id)
        │   ├── model-children/             # Alt-model (FK ilişkili) kayıtların master-detail gösterimi
        │   ├── model-node/                 # Model ağacı/şema düğümü gösterimi
        │   ├── form-build/                # Dinamik schema builder + C# önizleme (admin)
        │   ├── draft-models/               # Taslak (henüz yayınlanmamış) modeller (admin)
        │   ├── database-proccess/          # /Database endpoint'lerini saran ekran (admin) — implement edildi
        │   ├── user-permission-list/       # Kullanıcı bazlı izin listesi (admin)
        │   ├── user-permission-detail/     # Kullanıcı bazlı izin detay/düzenleme (admin)
        │   ├── role-list/                  # Rol (RBAC) listesi (admin)
        │   ├── role-detail/                 # Rol detay/izin/üyelik yönetimi (admin, new + :id)
        │   ├── user-profile/               # Kullanıcının kendi profil sayfası
        │   ├── report-list/                # Rapor tanım listesi
        │   ├── report-build/               # Rapor builder (filtre/gruplama/aggregate/grafik tipi, new + :id/edit)
        │   ├── report-viewer/              # Rapor çalıştırma/sonuç görünümü (tablo/grafik, export)
        │   ├── dashboard-list/             # Dashboard tanım listesi
        │   ├── dashboard-build/             # Dashboard builder (widget grid yerleşimi)
        │   ├── dashboard/                   # Dashboard çalıştırma/görüntüleme
        │   ├── chart/                       # ApexCharts tabanlı grafik component'i (rapor/dashboard tarafından kullanılır)
        │   └── shared/
        │       └── column-visibility/      # Admin-managed model kolon görünürlüğü (liste/detay/alt-model sekmeleri)
        ├── services/
        │   ├── auth.service.ts               # /Auth login/register, JWT → localStorage
        │   ├── published-table.service.ts    # /Published addTable, addMember
        │   ├── published-model.service.ts    # /PublishedModel getall/get/add/update/delete
        │   ├── publish-model.service.ts       # /PublishModel — Roslyn derleme
        │   ├── database.service.ts            # /Database createtable, checkdatabase
        │   ├── permission.service.ts          # /Permission — signal tabanlı izin durumu (isAdmin, can()), APP_INITIALIZER ile önyüklenir
        │   ├── permission-admin.service.ts    # /Permission — admin tarafından kullanıcı izinlerini yönetme
        │   ├── role-admin.service.ts          # /Role — RBAC rol CRUD, izin atama, üyelik yönetimi
        │   ├── user-profile.service.ts        # /Profile — me/update/change-password/upload-photo
        │   ├── model-column-setting.service.ts # /ModelColumnSetting — get/set kolon görünürlüğü
        │   ├── report.service.ts               # /Report — define/update/list/run/export
        │   ├── dashboard.service.ts             # /Dashboard — define/get/list
        │   ├── theme.service.ts                 # Açık/koyu tema tercihini yönetir (localStorage)
        │   └── notification.service.ts          # Global toast/uyarı bildirimleri (guard'lar dahil)
        ├── guards/
        │   ├── auth.guard.ts                  # JWT varlığını kontrol eder
        │   ├── admin.guard.ts                  # Yalnızca admin — PermissionService.ensureLoaded() + isAdmin()
        │   └── model-permission.guard.ts       # Factory: modelPermissionGuard('read'|'create'|'update'|'delete')
        ├── interceptors/
        │   ├── auth.interceptor.ts            # Authorization: Bearer header ekler
        │   └── error.interceptor.ts            # HTTP hata yakalamak
        ├── environments/
        │   ├── environment.ts                  # apiBaseUrl: 'https://localhost:7254'
        │   └── environment.prod.ts             # apiBaseUrl: 'http://localhost:5245' (henüz gerçek prod URL değil)
        └── models/
            ├── responseModel.ts                # ResponseModel { success, message }
            ├── responseModelList.ts            # ListResponseModel<T> extends ResponseModel { data }
            ├── dataResponseModel.ts            # DataResponseModel<T> extends ResponseModel { data: T } — tekil nesne
            ├── appUser.ts                       # AppUser — /User/getall yanıt öğesi
            ├── role.ts                          # RBAC rol modelleri
            ├── userProfile.ts                   # Profil modelleri
            ├── report.model.ts                  # ReportDefinition, ReportFilter/Aggregate/Sort, ChartType vb.
            └── dashboard.model.ts                # DashboardDefinition, DashboardWidget, DashboardRunResult vb.
```

## Routing

```
/login                  → LoginComponent                (public, authGuard yok)
/                       → LayoutComponent                (authGuard korumalı app shell)
  /                     → redirect → /models
  /models               → ModelListComponent
  /models/:typeName     → ModelDataComponent             (modelPermissionGuard('read'))
  /models/:typeName/new → ModelDetailComponent           (modelPermissionGuard('create'), data.mode='new')
  /models/:typeName/:id → ModelDetailComponent           (modelPermissionGuard('read'))
  /build                → FormBuildComponent             (adminGuard)
  /drafts               → DraftModelsComponent           (adminGuard)
  /database             → DatabaseProccessComponent       (adminGuard)
  /permissions          → UserPermissionListComponent     (adminGuard)
  /permissions/:id      → UserPermissionDetailComponent   (adminGuard)
  /roles                → RoleListComponent                (adminGuard)
  /roles/new            → RoleDetailComponent              (adminGuard, data.mode='new')
  /roles/:id            → RoleDetailComponent              (adminGuard)
  /profile              → UserProfileComponent             (authGuard yeterli)
  /reports              → ReportListComponent               (authGuard yeterli — yetki backend'de model üzerinde kontrol edilir)
  /reports/new          → ReportBuildComponent
  /reports/:id/edit     → ReportBuildComponent
  /reports/:id          → ReportViewerComponent
  /dashboard            → DashboardListComponent
  /dashboard/new        → DashboardBuildComponent
  /dashboard/:id        → DashboardComponent
**                      → redirect → /login
```

Tüm route'lar `loadComponent` ile lazy yüklenir. Sabit segmentler (`new`, `edit`) her zaman
`:id`/`:typeName` gibi parametreli segmentlerden **önce** tanımlanır — aksi halde Angular sabit
string'i parametre olarak yakalar. Korumalı route'lar `LayoutComponent`'in `children` dizisine
eklenir (üst `authGuard` otomatik miras alınır); admin-only sayfalar için ek olarak
`canActivate: [adminGuard]`, model-bazlı izin gereken sayfalar için
`modelPermissionGuard('read'|'create'|'update'|'delete')` kullanılır. Detay: `.Codex/skills/angular-standalone-component/SKILL.md`.

## HTTP Yapılandırması

`src/app/app.config.ts`:
```typescript
provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor]))
```

- **`provideHttpClient` zaten yapılandırılmış** — yeniden ekleme.
- `authInterceptor`: `localStorage('access_token')` JWT'yi alır, `Authorization: Bearer` header'ı ekler.
- `errorInterceptor`: HTTP hataları yakalar.
- `APP_INITIALIZER` (`permissionInitializerFactory`): router etkinleşmeden önce
  `PermissionService.loadMyPermissions()`'ı çağırıp izin signal'ini doldurur — `adminGuard` ve
  `modelPermissionGuard` bu sinyali **senkron** okuyabilir (sayfa yenilemesindeki guard yarış
  durumunu önler).

## Servisler

Tüm servisler `@Injectable({ providedIn: 'root' })`, `inject(HttpClient)` (veya ctor injection),
`environment.apiBaseUrl` üzerinden URL, `Observable<ResponseModel|ListResponseModel<T>|DataResponseModel<T>>` döner.

| Servis | Endpoint |
|--------|----------|
| `AuthService` | `/Auth/login`, `/Auth/register` |
| `PublishedTableService` | `/Published/addTable`, `/Published/addMember` |
| `PublishedModelService` | `/PublishedModel/getall`, `get`, `add`, `update`, `delete` |
| `PublishModelService` | `/PublishModel` — Roslyn derleme |
| `DatabaseService` | `/Database/createtable`, `/Database/checkdatabase` |
| `PermissionService` | `/Permission` — kendi izin durumu, signal (`isAdmin()`, `can()`), APP_INITIALIZER ile önyüklenir |
| `PermissionAdminService` | `/Permission` — admin: kullanıcı bazlı izin atama |
| `RoleAdminService` | `/Role` — RBAC rol CRUD, izin/üyelik yönetimi |
| `UserProfileService` | `/Profile` — me/update/change-password/upload-photo/sil |
| `ModelColumnSettingService` | `/ModelColumnSetting` — get/set kolon görünürlüğü |
| `ReportService` | `/Report` — define/update/list/run/export (excel/pdf) |
| `DashboardService` | `/Dashboard` — define/get/list |
| `ThemeService` | HTTP yok — açık/koyu tema tercihi, `localStorage` |
| `NotificationService` | HTTP yok — global toast/uyarı, guard'lar dahil kullanılır |

> `ModelRegistryService` kaldırıldı — model kaydı artık backend'deki `PublishedModelService`
> üzerinden yönetiliyor, ayrı bir localStorage tabanlı kayıt yok.

Yeni servis için `.Codex/skills/angular-api-service/SKILL.md` deseni kullan.

## Modeller

### `ResponseModel` (`src/app/models/responseModel.ts`)
```typescript
export interface ResponseModel {
  success: boolean;
  message: string;
}
```
Backend `IResult` → `{ Success, Message }` ile eşleşir.

### `ListResponseModel<T>` (`src/app/models/responseModelList.ts`)
```typescript
export interface ListResponseModel<T> extends ResponseModel {
  data: T[];
}
```
Backend `IDataResult<T>` (dizi) → `{ Success, Message, Data }` ile eşleşir.

### `DataResponseModel<T>` (`src/app/models/dataResponseModel.ts`)
```typescript
export interface DataResponseModel<T> extends ResponseModel {
  data: T;
}
```
Backend `IDataResult<T>` (tekil nesne) → `{ Success, Message, Data }` ile eşleşir.

Diğer alan-özel modeller: `appUser.ts`, `role.ts`, `userProfile.ts`, `report.model.ts`,
`dashboard.model.ts` — bunlar backend `Entities.DTOs.*` ile bire bir eşleşen domain tipleridir.

## Tasarım Sistemi

Uygulama Bootstrap değil, `src/styles.scss`'te tanımlı tam bir özel token-tabanlı
tasarım sistemi kullanır (artık açık/koyu tema desteği dahil). Detaylar için:
`.Codex/skills/corelogic-design/SKILL.md`

### Renk Paleti (özet)
- **Aksan:** `--accent: #1d4ed8` (indigo-700), slate nötrler üzerine
- **Yüzeyler:** `--bg`, `--surface`, `--surface-warm`
- **Metin:** `--fg`, `--fg-2`, `--muted`
- **Durum:** `--success/-bg`, `--warn/-bg`, `--danger/-bg`

### Global Sınıflar (styles.scss'te tanımlı, Bootstrap değil)
- Butonlar: `.btn` + `.btn-primary/-secondary/-danger/-ghost/-sm`
- Kart: `.panel` / `.panel-head` / `.panel-body` / `.panel-actions`
- Form: `.field` / `.input` / `.field-error` / `.field-help` / `.checkbox-label`
- Tablo: `.data-table` / `.td-actions`
- Etiket: `.badge` (+ `-success/-warn/-danger/-meta`), `.eyebrow`
- Bildirim: `.alert` (+ `-success/-danger/-warn/-info`)
- Yardımcı: `.spinner`, `.empty-state`, `.stack`, `.flow`, `.cluster`, `.sr-only`

### Layout
- CSS Grid (`display: grid`) — Bootstrap grid yok
- App shell: `grid-template-columns: var(--sidebar-w) 1fr`
- Sidebar: koyu (`background: var(--fg)`), genişlik `240px`
- Kırılma noktaları: `@media (max-width: 900px)` ve `768px`

### Yazım Kuralları
- Standalone component'ler (`standalone: true`)
- Yeni control flow: `@if` / `@for` / `@else` (`*ngIf`/`*ngFor` değil)
- İkonlar: inline stroke SVG, `currentColor`
- A11y: `aria-invalid`, `role="alert"`, `aria-describedby`, `.sr-only`
- **Tüm UI metni ve yorumlar Türkçe**

## Backend Entegrasyonu

| Alan | Değer |
|------|-------|
| HTTP port | `http://localhost:5245` |
| HTTPS port | `https://localhost:7254` (servislerde kullanılan) |
| CORS | `AllowAll` — `localhost:4200`'dan doğrudan çalışır |
| Swagger | `http://localhost:5245/swagger` |

## Geliştirme

### Ön Koşullar
- Node.js 18+
- Angular CLI 18: `npm install -g @angular/cli`

### Uygulamayı Çalıştırma
```bash
cd C:\CoreLogic\CoreLogicUI-master
npm install
npm start          # dev server → http://localhost:4200
```

### Diğer Komutlar
```bash
npm run build                   # Üretim build → dist/core-logic-ui/
npm run watch                   # İzleme modunda dev build
npm test                        # Karma/Jasmine testleri (izleme modu, Chrome)
npm run test:ci                 # Tek koşu, ChromeHeadless — commit öncesi doğrulama bununla
```

### Yeni Component Ekleme
```bash
ng generate component components/<ad>
```
Sonra `src/app/app.routes.ts`'e route ekle. Component yapısı/signal/guard konvansiyonları için
`angular-standalone-component`, tasarım için `corelogic-design`, API entegrasyonu için
`angular-api-service` skillini kullan. Yeni ekran üretmek için `ui-builder` agent'ını çalıştır.

## Konvansiyonlar

- **Standalone component'ler** — NgModule yok
- **SCSS** — tüm component stilleri `.scss`, `inlineStyleLanguage: scss`
- **Selector prefix** — `app` (örn. `app-form-build`)
- **Reactive Forms** — `FormBuilder` + `FormGroup`/`FormArray`
- **Yanıt tipleri** — `ResponseModel`, `ListResponseModel<T>` veya `DataResponseModel<T>`
- **Component state** — `signal()`/`computed()`/`effect()`; `BehaviorSubject` kullanılmaz
- **Türkçe yorumlar ve mesajlar** — backend ile tutarlı

## Bilinen Eksikler ve TODO'lar

1. **Unit test kapsamı düşük** — sadece 3 `*.spec.ts` dosyası var; servis/component'lerin büyük kısmı test edilmiyor
