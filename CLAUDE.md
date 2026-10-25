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
- Görsel tasarımcıyla iş akışı kurmak (onay, görev, paralel, koşul, alan güncelle, bildirim, bekleme, bitiş), simüle etmek, yayınlamak; çalışan süreci şema üzerinde izlemek (admin, `/workflows`)
- Kendisine atanan görevleri görmek ve karar vermek (`/tasks`)
- Yayınlanmış bir modelin kayıt formunu (sekme/bölüm/12 kolonluk ızgara) ve liste kolonlarını (sıra/genişlik) sürükle-bırakla tasarlamak, taslak olarak kaydedip yayınlamak (admin, `/build/:typeName/screen`)

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
| **Test** | Karma + Jasmine — saf çekirdekler (`utils/`), interceptor/guard'lar, temel servisler ve tasarımcılar spec'li; component kapsamı seçici. Commit öncesi `npm run test:ci` |
| **Build** | Angular CLI 18 / `@angular-devkit/build-angular` |

> **Bootstrap notu:** Bootstrap projede **hiç kullanılmıyor** — ne `package.json`'da
> ne de `angular.json`'da (test target'ından da kaldırıldı). Uygulama tamamen özel CSS
> token sistemi kullanır (bkz. [Tasarım Sistemi](#tasarım-sistemi)).

> **SSR notu:** Proje başlangıçta `@angular/ssr` + Express ile kuruldu, sonradan SSR
> tamamen kaldırıldı. `server.ts`, `src/main.server.ts`, `src/app/app.config.server.ts`
> dosyaları **artık mevcut değil**; `@angular/ssr`, `@angular/platform-server`, `express`,
> `@types/express` bağımlılıkları ve `serve:ssr:CoreLogicUI` script'i de kaldırıldı. Koddaki
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
        │   ├── model-node/                 # Model ağacı/şema düğümü gösterimi
        │   ├── form-build/                # Model şema listesi + seçim ekranı (admin)
        │   ├── table-detail/               # Model şema builder/düzenleme ekranı (new + :typeName, admin)
        │   ├── draft-models/               # Taslak (henüz yayınlanmamış) modeller (admin)
        │   ├── deleted-models/             # Soft-delete edilmiş modeller — geri yükleme/kalıcı silme (admin)
        │   ├── deleted-drafts/             # Soft-delete edilmiş taslak modeller (admin)
        │   ├── deleted-reports/            # Soft-delete edilmiş raporlar (admin)
        │   ├── deleted-dashboards/         # Soft-delete edilmiş dashboardlar (admin)
        │   ├── audit-log/                  # Denetim kayıtları — kim/ne zaman/ne değişti, filtre + sayfalama (admin)
        │   ├── parameters/                 # Parametreler (admin) — 4 sekme: yedekleme, SMTP, bildirim şablonları, abonelik
        │   │   ├── backup/                 #   Cron kurucu + "sonraki 5 çalışma" önizlemesi + yedek geçmişi
        │   │   ├── mail/                   #   SMTP ayarları + bildirim linki/logo/varsayılan dil + test maili (parola maskeli)
        │   │   ├── templates/              #   Bildirim e-posta şablonları — tür×dil HTML editörü, sandbox iframe önizleme
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
        │   ├── workflow-list/               # Akış listesi — durdur/sürdür, dışa/içe aktar, plan kotası şeridi (admin)
        │   ├── workflow-build/              # Görsel tasarımcı (admin) — bkz. "İş Akışı Tasarımcısı"
        │   │   ├── designer/                #   Signal store (belge+geçmiş+seçim+kamera), saf komutlar, palet, sağ panel,
        │   │   │                            #   sorun paneli, simülasyon paneli, pano/seçim yardımcıları (spec'li)
        │   │   ├── editors/                 #   Düğüm düzenleyicileri: koşul, bitiş, alan güncelle, bildirim, bekleme
        │   │   └── step-dialog/             #   Adım pop-up'ı ("Tüm ayarlar…"; telefonda tek düzenleme yolu)
        │   ├── workflow-versions/           # Sürüm geçmişi + "Öncekiyle karşılaştır" (şema üstünde fark) (admin)
        │   ├── workflow-instances/          # Süreç listesi — durum/akış/model/"hata bekleyenler" filtresi, sayfalı (admin)
        │   ├── workflow-instance/           # Süreç detayı — şema + yol katmanı, olay bandı (Yeniden dene/Adımı atla)
        │   ├── deleted-workflows/           # Silinen akışlar (admin)
        │   ├── my-tasks/ · task-detail/     # Görevlerim ve görev karar ekranı (authGuard)
        │   ├── screen-designer/             # Ekran Tasarımı (admin) — bkz. "Ekran Tasarımı"
        │   │   └── designer/                #   Form tasarımcısı (palet · tuval · özellikler), liste tasarımcısı,
        │   │                                #   depo (geri al/yinele), saf komutlar, isabet hesabı, kısayollar (spec'li)
        │   └── shared/
        │       ├── column-visibility/      # Admin-managed model kolon görünürlüğü (liste/detay/alt-model sekmeleri)
        │       ├── confirm-dialog/         # Onay diyaloğu — native confirm() YERİNE her zaman bu kullanılır
        │       ├── record-field/           # Kayıt formunun TEK alanı (etiket süsleri, tipe göre kontrol, dosya, hata) — kayıt sayfası, pop-up ve tasarımcı ortak
        │       ├── record-layout/          # Alanları yayındaki ekran tasarımına göre çizer (sekme/bölüm/12 kolon); tasarım yoksa eski otomatik ızgara
        │       ├── deleted-list/           # "Silinenler" ekranlarının ortak gövdesi (model/taslak/rapor/dashboard)
        │       ├── datatype-help/          # Veri tipi + ilişki kılavuz diyaloğu (içerik: datatype-help.data.ts)
        │       ├── help-hint/              # Alan yanındaki küçük yardım baloncuğu
        │       ├── lookup-picker/          # Lookup kolonu için sayfalı/aranabilir kayıt seçici
        │       ├── record-form-dialog/     # İç içe kayıt ekleme/düzenleme pop-up'ı (model-detail kullanır)
        │       ├── model-autocomplete/     # Model adı seçimi (combobox, klavye + ARIA) — ilişki hedefi seçiminde
        │       ├── entity-graph/           # Entity ilişki grafiği (inline SVG; geometri entity-graph.layout.ts'te, saf + test edilebilir)
        │       ├── workflow-canvas/        # Akış tuvali — HTML düğüm + SVG dik açılı kenar, kamera, sürükle/bağla/lasso,
        │       │                           #   klavye, sağ tık menüsü, `overlay` girdisi (simülasyon / süreç / sürüm farkı)
        │       ├── task-decision-form/     # Görev karar formu (ek alanlar + açıklama + Onayla/Reddet, ara onay diyaloğu YOK) — görev detayı; şema yardımcıları task-form.util.ts
        │       ├── task-action-dialog/     # Kayıt ekranındaki adım butonunun diyaloğu (ek karar alanları / red açıklaması)
        │       ├── workflow-view-dialog/   # "Akışı görüntüle" — yalnız ilerlenen yol + düğüm ipucu (kim onayladı / bekliyor)
        │       └── notification-bell/      # Topbar zili — okunmamış rozeti (30 sn poll) + bildirim listesi (/UserNotification)
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
        │   ├── model-label.service.ts           # HTTP yok — tablo adı → model etiketi (RecordMetadataService.models$ önbelleği) + `modelLabel` pipe'ı
        │   ├── lookup-label.service.ts          # Lookup id → etiket çözümleme (önbellekli)
        │   ├── record-metadata.service.ts       # Kayıt formu meta verisi (kolon kuralları/şema)
        │   ├── theme.service.ts                 # Açık/koyu tema tercihini yönetir (localStorage)
        │   ├── workflow.service.ts              # /Workflow — tanım CRUD, validate, simulate, publish, new-version,
        │   │                                    #   setEnabled, usage (kota), capabilities (Bekleme → 022)
        │   ├── screen-layout.service.ts         # /ModelScreenLayout — ekran tasarımı (published yardımcı istek; state/saveDraft/publish/discardDraft/reset admin)
        │   ├── workflow-task.service.ts         # /WorkflowTask + /WorkflowInstance — görevler, süreçler (list sayfalı),
        │   │                                    #   rollback, skipStep, cancel, verifyChain
        │   ├── notification.service.ts          # Global toast/uyarı bildirimleri (guard'lar dahil)
        │   └── user-notification.service.ts     # /UserNotification — kalıcı uygulama içi bildirimler (zil); toast DEĞİL
        ├── utils/
        │   ├── change-detection.ts              # markDirty(cdr) — OnPush'ta asenkron veri sonrası CD tetikler
        │   ├── cron-builder.ts                  # Saf: sıklık seçimi ↔ cron ifadesi + sonraki koşu önizlemesi (spec'li)
        │   ├── ai-import.mapper.ts              # Saf: AI önerisi → servis payload'ı (düzleştirme/doğrulama/ad→ID, spec'li)
        │   ├── identifier.ts                    # Model/alan adı: etiket → ad üretimi (Türkçe harf), ad doğrulayıcıları, LabelNameSync (spec'li)
        │   ├── locale-format.ts                 # Aktif dile göre sayı/tarih biçimlendirme (sabit 'tr-TR' KULLANMA)
        │   ├── pagination.ts                    # Saf: sayfalama penceresi (pageWindow, en fazla 5 düğme, spec'li)
        │   ├── download.ts                      # downloadBlob / downloadText (rapor dışa aktarımı, akış paketi)
        │   ├── report-column-label.ts           # Saf: rapor oluşturucu önizlemesinin kolon başlığı (çalışan raporda başlık sunucudan, spec'li)
        │   ├── design-history.ts                # Geri al/yinele geçmişi (generic, 600 ms birleştirme) — akış ve ekran tasarımcısı ortak
        │   ├── record-field/                    # isColumnRequired/mustStayVisible (zorunluluğun tek karar noktası), alan hata metni
        │   ├── screen-layout/                   # Ekran tasarımı çekirdeği, SAF + spec'li: belge tipleri, backend'le ORTAK doğrulama
        │   │                                    #   (screen-layout.vectors.json), parse/normalize, form planı, duyarlı kademe, liste kolonları, ilk taslak
        │   ├── workflow/                        # Akış çekirdeği, SAF + spec'li: exits (port sözlüğü — backend WorkflowExits
        │   │                                    #   ikizi), node-types (katalog), step-summary, overlay + runtime.overlay,
        │   │                                    #   diff (sürüm farkı), package (dışa/içe aktarım), templates (hazır şablonlar)
        │   └── auto-value/                      # Otomatik değer: formül dili (expression.ts), planlayıcı (auto-value.ts),
        │                                        #   form bağlayıcısı (auto-value-form.ts) + backend'le ORTAK vektörler (spec'li)
        ├── guards/
        │   ├── auth.guard.ts                  # JWT varlığını kontrol eder
        │   ├── admin.guard.ts                  # Yalnızca admin — PermissionService.ensureLoaded() + isAdmin()
        │   ├── model-permission.guard.ts       # Factory: modelPermissionGuard('read'|'create'|'update'|'delete')
        │   └── unsaved-changes.guard.ts        # canDeactivate — kaydedilmemiş tasarımdan ayrılırken onay diyaloğu
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
        │   ├── notification.i18n.ts           # Topbar bildirim zili (notification.kind.* = backend WorkflowNotifyKinds)
        │   ├── screen.i18n.ts                 # Ekran tasarımı (screen.* — layout.* app shell'e ait); screen.issue.{kod} doğrulama metinleri
        │   └── shared.i18n.ts                 # Paylaşılan diyalog metinleri
        ├── pipes/
        │   ├── translate.pipe.ts              # TranslatePipe — şablonlarda `{{ 'key' | t }}` şeklinde kullanılır
        │   └── model-label.pipe.ts            # ModelLabelPipe — `{{ modelName | modelLabel }}`: tablo adı yerine model etiketi (impure)
        ├── environments/
        │   ├── environment.ts                  # apiBaseUrl: 'https://localhost:7254'
        │   └── environment.prod.ts             # apiBaseUrl: '/api' — göreli, nginx aynı origin'den backend'e iletir
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
            ├── ai.model.ts                       # Sohbet/mesaj/öneri tipleri, öneri payload şekilleri, SSE olay union'ı
            └── screen-layout.model.ts            # /ModelScreenLayout DTO'ları (yerleşim API'de ham JSON metni)
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
  /build/:typeName/screen   → ScreenDesignerComponent        (adminGuard, canDeactivate: unsavedChangesGuard; ?view=list)
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
  /parameters               → ParametersComponent             (adminGuard — yedekleme/e-posta/bildirim şablonları/abonelik)
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
  /tasks                    → MyTasksComponent                 (authGuard yeterli — Görevlerim)
  /tasks/:id                → TaskDetailComponent              (görev ataması/okuma izni sunucuda denetlenir)
  /workflows                → WorkflowListComponent            (adminGuard)
  /workflows/new            → WorkflowBuildComponent           (adminGuard, canDeactivate: unsavedChangesGuard)
  /workflows/deleted        → DeletedWorkflowsComponent        (adminGuard) ⚠️ sabit segmentler ":id"den önce
  /workflows/instances      → WorkflowInstancesComponent       (adminGuard — süreç listesi)
  /workflows/instances/:id  → WorkflowInstanceComponent        (guard YOK — erişim sunucuda IWorkflowAccessPolicy)
  /workflows/versions/:code → WorkflowVersionsComponent        (adminGuard)
  /workflows/:id/edit       → WorkflowBuildComponent           (adminGuard, canDeactivate: unsavedChangesGuard)
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
  Yalnız dil kodu gider (`en`/`tr`); backend `Core/Utilities/Localization/AppCultures` bunu desteklenen
  kültüre (`en-US`/`tr-TR`) çevirir — ASP.NET'in varsayılan sağlayıcısı `en`'i `en-US` ile eşleştirmiyordu.
- `errorInterceptor`: HTTP hataları yakalar. 401 → `/login`, 403 → `/models` yönlendirmesi yapar.
  **Yardımcı istekler** (sayfanın asıl verisi olmayan, başarısız olunca sessizce düşebilen:
  `loadAssembly`, form kuralları, lookup seçenek/etiketleri) `SKIP_FORBIDDEN_REDIRECT`
  context token'ını taşır; yoksa admin'e özel ya da okuma izni olmayan bir uca giden
  istek kullanıcıyı bulunduğu sayfadan koparır (admin olmayan kullanıcının açılış
  dashboard'unu ve kayıt ekranını bozan hata buydu).
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
| `PublishedModelService` | `/PublishedModel/getall`, `get`, `add`, `update`, `delete`, `schema` (kayıt formu kuralları — Read izni yeter; admin'e özel `/Published/getTable`'ın form ikizi) |
| `PublishModelService` | `/PublishModel` — Roslyn derleme |
| `DatabaseService` | `/Database/createtable`, `/Database/checkdatabase` |
| `PermissionService` | `/Permission` — kendi izin durumu, signal (`isAdmin()`, `can()`), APP_INITIALIZER ile önyüklenir |
| `PermissionAdminService` | `/Permission` — admin: kullanıcı bazlı izin atama |
| `RoleAdminService` | `/Role` — RBAC rol CRUD, izin/üyelik yönetimi |
| `UserProfileService` | `/Profile` — me/update/change-password/upload-photo/sil + `language` (bildirim e-postası dili; layout açılışta ve TR/EN değişiminde yazar) |
| `ModelColumnSettingService` | `/ModelColumnSetting` — get/set kolon görünürlüğü |
| `ReportService` | `/Report` — define/update/list/run/export (excel/pdf). Sonuç kolonu başlığı `columns[].label` sunucuda, istek dilinde üretilir ("Toplam Net Tutar", "Kayıt sayısı", kolon etiketi — `ReportingManager.ApplyColumnLabels`); ekran, dashboard, grafik ve Excel/PDF aynı başlığı gösterir, satır anahtarı `name` kalır |
| `DashboardService` | `/Dashboard` — define/get/list + soft-delete/restore |
| `AuditLogService` | `/AuditLog` — filtrelenmiş denetim kayıtları (admin-only) |
| `UserAdminService` | `/User` — getall/create/update/setActive/resetPassword/setAdmin/delete (admin-only) |
| `RelationshipService` | `/publish/models/{id}/relationships` (GET/POST/PUT/DELETE), `/validate-graph`, `/preview` |
| `PublishedTableService` (otomatik değer) | `addMember` (+ `autoValueTrigger/autoValueExpression/isReadOnly`), `setMemberAutoValue` (JSON gövde) — `addMember` artık options nesnesi alır |
| `PublishedTableService` (kayıtlı kolon) | `updateMemberMetadata` (JSON gövde, TAM değiştirme) — etiket, açıklama, zorunluluk, kurallar, dosya sınırı, lookup gösterim kolonu; gövde `utils/column-rules.ts` `toMemberMetadataUpdate` ile kurulur |
| `ParameterService` | `/Parameter` — `backup/schedule`, `backup/history`, `backup/run`, `backup/{id}/download-link`, `backup/{id}/restore`, `backup/restore/{id}` + `/active`, `mail`, `mail/test`, `mail/templates/{kind}` (+ `/preview`, `/test`), `subscription/*` (admin-only) |
| `AiService` | `/Ai` — `conversations`, `chat` (SSE), `proposals/{id}/status`, `usage` (admin-only) |
| `AiImportService` | Kendi ucu YOK — AI önerilerini `PublishedTableService`/`RelationshipService`/`ReportService`/`DashboardService` üzerinden aktarır |
| `LanguageService` | HTTP yok — TR/EN dil tercihi, `localStorage`, `t()` metodu + `TranslatePipe` |
| `ModelLabelService` | HTTP yok — yalnız model ADI taşıyan ekranlarda (akış/süreç/görev listeleri, rapor rozetleri) tablo adını etikete çevirir; `modelLabel` pipe'ı bunu kullanır. Model listesini zaten çeken ekranlar `model.label \|\| model.typeName` yazar |
| `ModelUsageService` | HTTP yok — model kullanım özeti: hangi raporlar/dashboardlar bu modeli kullanıyor |
| `ThemeService` | HTTP yok — açık/koyu tema tercihi, `localStorage` |
| `NotificationService` | HTTP yok — global toast/uyarı, guard'lar dahil kullanılır |
| `ScreenLayoutService` | `/ModelScreenLayout` — `published` (kayıt ekranları; yardımcı istek, 403 yerine boş döner), `state`/`saveDraft`/`publish`/`discardDraft`/`reset` (admin). Yayındaki yerleşimi ekranlar `RecordMetadataService.formLayout$/listLayout$` ile okur (5 dk önbellek, `invalidateLayout`) |
| `UserNotificationService` | `/UserNotification` — `my`, `unreadCount`, `markRead`, `markAllRead` (kullanıcı kendi bildirimleri; satırları backend `InAppNotificationChannel` yazar, tablo tenant migrasyonu `018`) |

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
- Form: `.field` / `.input` / `.field-error` / `.field-help` / `.checkbox-label` / `.field-row` / `.field-head` / `.field--full` (yan yana alanlar)
- Tablo: `.table-wrapper` (yatay kaydırma kabı) > `.data-table` / `.td-actions` / `.td-muted` / `.row-link` (satırın ad bağlantısı) / `.select-hit` (satır seçim kutusu etiketi)
- Sayfalama: `.table-footer` > `.pagination` / `.page-btn` / `.page-ellipsis` / `.page-size-selector` — pencere hesabı `utils/pagination.ts` (`pageWindow`)
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

`/parameters` (adminGuard) dört bağımsız sekme taşır (bildirim şablonları: aşağıda
[Bildirim E-postaları](#bildirim-e-postaları)). Tümü `/Parameter` controller'ına gider,
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

**"Şimdi Yedek Al" kuyruktan geçer** (`IBackupService.QueueBackup`): satır `Queued` yazılır, aynı
`tenant.backup` işi `BackupId` ile kuyruğa atılır ve istek **hemen** yedeğin kimliğiyle döner; iş satırı
sahiplenir (`TryClaim` — yeniden teslimde kopya koşu yok) ve `Running` → `Completed/Failed` ilerletir.
Ekran geçmişi `Queued/Running` satır kaldıkça 3 sn'de bir yoklar. Kurallar: tenant başına tek aktif yedek
(`TryInsertActive`, `UPDLOCK, HOLDLOCK`); JobWorker konsoldan durdurulmuşsa istek açık mesajla reddedilir;
`Running` satır 30 sn'de bir canlılık damgası (`HeartbeatAt`) yazar, 10 dk damgasız kalan ya da 6 saat
kuyrukta bekleyen satır liste açılırken `Failed`'a çekilir (süreç ortada öldü). Dosya adı
`{Db}_{yyyyMMddHHmmssfff}_{id}.bak` — aynı saniyedeki iki yedek birbirini ezmez. Konsolun "Yedek al"ı da aynı yoldan.

**Saklama:** `ExpiresAt = tamamlanma + gün` (istekte verilmezse zamanlamadaki gün, o da yoksa 30; 0 = süresiz)
ve temizlik yalnız `ExpiresAt`'e bakar — elle, zamanlanmış, migrasyon/geri yükleme öncesi yedekler aynı
ölçüte tabidir. **Şema sürümü:** her yedek `DatabaseVersion`'ı (master `Tenant.DatabaseVersion`) yazar;
yedek sırasında sürüm değiştiyse boş kalır. Migrasyon **`master/030`** kolonları ekler ve eski yedeklerin
sürümünü (migrasyon kalemlerinden) doldurur — geri yükleme buna dayanır.

**İndirme:** "İndir" `POST backup/{id}/download-link` ile 2 dakikalık imzalı bağlantı alır
(`IDataProtector`, tenant + yedek kimliğine bağlı) ve tarayıcı onu doğrudan açar — dosya gigabaytlarca
olabileceğinden blob olarak belleğe alınmaz, yetki başlıkta değil token'dadır (`GET backup/download?token=`
anonim, Range destekli).

**Geri yükleme** (`backup-restore-dialog`, master **031**): şirket kodu aynen yazılır + parola istenir;
sunucu `tenant.restore` işini kuyruğa alır, diyalog fazları 2 sn'de bir yoklar (yan DB'ye açma →
güvenlik yedeği → takas → şema yükseltme → model/kullanıcı eşitleme → tamamlama). Canlı DB'nin üzerine
RESTORE yapılmaz; takastan önceki her hata canlıya dokunmaz. İsteyen admin o yedekte etkin yönetici
değilse iş takastan önce iptal edilir (kendini kilitleme). Takas sırasında tenant'ın istekleri
`503 {code: tenant_maintenance}` alır (`errorInterceptor` uyarı gösterir, oturumu korur). Bitince
herkesin oturumu geçersizdir (`401 {code: session_invalidated}` → `/login?reason=tenant_restored`);
diyalog uzlaştırma özetini (kullanıcılar: eşitlendi/yeniden açıldı/kaldırıldı, başka şirkette kayıtlı
e-postalar) gösterip yeniden girişe yollar. Geri yükleme `PreRestore` yedeği geri yüklenerek geri alınır.
Uygunluk sunucuda (`canRestore` / `restoreBlockedReason`): tamamlanmış, dosyası duran, şema sürümü bilinen
ve sunucudan yeni olmayan yedek — sürümü bilinmeyen eski yedek bilinçli olarak geri yüklenmez
(migrasyonlar iki kez koşarsa 012 tarihleri kaydırır).

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
abonelik `isCurrent` ile işaretlenir. Özellikler backend `MetricCatalog` sırasıyla, sunucuda isteğin
dilinde üretilmiş `label`/`unitLabel` ile gelir — UI özellik anahtarı listesi ya da etiket çevirisi
**tutmaz** (önceki `FEATURE_KEY_ORDER` iki iş akışı anahtarını bilmiyordu); sekme TR/EN değişince planları yeniden ister. Satın alma önce `IPaymentGateway.Charge`, sonra
`ISubscriptionService.ChangePlan` çağırır — tahsilat başarısızsa abonelik **hiç değişmez**.

`StubPaymentGateway` şimdilik her tahsilata başarı döner; Stripe entegrasyonu tek bir Autofac
kaydını değiştirmekten ibaret olacak (`Plan`'da henüz parasal alan yok, o yüzden UI fiyat göstermez).
`ChangePlan` iki yolu ayırır: aynı planda Trial/PastDue → satır yerinde `Active`'e çekilir
(deneme dönüşümü), farklı plan → eskisi `Cancelled`, yenisi `Active` (aktif tek abonelik kuralı).

## Bildirim E-postaları

Akış bildirimleri (zil) aynı zamanda kullanıcının **kayıtlı e-postasına** HTML olarak gider.
E-postası boş/bozuk ya da pasif (`Status=false`) kullanıcıya mail **gönderilmez** (zil bildirimi
yine düşer). SMTP kapalıysa e-posta işi hiç açılmaz.

| Tür | Ne zaman | Alıcı |
|---|---|---|
| `TaskAssigned` | Görev açıldı **veya yeniden atandı** | Görevli / rolün aktif üyeleri |
| `TaskEscalated` / `TaskExpired` | SLA (WorkflowWorker) | Görevli / rol üyeleri |
| `WorkflowCompleted` / `WorkflowRejected` | Süreç terminal duruma geçti | `StartedBy`, yoksa kaydın `CreatedBy`'ı |

**Akış:** `workflow.notify` işi → kanallar (zil, webhook, e-posta). E-posta kanalı maili
kendisi GÖNDERMEZ; e-postası olan her alıcı için ayrı `workflow.notify.email` işi açar
(`WorkflowEmailJobHandler`) — yeniden deneme alıcı başına izole kalır, bozuk bir adres
diğerlerini engellemez. Süreç bildirimi, onay transaction'ı geri alındıysa (instance terminal
değilse) gönderilmez (`NotificationValues.StillApplies`).

**Şablonlar** (`Business/Notifications/`): gömülü kurumsal iskelet `Templates/layout.html`
(EmbeddedResource) + `DefaultNotificationTemplates` tür×dil metinleri. Admin `/parameters` →
Bildirim Şablonları'ndan tür+dil başına kendi konu/HTML'ini yazar; `AppSetting`'te
`mail.tpl.{kind}.{lang}.subject|html` olarak durur (migrasyon yok), "Varsayılana Dön" siler.
Sözdizimi Mustache alt kümesi: `{{ad}}` (değer **HTML-encode**), `{{#ad}}…{{/ad}}` (doluysa),
`{{^ad}}…{{/ad}}` (boşsa). Yer tutucu listesi KAPALI (`NotificationPlaceholders`) — bilinmeyen
ad ya da kapanmamış bölüm kayıtta reddedilir. Önizleme sunucuda render edilir; UI onu
`<iframe sandbox="">` + `bypassSecurityTrustHtml` ile gösterir (projedeki tek iframe).

**Dil sırası:** kullanıcı tercihi (`UserPreference`, migrasyon **`019`**) → `mail.defaultLanguage`
→ `tr`. Tercihi layout yazar (açılışta + TR/EN değişiminde, `PUT /Profile/language`). 019
kurulmamış tenant'ta okuma SQL 208'i yutup varsayılana düşer — e-posta yine gider.

**Bağlantı:** `mail.appUrl` (E-posta sekmesi) + `/tasks/{id}` ya da `/models/{tip}/{id}`.
Boşsa mailde buton çıkmaz (göreli link mail istemcisinde çalışmaz). `mail.logoUrl` opsiyonel.

> `User.Email` EF'te `IsRequired(false)` olarak eşlendi: Core'da Nullable açık ve NULL
> e-postalı tek bir satır, onu içeren her `User` sorgusunu `SqlNullValueException` ile
> düşürüyordu (rol üyelerine bildirim dahil — uçtan uca testte yakalandı).

## Form Tabanlı İş Akışı

Bir akış bir modele (forma) bağlanır; kayıt ekranında (`/models/:type/:id`) yürür.
Akış **`manual`** tetiklenir: formu oluşturan kişi ya yalnız **Kaydet**'e basar ya da
**"{Akış} Başlat"** ile kaydedip başlatır. Sonra sırası gelen kişi, Kaydet'in yanında
**adımın adını taşıyan butonu** görür, kendi alanlarını doldurup ilerletir.

- **Adımın kayıt alanları** (`form.recordFields: [{column, isRequired}]`) tasarımcıdaki adım
  pop-up'ında seçilir; buton etiketleri (`approveLabel`/`rejectLabel`) ve `allowReject` da
  orada. Ayarlar görev açılırken `WorkflowTask.FormSchemaJson`'a kopyalanır — **migration yok**.
  Serbest `form.fields` hâlâ var ("Ek karar alanları"): değerleri kayda değil süreç bağlamına gider.
- **Kilit:** tanımı kayıt alanı kullanan bir akış koşarken kayıt kilitlidir. Yalnız bekleyen
  görevin sahibi, yalnız o adımın kolonlarını düzenler; admin aşar. Kayıt alanı kullanmayan
  eski akışlar kilitlemez. Tek karar noktası backend `IWorkflowRecordGate` —
  `PublishedModelManager.Update/Delete/AddTree` ve `/WorkflowInstance/recordState` aynı kapıdan
  geçer. Alt model satırları üst kaydın kilidini miras alır.
- **Atomik onay:** `POST /WorkflowTask/complete`'e `recordValuesJson` eklendi; alan yazımı + görev
  kapanışı + akış ilerlemesi tek `TransactionScope`'ta (ReadCommitted). Kapsam içinde iki bağlantı
  aynı anda açık tutulmamalı ve master'a yazılmamalı (bildirim kuyruğu `Suppress` ile yazılır).
- **Ara kaydetme:** kilitli kayıtta görevlinin Kaydet'i `POST /WorkflowTask/saveRecord`'a gider
  (yetki görev atamasından; yalnız adım kolonları, yalnız gönderilen anahtarlar).
- **Başlatma yetkisi:** admin, model Update izni **ya da kaydın sahibi** (`CreatedBy`).
  Sıradan kullanıcı akışları `GET /WorkflowInstance/startable` ile görür (`/Workflow/list` admin-only).
- Akışın kendi yazımları `WorkflowTriggerSuppression` ile outbox üretmez — aksi halde süreç
  bitince aynı kayıt için yeni bir onUpdate akışı başlardı.
- Görevlinin kaydı açabilmesi için modelde **Read** izni gerekir (görev tabanlı okuma izni yok).
- **Akışı görüntüle:** kayıt başlığındaki düğme (`shared/workflow-view-dialog`) kaydın en yeni
  sürecini **yalnız ilerlediği yere kadar** çizer: tuvalin `pathOnly` girdisi ulaşılmayan adımı ve
  izlenmeyen kenarı hiç çizmez (konumlar tüm grafiğin yerleşiminden gelir). Düğüm üstünde (telefonda
  dokununca) kim onayladı/reddetti + açıklama, bekleyen adımda kişi ya da rol + rolün aktif üyeleri
  (`utils/workflow/workflow-step-history.ts`). Adlar `/WorkflowInstance/get`'te sunucudan gelir
  (`assignedUserName`, `completedByName`, `candidates`, `startedByName` — `IWorkflowPeopleResolver`).
- **Görme izni = yeni model izni `ViewWorkflow` (bit 64)**, kullanıcı/rol izin ekranlarında
  "Akışı görüntüle". `IWorkflowAccessPolicy`: admin · başlatan · görevli/karar veren her zaman görür;
  diğerleri **Read + ViewWorkflow** ister (yalnız Read artık süreç/görev okuma uçlarını AÇMAZ —
  kayıt başlığındaki "Akışı görüntüle" düğmesi dahil; kaydın altındaki eski "Süreç" kartı kaldırıldı). `recordState` (kilit/adım düğmeleri) Read ile çalışmaya devam eder.
  `ModelPermissionDto` UI'ın okuduğu `canOwnOnly` adını da yazar (önceden yalnız `ownRecordsOnly`
  gidiyordu; izin ekranında kutu hep boş gelip kayıtta bit siliniyordu).

## İş Akışı Tasarımcısı ve Düğüm Tipleri

`/workflows/:id/edit` — palet (sol) · tuval (orta) · özellik paneli (sağ). Telefonda tuval yok:
Adımlar listesi + pop-up düzenleyiciler.

**Tek doğruluk kaynağı** tasarım belgesidir (`designer/workflow-designer.store.ts`, signal):
`{ meta, conditions, graph, extras }` — `extras` tanımın bilmediğimiz alanlarını taşır, kayıtta aynen
geri yazılır. Değişiklikler saf komutlarla (`workflow-design.commands.ts`), geçmiş 600 ms birleştirmeli
(Ctrl+Z/Y). Kaydet sayfada kalır; iki admin aynı taslakta → `LastModifiedOn` iyimser kilidi. Taslak
hatalarıyla kaydedilir, yayın doğrulamayı zorlar. Canlı doğrulama konumdan bağımsız anahtar üzerinden.

| Düğüm (`type`) | Çıkışlar (port) | Ne yapar |
|---|---|---|
| Onay `approval` | `approve` / `reject` | Görev açar; boş hedef → tamamlandı/reddedildi |
| Görev | `approve` | Reddi kapalı onay (`form.allowReject=false`); buton "Tamamla" |
| Paralel `parallel` | `complete` / `anyReject` | Tek kutuda dallar; all/any, red önceliklidir |
| Koşul `condition` | `case:{anahtar}` … / `default` | Sıralı durumlar (satır ya da formül), ilk eşleşen; yoksa varsayılan |
| Alan güncelle `action` | `next` | Kayda sabit/formül/temizle yazar — `IWorkflowRecordWriter` yolu |
| Bildirim `notify` | `next` | Zil + e-posta; alıcı: oluşturan/başlatan/rol/kişi/adım görevlileri |
| Bekleme `timer` | `next` | Süre ya da kayıttaki tarihe kadar (İstanbul saati) — migrasyon **022** |
| Bitiş `end` | — | Sonuçla (tamamlandı/reddedildi) bitirir; kayıt durumu boşalmaz |

Port sözlüğü iki yerde, birebir aynı: `utils/workflow/workflow-exits.ts` ↔ backend `WorkflowExits`.
Yeni düğüm tipi önce bu ikisine eklenir. Bildirim şablonunda yer tutucular: `{{record.Alan}}`,
`{{workflow.name}}`, `{{step.name}}`, `{{instance.id}}`, `{{link}}` (metin düz yazı; e-postada HTML'e kaçırılır).

**Motor:** saf `WorkflowStateMachine` (düğüm başına) + `WorkflowRunner` (otomatik adımları aynı işlemde
zincirler; kaydı her adımdan önce yeniden okur; 64 adım sınırı). Simülasyon (`POST /Workflow/simulate`)
gerçek motor fonksiyonlarını bellekte koşturur; şema üstünde yol olarak boyanır.

### Olay (incident) modeli

Otomatik adım hata verirse (formül, tip uyuşmazlığı, kayıt doğrulaması, hedefsiz yol, 022'siz Bekleme)
süreç **Failed olmaz**: Running kalır, `ErrorMessage` dolar, `CurrentStepKey` hatalı düğümde, `StepFailed`
olayı düşer; onaycının kararı geri alınmaz. Süreç ekranındaki olay bandından yönetici **Yeniden dene**
(o adıma geri alma — adım aynı yerde yine hata verirse işlem geri alınır ve güncel hata döner) ya da
**Adımı atla** (koşulda varsayılan, eylemlerde sonraki yol) der. Liste filtresi: "Yalnız hata bekleyenler".

### Bekleme ve zamanlayıcı (migrasyon 022)

`WorkflowTimer` tablosu adıma girişle aynı transaction'da yazılır; geri alma/iptal aynı transaction'da
iptal eder. `WorkflowWorker` (10 sn) DB sürümü ≥ 22 olan tenant'larda vadesi geleni `UPDLOCK, READPAST`
ile sahiplenir → süreç kilidi → "hâlâ o adımda mı" (değilse bayat, iptal) → runner. Hata 1/5/15/60 dk
geri çekilir, 5. hatada olay. Restart sonrası kaçırılan vade bir sonraki turda bir kez ateşlenir.
022'siz tenant'ta palette Bekleme pasiftir (`GET /Workflow/capabilities`), taslak kaydedilir, yayın
`timer.unavailable` ile reddedilir. Tablo EF modeline eklenmedi (ham SQL DAL) — yükseltilmemiş tenant'ta
EF sorguları etkilenmesin.

> **Restart tuzağı:** tenant'ın derlenmiş modelleri ilk UI isteğinde (`loadAssembly`) belleğe yüklenir.
> Akışı worker ilerletiyorsa (Bekleme, kayıt tetiği → Alan güncelle) o istek hiç gelmemiş olabilir;
> `WorkflowRecordWriter` derlemeyi gerekirse kendisi yükler. Tip isteyen yeni worker yolları da yüklemeli.

### Süreç izleme, sürümler, taşınabilirlik

- Süreç ekranı şemayı sürecin **başladığı sürümden** çizer; geçilen adım/oklar olay günlüğünden
  (`utils/workflow/workflow-runtime.overlay.ts`), geri alma izi keser. Bekleyen Bekleme "… tarihine kadar".
- Sürüm geçmişinde "Öncekiyle karşılaştır": eklenen (yeşil), değişen (sarı), kaldırılan (liste); konum fark sayılmaz.
- Dışa/içe aktarım: `corelogic.workflow` v1 JSON paketi; içe aktarılan akış her zaman yeni **taslak**,
  kod çakışırsa `_2` soneki; rol/kişi atamaları hedefte geçersiz kalabilir (sorun panelinde görünür).
- Yeni boş akışta hazır şablonlar (Satın alma onayı, İzin talebi, Masraf onayı) — rol ve kolonlar bilerek boş.
- Listede **Durdur/Sürdür** (`POST /Workflow/setEnabled`, yeni sürüm açmaz) ve plan kotası şeridi (`GET /Workflow/usage`).
- Tetik koşulları koşul düğümüyle aynı karşılaştırmayı kullanır (iki taraf tarihse tarih olarak);
  okunamayan tetik JSON'ı hiç eşleşmez. Yalnız yükseltme süresi tanımlı SLA artık tetiklenir.

## Otomatik Değer Atama

Kolon popup'ındaki (`/build/:typeName`) **Otomatik Değer** bölümünde bir alana formül bağlanır;
alan kendiliğinden dolar. Kural `PublishedTableMember.AutoValueTrigger/AutoValueExpression`
(+ zaten var olan `IsReadOnly`) olarak durur — tenant migrasyonu **`021`** (ayrıca
`AutoValueSequence` sayaç tablosu). Şema değişmez, yeniden yayın gerekmez.

| Tetik | İstemci (anında) | Sunucu — yeni kayıt | Sunucu — güncelleme |
|---|---|---|---|
| `create` Form açıldığında | yeni formda, alan boşsa | salt okunursa hep, değilse boşsa | dokunulmaz |
| `change` Alan değiştiğinde | formüldeki alan değişince (zincirleme) | salt okunursa hep, değilse boşsa | salt okunursa yeniden hesaplanır |
| `save` Kaydedilirken | kaydetmeden hemen önce | hesaplanır | hesaplanır |

**Sözdizimi (Excel benzeri):** alan `[Ad]`, metin `'…'`, `+ - * / %`, `&` (birleştirme),
`= != < <= > >=`, `AND OR NOT`; fonksiyonlar `IF COALESCE MIN MAX ROUND ABS CONCAT UPPER LOWER
TRIM LEFT RIGHT LEN TODAY NOW FORMAT_DATE ADD_DAYS SEQ`. Boş alan aritmetikte 0 sayılır; formüldeki
alanların **hepsi** boşsa sonuç boştur; sıfıra bölme vb. hata → alan boş kalır.

**Sıra numarası:** `TODAY('ddMMyyyy') & '-' & SEQ(3, TODAY('ddMMyyyy'))` → `25092026-001`
(popup'taki "Tarih + sıra no" düğmesi). `SEQ(genişlik, kapsam)` numarayı **yalnız sunucu**, kaydı
ekleyen transaction içinde verir (`MERGE … HOLDLOCK`) — geri alınan kayıt numara yakmaz. Bu yüzden
SEQ yalnız `create` ile kullanılır, her zaman salt okunurdur ve başka formül SEQ kolonuna bakamaz.
Formda "Kaydedince atanır" görünür; kayıttan sonra form sunucudan yeniden okunur.

**İki implementasyon, tek davranış.** Formül istemcide (`utils/auto-value/expression.ts`) ve
sunucuda (`Business/Concrete/Dynamic/AutoValue/AutoValueExpression.cs`) ayrı yazılmıştır ve
**bit düzeyinde aynı sonucu** vermelidir. `auto-value.vectors.json` iki depoda birebir kopyadır
(`Tests/Business.Tests/AutoValue/`); iki taraf da onu koşar. Davranış değiştiren her düzenleme
iki dosyaya birlikte yapılır ve vektör eklenir. Elle eşitlenen tuzaklar: yuvarlama `Math.Round`
değil `roundAway` (1.005 → 1.01), sayı → metin en kısa gidiş-dönüş + üstel yazım açılır,
`-0` → `0`, `\d` yerine `[0-9]`, `trim` yalnız ASCII boşluk + NBSP.

- **Salt okunur** hedefler formda `disable` edilir → kaydeden yollar `getRawValue()` kullanır
  (`.value` onları atar). Sunucu bu kolonları istemci payload'ından kopyalamaz
  (`IAutoValueApplier.ProtectedColumns`) — tarayıcıdan değer basmak işe yaramaz.
- **İş akışı kilidi:** görevli yalnız adım kolonlarını gönderir; bağımlı hesaplanan alanları
  `WorkflowRecordWriter` sunucuda yeniden yazar.
- **`TODAY()/NOW()`** sunucuda "Turkey Standard Time" ile hesaplanır (`AutoValueClock`) —
  tenant saat dilimi ayarı yok; UTC'de koşan sunucu gece yarısından sonra farklı gün üretmesin.
- **Doğrulama:** `addMember` yalnız kolonun kendi kuralını denetler (kolonlar tek tek eklenir,
  formül henüz eklenmemiş kolona bakabilir); bilinmeyen alan/döngü tasarımcıda (kaydetmeden
  önce tüm tablo) ve `POST /Published/setMemberAutoValue`'da denetlenir. Çalışma anında hatalı
  kural kaydı engellemez, yalnız çalışmaz.
- Tasarımcı kural kaydedince `RecordMetadataService.invalidate(typeName)` — aksi halde açık
  oturumdaki formlar eski kuralı kullanırdı.

> Kapsam dışı: alt kayıtlara referans (`SUM([Kalemler.Tutar])`), başka modelin kolonları,
> AI önerilerinde otomatik değer. `PublishedModelManager.Update` hâlâ `DynamicEntityValidator`'ı
> çağırmıyor (önceden var olan boşluk).

## Kayıtlı Kolonun Düzenlenmesi

`/build/:typeName` kolon popup'ında kayıtlı bir kolonun **adı, tipi ve lookup hedefi kilitlidir** (derlenen
sınıfı ve tabloyu değiştirirler); **meta verisi** düzenlenir: etiket, açıklama, zorunluluk, doğrulama
kuralları (metin: min/max uzunluk, regex · sayı: en küçük/en büyük · enum: izinli değerler · dosya: boyut
sınırı · lookup: gösterim kolonu). Kaydet farkı `metadataKey` ile bulur ve kolon başına tek
`POST /Published/updateMemberMetadata` atar — kurallar `DynamicEntityValidator` tarafından çalışma
anında şemadan okunduğu için **yeniden yayın gerekmez**. Önceden popup tip/kural değişikliğine izin verip
yalnız etiketi yazıyor, gerisini **sessizce atıyordu**.

- **Zorunluluk kuralı** (`requiredChangeAllowed` ↔ backend `CoreLogicTypeMap.RequiredAffectsClrType`):
  string/enum/file/image'da serbest; değer tiplerinde (sayı, tarih, mantıksal, guid, lookup) yalnız model
  **hiç yayınlanmamışsa** — aksi halde `int` ⇄ `int?` değişir ve NULL değerli satırlar okunamaz olur.
- Yayındaki modelde alanı zorunlu yapmak ya da enum değeri kaldırmak popup'ta uyarı gösterir: eski
  kayıtlar ancak bir sonraki düzenlemede takılır.
- Sunucu tipe uymayan kuralı yok sayar, metin `MaxLength` ≤ 250 (`nvarchar(250)`) ve `Min ≤ Max` ister.
- Yayında `CheckDb` (ALTER ADD) hatası artık yayını durdurur; önceden sonucu atılıyordu.

## Ekran Tasarımı

`/build/:typeName/screen` (adminGuard) — admin, **yayınlanmış** bir modelin kayıt formunu ve liste
kolonlarını kod yazmadan düzenler. Girişler: şema ekranı başlığı (yalnız yayınlanmış model), model
kartları, kayıt ve liste ekranlarının başlıkları. Tasarım modelin şemasından AYRIDIR: C# sınıfına,
tabloya ya da derlemeye dokunmaz; tasarımcı yalnız **sunumu** değiştirir (genişlik, satır başı, gösterim
biçimi, başlıklar). Etiket, zorunluluk ve kurallar şemadadır — ikinci bir kural kaynağı istemci ile
sunucuyu ayrıştırırdı.

**Depolama ve yaşam döngüsü** (tenant migrasyonu **023**, `ModelScreenLayout`): model + görünüm
(`form` | `list`) başına tek satır, `DraftJson` + `PublishedJson`. Kaydet taslağı yazar, kullanıcılar
yalnız yayındakini görür; Yayınla sunucuda modelin GÜNCEL şemasına karşı yeniden doğrulanır; sürüm
geçmişi tutulmaz (ürün kararı). İyimser kilit `LastModifiedOn`; çakışmada tasarımcı "Yeniden yükle" bandı
gösterir. 023'süz tenant'ta ekranlar varsayılan görünümle çalışır, tasarımcı kaydedemez.

**Belge (schemaVersion 1):** form → `tabs[] → sections[] → items[]` (`field` · `spacer` · `divider` ·
`note`; alanlarda `span` 1–12, `newRow`, `widget: multiline|radio`) + `hiddenColumns`; liste →
`columns[{column, width?}]` (yerleştirilen kolon görünür; ID her zaman başta, akış durumu sonda).

**Doğrulama iki tarafta, tek davranış.** `utils/screen-layout/screen-layout.validate.ts` ↔ backend
`Business/Concrete/ScreenLayout/ScreenLayoutValidator.cs`; ortak vektörler `screen-layout.vectors.json`
iki repoda birebir kopyadır (`Tests/Business.Tests/ScreenLayout/`). Yapısal sorun (okunamaz, sınır,
kimlik, span…) taslağı da reddeder; anlamsal sorun (silinmiş kolon, zorunlu alan gizli, boş sekme,
tipe uymayan gösterim) taslakta uyarı, yayında hata; "yerleştirilmemiş kolon" hep bilgi. Kural değiştiren
her düzenleme iki dosyaya birlikte yapılır ve vektör eklenir.

**Çalışma anı** (`shared/record-layout`, kayıt sayfası + alt kayıt pop-up'ı + listeler):
- Yayınlanmış yerleşim yoksa bugünkü görünüm aynen; varsa "Kolonlar" (`ModelColumnSetting`) ayarının
  yerini alır — o görünümde popover yerine "Ekranı tasarla" çıkar.
- Tasarımdan SONRA eklenen kolonlar formun sonuna eklenir (zorunlu yeni alan kaybolup formu kilitlemesin),
  admin "tasarım güncel değil" uyarısı görür. Zorunlu ve iş akışı adımı alanları gizli olsa da çizilir;
  pop-up FK/ID'yi hiç çizmez; silinmiş kolon atlanır.
- Pasif sekme ve kapalı bölüm `hidden` ile gizlenir (alanlar canlı kalır). Kaydet geçersiz formda durunca
  ilk hatalı alanın sekmesine geçilir, bölümü açılır, alana odaklanılır; sekmede hata rozeti.
- Genişlik kademesi ekranın değil **kabın** genişliğinden (ResizeObserver): ≥720 px tasarlanan span,
  480–719 yarım/tam, <480 tam satır. CSS container query bilinçli kullanılmadı (lookup açılır listesinin
  `position: fixed` konumunu bozabilir).
- Liste genişlikleri `<colgroup>` + sabit tablo düzeniyle (`.data-table--sized`).

**Tasarımcı:** form tuvali gerçek alan bileşenini (`app-record-field`, `inert`) 12 kolonluk ızgarada
çizer; sürükle-bırak Pointer Events ile (kütüphane yok), bırakınca tek komut = tek geri al adımı; sağ
kenar tutamacı genişliği kolon adımına oturtur. Önizleme belgeyi çalışma anı bileşeniyle masaüstü /
tablet / telefon genişliğinde çizer. Kısayollar: Ctrl+Z/Y/S, Alt+↑/↓ taşı, Alt+←/→ genişlik, Delete, Esc.
Telefonda tuval yerine yapı listesi. İlk taslak bugünkü görünümden (mevcut "Kolonlar" ayarı dahil) tohumlanır.

> **Zorunluluk tek yerden:** `utils/record-field/column-required.ts`. Backend `CoreLogicTypeMap.IsNullable`
> her referans tipi (string/file/image) için `true` döner; görünürlük eskiden `!isNullable`'a baktığı için
> zorunlu metin alanı "Kolonlar" ayarıyla gizlenebiliyor ve Kaydet sessizce dönüyordu.

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
Başlatma   : AiQuotaService.BeginRequest()          → Limit null ise deny-by-default
             kalan − süren istekler < 20.000         → yeni istek başlatılmaz (UI: usage.canStart)
Her çağrı  : AiTokenBudget.BeginCall()               → max_tokens = min(16.000, kalan − tahmini girdi)
             kalan < 2.000                           → döngü durur, SSE `event: quota`
Tüketim    : IUsageDal.TenantTotals (SQL SUM)        — IUsageMeter.Query DEĞİL (200 satır tavanı var)
Yazma      : try/finally — iptal/hata dahil HER yolda; ayrık maliyet satırları → kota satırı
```

**Kota tanımı = önbelleksiz girdi + çıktı** (planlar bununla satıldı); önbellek okuma/yazma
kotaya sayılmaz (çoğu platformun kendi sistem promptu). Tool döngüsünün her model çağrısından
önce kalan pay yeniden okunur — DB'deki tüketim + `AiQuotaReservationRegistry`'deki (tekil,
bellek içi) **aynı tenant'ın süren diğer istekleri** düşülür; paralel iki sohbet aynı payı iki kez
harcayamaz. Aşım en fazla bir çağrının tahmin hatası kadardır. Akış ortasında istemci koparsa
(sekme kapandı) çıktı akan karakterlerden tahmin edilip yine yazılır — önceden hiç yazılmıyordu.

**Maliyet ayrık:** her tur `ai_input_tokens`, `ai_output_tokens`, `ai_cache_write_tokens`,
`ai_cache_read_tokens` satırlarını (yalnız maliyet, plana yazılamaz — `UsageMetricKeys`) ve kota
satırını yazar. Birim fiyatlar `MetricCatalog`'da (claude-sonnet-5 liste fiyatı), konsoldan
`cost.unit.{metrik}` ile ezilir. `ai_tokens_per_month`'un maliyeti 0'dır; ayrım öncesi yazılmış
kota satırları `ai_tokens_legacy` sanal satırıyla eski harman fiyatla gösterilir. Maliyet ve
kullanım özeti satırın **kayıt anına** (`RecordedAt`, master `029` indeksi) göre pencerelenir.

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
   Ardından **model değişiklikleri** (`propose_model_change`, kart türü `model_change`): kayıtlı
   şema okunur, öneri onunla birleştirilir (`toMemberMetadataUpdates` — öneri yalnız değişen alanları
   taşır, uç TAM değiştirir), yeni kolonlar `addMember`, meta veri `updateMemberMetadata`. Yalnız meta
   veri değiştiyse kart hemen `published`; yeni kolon varsa `imported` kalır ve yayınlanır.
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
npm test                        # Karma/Jasmine testleri (izleme modu, Chrome)
npm run test:ci                 # Tek koşu, ChromeHeadless — commit öncesi doğrulama bununla
```

### Dağıtım (Ubuntu sunucu)

Sunucu kurulumu backend reposundaki `deploy/` klasöründedir (adım adım rehber:
`deploy/README.md`). Docker Compose dört servis kaldırır: `mssql` (2025 Express,
`Turkish_CI_AS`), `backend`, `web` (nginx + iki SPA) ve tek seferlik `mssql-init`. Erişim
Tailscale üzerinden HTTPS ile olur. Üç repo sunucuda yan yana durur
(`~/corelogic/{CoreLogic,CoreLogicUI,CoreLogicPlatformConsole}`), güncelleme `deploy/update.sh` ile yapılır.

- **Tek origin:** `/` Tenant UI, `/console/` Platform Console (`--base-href /console/`),
  `/api/platform/` olduğu gibi, `/api/` ise önek soyularak backend'e gider
  (`/api/Auth/login` → `/Auth/login`).
- Production build `fileReplacements` ile `environment.prod.ts`'i kullanır (`apiBaseUrl: '/api'`).
  `ng serve` development yapılandırmasıyla `environment.ts`'te kalır.
- Yeni bir backend controller'ı için nginx'te bir şey yapmak gerekmez: `/api/` altındaki her yol iletilir.

#### Çalışma akışı (2026-10-17'den itibaren)

Uygulama sunucuda gerçekten kullanılıyor; geliştirme Windows'ta sürüyor. Her iş şu sırayla biter:

1. **Doğrula** — `ng test` + `ng build` (backend değiştiyse `dotnet build`) geçmeli.
2. **`main`'e commit + push** — özellik dalı açılmaz. İş birden çok repoya yayılıyorsa
   (UI + backend) her repo kendi commit'ini alır ve hepsi push'lanır; biri eksik kalırsa
   sunucu yarım sürümle derlenir.
3. **Sunucuya alma kullanıcıdadır** — sunucuda `bash ~/corelogic/CoreLogic/deploy/update.sh`
   (üç repoyu `pull --ff-only` ile çeker, imajları yeniden derler). Claude sunucuya erişmez.
   `--ff-only` yüzünden sunucudaki repolarda elle değişiklik yapılmaz, yoksa pull düşer.
4. **Sürüm (tenant migrasyonu)** — iş yeni bir `migrations/NNN_*.sql` eklediyse, dağıtımdan
   sonra Platform Console → `/console/operations/migrations` → **Koşu Başlat**. Master
   migrasyonları backend açılışında kendiliğinden koşar; tenant migrasyonları KOŞMAZ.

Claude her işin sonunda kullanıcıya şunları açıkça yazar: hangi repolar değişti, hangi imaj
yeniden derlenecek (`backend` / `web`), tenant migrasyonu gerekiyor mu (gerekiyorsa numarası),
dağıtım sırası önemli mi.

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
- **Mobil uyumluluk** — telefondan da kullanılıyor (iPhone + Android). Aksiyon satırları sarılır, sabit `min-width` > 300px yazılmaz, bilgi yalnız `title`'da bırakılmaz (dokunmatikte hover yok → `app-help-hint`), diyaloglar `dvh` kullanır, component `:host`'una padding verilmez (boşluğu `.page-content` verir), dokunmatikte zor araçlara (sürükle-bırak, tuval) "geniş ekranda düzenleyin" notu konur. Tam liste: `corelogic-design` skill'i "Mobil Kurallar"
- **Yan yana form alanları** — yalnızca global `.field-row` (+ düğmeli etiket için `.field-head`, tam satır için `.field--full`). Etiket satırları sabit yükseklikte olduğundan input'lar hizalı kalır. Component SCSS'inde yerel satır sınıfı (`flex: 0 0 120px`, `align-items: end`) YAZMA — detay: `corelogic-design` skill'i "Yan yana alanlar"
- **Tablo sarmalayıcısı** — her `.data-table` global `.table-wrapper` içinde durur: `.panel` `overflow: hidden` olduğundan sarmalayıcısız geniş tablo mobilde kırpılır ve kaydırılamaz. Component SCSS'inde `.table-wrapper`'ı yeniden TANIMLAMA
- **Tablo hücreleri** — `<td>`'ye `display` değiştiren sınıf (`muted-hint`, `cluster`, `stack`…) VERME: hücre tablo hücresi olmaktan çıkar, komşusuyla tek hücreye birleşir (düğmeler alt satıra düşer). Soluk metin için `.td-muted`, aksiyonlar için `<td class="td-actions">` (sağa yaslı)
- **Sayfa başlığı** — her ekranın üstünde tek satır: `.page-header` içinde `<span class="eyebrow">` + sayfanın/modelin adı, sağda aksiyonlar. Büyük `h1` başlık ve açıklama paragrafı KULLANILMAZ (`.page-title`/`.page-subtitle` kaldırıldı)
- **Türkçe kod yorumları** — backend ile tutarlı; UI metinleri çeviri sistemi üzerinden gelir

## Bilinen Eksikler ve TODO'lar


1. **Yedekler aynı diskte** — sunucu kurulumunda yedekler `corelogic_mssql-backup` volume'ünde, yani veriyle aynı diskte duruyor; dışarı kopyalama elle yapılıyor (bkz. backend `deploy/README.md` → Yedekler)
2. **Ödeme sağlayıcısı stub** — `StubPaymentGateway` her tahsilata başarı dönüyor ve `Plan`'da fiyat/para birimi kolonu yok. Stripe için: `Plan`'a parasal alanlar + `IPaymentGateway`'in gerçek implementasyonu (abonelik akışı değişmez)
3. **PlatformConfig sürümleme yok** — `PUT /api/platform/v1/config/{key}` eklendi (beyaz liste + sunucu tarafı `IsSecret` + maske koruması + audit), ancak değer geçmişi/geri alma tutulmuyor; audit yalnızca "kim ne zaman hangi anahtarı değiştirdi" diyor, eski değeri saklamıyor (bilinçli — sır sızdırmamak için)
4. **Data Protection anahtar halkası tek makinede** — `%PROGRAMDATA%\CoreLogic\dataprotection-keys` (veya `DataProtection:KeyPath`). Çok sunuculu dağıtımda bu klasör paylaşılmalı, yoksa bir sunucunun şifrelediğini diğeri çözemez. Yatay ölçeklemeden önce paylaşımlı depo (dosya paylaşımı/Key Vault) gerekir. Aynı varsayım AI kotasının süren istek sayacında (`AiQuotaReservationRegistry`) ve geri yüklemenin bakım kapısında (`TenantMaintenanceGate`) da var — ikisi de bellek içi: birden çok backend örneğinde birbirlerini göremez, master'a taşınmalı
5. **Akış tasarımcısında mini harita ve hizala/dağıt yok** — v2 planının Faz 11'inde opsiyoneldi, yapılmadı
6. **Kayıt tetiği güncel değere bakar** — outbox satırı işlenirken tetik koşulu kaydın O ANKİ değerine
    karşı değerlendirilir (yazıldığı anki değil). Bir akış kaydı değiştirdikten sonra işlenen `onCreate`
    satırı, değişmiş değerle ikinci bir akışı başlatabilir (uçtan uca testte görüldü)
7. **Bekleme boyunca kayıt kilidi sürer** — kayıt alanlı adımı olan akış beklemedeyken kayıt kilitli kalır (ürün kararı)
8. **Ekran tasarımı model silinince temizlenmez** — `ModelScreenLayout` satırı kalır (`ModelColumnSetting`'te de böyle); çalışma anı silinmiş kolonları yok saydığı için zararsız
9. **Tam sayfa yenilemede `loadAssembly` yarışı** — uygulama açılışındaki `/PublishModel/loadAssembly` aynı anda koşan bir kayıt isteğiyle çakışırsa derleme yeniden yüklenip `Cannot create DbSet … AracKaydi … AracKaydi` (500) alınabiliyor; Playwright ile her `page.goto`'da görüldü, uygulama içi gezinmede görülmedi
10. **`task-decision-form` alanları ayrı kopya** — kayıt sayfası ve pop-up `app-record-field`'a taşındı, görev karar formu hâlâ kendi (daha dar) alan bloğunu çiziyor
