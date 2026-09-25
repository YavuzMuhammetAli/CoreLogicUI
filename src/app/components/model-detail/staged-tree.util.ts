import { ValidatorFn, Validators } from '@angular/forms';
import { DynamicTreeNodeDto, PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema, PublishedTableSchema } from '../../services/published-table.service';
import { fieldValue, sanitizePayload } from '../model-data/model-data.util';
import { isFileType, maxFileSizeValidator } from '../../utils/file-size';

/** Dinamik tablo satırı — alan adı → değer. */
export type DataRow = Record<string, unknown>;

/**
 * Bellekte bekleyen (henüz kaydedilmemiş) bir kayıt ve tüm alt ağacı.
 *
 * Kullanıcı ana model + alt modeller + torunlar zincirini hiçbir şey kaydetmeden
 * kurabilir; "Kaydet"e basıldığında ağaç kökten yapraklara doğru SIRAYLA işlenir.
 * Kaydedilen düğüm `savedId` alır ve sonraki denemelerde ATLANIR — böylece kısmi
 * bir başarısızlıktan sonra tekrar denendiğinde çift kayıt oluşmaz.
 */
export interface StagedNode {
  /** Ağaç içinde benzersiz geçici kimlik (gerçek ID değil). */
  localId: number;
  typeName: string;
  /** Form değerleri (FK kolonu HARİÇ — o kaydetme anında eklenir). */
  values: DataRow;
  /** altTipAdı → o tipteki bekleyen düğümler. */
  children: Map<string, StagedNode[]>;
  /** Kaydedildiyse sunucudaki gerçek ID; null ise hâlâ bellekte. */
  savedId: number | null;
  /** Son kaydetme denemesinin hata mesajı; başarılıysa null. */
  error: string | null;
  /**
   * Kullanıcı bu düğümün değerlerini değiştirdi mi.
   *
   * Yalnızca `savedId` dolu düğümlerde anlamlıdır: `addTree` mevcut bir kaydı
   * GÜNCELLEMEZ (`existingId` dolu düğümü atlar), o yüzden değişmiş kayıtlı düğümler
   * ayrıca `update()` ile gönderilmelidir. Bu bayrak olmadan kullanıcının düzeltmesi
   * sessizce kaybolur.
   */
  dirty: boolean;
}

let localIdSeq = 0;

/** Yeni bir bekleyen düğüm oluşturur. */
export function createStagedNode(typeName: string, values: DataRow): StagedNode {
  return {
    localId: ++localIdSeq,
    typeName,
    values,
    children: new Map<string, StagedNode[]>(),
    savedId: null,
    error: null,
    dirty: false
  };
}

/**
 * Sunucudan gelen bir satırı ŞEMA kolon adlarına göre normalize eder.
 *
 * Backend kolon meta adını PascalCase (`UnitPrice`), satır verisini ise
 * `System.Text.Json` varsayılan politikasıyla camelCase (`unitPrice`) döndürür
 * (bkz. `fieldValue` doc'u). `StagedNode.values` bu iki dünyanın buluştuğu yer
 * olduğu için satır TEK casing'e indirgenmelidir:
 *
 * - Form kontrolleri `col.columnName` (PascalCase) ile kurulur → normalize edilmezse
 *   her alan boş açılır.
 * - `sanitizePayload` de PascalCase anahtarları tanır → normalize edilmezse camelCase
 *   orijinal ile PascalCase kopyası payload'a BİRLİKTE gider ve mevcut değer null'lanır.
 *
 * Şemada olmayan alanlara dokunulmaz — `ID` gibi meta alanlar korunur.
 */
export function normalizeRow(columns: PublishedColumn[], row: DataRow): DataRow {
  const out: DataRow = {};
  for (const col of columns) {
    out[col.columnName] = fieldValue(row, col.columnName) ?? null;
  }
  const id = fieldValue(row, 'ID');
  if (id !== undefined) out['ID'] = id;
  return out;
}

/** Bir düğümün belirli tipteki alt düğümlerini döner (yoksa boş dizi). */
export function childrenOf(node: StagedNode, childTypeName: string): StagedNode[] {
  return node.children.get(childTypeName) ?? [];
}

/** Alt düğüm ekler veya aynı localId'li olanı değiştirir. */
export function upsertChild(node: StagedNode, childTypeName: string, child: StagedNode): void {
  const list = [...childrenOf(node, childTypeName)];
  const idx = list.findIndex(n => n.localId === child.localId);
  if (idx >= 0) list[idx] = child;
  else list.push(child);
  node.children.set(childTypeName, list);
}

/** Alt düğümü kaldırır. */
export function removeChild(node: StagedNode, childTypeName: string, localId: number): void {
  node.children.set(childTypeName, childrenOf(node, childTypeName).filter(n => n.localId !== localId));
}

/** Ağaçtaki (kök hariç) toplam bekleyen — henüz kaydedilmemiş — düğüm sayısı. */
export function pendingCount(node: StagedNode): number {
  let total = 0;
  for (const [, list] of node.children) {
    for (const child of list) {
      if (child.savedId === null) total++;
      total += pendingCount(child);
    }
  }
  return total;
}

