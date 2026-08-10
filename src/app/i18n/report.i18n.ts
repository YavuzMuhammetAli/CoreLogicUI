import { Translations } from './translations.model';

/**
 * report-list / report-build / report-viewer ekranları ve chart component'i
 * (chart.component.html/.ts, chart-mapping.ts, chart-types.ts) statik metinleri.
 * Namespace: 'report.*' (rapor ekranları), 'chart.*' (grafik tipi etiketleri/ipuçları,
 * grafik durum metinleri).
 */
export const REPORT_I18N: Translations = {
  // ── report-list ──────────────────────────────────────────────────────────
  'report.list.title': { tr: 'Raporlar', en: 'Reports' },
  'report.list.deletedReports': { tr: 'Silinmiş Raporlar', en: 'Deleted Reports' },
  'report.list.newReport': { tr: 'Yeni Rapor', en: 'New Report' },
  'report.list.colName': { tr: 'Ad', en: 'Name' },
  'report.list.colModel': { tr: 'Model', en: 'Model' },
  'report.list.colChartType': { tr: 'Grafik Tipi', en: 'Chart Type' },
  'report.list.view': { tr: 'Görüntüle', en: 'View' },
  'report.list.edit': { tr: 'Düzenle', en: 'Edit' },
  'report.list.emptyTitle': { tr: 'Henüz rapor tanımlanmadı', en: 'No reports defined yet' },
  'report.list.emptySubtitle': { tr: 'Erişebildiğiniz bir model üzerinde ilk raporunuzu oluşturun.', en: 'Create your first report on a model you have access to.' },
  'report.list.createFirst': { tr: 'İlk Raporu Oluştur', en: 'Create First Report' },
  'report.list.loadFailed': { tr: 'Raporlar yüklenemedi.', en: 'Reports could not be loaded.' },
  'report.list.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },

  // ── report-build: genel ─────────────────────────────────────────────────
  'report.build.titleEdit': { tr: 'Raporu Düzenle', en: 'Edit Report' },
  'report.build.titleNew': { tr: 'Yeni Rapor', en: 'New Report' },
  'report.build.cancel': { tr: 'Vazgeç', en: 'Cancel' },
  'report.build.basicInfo': { tr: 'Temel Bilgiler', en: 'Basic Information' },
  'report.build.reportName': { tr: 'Rapor Adı', en: 'Report Name' },
  'report.build.reportNameRequired': { tr: 'Rapor adı zorunludur.', en: 'Report name is required.' },
  'report.build.model': { tr: 'Model', en: 'Model' },
  'report.build.selectModel': { tr: 'Bir model seçin', en: 'Select a model' },
  'report.build.modelRequired': { tr: 'Model seçimi zorunludur.', en: 'Model selection is required.' },
  'report.build.chartType': { tr: 'Grafik Tipi', en: 'Chart Type' },
  'report.build.chartTypeHelp': { tr: 'Gruplama/aggregate tanımlıysa grafik bu sonuçlar üzerinden çizilir.', en: 'If grouping/aggregate is defined, the chart is drawn from those results.' },
  'report.build.singleAggregateWarning': {
    tr: 'Bu grafik tipi tek bir aggregate ile en iyi sonucu verir; birden çok aggregate tanımladınız, çizimde yalnızca ilki kullanılacaktır.',
    en: 'This chart type works best with a single aggregate; you defined more than one, only the first will be used for drawing.'
  },

  // ── report-build: canlı önizleme ────────────────────────────────────────
  'report.build.livePreview': { tr: 'Canlı Önizleme', en: 'Live Preview' },
  'report.build.previewHelp': { tr: 'Aşağıdaki grafik örnek veriyle çizilmiştir; kaydettikten sonra gerçek veriler kullanılır.', en: 'The chart below is drawn with sample data; real data is used after saving.' },
  'report.build.previewStrikeHelp': { tr: 'Devre dışı göstermek için bir satıra tıklayın; tekrar tıklayınca normale döner.', en: 'Click a row to mark it disabled; click again to restore it.' },
  'report.build.previewEmpty': { tr: 'Önizleme için bir model ve kolon seçin.', en: 'Select a model and column for preview.' },
  'report.build.previewCategory': { tr: 'Kategori', en: 'Category' },
  'report.build.previewValue': { tr: 'Değer', en: 'Value' },

  // ── report-build: SQL önizleme ───────────────────────────────────────────
  'report.build.sqlPreview': { tr: 'SQL Önizleme', en: 'SQL Preview' },
  'report.build.sqlPreviewButton': { tr: 'SQL Önizle', en: 'Preview SQL' },
  'report.build.sqlPreviewHelp': { tr: "Backend'in bu rapor tanımı için üreteceği SQL sorgusunu gösterir; sorgu çalıştırılmaz.", en: 'Shows the SQL query the backend would generate for this report definition; the query is not executed.' },
  'report.build.sqlPreviewEmpty': { tr: 'Üretilen SQL\'i görmek için "SQL Önizle"ye tıklayın.', en: 'Click "Preview SQL" to see the generated SQL.' },
  'report.build.sqlPreviewSelectModelFirst': { tr: 'Önce bir model seçin.', en: 'Select a model first.' },
  'report.build.sqlPreviewFailed': { tr: 'SQL önizlemesi üretilemedi.', en: 'SQL preview could not be generated.' },

  // ── report-build: kolonlar/filtreler/gruplama/aggregate/sıralama ───────
  'report.build.columns': { tr: 'Kolonlar', en: 'Columns' },
  'report.build.columnsHelp': { tr: 'Gruplama veya aggregate tanımlandığında kolon seçimi yok sayılır.', en: 'Column selection is ignored when grouping or aggregate is defined.' },
  'report.build.filters': { tr: 'Filtreler', en: 'Filters' },
  'report.build.addFilter': { tr: 'Filtre Ekle', en: 'Add Filter' },
  'report.build.noFilters': { tr: 'Henüz filtre eklenmedi.', en: 'No filters added yet.' },
  'report.build.field': { tr: 'Alan', en: 'Field' },
  'report.build.valuePlaceholder': { tr: 'Değer', en: 'Value' },
  'report.build.remove': { tr: 'Kaldır', en: 'Remove' },
  'report.build.groupBy': { tr: 'Gruplama', en: 'Grouping' },
  'report.build.aggregate': { tr: 'Aggregate', en: 'Aggregate' },
  'report.build.addAggregate': { tr: 'Aggregate Ekle', en: 'Add Aggregate' },
  'report.build.noAggregates': { tr: 'Henüz aggregate eklenmedi.', en: 'No aggregates added yet.' },
  'report.build.countNoFieldNeeded': { tr: '(COUNT için gerekli değil)', en: '(Not required for COUNT)' },
  'report.build.aggregateNumericHelp': { tr: 'SUM/AVG yalnızca sayısal alanlarda kullanılabilir.', en: 'SUM/AVG can only be used on numeric fields.' },
  'report.build.sortBy': { tr: 'Sıralama', en: 'Sort' },
  'report.build.addSort': { tr: 'Sıralama Ekle', en: 'Add Sort' },
  'report.build.noSorts': { tr: 'Henüz sıralama eklenmedi.', en: 'No sorting added yet.' },
  'report.build.save': { tr: 'Kaydet', en: 'Save' },

  // ── report-build: validasyon/hata mesajları (ts) ────────────────────────
  'report.build.modelsLoadFailed': { tr: 'Modeller yüklenemedi.', en: 'Models could not be loaded.' },
  'report.build.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'report.build.notFoundOrNoAccess': { tr: 'Rapor bulunamadı veya erişim yetkiniz yok.', en: 'Report not found or you do not have access.' },
  'report.build.aggregateFieldRequired': { tr: 'COUNT dışındaki aggregate fonksiyonları için bir alan seçilmelidir.', en: 'A field must be selected for aggregate functions other than COUNT.' },
  'report.build.saveFailed': { tr: 'Rapor kaydedilemedi.', en: 'Report could not be saved.' },

  // ── filtre operatörleri ─────────────────────────────────────────────────
  'report.operator.eq': { tr: '=', en: '=' },
  'report.operator.ne': { tr: '≠', en: '≠' },
  'report.operator.gt': { tr: '>', en: '>' },
  'report.operator.ge': { tr: '≥', en: '≥' },
  'report.operator.lt': { tr: '<', en: '<' },
  'report.operator.le': { tr: '≤', en: '≤' },
  'report.operator.contains': { tr: 'içerir', en: 'contains' },
  'report.operator.startswith': { tr: 'ile başlar', en: 'starts with' },

  // ── aggregate fonksiyonları ──────────────────────────────────────────────
  'report.aggregate.sum': { tr: 'Toplam (SUM)', en: 'Sum (SUM)' },
  'report.aggregate.count': { tr: 'Sayı (COUNT)', en: 'Count (COUNT)' },
  'report.aggregate.avg': { tr: 'Ortalama (AVG)', en: 'Average (AVG)' },
  'report.aggregate.min': { tr: 'Minimum (MIN)', en: 'Minimum (MIN)' },
  'report.aggregate.max': { tr: 'Maksimum (MAX)', en: 'Maximum (MAX)' },

  // ── aggregate fonksiyonları — KPI kartı kısa etiketleri (report-viewer) ─
  'report.aggregateShort.sum': { tr: 'Toplam', en: 'Sum' },
  'report.aggregateShort.count': { tr: 'Sayı', en: 'Count' },
  'report.aggregateShort.avg': { tr: 'Ortalama', en: 'Average' },
  'report.aggregateShort.min': { tr: 'Minimum', en: 'Minimum' },
  'report.aggregateShort.max': { tr: 'Maksimum', en: 'Maximum' },

  // ── sıralama yönleri ─────────────────────────────────────────────────────
  'report.sort.asc': { tr: 'Artan (A→Z, 0→9)', en: 'Ascending (A→Z, 0→9)' },
  'report.sort.desc': { tr: 'Azalan (Z→A, 9→0)', en: 'Descending (Z→A, 9→0)' },

  // ── report-viewer ────────────────────────────────────────────────────────
  'report.viewer.defaultTitle': { tr: 'Rapor', en: 'Report' },
  'report.viewer.edit': { tr: 'Düzenle', en: 'Edit' },
  'report.viewer.backToList': { tr: 'Listeye Dön', en: 'Back to List' },
  'report.viewer.export': { tr: 'Export', en: 'Export' },
  'report.viewer.exportExcel': { tr: 'Excel (.xlsx)', en: 'Excel (.xlsx)' },
  'report.viewer.exportPdf': { tr: 'PDF', en: 'PDF' },
  'report.viewer.noResultTitle': { tr: 'Sonuç yok', en: 'No results' },
  'report.viewer.noResultSubtitle': { tr: 'Bu rapor için filtre koşullarına uyan kayıt bulunamadı.', en: 'No records matching the filter conditions were found for this report.' },
  'report.viewer.result': { tr: 'Sonuç', en: 'Result' },
  'report.viewer.chart': { tr: 'Grafik', en: 'Chart' },
  'report.viewer.table': { tr: 'Tablo', en: 'Table' },
  'report.viewer.data': { tr: 'Veri', en: 'Data' },
  'report.viewer.pagerInfo': {
    tr: 'Sayfa {page} / {pages} · toplam {total} kayıt',
    en: 'Page {page} of {pages} · {total} records total'
  },
  'report.viewer.truncatedWarning': {
    tr: 'Sonuç çok büyük olduğu için ilk {shown} satır gösteriliyor (toplam {total}). Tam veri için dışa aktarın.',
    en: 'Result is too large; showing the first {shown} rows of {total}. Export for the full data.'
  },
  'report.viewer.runFailed': { tr: 'Rapor çalıştırılamadı.', en: 'Report could not be executed.' },
  'report.viewer.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'report.viewer.excelExportFailed': { tr: 'Excel export başarısız oldu.', en: 'Excel export failed.' },
  'report.viewer.pdfExportFailed': { tr: 'PDF export başarısız oldu.', en: 'PDF export failed.' },

  // ── chart: grafik tipi etiketleri/ipuçları (chart-types.ts) ────────────
  'chart.type.column.label': { tr: 'Sütun', en: 'Column' },
  'chart.type.column.hint': { tr: 'Kategoriler arasında karşılaştırma — dikey çubuklar.', en: 'Comparison across categories — vertical bars.' },
  'chart.type.bar.label': { tr: 'Çubuk', en: 'Bar' },
  'chart.type.bar.hint': { tr: 'Çok kategori, uzun etiketler için yatay karşılaştırma.', en: 'Horizontal comparison for many categories or long labels.' },
  'chart.type.line.label': { tr: 'Çizgi', en: 'Line' },
  'chart.type.line.hint': { tr: 'Zaman içindeki eğilim — sıralı kategoriler.', en: 'Trend over time — ordered categories.' },
  'chart.type.area.label': { tr: 'Alan', en: 'Area' },
  'chart.type.area.hint': { tr: 'Dolgulu çizgi — eğilimi hacim hissiyle göster.', en: 'Filled line — shows the trend with a sense of volume.' },
  'chart.type.pie.label': { tr: 'Pasta', en: 'Pie' },
  'chart.type.pie.hint': { tr: 'Tek aggregate, bütünün parçaları (az kategori).', en: 'Single aggregate, parts of a whole (few categories).' },
  'chart.type.donut.label': { tr: 'Donut', en: 'Donut' },
  'chart.type.donut.hint': { tr: 'Pasta gibi, ortada toplam etiketiyle.', en: 'Like pie, with a total label in the center.' },
  'chart.type.radialBar.label': { tr: 'Radyal (Gösterge)', en: 'Radial (Gauge)' },
  'chart.type.radialBar.hint': { tr: 'Tek bir oranı/yüzdeyi gösterge gibi vurgula.', en: 'Highlight a single ratio/percentage like a gauge.' },
  'chart.type.kpi.label': { tr: 'KPI Kartı', en: 'KPI Card' },
  'chart.type.kpi.hint': { tr: 'Tek büyük sayı — en önemli metriği öne çıkar.', en: 'A single large number — highlights the most important metric.' },
  'chart.type.table.label': { tr: 'Tablo', en: 'Table' },
  'chart.type.table.hint': { tr: 'Ham veri — satır/kolon listesi.', en: 'Raw data — list of rows/columns.' },

  // ── chart: çizim/durum metinleri (chart-mapping.ts, chart.component.ts) ─
  'chart.noDataForChart': { tr: 'Grafik için yeterli veri yok.', en: 'Not enough data for the chart.' },
  'chart.total': { tr: 'Toplam', en: 'Total' },
  'chart.capNote': { tr: '{total} kayıttan ilk {cap} gösteriliyor — tüm veri için Tablo görünümünü veya gruplama/aggregate kullanın.', en: 'Showing the first {cap} of {total} records — use the Table view or grouping/aggregate to see all data.' },
  'chart.ariaNoData': { tr: '{type} grafiği — veri yok.', en: '{type} chart — no data.' },
  'chart.ariaSummary': { tr: '{type} grafiği — {rows} kayıt, {cols} kolon.', en: '{type} chart — {rows} records, {cols} columns.' }
};
