---
name: corelogic-design
description: >
  CoreLogicUI ekranları ve component'leri oluştururken veya stillendirirken kullan.
  Tasarım token'larını, global CSS sınıflarını ve layout desenlerini tanımlar.
  src/styles.scss'teki gerçek tasarım sistemine dayanır — Bootstrap kullanılmaz.
---

# CoreLogicUI Tasarım Sistemi

## Temel Kural

**Asla hard-coded hex/renk yazma.** Tüm renkler, boşluklar, radiuslar ve geçişler
`:root` CSS custom property'leri (token) üzerinden kullanılır. Token yoksa `color-mix(in oklab, …)` ile türet.

---

## Renk Token'ları (`src/styles.scss` — `:root`)

```css
/* Arkaplan & Yüzeyler */
--bg: #f8fafc          /* Sayfa arka planı */
--surface: #ffffff     /* Kart / panel yüzeyi */
--surface-warm: #eef2f7 /* Tablo başlık, hover arka planı */

/* Metin */
--fg: #0f172a          /* Birincil metin (başlık, label) */
--fg-2: #334155        /* İkincil metin (td içeriği) */
--muted: #64748b       /* Soluk metin (tablo th, yardımcı) */
--meta: #1d4ed8        /* Vurgu metin (.eyebrow, .badge-meta) */

/* Aksan (Birincil marka rengi — indigo-700) */
--accent: #1d4ed8
--accent-on: #ffffff
--accent-hover: color-mix(in oklab, var(--accent), black 8%)
--accent-active: color-mix(in oklab, var(--accent), black 14%)

/* Kenarlık */
--border: #d8dee8
--border-soft: #edf1f6

/* Durum renkleri */
--success: #15803d   / --success-bg: #f0fdf4
--warn:    #b45309   / --warn-bg:    #fffbeb
--danger:  #b91c1c   / --danger-bg:  #fef2f2

/* Odak halkası */
--focus-ring: 0 0 0 3px rgba(29, 78, 216, 0.22)
```

---

## Tipografi Token'ları

```css
--font-display: 'Inter', system-ui, sans-serif   /* Başlıklar */
--font-body:    'Inter', system-ui, sans-serif   /* Gövde metni */
--font-mono:    'IBM Plex Mono', ui-monospace, Menlo, monospace  /* Kod, .eyebrow, .badge */

--text-xs:   12px   --text-sm:   14px   --text-base: 16px
--text-lg:   18px   --text-xl:   24px   --text-2xl:  34px
--text-3xl:  48px   --text-4xl:  64px

--leading-body:    1.52
--leading-tight:   1.08
--tracking-display: -0.018em
```

> ⚠️ Inter ve IBM Plex Mono fontları `index.html`'de `<link>` ile yüklenmemiş;
> şu an `system-ui`'ye düşüyor. Fontları eklemek için `index.html`'e Google Fonts
> veya bunlara link ekle.

---

## Boşluk, Radius, Gölge, Hareket Token'ları

```css
/* Boşluk */
--space-1: 4px   --space-2: 8px    --space-3: 12px
--space-4: 16px  --space-5: 20px   --space-6: 24px
--space-8: 32px  --space-12: 48px

/* Köşe yuvarlaklığı */
--radius-sm: 6px   --radius-md: 10px
--radius-lg: 16px  --radius-pill: 9999px

/* Gölge / Yükseklik */
--elev-flat: none
--elev-ring:   0 0 0 1px var(--border)
--elev-raised: 0 1px 3px rgba(15,23,42,.06), 0 4px 16px rgba(15,23,42,.08)
--elev-high:   0 8px 32px rgba(15,23,42,.12)

/* Hareket */
--motion-fast: 150ms
--motion-base: 230ms
--ease-standard: cubic-bezier(0.2, 0, 0, 1)

/* Düzen */
--sidebar-w:     240px
--topbar-h:      60px
--container-max: 1240px
```

---

## Global Component Sınıfları

Bu sınıflar `src/styles.scss`'te tanımlıdır. **Bootstrap sınıfları değildir.**
Component SCSS'inde yeniden tanımlama — doğrudan HTML'de kullan.

### Butonlar

```html
<!-- Birincil eylem -->
<button class="btn btn-primary">Kaydet</button>

<!-- İkincil / outline -->
<button class="btn btn-secondary">İptal</button>

<!-- Tehlikeli eylem -->
<button class="btn btn-danger">Sil</button>

<!-- Şeffaf / simge yanı -->
<button class="btn btn-ghost">Geri</button>

<!-- Küçük varyant (herhangi birinin üstüne) -->
<button class="btn btn-secondary btn-sm">Düzenle</button>
```

### Panel / Kart

```html
<div class="panel">
  <div class="panel-head">
    <h3>Başlık</h3>
    <div class="panel-actions">
      <button class="btn btn-primary btn-sm">Yeni</button>
    </div>
  </div>
  <div class="panel-body">
    <!-- içerik -->
  </div>
</div>
```

### Form Alanları

