---
name: angular-standalone-component
description: >
  CoreLogicUI'de yeni bir standalone component, guard veya servis eklerken MUTLAKA bu
  skill'i oku. Signal kullanımı, `inject()` deseni, lazy route kaydı ve SSR'ın bu projede
  artık FİİLEN KAPALI olduğu (ama bazı `isPlatformBrowser` kontrollerinin kasıtlı olarak
  bırakıldığı) gibi proje-özel ayrıntıları kapsar. API servis deseni için `angular-api-service`,
  görsel tasarım için `corelogic-design` skill'lerine bak — bu skill onları tekrar etmez.
---

# Angular Standalone Component Konvansiyonları

Bu skill `angular-api-service` (HTTP/servis deseni) ve `corelogic-design` (token/CSS) ile
**örtüşmez** — onlar zaten var, oraya gönderiyoruz. Burası component yapısı, signal kullanımı,
guard ve route kaydı içindir.

## ⚠️ Önce oku: SSR fiilen kapalı, ama `isPlatformBrowser` kontrolleri bilinçli korunuyor

Proje SSR ile kuruldu, sonradan tamamen kaldırıldı (kök `CLAUDE.md` bunu artık doğru
yansıtıyor). `server.ts`, `src/main.server.ts`, `src/app/app.config.server.ts` **mevcut değil**,
`src/` altında sadece `app/`, `environments/`, `index.html`, `main.ts` var. `package.json`'da
`@angular/ssr`/`express` bağımlılıkları hâlâ duruyor ama bu temizlenmemiş kalıntı — runtime'da
SSR çalışmıyor.

Buna rağmen `app.config.ts` ve component'lerde `isPlatformBrowser(platformId)` kontrolleri
**kasıtlı olarak korunuyor** — kod yorumunda açıkça yazıyor:

```typescript
// app.config.ts — gerçek yorum
// Tarayıcı dışında (artık olmasa da guard yapısını bozmamak için korundu)
if (!isPlatformBrowser(platformId)) return Promise.resolve();
```

