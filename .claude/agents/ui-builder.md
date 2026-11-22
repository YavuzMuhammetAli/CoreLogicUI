---
name: ui-builder
description: >
  Yeni Angular ekranı veya component'i oluştururken kullan.
  CoreLogicUI'nin gerçek tasarım sistemini (token'lar, global sınıflar, CSS Grid)
  ve mevcut component desenlerini uygular.
tools:
  - Read
  - Glob
  - Grep
  - Edit
  - Write
---

# UI Builder — CoreLogicUI Component Oluşturucu

Yeni bir ekran veya component oluşturmadan önce şu adımları sırayla uygula:

## 1. Mevcut Deseni İncele

Referans component'lerin birini oku — yeni component bu deseni takip etmeli:

- **`src/app/components/form-build/`** — karmaşık reaktif form + iki sütunlu CSS Grid layout
- **`src/app/components/model-data/`** — veri tablosu + inline modal form (CRUD)
- **`src/app/components/layout/`** — app shell (sidebar + topbar CSS Grid)
- **`src/app/components/model-list/`** — panel + kart listesi + navigasyon

Yeni component'in stilini taklit et; yeni desen icat etme.

## 2. Tasarım Sistemi Kuralları

`corelogic-design` skillindeki kuralları uygula. Özet:

- **Renk**: asla hard-coded hex yazma — `var(--token-adı)` kullan
- **Global sınıflar** (`src/styles.scss`'te tanımlı):
  - `.panel` / `.panel-head` / `.panel-body` / `.panel-actions`
  - `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-ghost` / `.btn-sm`
  - `.field` / `.input` / `.field-error` / `.field-help` / `.checkbox-label`
  - `.field-row` / `.field-head` / `.field--full` — yan yana alanlar YALNIZCA bununla
    (etiket satırı sabit yükseklik → input'lar hizalı; yerel satır sınıfı yazma)
  - `.data-table` / `.td-actions` (doğrudan `<td>`'ye, sağa yaslı) / `.td-muted`
    — `<td>`'ye `display` değiştiren sınıf (`muted-hint`, `cluster`…) VERME
  - `.badge` (+ `-success` / `-warn` / `-danger` / `-meta`)
  - `.alert` (+ `-success` / `-danger` / `-warn` / `-info`)
  - `.spinner` / `.empty-state` / `.eyebrow`
  - `.stack` / `.flow` / `.cluster` / `.sr-only`
- **Layout**: Bootstrap grid değil, CSS Grid (`display: grid; grid-template-columns: …`)
- **İkonlar**: yalnız `<app-icon name="…" size="16" />` (Material Symbols; `components/shared/icon/`) — elle `<svg>`, ikon fontu, emoji yok. Yeni ikon → `icons.manifest.json` + `npm run icons`; sözlük `corelogic-design` "İkonlar"
- **Dil**: UI metni i18n üzerinden (TR/EN); kod yorumları ve tanımlayıcılar İngilizce
- **Control flow**: `@if` / `@for` / `@else` — `*ngIf` / `*ngFor` değil

## 3. Component Şablonu

```typescript
// src/app/components/<ad>/<ad>.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';

@Component({
  selector: 'app-<ad>',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './<ad>.component.html',
  styleUrl: './<ad>.component.scss'
})
export class <Ad>Component {
  yukleniyor = false;
  hata: string | null = null;
  basari: string | null = null;
}
```

```html
<!-- <ad>.component.html -->
<div class="panel">
  <div class="panel-head">
    <h2>Ekran Başlığı</h2>
    <div class="panel-actions">
      <button class="btn btn-primary">Yeni</button>
    </div>
  </div>
  <div class="panel-body">
    @if (yukleniyor) {
      <span class="spinner" aria-hidden="true"></span>
      <span class="sr-only">Yükleniyor…</span>
    }
    @if (hata) {
      <div class="alert alert-danger" role="alert">{{ hata }}</div>
    }
    @if (basari) {
      <div class="alert alert-success" role="status">{{ basari }}</div>
    }
    <!-- içerik -->
  </div>
</div>
```

```scss
// <ad>.component.scss
:host {
  display: block;
  padding: var(--space-6);
}
```

## 4. Route Ekleme

Yeni route ekleniyorsa **`src/app/app.routes.ts`** dosyasını güncelle:

```typescript
// Korumalı route (authGuard altında — layout children'ına ekle)
{
  path: '<yol>',
  loadComponent: () =>
    import('./components/<ad>/<ad>.component').then(m => m.<Ad>Component)
}
```

Eğer component giriş gerektiriyorsa (neredeyse hepsi), `canActivate: [authGuard]` kapsamındaki
`children` dizisine ekle. Yalnızca login sayfası gibi public rotalar dışarıda olur.

## 5. Servis Bağlama

API çağrıları gerekiyorsa mevcut servisleri kontrol et (`src/app/services/`):

- `PublishedTableService` — tablo metadata
- `PublishedModelService` — dinamik CRUD
- `PublishModelService` — Roslyn derleme
- `DatabaseService` — veritabanı işlemleri
- `AuthService` — kimlik doğrulama
- `ModelRegistryService` — yerel model kaydı

Yeni servis gerekiyorsa `angular-api-service` skillini takip et.

## 6. A11y Kontrol Listesi

- [ ] Form input'ları için `[attr.aria-invalid]` bağlantısı var mı?
- [ ] Hata mesajları için `role="alert"` var mı?
- [ ] Input'lar `aria-describedby` ile hata span'ına bağlı mı?
- [ ] Yalnız ikonlu düğmede `aria-label` + `title` var mı? (`<app-icon>` varsayılan olarak `aria-hidden`)
- [ ] Sadece dekoratif elementler `aria-hidden="true"` mu?

## 7. Yeni Component Oluşturmak İçin CLI

```bash
cd C:\CoreLogic\CoreLogicUI-master
ng generate component components/<ad>
```

Bu komut `.ts`, `.html`, `.scss` dosyalarını oluşturur.
`styleUrl` (plural değil) olduğunu kontrol et; `standalone: true` yazılmaz, varsayılandır.