```html
<div class="field">
  <label for="name">
    Tablo Adı <span class="req">*</span>
  </label>
  <input
    id="name"
    class="input"
    type="text"
    formControlName="tableName"
    [attr.aria-invalid]="f['tableName'].invalid && f['tableName'].touched"
    aria-describedby="name-err"
  />
  @if (f['tableName'].invalid && f['tableName'].touched) {
    <span id="name-err" class="field-error" role="alert">Zorunlu alan.</span>
  }
  <span class="field-help">Tablo adı benzersiz olmalıdır.</span>
</div>

<!-- Select -->
<div class="field">
  <label for="type">Veri Tipi</label>
  <select id="type" formControlName="dataType">
    <option value="string">string</option>
    <option value="int">int</option>
  </select>
</div>

<!-- Checkbox -->
<label class="checkbox-label">
  <input type="checkbox" formControlName="isRequired" />
  Zorunlu alan
</label>
```

### Veri Tablosu

```html
<table class="data-table">
  <thead>
    <tr>
      <th>Ad</th>
      <th>Tip</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    @for (row of rows; track row.id) {
      <tr>
        <td>{{ row.name }}</td>
        <td><span class="badge badge-meta">{{ row.type }}</span></td>
        <td>
          <div class="td-actions">
            <button class="btn btn-ghost btn-sm">Düzenle</button>
            <button class="btn btn-danger btn-sm">Sil</button>
          </div>
        </td>
      </tr>
    }
  </tbody>
</table>
```

### Badge, Alert, Spinner, Empty State

```html
<!-- Badge varyantları -->
<span class="badge badge-success">Aktif</span>
<span class="badge badge-warn">Bekliyor</span>
<span class="badge badge-danger">Hata</span>
<span class="badge badge-meta">v1.0</span>

<!-- Alert kutuları -->
<div class="alert alert-success">İşlem başarıyla tamamlandı.</div>
<div class="alert alert-danger">Bir hata oluştu: {{ hata }}</div>
<div class="alert alert-warn">Dikkat: Bu işlem geri alınamaz.</div>
<div class="alert alert-info">Bilgi mesajı.</div>

<!-- Loading spinner -->
<span class="spinner" aria-hidden="true"></span>
<span class="sr-only">Yükleniyor…</span>

<!-- Boş durum -->
<div class="empty-state">
  <div class="empty-icon">📭</div>
  <h3>Henüz kayıt yok</h3>
  <p>İlk tabloyu oluşturmak için "Yeni Model" butonuna tıkla.</p>
</div>

<!-- Mono üst etiket -->
<p class="eyebrow">Model Listesi</p>
```

### Layout Yardımcıları

```html
<!-- Dikey boşluk (space-4 aralıkla) -->
<div class="stack">
  <div>...</div>
  <div>...</div>
</div>

<!-- Dikey boşluk (space-6 aralıkla) -->
<div class="flow">
  <section>...</section>
  <section>...</section>
</div>

<!-- Yatay flex cluster -->
<div class="cluster">
  <button class="btn btn-primary">Yeni</button>
  <button class="btn btn-secondary">Filtrele</button>
</div>

<!-- Ekran okuyucu metni -->
<span class="sr-only">Silmek için tıkla</span>
```

---

## Layout Desenleri

### App Shell (LayoutComponent)
CSS Grid: `grid-template-columns: var(--sidebar-w) 1fr`
- Sidebar: `background: var(--fg)` (koyu), `color: var(--surface)`, genişlik `var(--sidebar-w)`
- Topbar: sticky, `height: var(--topbar-h)`, `background: var(--surface)`, `border-bottom: 1px solid var(--border)`
- Responsive: 900px'de sidebar daralt (`.sidebar-collapsed`), 768px'de tamamen gizle

### İki Sütunlu Bölüm
```scss
.my-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}
```

### Yeni Component SCSS Şablonu
```scss
:host {
  display: block;
  padding: var(--space-6);
}

.my-section {
  // Token kullan, hard-coded değer yazma
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}
```

---

## Component Yazım Kuralları

| Kural | Açıklama |
|-------|----------|
| **Standalone** | `standalone: true` — NgModule yok |
| **Control flow** | `@if` / `@for` / `@else` (Angular 17+ sözdizimi — `*ngIf`/`*ngFor` değil) |
| **Reactive Forms** | `FormBuilder` + `FormGroup`/`FormArray`; template-driven form yok |
| **İkonlar** | Inline stroke SVG, `currentColor`, ikon-font kütüphanesi yok |
| **A11y** | `aria-invalid`, `role="alert"`, `aria-describedby`, `.sr-only` zorunlu |
| **Dil** | Tüm UI metni ve yorumlar Türkçe |
| **Stil** | Global sınıfları yeniden kullan; component SCSS'inde token kullan; yeni renk icat etme |

---

## ❌ / ✅ Örnek

```html
<!-- ❌ YANLIŞ: hard-coded hex, Bootstrap sınıfı, *ngIf -->
<div style="background:#1d4ed8; color:white;" class="card">
  <div class="card-body">
    <p class="text-danger" *ngIf="hata">{{ hata }}</p>
    <button class="btn btn-primary">Kaydet</button>
  </div>
</div>

<!-- ✅ DOĞRU: token, global sınıf, @if -->
<div class="panel">
  <div class="panel-body">
    @if (hata) {
      <div class="alert alert-danger" role="alert">{{ hata }}</div>
    }
    <button class="btn btn-primary" type="submit">Kaydet</button>
  </div>
</div>
```
