import { AggregateFunction, ReportAggregate } from '../models/report.model';

/**
 * Rapor sonuç kolonunun başlığı — SAF, DOM yok.
 *
 * Çalıştırılan raporda başlık sunucudan gelir (`ReportColumnInfo.label`, backend
 * `ReportingManager.ApplyColumnLabels`). Bu yardımcı yalnız rapor OLUŞTURUCUSUNUN sentetik
 * önizlemesi ve sıralama listesi içindir; metinler backend `Messages.ReportColumn*` ile
 * aynı kalmalıdır (bkz. report.i18n.ts 'report.columnLabel.*').
 */

const AGGREGATE_LABEL_KEYS: Record<AggregateFunction, string> = {
  SUM: 'report.columnLabel.sum',
  COUNT: 'report.columnLabel.count',
  AVG: 'report.columnLabel.avg',
  MIN: 'report.columnLabel.min',
  MAX: 'report.columnLabel.max'
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Sunucudaki alias kuralı (ReportingManager.BuildProjection): `{FONKSİYON}_{Alan|All}`. */
export function aggregateAlias(agg: Pick<ReportAggregate, 'function' | 'field'>): string {
  return `${agg.function}_${agg.field || 'All'}`;
}

/**
 * `name` bir aggregate alias'ıysa "Toplam {alan etiketi}" / "Kayıt sayısı"; düz kolonsa
 * kolonun etiketi; hiçbiri yoksa adın kendisi. COUNT alandan bağımsızdır (sunucu
 * `Count()` çağırır) — `COUNT_ID` de "Kayıt sayısı"dır.
 */
export function reportColumnLabel(
  name: string,
  columns: ReadonlyArray<{ columnName: string; label?: string | null }>,
  aggregates: ReadonlyArray<Pick<ReportAggregate, 'function' | 'field'>>,
  t: Translate
): string {
  const fieldLabel = (field: string) =>
    columns.find(c => c.columnName === field)?.label?.trim() || field;

  const agg = aggregates.find(a => a.function && aggregateAlias(a) === name);
  if (agg) {
    const key = AGGREGATE_LABEL_KEYS[agg.function];
    if (key) return agg.function === 'COUNT' ? t(key) : t(key, { field: fieldLabel(agg.field) });
  }

  return fieldLabel(name);
}