**Pratik sonuç:** Yeni component yazarken `isPlatformBrowser` kontrollerini "artık gerek yok"
diye kaldırma — yapısal güvenlik ağı olarak bilinçli bırakılmış. Ama yeni bir SSR-özel kod
yolu da YAZMA (`TransferState`, `REQUEST`/`RESPONSE` injection token'ları vb.) — proje SSR
çalıştırmıyor, böyle bir kod hiçbir zaman tetiklenmez.

## Standalone Component Şablonu (gerçek örnek — `UserProfileComponent`)

```typescript
import { Component, OnInit, signal, inject, PLATFORM_ID, ElementRef, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [ReactiveFormsModule],            // sadece ihtiyaç duyulan modüller/component'ler
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.scss']
})
export class UserProfileComponent implements OnInit {
  @ViewChild('photoInput') photoInputRef!: ElementRef<HTMLInputElement>;

  // inject() — constructor injection DEĞİL, bu projenin standart deseni
  private readonly fb         = inject(FormBuilder);
  private readonly profileSvc = inject(UserProfileService);
  private readonly platformId = inject(PLATFORM_ID);

  // Signal — state için varsayılan, BehaviorSubject kullanma
  profile   = signal<UserProfile | null>(null);
  loading   = signal(true);
  loadError = signal('');
}
```

**Kurallar:**
- `standalone: true` her zaman, `NgModule` yok.
- `inject()` fonksiyonu tercih edilen DI yolu — constructor injection da çalışır ama
  mevcut component'lerin çoğu `inject()` kullanıyor, tutarlılık için onu izle.
- `imports` dizisine sadece gerçekten kullanılan şeyleri ekle (`ReactiveFormsModule`,
  başka standalone component'ler) — `CommonModule`'ü gereksiz import etme, Angular 18'de
  `@if`/`@for` yerleşik control flow için modül gerekmez.

## Signal Kullanımı — `BehaviorSubject` Değil

Component-local state için `signal<T>()` kullan. `computed()` türetilmiş state için,
`effect()` yan etkiler için. RxJS hâlâ HTTP servislerinde (`Observable` dönüşleri,
`angular-api-service` skill'ine bak) ve guard'larda kullanılıyor — signal'ler RxJS'i
**değiştirmiyor**, component-level UI state'i için tercih ediliyor.

```typescript
// PermissionService — signal + RxJS birlikte kullanım örneği
private readonly permissionsSignal = signal<UserPermissionSummary | null>(null);
isAdmin = computed(() => this.permissionsSignal()?.isAdmin ?? false);

loadMyPermissions(): Observable<UserPermissionSummary> {
  return this.http.get<UserPermissionSummary>(url).pipe(
    tap(p => this.permissionsSignal.set(p))      // HTTP sonucu signal'e yazılır
  );
}
```

Bu, **APP_INITIALIZER ile guard yarış durumu** çözümünün temelidir: `app.config.ts`'teki
`permissionInitializerFactory`, router etkinleşmeden önce `loadMyPermissions()`'ı çağırıp
signal'i doldurur — `adminGuard` gibi guard'lar `isAdmin()` sinyalini **senkron** okuyabilir.
Yeni bir admin-only veya izin-bağımlı route eklersen, guard'ının senkron sinyal okuduğundan
emin ol — `Observable`'a `subscribe` ederek async guard yazma, mevcut deseni boz.

## Route Kaydı — Lazy `loadComponent`, Guard Sırası Önemli

```typescript
// app.routes.ts — gerçek kalıp
{
  path: 'models/:typeName/new',          // "new" sabit segmenti :id PARAM'INDAN ÖNCE gelmeli
  canActivate: [modelPermissionGuard('create')],
  data: { mode: 'new' },
  loadComponent: () =>
    import('./components/model-detail/model-detail.component').then(m => m.ModelDetailComponent)
},
{
  path: 'models/:typeName/:id',
  canActivate: [modelPermissionGuard('read')],
  loadComponent: () =>
    import('./components/model-detail/model-detail.component').then(m => m.ModelDetailComponent)
}
```

**Kurallar:**
- Her zaman `loadComponent` ile lazy import — `component: XComponent` ile eager kayıt yok.
- Sabit segmentler (`new`, `edit`) parametreli segmentlerden (`:id`) ÖNCE tanımlanmalı,
  aksi halde Angular sabit string'i parametre olarak yakalar (`app.routes.ts`'teki yorumda
  iki kez vurgulanmış gerçek bir tuzak).
- Korumalı route'lar `LayoutComponent`'in `children` dizisine eklenir (üst `authGuard`
  otomatik miras alınır) — yeni admin-only sayfa için ayrıca `canActivate: [adminGuard]` ekle,
  model-bazlı izin gerekiyorsa `modelPermissionGuard('read'|'create'|...)` factory'sini kullan.

## Anti-Pattern'ler

- ❌ `HttpClientModule`'ü component `imports`'una eklemek — deprecated, `provideHttpClient()`
  zaten `app.config.ts`'te bir kez tanımlı (bkz. `angular-api-service` skill).
- ❌ `NgModule` bazlı yapı kurmak — proje %100 standalone.
- ❌ `document`/`window`'a `isPlatformBrowser()` kontrolü olmadan erişmek — SSR artık
  çalışmasa da bu kontroller kasıtlı korunuyor, yeni kodda da uygula.
- ❌ Component state için `BehaviorSubject` + `async` pipe kurmak — `signal()` kullan.
- ❌ Guard'da senkron sinyal yerine `Observable.subscribe` ile async kontrol yazmak —
  APP_INITIALIZER deseni bunu önlemek için var, bozma.
- ❌ Route'a `:id` segmentini sabit segmentten (`new`/`edit`) önce tanımlamak.

## Referans Dosyalar

| Dosya | Neyi Gösterir |
|-------|---------------|
| `src/app/components/user-profile/user-profile.component.ts` | Tam standalone + signal şablonu |
| `src/app/app.config.ts` | `APP_INITIALIZER` guard yarış durumu çözümü, `isPlatformBrowser` |
| `src/app/app.routes.ts` | Lazy route kaydı, segment sıralama tuzağı |
| `src/app/services/permission.service.ts` | Signal + RxJS birlikte kullanım |
| `angular-api-service` skill | HTTP servis deseni (bu skill'in kapsamı dışında) |
| `corelogic-design` skill | Tasarım token'ları, global CSS sınıfları (bu skill'in kapsamı dışında) |
