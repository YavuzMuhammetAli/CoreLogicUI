# CoreLogicUI — Angular Frontend for CoreLogic Platform

## Project Overview

CoreLogicUI is the Angular 18 frontend for the **CoreLogic** dynamic model publishing platform.
Backend: ASP.NET Core 8.0 Web API at `C:\Users\muham\source\repos\YavuzMuhammetAli\CoreLogic`, compiles C# entity
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
- Silinen modelleri/taslakları/raporları/dashboardları geri yüklemek veya kalıcı silmek (admin)
- Denetim kayıtlarını (audit log) görüntülemek — kim, ne zaman, hangi kayıtta değişiklik yaptı (admin)
- Veritabanı yedekleme zamanlaması, sistem e-postası (SMTP) ve abonelik planını yönetmek (admin, `/parameters`)
- Yapay zekaya işini anlatıp model/rapor/dashboard önerileri almak, beğendiklerini içeri aktarıp yayınlamak (admin, `/ai`)
- Uygulama arayüz dilini değiştirmek (TR/EN topbar toggle)

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

> **Bootstrap notu:** Bootstrap projede **hiç kullanılmıyor** — ne `package.json`'da
> ne de `angular.json`'da (test target'ından da kaldırıldı). Uygulama tamamen özel CSS
> token sistemi kullanır (bkz. [Tasarım Sistemi](#tasarım-sistemi)).

> **SSR notu:** Proje başlangıçta `@angular/ssr` + Express ile kuruldu, sonradan SSR
> tamamen kaldırıldı. `server.ts`, `src/main.server.ts`, `src/app/app.config.server.ts`
> dosyaları **artık mevcut değil**. `package.json`'da `@angular/ssr`/`express` bağımlılıkları
> ve `serve:ssr:CoreLogicUI` script'i temizlenmemiş kalıntı olarak duruyor (script artık
> sadece `echo 'SSR kaldirildi — artik kullanilmiyor'` çalıştırıyor). Koddaki
> `isPlatformBrowser(platformId)` kontrolleri buna rağmen **kasıtlı olarak korunuyor** —
> detay için `.claude/skills/angular-standalone-component/SKILL.md`.

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
        │   ├── layout/                     # App shell (sidebar + topbar CSS Grid, tema + dil toggle)
        │   ├── model-list/                # Kayıtlı model listesi
        │   ├── model-data/                # Dinamik tablo CRUD (liste görünümü, sayfalama)
        │   ├── model-detail/               # Dinamik tablo tekil kayıt görünümü/düzenleme (new + :id)
        │   ├── model-children/             # Alt-model (FK ilişkili) kayıtların master-detail gösterimi
        │   ├── model-node/                 # Model ağacı/şema düğümü gösterimi
        │   ├── form-build/                # Model şema listesi + seçim ekranı (admin)
        │   ├── table-detail/               # Model şema builder/düzenleme ekranı (new + :typeName, admin)
        │   ├── draft-models/               # Taslak (henüz yayınlanmamış) modeller (admin)
        │   ├── deleted-models/             # Soft-delete edilmiş modeller — geri yükleme/kalıcı silme (admin)
        │   ├── deleted-drafts/             # Soft-delete edilmiş taslak modeller (admin)
        │   ├── deleted-reports/            # Soft-delete edilmiş raporlar (admin)
        │   ├── deleted-dashboards/         # Soft-delete edilmiş dashboardlar (admin)
        │   ├── audit-log/                  # Denetim kayıtları — kim/ne zaman/ne değişti, filtre + sayfalama (admin)
        │   ├── parameters/                 # Parametreler (admin) — 3 sekme: yedekleme zamanlaması, SMTP, abonelik
        │   │   ├── backup/                 #   Cron kurucu + "sonraki 5 çalışma" önizlemesi + yedek geçmişi
        │   │   ├── mail/                   #   SMTP ayarları + test maili (parola maskeli taşınır)
        │   │   └── subscription/           #   Plan kartları + mevcut abonelik + satın alma (ödeme şimdilik stub)
        │   ├── ai-chat/                    # Yapay Zeka asistanı (admin) — sohbet + öneri kartları + içeri aktar/yayınla
        │   ├── database-proccess/          # /Database endpoint'lerini saran ekran (admin)
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
        │       ├── column-visibility/      # Admin-managed model kolon görünürlüğü (liste/detay/alt-model sekmeleri)
        │       ├── confirm-dialog/         # Onay diyaloğu — native confirm() YERİNE her zaman bu kullanılır
        │       ├── deleted-list/           # "Silinenler" ekranlarının ortak gövdesi (model/taslak/rapor/dashboard)
        │       ├── datatype-help/          # Veri tipi + ilişki kılavuz diyaloğu (içerik: datatype-help.data.ts)
        │       ├── help-hint/              # Alan yanındaki küçük yardım baloncuğu
        │       ├── lookup-picker/          # Lookup kolonu için sayfalı/aranabilir kayıt seçici
        │       ├── record-form-dialog/     # İç içe kayıt ekleme/düzenleme pop-up'ı (model-detail kullanır)
        │       ├── model-autocomplete/     # Model adı seçimi (combobox, klavye + ARIA) — ilişki hedefi seçiminde
        │       └── entity-graph/           # Entity ilişki grafiği (inline SVG; geometri entity-graph.layout.ts'te, saf + test edilebilir)
        ├── services/
        │   ├── auth.service.ts               # /Auth login/register, JWT → localStorage
        │   ├── published-table.service.ts    # /Published addTable, addMember + soft-delete/restore
        │   ├── published-model.service.ts    # /PublishedModel getall(sayfalı)/get/add/update/delete + meta
        │   ├── publish-model.service.ts       # /PublishModel — Roslyn derleme
        │   ├── database.service.ts            # /Database createtable, checkdatabase
        │   ├── permission.service.ts          # /Permission — signal tabanlı izin durumu (isAdmin, can()), APP_INITIALIZER ile önyüklenir
        │   ├── permission-admin.service.ts    # /Permission — admin tarafından kullanıcı izinlerini yönetme
        │   ├── role-admin.service.ts          # /Role — RBAC rol CRUD, izin atama, üyelik yönetimi
        │   ├── user-profile.service.ts        # /Profile — me/update/change-password/upload-photo
        │   ├── model-column-setting.service.ts # /ModelColumnSetting — get/set kolon görünürlüğü
        │   ├── report.service.ts               # /Report — define/update/list/run/export + soft-delete/restore
        │   ├── dashboard.service.ts             # /Dashboard — define/get/list + soft-delete/restore
        │   ├── audit-log.service.ts             # /AuditLog — filtrelenmiş denetim kayıtları (admin-only)
        │   ├── user-admin.service.ts             # /User — şirket içi kullanıcı CRUD + pasifle/parola/admin (admin-only)
        │   ├── relationship.service.ts           # /publish/models/{id}/... — model ilişkileri CRUD + validate-graph + preview
        │   ├── parameter.service.ts               # /Parameter — yedekleme zamanlaması, SMTP ayarları, abonelik (admin-only)
        │   ├── ai.service.ts                       # /Ai — sohbet CRUD + kota + SSE akışı (fetch tabanlı, admin-only)
        │   ├── ai-import.service.ts                # HTTP yok kendi başına — AI önerilerini MEVCUT servislerle sisteme aktarır
        │   ├── language.service.ts              # HTTP yok — TR/EN dil tercihi, localStorage, t() + TranslatePipe
        │   ├── model-usage.service.ts           # HTTP yok — model kullanım özeti (raporlar + dashboardlar)
        │   ├── lookup-label.service.ts          # Lookup id → etiket çözümleme (önbellekli)
        │   ├── record-metadata.service.ts       # Kayıt formu meta verisi (kolon kuralları/şema)
        │   ├── theme.service.ts                 # Açık/koyu tema tercihini yönetir (localStorage)
        │   └── notification.service.ts          # Global toast/uyarı bildirimleri (guard'lar dahil)
        ├── utils/
        │   ├── change-detection.ts              # markDirty(cdr) — OnPush'ta asenkron veri sonrası CD tetikler
        │   ├── cron-builder.ts                  # Saf: sıklık seçimi ↔ cron ifadesi + sonraki koşu önizlemesi (spec'li)
        │   ├── ai-import.mapper.ts              # Saf: AI önerisi → servis payload'ı (düzleştirme/doğrulama/ad→ID, spec'li)
        │   └── locale-format.ts                 # Aktif dile göre sayı/tarih biçimlendirme (sabit 'tr-TR' KULLANMA)
        ├── guards/
        │   ├── auth.guard.ts                  # JWT varlığını kontrol eder
        │   ├── admin.guard.ts                  # Yalnızca admin — PermissionService.ensureLoaded() + isAdmin()
        │   └── model-permission.guard.ts       # Factory: modelPermissionGuard('read'|'create'|'update'|'delete')
        ├── interceptors/
        │   ├── auth.interceptor.ts            # Authorization: Bearer header ekler
        │   ├── language.interceptor.ts         # Accept-Language header ekler (LanguageService'den okur)
        │   └── error.interceptor.ts            # HTTP hata yakalamak
        ├── i18n/                              # TR/EN çeviri sözlüğü (TRANSLATIONS map)
        │   ├── index.ts                       # TRANSLATIONS map'ini dışa aktarır
        │   ├── translations.model.ts          # TranslationEntry { tr, en } tipi
        │   ├── common.i18n.ts                 # Ortak: kaydet/iptal/sil/yükle vb.
        │   ├── layout.i18n.ts                 # Sidebar + topbar metinleri
        │   ├── login.i18n.ts                  # Giriş ekranı
        │   ├── model.i18n.ts                  # Model CRUD ekranları
        │   ├── report.i18n.ts                 # Rapor ekranları
        │   ├── dashboard.i18n.ts              # Dashboard ekranları
        │   ├── admin.i18n.ts                  # Admin ekranları (form-build, draft, db, audit-log)
        │   ├── permission.i18n.ts             # İzin/rol ekranları
        │   ├── profile.i18n.ts                # Profil ekranı
        │   ├── relationship.i18n.ts           # Model ilişkileri sekmesi, ilişki popup'ı, önizleme
        │   ├── parameter.i18n.ts              # Parametreler ekranı (yedekleme · e-posta · abonelik)
        │   ├── ai.i18n.ts                     # Yapay Zeka asistanı (sohbet, öneri kartları, durumlar)
        │   └── shared.i18n.ts                 # Paylaşılan diyalog metinleri
        ├── pipes/
        │   └── translate.pipe.ts              # TranslatePipe — şablonlarda `{{ 'key' | t }}` şeklinde kullanılır
        ├── environments/
        │   ├── environment.ts                  # apiBaseUrl: 'https://localhost:7254'
        │   └── environment.prod.ts             # apiBaseUrl: 'http://localhost:5245' (henüz gerçek prod URL değil)
        └── models/
            ├── responseModel.ts                # ResponseModel { success, message }
            ├── responseModelList.ts            # ListResponseModel<T> extends ResponseModel { data }
            ├── dataResponseModel.ts            # DataResponseModel<T> extends ResponseModel { data: T } — tekil nesne
            ├── appUser.ts                       # AppUser — /User/getall yanıt öğesi
            ├── auditLog.ts                      # AuditLog — denetim kaydı modeli
            ├── role.ts                          # RBAC rol modelleri
            ├── userProfile.ts                   # Profil modelleri
            ├── report.model.ts                  # ReportDefinition, ReportFilter/Aggregate/Sort, ChartType vb.
            ├── dashboard.model.ts                # DashboardDefinition, DashboardWidget, DashboardRunResult vb.
            ├── relationship.model.ts             # RelationshipType/Definition, ValidationIssue, EntityGraph, PublishPreview
            └── ai.model.ts                       # Sohbet/mesaj/öneri tipleri, öneri payload şekilleri, SSE olay union'ı
```

## Routing

```
/login                      → LoginComponent                (public, authGuard yok)
/                           → LayoutComponent                (authGuard korumalı app shell)
  /                         → redirect → /models
  /models                   → ModelListComponent
  /models/deleted           → DeletedModelsComponent         (adminGuard) ⚠️ "deleted" sabit seg. ":typeName"'den önce
  /models/:typeName         → ModelDataComponent             (modelPermissionGuard('read'))
  /models/:typeName/new     → ModelDetailComponent           (modelPermissionGuard('create'), data.mode='new')
  /models/:typeName/:id     → ModelDetailComponent           (modelPermissionGuard('read'))
  /build                    → FormBuildComponent             (adminGuard — model şema listesi)
  /build/new                → TableDetailComponent           (adminGuard, data.mode='new' — yeni şema oluştur)
  /build/:typeName          → TableDetailComponent           (adminGuard — mevcut şemayı düzenle)
  /drafts                   → DraftModelsComponent           (adminGuard)
  /drafts/deleted           → DeletedDraftsComponent         (adminGuard)
  /database                 → DatabaseProccessComponent       (adminGuard)
  /users                    → UserListComponent               (adminGuard — şirket kullanıcıları)
  /users/new                → UserDetailComponent             (adminGuard, data.mode='new')
  /users/:id                → UserDetailComponent             (adminGuard)
  /permissions              → UserPermissionListComponent     (adminGuard)
  /permissions/:id          → UserPermissionDetailComponent   (adminGuard)
  /roles                    → RoleListComponent                (adminGuard)
  /roles/new                → RoleDetailComponent              (adminGuard, data.mode='new')
  /roles/:id                → RoleDetailComponent              (adminGuard)
  /audit-logs               → AuditLogComponent               (adminGuard)
  /parameters               → ParametersComponent             (adminGuard — yedekleme/e-posta/abonelik)
  /ai                       → AiChatComponent                 (adminGuard — yapay zeka asistanı)
  /profile                  → UserProfileComponent             (authGuard yeterli)
  /reports                  → ReportListComponent               (authGuard yeterli)
  /reports/new              → ReportBuildComponent
  /reports/:id/edit         → ReportBuildComponent
  /reports/deleted          → DeletedReportsComponent          (adminGuard) ⚠️ "deleted" sabit seg. ":id"'den önce
  /reports/:id              → ReportViewerComponent
  /dashboard                → DashboardListComponent
  /dashboard/new            → DashboardBuildComponent
  /dashboard/deleted        → DeletedDashboardsComponent       (adminGuard) ⚠️ "deleted" sabit seg. ":id"'den önce
  /dashboard/:id            → DashboardComponent
**                          → redirect → /login
```

Tüm route'lar `loadComponent` ile lazy yüklenir. Sabit segmentler (`new`, `edit`) her zaman
`:id`/`:typeName` gibi parametreli segmentlerden **önce** tanımlanır — aksi halde Angular sabit
string'i parametre olarak yakalar. Korumalı route'lar `LayoutComponent`'in `children` dizisine
eklenir (üst `authGuard` otomatik miras alınır); admin-only sayfalar için ek olarak
`canActivate: [adminGuard]`, model-bazlı izin gereken sayfalar için
`modelPermissionGuard('read'|'create'|'update'|'delete')` kullanılır. Detay: `.claude/skills/angular-standalone-component/SKILL.md`.

## HTTP Yapılandırması

`src/app/app.config.ts`:
```typescript
provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor]))
```

- **`provideHttpClient` zaten yapılandırılmış** — yeniden ekleme.
- `authInterceptor`: `localStorage('access_token')` JWT'yi alır, `Authorization: Bearer` header'ı ekler.
- `languageInterceptor`: `localStorage('lang')` dil tercihini alır, `Accept-Language` header'ı ekler.
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
| `DashboardService` | `/Dashboard` — define/get/list + soft-delete/restore |
| `AuditLogService` | `/AuditLog` — filtrelenmiş denetim kayıtları (admin-only) |
| `UserAdminService` | `/User` — getall/create/update/setActive/resetPassword/setAdmin/delete (admin-only) |
| `RelationshipService` | `/publish/models/{id}/relationships` (GET/POST/PUT/DELETE), `/validate-graph`, `/preview` |
| `ParameterService` | `/Parameter` — `backup/schedule`, `backup/history`, `backup/run`, `mail`, `mail/test`, `subscription/*` (admin-only) |
| `AiService` | `/Ai` — `conversations`, `chat` (SSE), `proposals/{id}/status`, `usage` (admin-only) |
| `AiImportService` | Kendi ucu YOK — AI önerilerini `PublishedTableService`/`RelationshipService`/`ReportService`/`DashboardService` üzerinden aktarır |
| `LanguageService` | HTTP yok — TR/EN dil tercihi, `localStorage`, `t()` metodu + `TranslatePipe` |
| `ModelUsageService` | HTTP yok — model kullanım özeti: hangi raporlar/dashboardlar bu modeli kullanıyor |
| `ThemeService` | HTTP yok — açık/koyu tema tercihi, `localStorage` |
| `NotificationService` | HTTP yok — global toast/uyarı, guard'lar dahil kullanılır |

> `ModelRegistryService` kaldırıldı — model kaydı artık backend'deki `PublishedModelService`
> üzerinden yönetiliyor, ayrı bir localStorage tabanlı kayıt yok.

Yeni servis için `.claude/skills/angular-api-service/SKILL.md` deseni kullan.

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

Diğer alan-özel modeller: `appUser.ts`, `auditLog.ts`, `role.ts`, `userProfile.ts`, `report.model.ts`,
`dashboard.model.ts` — bunlar backend `Entities.DTOs.*` ile bire bir eşleşen domain tipleridir.

## Tasarım Sistemi

Uygulama Bootstrap değil, `src/styles.scss`'te tanımlı tam bir özel token-tabanlı
tasarım sistemi kullanır (artık açık/koyu tema desteği dahil). Detaylar için:
`.claude/skills/corelogic-design/SKILL.md`

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

## Şirket İçi Kullanıcı Yönetimi (G2)

Bir şirket `/register-company` ile kaydolduğunda **tek bir admin** oluşur. Diğer kullanıcılar
yalnızca `/users` ekranından, o şirketin admin'i tarafından eklenir.

**Dışarıdan bir şirkete katılım YOKTUR** — "mevcut şirkete kaydol" akışı ne backend'de ne
UI'da vardır. `/User/*` uçlarının tamamı `[Authorize(Roles = "admin")]` ve yeni kullanıcı
her zaman **çağıran admin'in ambient tenant'ına** eklenir; istemci şirket/tenant seçemez.

| İşlem | Uç |
|---|---|
| Liste | `GET /User/getall` |
| Oluştur | `POST /User/create` |
| Güncelle (ad/soyad/e-posta) | `PUT /User/update?userId=` |
| Pasifle / aktifle | `POST /User/setActive?userId=&active=` |
| Parola sıfırla | `POST /User/resetPassword?userId=` |
| Admin yetkisi | `POST /User/setAdmin?userId=&isAdmin=` |
| Kalıcı sil | `DELETE /User/delete?userId=` |

**Master senkronu zorunludur.** Login `MasterAuthManager` ile master satırına karşı doğrulanır
ve tenant'ı e-postadan çözer. Bu yüzden `SetActive`, e-posta değişikliği ve parola sıfırlama
**her iki tarafa birlikte** yazılır (`IMasterAuthService.SetMasterUserStatus` /
`UpdateMasterUserEmail` / `UpdateMasterUserPassword`). Yalnızca tenant güncellenirse pasifleme
etkisiz kalır, e-posta/parola değişikliği ise kullanıcıyı **giriş yapamaz** hale getirir.

**Kilitlenme korumaları** (`UserAdminManager`): admin kendi hesabını pasifleyemez/silemez ve
kendi admin yetkisini kaldıramaz; şirketin **son admin'i** yetkisiz bırakılamaz.

**Kalıcı silme korumalı**: `[User](ID)`'ye işaret eden `CreatedBy`/`LastModifiedBy` FK'ları
(hem `[User]` kendine, hem her dinamik tabloda `FK_{tablo}_CreatedBy`) nedeniyle **kayıt üretmiş
bir kullanıcı silinemez** — FK ihlali yakalanır, transaction geri alınır ve kullanıcı
pasiflemeye yönlendirilir. Veri ve denetim izi hiçbir durumda bozulmaz.

> Parola akışı: tenant tarafında e-posta altyapısı yoktur; admin başlangıç parolasını belirler
> ve kullanıcıya kendi kanalından iletir. Kullanıcı `/profile` üzerinden değiştirir.
> Yetki/pasifleme değişiklikleri kullanıcının **yeni JWT oturumunda** etkinleşir.

## Model İlişkileri (Publish · G1)

`/build/:typeName` ekranındaki **İlişkiler** sekmesinde, bir model yayınlanırken daha önce
yayınlanmış modellerle ilişkilendirilir. Sonuçta üretilen assembly'de navigation property'ler,
EF modelinde Fluent API konfigürasyonu, veritabanında FK/index/join tablosu oluşur.

**Desteklenen tipler:** OneToOne, OneToMany, ManyToOne, ManyToMany, SelfReference.
Inheritance desteklenmez.

**Üç bağımsız FK mekanizması bir arada çalışır** — yenisi eskileri değiştirmez:

| Mekanizma | Metadata | FK kolonu | Constraint adı |
|---|---|---|---|
| Alt-model ağacı | `PublishedTable.ParentTableId` | `{Parent}Id` | `FK_{tablo}_{parent}` |
| `lookup` kolon tipi | `PublishedTableMember.LookupTargetTable` | kolonun kendi adı | `FK_{tablo}_{kolon}` |
| **İlişki (yeni)** | `RelationshipDefinition` | property adından türetilir | `FK_{tablo}_{kolon}_**Rel**` |

`_Rel` son eki ad çakışmasını engeller; validator ilişki FK'sının eski mekanizmaların
kolonlarıyla çakışmasını reddeder.

**Kurallar:** ilişki derinliği en fazla **3** (kök = 0). Döngüsel ilişki yasaktır — cycle
kontrolü yalnızca *tanımlı* kenarlar üzerinde çalışır, ters property ayrı kenar sayılmaz
(`Customer.Orders ↔ Order.Customer` tek ilişkidir), `SelfReference` beyaz listededir.
Dolu bir tabloya `Required` (NOT NULL) FK eklenemez — publish öncesi engellenir.

**UI:** hedef model autocomplete'i yalnızca yayınlanmış modelleri önerir; her satırda derinlik
rozeti vardır; kaydetmeden önce `validate-graph` ile döngü/derinlik uyarısı gösterilir;
**Önizleme** diyaloğu oluşacak entity graph'ı (SVG), üretilecek C#'ı ve DDL'i assembly'e
yazmadan gösterir.

> Yayınlama akışı değişmez: ilişkiler `POST /Published/publish` çağrısına otomatik dahil olur.
> İlişkinin karşı tarafı da yeniden derlenir (Customer'a `Orders` eklenince Order tipi
> `CustomerId` + `Customer` navigation'ını kazanır).

## Parametreler Ekranı (G3)

`/parameters` (adminGuard) üç bağımsız sekme taşır. Tümü `/Parameter` controller'ına gider,
tenant **istemciden alınmaz** — her uç çağıran admin'in ambient tenant'ında çalışır.

### Yedekleme

Tenant kendi veritabanı yedeğinin zamanlamasını kurar. Kullanıcı cron yazmaz; sıklık seçer
(saatte bir / N saatte bir / her gün / N günde bir / haftada bir / ayda bir / özel) ve
`utils/cron-builder.ts` bunu 5 alanlı cron'a çevirir. Ekran kaydetmeden **sonraki 5 çalışmayı**
gösterir; kayıtlı cron `parseCron` ile forma geri döner, çözülemezse "Özel"e düşer (bilgi kaybı yok).

Zamanlama master DB'deki `ScheduledTask` satırında durur (migrasyon `master/023`); yedek alma
master bağlantısı + SQL Server servis hesabı gerektirdiği için tenant DB'sinde tutulmaz.

**Çalışma zinciri:** `SchedulerTick` (dakikada bir, `PeriodicWorker`) → vadesi geleni
`PlatformJob` kuyruğuna atar (`TenantId` + `ScheduledTaskId` ile) → `JobWorker` → `BackupJobHandler`
→ `IBackupService.RequestBackup(Type=Scheduled)` + saklama süresi dolmuş yedekleri temizler.
`SchedulerTick` **iş yapmaz**, yalnız tetikler: hata/yeniden deneme/park semantiği JobWorker'da tek yerde kalır.

> `ScheduledTask` tablosu 2023'ten beri boştu — DAL'ı ve worker'ı yoktu, bu yüzden
> `BackupType.Scheduled` hiç üretilmiyordu. Bu iş o boşluğu kapattı.
> Cron çözümleme `Core/Utilities/Scheduling/CronSchedule.cs` (dış paket yok); saat dilimi
> duyarlıdır ve DST boşluğuna denk gelen yerel saatleri atlar.

### E-posta

Tenant kendi SMTP'sini tanımlar; sistem mail göndereceğinde bunu kullanır. Ayarlar tenant
DB'sindeki `AppSetting` anahtar/değer tablosunda durur (migrasyon `015`) — master'daki
`PlatformConfig`'in tenant ikizi. Parola `ISecretProtector` ile şifrelenir, okurken `••••••`
maskelenir; **maskeli değer geri POST edilirse mevcut parola korunur** (yanlışlıkla silinmesin).

`ITenantEmailSender`/`TenantSmtpEmailSender` platformdaki `IEmailSender`'dan ayrıdır: o master
`PlatformConfig`'ten okur ve konsol davetleri atar. Tenant göndericisi yapılandırma eksikse
**sessiz no-op değil, açık hata** döner — "Test gönder"de yalancı başarı yanıltıcı olurdu.

### Abonelik

Planlar master'daki `Plan`/`PlanFeature`'dan okunur (yalnız `IsPublic` + `Active`), mevcut
abonelik `isCurrent` ile işaretlenir. Satın alma önce `IPaymentGateway.Charge`, sonra
`ISubscriptionService.ChangePlan` çağırır — tahsilat başarısızsa abonelik **hiç değişmez**.

`StubPaymentGateway` şimdilik her tahsilata başarı döner; Stripe entegrasyonu tek bir Autofac
kaydını değiştirmekten ibaret olacak (`Plan`'da henüz parasal alan yok, o yüzden UI fiyat göstermez).
`ChangePlan` iki yolu ayırır: aynı planda Trial/PastDue → satır yerinde `Active`'e çekilir
(deneme dönüşümü), farklı plan → eskisi `Cancelled`, yenisi `Active` (aktif tek abonelik kuralı).

## Yapay Zeka Modülü (G4)

`/ai` (adminGuard) — kullanıcı işini düz metinle anlatır, Claude karşılığında **model
şeması, rapor ve dashboard önerileri** üretir. Kullanıcı beğendiklerini **"İçeri Aktar"**
ile taslak olarak yazdırır, **"Hepsini Yayınla"** ile derletir.

### Güvenlik sözleşmesi — modelin yazma yetkisi YOKTUR

Claude'un tool çağrıları hiçbir yan etki üretmez; yalnızca tenant DB'sinde bir
`AiProposal` satırı oluşur. Şema/rapor/dashboard'ın gerçekten yazılması, kullanıcının
onayıyla ve **mevcut, izin denetimli uçlar** üzerinden `AiImportService` tarafından
yapılır. Yani AI'a ayrıcalıklı bir kanal açılmaz: aktarım, admin'in elle de
yapabileceği sıradan bir işlemdir. Prompt injection ya da halüsinasyon en kötü ihtimalle
reddedilecek bir öneri kartı üretir.

### Model ve API kuralları

`claude-sonnet-5` (tarih soneki yok). `AnthropicChatClient` çözümde Anthropic SDK'sına
bağımlı **tek dosyadır** — `TenantSmtpEmailSender`'ın MailKit'i sarmalamasıyla aynı desen.

- `Temperature`/`TopP`/`TopK` **kullanılmaz** — Sonnet 5'te varsayılan dışı değer 400 döner.
- `budget_tokens` **kaldırıldı**; derinlik `OutputConfig.Effort` ile (`ai.effort`, varsayılan `medium`).
- Adaptive thinking varsayılan olarak AÇIK ve `MaxTokens` düşünme + yanıtı **birlikte** sınırlar.
- `thinking.display` varsayılanı `omitted`; akışlı arayüzde uzun sessizlik gibi göründüğü
  için açıkça `Summarized` isteniyor.
- Son mesaj `Role.Assistant` olamaz (prefill kaldırıldı).
- `StopReason == "refusal"` **içerik okunmadan önce** kontrol edilir.

**Prompt cache:** render sırası `tools` → `system` → `messages`. Statik prompt (tüm
tenant'larda ortak) ve tenant bağlam bloğu ayrı breakpoint alır. `CoreLogicToolCatalog.All`
**sırası sabittir** — değişirse tüm cache düşer, yeni tool sona eklenir.

### Yapılandırma

Tek platform anahtarı; tenant kendi anahtarını giremez, plan kotasından harcar.
İki kaynak var, **PlatformConfig kazanır**:

```
master PlatformConfig (doluysa)          ← Platform Console → Yapılandırma
  └── boşsa → IConfiguration             ← User Secrets (dev) / ortam değişkeni (prod)
```

| PlatformConfig anahtarı | Yapılandırma yolu | Not |
|---|---|---|
| `ai.apiKey` | `Ai:ApiKey` | `IsSecret` — şifreli saklanır, okumada `••••••` |
| `ai.model` | `Ai:Model` | Varsayılan `claude-sonnet-5` |
| `ai.effort` | `Ai:Effort` | `low` / `medium` / `high` |

Geliştirmede en hızlısı (CreateDLL dizininde):
```bash
dotnet user-secrets set "Ai:ApiKey" "sk-ant-..."
```

Öncelik sırası bilinçli: konsoldan girilen değer ortam değişkenini **ezer**. Tersi
olsaydı operatör konsolda kaydeder, hiçbir şey değişmez ve sebebi görünmezdi.

> **Tenant migration'ı şart.** `AiConversation`/`AiMessage`/`AiProposal` tabloları
> `migrations/016_ai-sohbet.sql` ile gelir ve tenant migrasyonları **uygulama
> açılışında koşmaz** (master koşar, tenant koşmaz — asimetri kasıtlı). Platform
> Console → `operations/migrations` üzerinden uygulanır: ya **Koşu Başlat** ile
> elle, ya da aynı sayfadaki **otomatik yükseltme** cron zamanlamasıyla
> (varsayılan kapalı). Koşu artık HTTP isteğinde değil `PlatformJob` kuyruğunda
> yürür — istek hemen döner, koşu `Queued` → `Running` → `Completed` ilerler ve
> sayfa kendini yeniler. Yükseltilmemiş bir tenant'ta `/ai` ham SqlException
> yerine "modül bu şirkette kurulmamış" mesajı döner
> (`AiConversationManager.Guarded`, SQL hata 208).

### Kota

`EntitlementService`'in projedeki **ilk gerçek tüketicisi**: `Limit()`/`Can()` bugüne dek
tanımlıydı ama hiçbir yerden çağrılmıyordu.

```
Ön kontrol : Limit(tenant, ai_tokens_per_month)   → null ise deny-by-default
             kalan < 20.000 (Reserve)             → yeni istek başlatılmaz
Tüketim    : IUsageDal.TenantTotals (SQL SUM)     — IUsageMeter.Query DEĞİL (200 satır tavanı var)
Yazma      : IUsageMeter.Record(..., source:"ai") — MetricKey = PlanFeature anahtarıyla AYNI
```

`Reserve` payı tek bir isteğin kotayı aşmasını sınırlar; akış ortasında sert kesme yoktur.
Plan limitleri `migrations/master/024`'te seed edilir (free 100K, pro 1M, enterprise 5M —
008'den) ve Platform Console → Plan Detay'dan migration'sız değiştirilebilir.

### Akış (SSE)

`POST /Ai/chat` `text/event-stream` döner. Angular tarafında `HttpClient` yerine `fetch`
kullanılır (`EventSource` POST yapamaz, header ekleyemez) — bu yol **interceptor'ları
baypas eder**, bu yüzden `ai.service.ts` `Authorization` ve `Accept-Language` başlıklarını
kendisi ekler. Kota hatası akıştan ÖNCE kontrol edilir ki düzgün bir 400 dönebilsin.

### İçeri aktarma sırası — bağlayıcı

1. **İçeri Aktar** → yalnız modeller: dup kontrol → `addTable` → N× `addMember`
   (`concatMap`, sıralı) → ilişkiler (`getAllTables` ile `tableId` çözülür). Sonuç: `/drafts`.
   Düğümler **parent-first** sırada gider; `isNullable` → `isRequired` **ters çevrilir**.
2. **Hepsini Yayınla** → kök modelleri `publish` (alt ağaç birlikte) → raporlar `define`
   (dönen ID saklanır) → dashboard'lar (widget'lardaki rapor **adı** → ID).

Rapor tanımı backend'de model adına ve kolonlarına karşı doğrulandığı için model
yayınlanmadan rapor tanımlanamaz — bu yüzden iki ayrı buton var.

> `ReportService.define()` artık `DataResponseModel<number>` dönüyor (eskiden `ResponseModel`).
> Dashboard widget'ının ihtiyacı olan `reportDefinitionId` başka türlü elde edilemiyordu;
> ada göre sonradan eşleştirmek aynı adlı iki raporda yanlış hedefi seçerdi.
> `DashboardService.define()` zaten ID dönüyordu — ikisi simetrik hale geldi.

### Sistem promptu

`CreateDLL/Prompts/corelogic-system.md` — kod değil metin olarak durur, build'de çıktıya
kopyalanır (`WebAPI.csproj`), `AiPromptProvider` singleton olarak bir kez okur. Tip beyaz
listesi, ad kalıpları, derinlik sınırları, üç FK mekanizması, rapor/dashboard sözleşmesi
ve "yapamadıkların" bölümünü içerir. Her istekte ikinci bir sistem bloğu eklenir: tenant'ın
yayınlanmış modelleri, mevcut raporları ve **bu sohbette şimdiye dek önerilenler** — tool
blokları geçmişe geri yazılmadığı için modelin hafızası bu listedir.

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
npm test                        # Karma/Jasmine testleri
```

> `npm run serve:ssr:CoreLogicUI` script'i hâlâ `package.json`'da var ama artık sadece
> "SSR kaldirildi — artik kullanilmiyor" yazdırıp çıkıyor — gerçek bir SSR sunucusu çalıştırmaz.

### Yeni Component Ekleme
```bash
ng generate component components/<ad>
```
Sonra `src/app/app.routes.ts`'e route ekle. Component yapısı/signal/guard konvansiyonları için
`angular-standalone-component`, tasarım için `corelogic-design`, API entegrasyonu için
`angular-api-service` skillini kullan. Yeni ekran üretmek için `ui-builder` agent'ını çalıştır.

## CodeGraph

Bu repo CodeGraph ile indekslidir (`.codegraph/` mevcut, dosya izleyici daemon'u
ile otomatik senkron, MCP sunucusu yapılandırılmış). Kod konumlandırma/anlama/
düzenleme görevlerinde grep/find/Read'den **ÖNCE** `mcp__codegraph__codegraph_explore`
kullan — tek çağrıda ilgili sembollerin satır numaralı kaynak kodunu, çağrı
yollarını ve etki alanını (blast-radius) döner; onlarca grep+read turu yerine
genelde tek çağrı yeterli olur, token tüketimini ciddi azaltır.

## Konvansiyonlar

- **Standalone component'ler** — NgModule yok
- **SCSS** — tüm component stilleri `.scss`, `inlineStyleLanguage: scss`
- **Selector prefix** — `app` (örn. `app-form-build`)
- **Reactive Forms** — `FormBuilder` + `FormGroup`/`FormArray`
- **Yanıt tipleri** — `ResponseModel`, `ListResponseModel<T>` veya `DataResponseModel<T>`
- **Component state** — `signal()`/`computed()`/`effect()`; `BehaviorSubject` kullanılmaz
- **i18n** — hard-coded UI metni yerine `LanguageService.t('key')` (TS kodu) veya `'key' | t` pipe'ı (şablon) kullan; çeviri anahtarları `src/app/i18n/` altında alan dosyalarında tanımlanır.
  `src/app/i18n/translations.spec.ts` her anahtarın TR+EN karşılığını ve yer tutucu tutarlılığını doğrular — eksik anahtar testte patlar (aksi halde kullanıcı ekranda ham anahtar metnini görür).
- **Onay diyaloğu** — native `confirm()` KULLANMA; `shared/confirm-dialog` component'ini bağla (tasarım sistemi + tema + i18n uyumlu, test edilebilir)
- **Locale-duyarlı biçimlendirme** — sayı/tarih için `Intl.*Format`'ı sabit `'tr-TR'` ile kurma; `utils/locale-format.ts` üzerinden aktif dile göre al
- **Ardışık paneller** — `.panel`'in kendi `margin`'i YOK; birden çok panel render eden konteyneri `.flow` ile sarmala, yoksa kartlar yapışık görünür. Panelleri `grid/flex` + `gap` ile dizen konteynerlerde (`.widget-grid`, `.kpi-strip`, `.model-grid`, `.plan-grid`) kullanma
- **Sayfa başlığı** — her ekranın üstünde tek satır: `.page-header` içinde `<span class="eyebrow">` + sayfanın/modelin adı, sağda aksiyonlar. Büyük `h1` başlık ve açıklama paragrafı KULLANILMAZ (`.page-title`/`.page-subtitle` kaldırıldı)
- **Türkçe kod yorumları** — backend ile tutarlı; UI metinleri çeviri sistemi üzerinden gelir

## Bilinen Eksikler ve TODO'lar

1. **`environment.prod.ts` API URL'si** — hâlâ `http://localhost:5245` (gerçek prod URL değil), deployment'ta güncellenmeli
2. **Unit test kapsamı düşük** — kapsam `i18n/translations.spec.ts`, `shared/entity-graph/entity-graph.layout.spec.ts`, `utils/cron-builder.spec.ts` ve `utils/ai-import.mapper.spec.ts` ile genişletildi, ancak servis/component'lerin büyük kısmı hâlâ test edilmiyor
3. **SSR bağımlılık kalıntısı** — `package.json`'da `@angular/ssr`/`express`/`@types/express` hâlâ duruyor; SSR fiilen kaldırıldığı için temizlenebilir ama `isPlatformBrowser` guard'ları kasıtlı korunuyor (bkz. `angular-standalone-component` skill)
4. **Kalan native `confirm()` çağrıları** — `model-children`, `model-data`, `model-detail`, `role-detail`, `role-list` içinde 5 çağrı hâlâ native; `ConfirmDialogComponent`'e taşınmalı
5. **Backend controller boilerplate** — `WebAPI.Infrastructure.ApiControllerBase.Respond()` eklendi ve `ProfileController` + `PublishedModelController` + `ParameterController` bunu kullanıyor; kalan controller'lar hâlâ `result.Success ? Ok(result) : BadRequest(result)` satırını elle tekrarlıyor
6. **Ödeme sağlayıcısı stub** — `StubPaymentGateway` her tahsilata başarı dönüyor ve `Plan`'da fiyat/para birimi kolonu yok. Stripe için: `Plan`'a parasal alanlar + `IPaymentGateway`'in gerçek implementasyonu (abonelik akışı değişmez)
7. **Yedek geri yükleme yok** — yedek alma ve `RESTORE VERIFYONLY` doğrulaması var, ancak yedekten geri dönme ve yedek indirme ucu yok (platform tarafında da yoktu)
8. **Yedekleme senkron** — `BackupManager` yedeği HTTP isteği içinde alıyor; "Şimdi Yedek Al" büyük veritabanlarında isteği uzun süre bloklar (zamanlanmış yol kuyruktan geçtiği için etkilenmez)
9. **AI kotası tek istekte aşılabilir** — ön kontrol istek başında çalışır, akış ortasında sert kesme yok. `AiQuotaManager.Reserve` (20.000 token) aşımı sınırlar ama sıfırlamaz
10. **AI maliyet hesabı girdi/çıktı ayırmıyor** — `CostAnalyticsManager.cs` `ai_tokens_per_month` için tek birim fiyat (`0.000002`) kullanıyor; Sonnet 5 çıktısı girdisinden 5 kat pahalı olduğu için maliyet eksik hesaplanıyor
11. **AI mevcut kolonu değiştiremez** — platformda `updateMember` yolu yok (`onSaveEdit` diff'i yalnız kolon ADI üzerinden çalışır). Sistem promptu bunu açıkça yasaklıyor; kolon tipi değişimi için yeni kolon + veri taşıma gerekiyor
12. **`ai_tokens_per_month` anahtarı üç yerde tekrarlanıyor** — backend `FeatureKeys`, UI `FEATURE_KEY_ORDER`, konsol `FEATURE_KEYS`. Yeni bir plan özelliği eklenirse üçü birden güncellenmeli
13. **PlatformConfig sürümleme yok** — `PUT /api/platform/v1/config/{key}` eklendi (beyaz liste + sunucu tarafı `IsSecret` + maske koruması + audit), ancak değer geçmişi/geri alma tutulmuyor; audit yalnızca "kim ne zaman hangi anahtarı değiştirdi" diyor, eski değeri saklamıyor (bilinçli — sır sızdırmamak için)
14. **Data Protection anahtar halkası tek makinede** — `%PROGRAMDATA%\CoreLogic\dataprotection-keys` (veya `DataProtection:KeyPath`). Çok sunuculu dağıtımda bu klasör paylaşılmalı, yoksa bir sunucunun şifrelediğini diğeri çözemez. Yatay ölçeklemeden önce paylaşımlı depo (dosya paylaşımı/Key Vault) gerekir
