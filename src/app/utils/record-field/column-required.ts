import { PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';

/**
 * Kolon zorunlu mu — formdaki TEK karar noktası.
 *
 * Şema kuralı (`/PublishedModel/schema` → `isRequired`) varsa o esastır. Yoksa derlenmiş
 * tipin `isNullable`'ına düşülür; ama bu yalnız değer tiplerinde anlamlıdır: backend
 * `CoreLogicTypeMap.IsNullable` her REFERANS tipi (string, image, file) için `true`
 * döndüğünden zorunlu bir metin kolonu `isNullable=true` görünür. Görünürlük kararı
 * eskiden doğrudan `!isNullable`'a bakıyordu; zorunlu metin alanı "Kolonlar" ayarıyla
 * gizlenebiliyor, Kaydet de gizli alandaki `required` hatası yüzünden sessizce dönüyordu.
 */
export function isColumnRequired(
  col: Pick<PublishedColumn, 'isNullable'>,
  rule: Pick<PublishedColumnSchema, 'isRequired'> | undefined
): boolean {
  return rule ? rule.isRequired : col.isNullable === false;
}

/**
 * Kolon formdan gizlenemez mi.
 *
 * Zorunlu kolon gizlenirse form geçersiz kalır ve kullanıcı neyi doldurması gerektiğini
 * göremez. İstisna: değeri sunucuda üretilen salt okunur otomatik değer kolonları —
 * `AutoValueFormBinding` onları `disable` eder, disabled kontrol hiçbir zaman geçersiz
 * sayılmaz ve sunucu değeri kendisi yazar. `auto-value.ts`'teki `readOnly` kararının
 * aynısı: "kaydedilirken" tetiği, SEQ() kullanan formül ya da kolonun `isReadOnly`'si.
 */
export function mustStayVisible(
  col: Pick<PublishedColumn, 'isNullable'>,
  rule: PublishedColumnSchema | undefined
): boolean {
  if (!isColumnRequired(col, rule)) return false;
  return !isServerFilledAutoValue(rule);
}

/** Kural, değeri sunucuda yazılan salt okunur bir otomatik değer mi. */
export function isServerFilledAutoValue(rule: PublishedColumnSchema | undefined): boolean {
  const trigger = rule?.autoValueTrigger;
  const expression = rule?.autoValueExpression?.trim();
  if (!trigger || !expression) return false;
  return trigger === 'save' || !!rule?.isReadOnly || SEQ_CALL.test(expression);
}

const SEQ_CALL = /\bSEQ\s*\(/i;