/** Ağaçta kaydetme hatası taşıyan düğüm var mı. */
export function hasErrors(node: StagedNode): boolean {
  for (const [, list] of node.children) {
    for (const child of list) {
      if (child.error) return true;
      if (hasErrors(child)) return true;
    }
  }
  return false;
}

/**
 * Alt model FK kolonunun adı. Projedeki konvansiyon: `<ÜstTipAdı>Id`
 * (bkz. model-detail `buildTabState`). Şema tarafında da aynı ad üretilir.
 *
 * NOT: Kaydetme sırasında bu değeri İSTEMCİ ATAMAZ — `addTree` ucunda sunucu,
 * üst kaydın gerçek ID'sini yazar. Bu yardımcı yalnızca listeleme/filtreleme
 * (FK'ya göre alt kayıt çekme) için kullanılır.
 */
export function fkColumnFor(parentTypeName: string): string {
  return parentTypeName + 'Id';
}

/**
 * Bekleyen ağacı `POST /PublishedModel/addTree` gövdesine çevirir.
 *
 * `clientId` olarak düğümün geçici `localId`'si kullanılır; sunucu yanıtındaki
 * `savedIds` / `errors` sözlükleri bu anahtarla geri döner. FK kolonu payload'a
 * KONULMAZ — sunucu üst kaydın gerçek ID'sinden kendisi atar.
 */
export function toTreeDto(
  node: StagedNode,
  columnsOf: (typeName: string) => PublishedColumn[],
  existingId: number | null = null
): DynamicTreeNodeDto {
  const children: DynamicTreeNodeDto[] = [];
  for (const [, list] of node.children) {
    for (const child of list) {
      children.push(toTreeDto(child, columnsOf));
    }
  }

  return {
    typeName: node.typeName,
    clientId: String(node.localId),
    jsonData: sanitizePayload(columnsOf(node.typeName), node.values),
    existingId: existingId ?? node.savedId,
    children
  };
}

/** Ağaçtaki tüm düğümleri düz listeye açar (yanıttaki ID/hata eşlemesi için). */
export function flattenNodes(node: StagedNode): StagedNode[] {
  const out: StagedNode[] = [];
  const walk = (n: StagedNode) => {
    out.push(n);
    for (const [, list] of n.children) list.forEach(walk);
  };
  walk(node);
  return out;
}

/**
 * Ağaçtaki KAYITLI ve DEĞİŞTİRİLMİŞ düğümler — `addTree` bunları yazamaz, her biri için
 * ayrı bir `update()` gönderilmelidir. Kök dahil edilir; çağıran gerekiyorsa ayıklar.
 */
export function dirtyNodes(root: StagedNode): StagedNode[] {
  return flattenNodes(root).filter(n => n.savedId !== null && n.dirty);
}

/** Ağaçta sunucuya EKLENECEK (henüz kaydedilmemiş) düğüm var mı. */
export function hasInserts(root: StagedNode): boolean {
  return flattenNodes(root).some(n => n.savedId === null);
}

// ─── Doğrulama kuralları ──────────────────────────────────────────────────────

/**
 * Şema kurallarını (regex / uzunluk / aralık) Angular validator'larına çevirir.
 *
 * Kurallar `PublishedTableService.getSchema()` ile gelir — backend
 * `ValidateDynamicEntity` ile AYNI kaynağı kullanır, böylece istemci ve sunucu
 * doğrulaması birebir örtüşür ve kullanıcı hataları sunucuya gitmeden görür.
 *
 * `Validators.pattern` boş değerde çalışmaz; bu kasıtlıdır — backend de null
 * değerlerde kural kontrollerini atlar.
 */
export function validatorsFor(
  col: PublishedColumn,
  rule: PublishedColumnSchema | undefined
): ValidatorFn[] {
  const validators: ValidatorFn[] = [];

  // Zorunluluk: getModels() `isNullable`, getSchema() `isRequired` döner — ikisi de kabul edilir.
  const required = rule ? rule.isRequired : col.isNullable === false;
  if (required) validators.push(Validators.required);

  // image/file: maxLength = boyut sınırı (KB). Kural yoksa da platform tavanı uygulanır.
  if (isFileType(col.dataType)) {
    validators.push(maxFileSizeValidator(col.dataType, rule?.maxLength ?? col.maxLength));
    return validators;
  }

  if (!rule) return validators;

  if (col.dataType === 'string') {
    if (rule.minLength != null) validators.push(Validators.minLength(rule.minLength));
    if (rule.maxLength != null) validators.push(Validators.maxLength(rule.maxLength));
    if (rule.regex) {
      try {
        // Geçersiz desen formu tamamen kilitlemesin — backend de bozuk regex'i atlıyor.
        new RegExp(rule.regex);
        validators.push(Validators.pattern(rule.regex));
      } catch {
        /* bozuk desen — istemci tarafında atla */
      }
    }
  }

  if (NUMERIC_TYPES.has(col.dataType)) {
    if (rule.min != null) validators.push(Validators.min(rule.min));
    if (rule.max != null) validators.push(Validators.max(rule.max));
  }

  return validators;
}

const NUMERIC_TYPES = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);
