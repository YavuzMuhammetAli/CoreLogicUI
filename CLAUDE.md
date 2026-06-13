# CoreLogicUI — Angular Frontend for CoreLogic Platform

## Project Overview

CoreLogicUI is the Angular 18 frontend for the **CoreLogic** dynamic model publishing platform.
Backend: ASP.NET Core 8.0 Web API at `C:\CoreLogic\CoreLogic-master`, compiles C# entity
code at runtime via Roslyn and exposes dynamic CRUD endpoints.

Users can:
- Giriş yaparak uygulamaya erişmek (JWT tabanlı auth)
- Dinamik entity şeması tanımlamak (kolon adı, tipi, nullable)
- C# model kodu oluşturup backend'e göndermek (Roslyn derleme)
- Dinamik olarak oluşturulan tablolardaki kayıtları CRUD ile yönetmek
- Kayıtlı model listesini görüntülemek

## Tech Stack

| Bileşen | Teknoloji |
|---------|-----------|
| **Framework** | Angular 18.1 (standalone components) |
| **Dil** | TypeScript 5.5 |
| **Stil** | Özel token-tabanlı tasarım sistemi (SCSS) — Bootstrap runtime'da kullanılmaz |
| **Render** | Angular SSR (`@angular/ssr`, Express 4.x, prerender etkin) |
| **Formlar** | Angular Reactive Forms |
| **HTTP** | `HttpClient` (`withFetch()` + interceptor'lar) |
| **Test** | Karma + Jasmine |
| **Build** | Angular CLI 18 / `@angular-devkit/build-angular` |

> **Bootstrap notu:** `bootstrap` paketi `package.json`'da production bağımlılığı değildir;
> yalnızca `angular.json`'daki `test` target'ında kullanılır. Runtime build'de Bootstrap yoktur —
> uygulama tamamen özel CSS token sistemi kullanır (bkz. [Tasarım Sistemi](#tasarım-sistemi)).

## Proje Yapısı

```
CoreLogicUI-master/
├── angular.json                           # Angular CLI yapılandırması
├── package.json
├── tsconfig.json / tsconfig.app.json
├── server.ts                              # Express SSR giriş noktası
└── src/
    ├── index.html
    ├── main.ts                            # Tarayıcı bootstrap
    ├── main.server.ts                     # SSR bootstrap
    ├── styles.scss                        # Global tasarım token'ları ve baz stiller (465 satır)
    └── app/
        ├── app.component.ts               # Kök bileşen — RouterOutlet
        ├── app.routes.ts                  # Route tablosu (lazy + authGuard)
        ├── app.config.ts                  # Provider'lar: router, SSR, HttpClient, interceptor'lar
        ├── app.config.server.ts           # SSR-özel provider'lar
        ├── components/
        │   ├── login/                     # Giriş ekranı (public, JWT gönderir)
        │   ├── layout/                    # App shell (sidebar + topbar CSS Grid)
        │   ├── model-list/                # Kayıtlı model listesi
        │   ├── model-data/                # Dinamik tablo CRUD (inline modal)
        │   ├── form-build/                # Dinamik schema builder + C# önizleme
        │   └── database-proccess/         # Stub — henüz rota yok, implement edilmedi
        ├── services/
        │   ├── auth.service.ts            # /Auth login/register, JWT → localStorage
        │   ├── published-table.service.ts # /Published addTable, addMember
        │   ├── published-model.service.ts # /PublishedModel getall/get/add/update/delete
        │   ├── publish-model.service.ts   # /PublishModel — Roslyn derleme
        │   ├── database.service.ts        # /Database/createtable
        │   └── model-registry.service.ts  # localStorage tabanlı model kaydı (HTTP yok)
        ├── guards/
        │   └── auth.guard.ts              # JWT varlığını kontrol eder
        ├── interceptors/
        │   ├── auth.interceptor.ts        # Authorization: Bearer header ekler (SSR-safe)
        │   └── error.interceptor.ts       # HTTP hata yakalamak
        ├── environments/
        │   ├── environment.ts             # apiBaseUrl: 'https://localhost:7254'
        │   └── environment.prod.ts
        └── models/
            ├── responseModel.ts           # ResponseModel { success, message }
            └── responseModelList.ts       # ListResponseModel<T> extends ResponseModel { data }
```

## Routing

```
/login          → LoginComponent           (public, authGuard yok)
/               → LayoutComponent          (authGuard korumalı app shell)
  /             → redirect → /models
  /models       → ModelListComponent
  /models/:typeName → ModelDataComponent
  /build        → FormBuildComponent
**              → redirect → /login
```

Tüm lazy-loaded route'lar `loadComponent` ile yüklenir. Yeni protected route eklerken
`LayoutComponent`'in `children` dizisine ekle (authGuard otomatik uygulanır).

## HTTP Yapılandırması

`src/app/app.config.ts`:
```typescript
provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor]))
```

- **`provideHttpClient` zaten yapılandırılmış** — yeniden ekleme.
- `authInterceptor`: `localStorage('access_token')` JWT'yi alır, `Authorization: Bearer` header'ı ekler.
- `errorInterceptor`: HTTP hataları yakalar.

## Servisler

Tüm servisler `@Injectable({ providedIn: 'root' })`, ctor-injected `HttpClient`,
`environment.apiBaseUrl` üzerinden URL, `Observable<ResponseModel|ListResponseModel<T>>` döner.

| Servis | Endpoint |
|--------|----------|
| `AuthService` | `/Auth/login`, `/Auth/register` |
| `PublishedTableService` | `/Published/addTable`, `/Published/addMember` |
| `PublishedModelService` | `/PublishedModel/getall`, `get`, `add`, `update`, `delete` |
| `PublishModelService` | `/PublishModel` |
| `DatabaseService` | `/Database/createtable` |
| `ModelRegistryService` | HTTP yok — localStorage |

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
Backend `IDataResult<T>` → `{ Success, Message, Data }` ile eşleşir.

## Tasarım Sistemi

Uygulama Bootstrap değil, `src/styles.scss`'te tanımlı tam bir özel token-tabanlı
tasarım sistemi kullanır. Detaylar için: `.claude/skills/corelogic-design/SKILL.md`

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
npm test                        # Karma/Jasmine testleri
npm run serve:ssr:CoreLogicUI   # SSR üretim sunucusu
```

### Yeni Component Ekleme
```bash
ng generate component components/<ad>
```
Sonra `src/app/app.routes.ts`'e route ekle. Tasarım için `corelogic-design` skillini,
API entegrasyonu için `angular-api-service` skillini kullan.
Yeni ekran üretmek için `ui-builder` agent'ını çalıştır.

## Konvansiyonlar

- **Standalone component'ler** — NgModule yok
- **SCSS** — tüm component stilleri `.scss`, `inlineStyleLanguage: scss`
- **Selector prefix** — `app` (örn. `app-form-build`)
- **Reactive Forms** — `FormBuilder` + `FormGroup`/`FormArray`
- **Yanıt tipleri** — `ResponseModel` veya `ListResponseModel<T>`
- **Türkçe yorumlar ve mesajlar** — backend ile tutarlı

## Bilinen Eksikler ve TODO'lar

1. **`DatabaseProccessComponent` stub** — rota yok, implement edilmedi; `/Database` endpoint'lerini sarmalayacak
2. **Inter / IBM Plex Mono fontları** — `index.html`'de `<link>` ile yüklenmemiş; şu an `system-ui`'ye düşüyor
3. **`environment.prod.ts` API URL'si** — prod deployment'ta gerçek URL ile güncellenmeli
4. **Unit testler yok** — servisler için `*.spec.ts` dosyaları oluşturulmalı
5. **`CreatedBy`/`LastModifiedBy` backend'de 1 hardcoded** — JWT entegrasyonundan sonra gerçek kullanıcı ID'si gelecek
