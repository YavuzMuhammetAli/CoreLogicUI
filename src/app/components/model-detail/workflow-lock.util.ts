import { PublishedColumn } from '../../services/published-model.service';
import { RecordField, RecordWorkflowState } from '../../models/workflow.model';
import { sanitizePayload } from '../model-data/model-data.util';

/**
 * Form tabanlı akışın kayıt ekranı kuralları — SAF (spec'li).
 *
 * Kilit kararının asıl sahibi sunucudur (`/WorkflowInstance/recordState` ve
 * PublishedModelManager aynı kapıdan geçer); buradaki fonksiyonlar yalnızca o
 * kararı forma uygular. Kolon adları sunucuda harf duyarsız eşlendiği için
 * burada da öyle eşlenir.
 */

type DataRow = Record<string, unknown>;

const lower = (value: string) => value.toLowerCase();

/**
 * Formda kilitlenecek (disabled) kolonlar. Kilit yoksa ya da kullanıcı kilidi
 * aşabiliyorsa (admin) boş küme; aksi halde düzenlenebilir kolonlar DIŞINDAKİ her şey.
 */
export function lockedColumns(
  columns: PublishedColumn[], state: RecordWorkflowState | null
): Set<string> {
  if (!state?.isLocked || state.canBypass) return new Set();

  const editable = new Set(state.editableColumns.map(lower));
  return new Set(
    columns
      .filter(c => !editable.has(lower(c.columnName)))
      .map(c => c.columnName));
}

/** Değer "boş" mu — sunucudaki zorunluluk denetimiyle aynı: null, boş/boşluk metin. false DOLUDUR. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** Adımın zorunlu kayıt alanlarından formda boş kalanlar (formdaki gerçek kolon adıyla). */
export function missingRequired(
  fields: RecordField[], raw: DataRow, columns: PublishedColumn[]
): string[] {
  const byLower = new Map(columns.map(c => [lower(c.columnName), c.columnName]));

  return fields
    .filter(f => f.isRequired)
    .map(f => byLower.get(lower(f.column)) ?? f.column)
    .filter(name => isEmptyValue(raw[name]));
}

/**
 * Sunucuya gidecek kayıt değerleri: YALNIZ verilen kolonlar, model tiplerine göre
 * temizlenmiş (boş metin → null). Kısmi payload bilinçli — sunucu yalnız gelen
 * anahtarları yazar, diğer alanlar ezilmez.
 */
export function buildRecordValues(
  columnNames: string[], raw: DataRow, columns: PublishedColumn[]
): DataRow {
  const wanted = new Set(columnNames.map(lower));
  const selected = columns.filter(c => wanted.has(lower(c.columnName)));

  const values: DataRow = {};
  for (const column of selected) values[column.columnName] = raw[column.columnName];

  return sanitizePayload(selected, values);
}
