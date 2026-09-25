import { AbstractControl, FormArray, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Model (tablo) ve alan (kolon) adları için tek kaynak.
 *
 * Kullanıcı serbest bir ETİKET yazar ("satış pazarlama formu"); tanımlayıcı
 * ("SatisPazarlamaFormu") buradan türetilir. Ad elle de yazılabilir ama
 * backend'e gidecek her ad buradaki doğrulayıcılardan geçmek zorundadır —
 * kural backend'le aynıdır, yalnızca hata kayda gitmeden yakalanır.
 *
 * Saf fonksiyonlar; Angular'a yalnızca ValidatorFn tipi ve form ağacı üzerinden bağlıdır.
 */

export type IdentifierKind = 'model' | 'column';

/** Model adı: büyük harfle başlayan PascalCase (üretilen C# sınıf adı). */
export const MODEL_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

/** Kolon adı: backend `SqlIdentifier.Pattern` ile aynı. */
export const COLUMN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Tanımlayıcı üst sınırı. SQL Server 128'e izin verir ama ad, türetilmiş
 * constraint adlarına da gömülür (`FK_{tablo}_{kolon}_Rel`) — ikisi yan yana sığmalı.
 */
export const IDENTIFIER_MAX_LENGTH = 50;

/** Etiket üst sınırı — backend `PublishedTable.Label` / `PublishedTableMember.Label` NVARCHAR(255). */
export const LABEL_MAX_LENGTH = 255;

/**
 * Her dinamik tabloya sistemin zaten yazdığı kolonlar. Backend
 * `Core/Constants/DbBaseObjectColumns.All` aynasıdır — oraya kolon eklenirse burası da güncellenmeli.
 */
export const RESERVED_COLUMN_NAMES: readonly string[] = [
  'ID', 'Active', 'RecordStatus',
  'CreatedOn', 'CreatedBy', 'LastModifiedOn', 'LastModifiedBy',
  'WorkflowStatus'
];

/**
 * Tenant veritabanındaki sistem tabloları (backend `CoreLogicContext` DbSet'leri + migrasyon
 * tabloları). Aynı adla dinamik model açmak mevcut sistem tablosuna CREATE/ALTER denemek demektir.
 */
export const RESERVED_MODEL_NAMES: readonly string[] = [
  'User', 'OperationClaim', 'UserOperationClaim', 'Role', 'UserRole', 'RolePermission', 'Permission',
  'PublishedTable', 'PublishedTableMember', 'ModelDefinition', 'ApplicationAssembly',
  'DataBaseOperation', 'DataBaseOperations', 'AuditLog', 'ModelColumnSetting',
  'ReportDefinition', 'DashboardDefinition', 'RelationshipDefinition', 'RelationshipMigrationHistory',
  'AppSetting', 'AiConversation', 'AiMessage', 'AiProposal',
  'WorkflowDefinition', 'WorkflowInstance', 'WorkflowTask', 'WorkflowEvent', 'WorkflowOutbox',
  'UserNotification', 'UserPreference', 'SchemaVersion',
  // Üretilen C# kodunda ad çakışması yaratır
  'System', 'Object', 'String', 'Microsoft'
];

/** C# anahtar kelimeleri — kolon property'si olarak Roslyn derlemesini bozar (büyük/küçük harf duyarlı). */
const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class',
  'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event',
  'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if',
  'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null',
  'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly',
  'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe',
  'ushort', 'using', 'virtual', 'void', 'volatile', 'while'
]);

const RESERVED_COLUMNS_CI = new Set(RESERVED_COLUMN_NAMES.map(n => n.toLowerCase()));
const RESERVED_MODELS_CI = new Set(RESERVED_MODEL_NAMES.map(n => n.toLowerCase()));

/**
 * NFD ayrıştırmasıyla ASCII'ye inmeyen harfler. Türkçe harfler de burada: `ı` NFD'de
 * ayrışmaz, `İ` ise `I + nokta` olur ve küçültülünce `i̇` (iki karakter) üretir.
 */
const CHAR_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
  'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
  'ß': 'ss', 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe', 'ø': 'o', 'Ø': 'O',
  'đ': 'd', 'Đ': 'D', 'ł': 'l', 'Ł': 'L'
};

/** Türkçe ve aksanlı harfleri ASCII karşılığına çevirir; diğer karakterlere dokunmaz. */
export function transliterate(text: string): string {
  let out = '';
  for (const ch of text) out += CHAR_MAP[ch] ?? ch;
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Serbest bir etiketten tanımlayıcı üretir.
 *   "satış pazarlama formu" → "SatisPazarlamaFormu"
 *   "İŞ EMRİ"               → "IsEmri"   (tamamı büyük harfse önce küçültülür)
 *   "KDV tutarı"            → "KDVTutari" (karışık yazımda kısaltma korunur)
 *   "2024 satışlar"         → "Model2024Satislar" / "Alan2024Satislar"
 * Üretilebilecek bir şey yoksa (yalnız noktalama) boş döner.
 */
export function toIdentifier(label: string | null | undefined, kind: IdentifierKind): string {
  let text = transliterate((label ?? '').trim());
  // "SATIŞ FORMU" → "SatisFormu"; "SATISFORMU" gibi okunmaz bir ad üretilmesin.
  if (!/[a-z]/.test(text)) text = text.toLowerCase();

  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!name) return '';

  if (/^[0-9]/.test(name)) name = (kind === 'model' ? 'Model' : 'Alan') + name;
  return name.slice(0, IDENTIFIER_MAX_LENGTH);
}

/**
 * Kullanıcı adı ELLE yazarken her tuşta uygulanır: Türkçe harfleri çevirir, izin
 * verilmeyen karakterleri (boşluk, noktalama) atar. PascalCase dayatmaz — kullanıcının
 * yazdığına saygı duyar; yalnızca model adının ilk harfini büyütür (desen gereği).
 */
export function sanitizeIdentifierInput(raw: string, kind: IdentifierKind): string {
  const allowed = kind === 'model' ? /[^A-Za-z0-9]/g : /[^A-Za-z0-9_]/g;
  let out = transliterate(raw ?? '').replace(allowed, '');
  if (kind === 'model' && out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out.slice(0, IDENTIFIER_MAX_LENGTH);
}

/**
 * Ad input'unun `(input)` olayında çağrılır: yazılan değeri anında temizler ve imleci
 * kullanıcının yazdığı yerde tutar (yalnızca sona yazılmış gibi zıplamasın).
 */
export function sanitizeIdentifierInputEvent(event: Event, control: AbstractControl, kind: IdentifierKind): void {
  const el = event.target as HTMLInputElement;
  const raw = el.value;
  const clean = sanitizeIdentifierInput(raw, kind);
  if (clean === raw) return;

  const caret = sanitizeIdentifierInput(raw.slice(0, el.selectionStart ?? raw.length), kind).length;
  el.value = clean;
  control.setValue(clean);
  el.setSelectionRange(caret, caret);
}

// ─── Doğrulama ────────────────────────────────────────────────────────────────

/** Bir adın çakışmaması gereken çevre. Hepsi opsiyonel; verilmeyen kontrol atlanır. */
export interface IdentifierContext {
  /** Aynı kapsamdaki diğer adlar (kardeş kolonlar ya da mevcut modeller). */
  taken?: Iterable<string | null | undefined>;
  /** Kolonun ait olduğu modelin adı — C#'ta üye adı sınıf adıyla aynı olamaz (CS0542). */
  modelName?: string | null;
  /** Alt modelse üst modelin adı — `{Parent}Id` FK kolonu sistem tarafından üretilir. */
  parentName?: string | null;
}

/** Hata anahtarları — `identifierErrorMessage` bunları i18n anahtarına çevirir. */
export type IdentifierErrorKey =
  | 'identifierMaxLength' | 'identifierPattern' | 'identifierKeyword' | 'identifierReserved'
  | 'identifierSameAsModel' | 'identifierParentFk' | 'identifierDuplicate';

const eqCi = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Saf kontrol: ad geçerliyse null, değilse tek bir hata nesnesi döner. Boş ad `required`'ın işidir. */
export function identifierErrors(
  value: string | null | undefined,
  kind: IdentifierKind,
  ctx: IdentifierContext = {}
): ValidationErrors | null {
  if (!value) return null;

  if (value.length > IDENTIFIER_MAX_LENGTH) {
    return { identifierMaxLength: { max: IDENTIFIER_MAX_LENGTH } };
  }
  const pattern = kind === 'model' ? MODEL_NAME_PATTERN : COLUMN_NAME_PATTERN;
  if (!pattern.test(value)) return { identifierPattern: true };
  if (CSHARP_KEYWORDS.has(value)) return { identifierKeyword: { name: value } };

  const reserved = kind === 'model' ? RESERVED_MODELS_CI : RESERVED_COLUMNS_CI;
  if (reserved.has(value.toLowerCase())) return { identifierReserved: { name: value } };

  if (kind === 'column') {
    if (eqCi(value, ctx.modelName)) return { identifierSameAsModel: { name: value } };
    if (ctx.parentName && eqCi(value, `${ctx.parentName}Id`)) {
      return { identifierParentFk: { name: value } };
    }
  }

  for (const other of ctx.taken ?? []) {
    if (eqCi(value, other)) return { identifierDuplicate: { name: value } };
  }
  return null;
}

/**
 * Üretilen ad bir kurala takılırsa (çakışma, rezerve ad…) sonuna sayı ekleyerek
 * geçerli ilk adı bulur: "MusteriAdi" → "MusteriAdi2" → "MusteriAdi3".
 * Otomatik üretimin kendisi hiçbir zaman hatalı ad önermez.
 */
export function uniqueIdentifier(base: string, kind: IdentifierKind, ctx: IdentifierContext = {}): string {
  if (!base) return '';
  const taken = [...(ctx.taken ?? [])];
  const fullCtx = { ...ctx, taken };
  if (!identifierErrors(base, kind, fullCtx)) return base;

  for (let n = 2; n < 1000; n++) {
    const suffix = String(n);
    const candidate = base.slice(0, IDENTIFIER_MAX_LENGTH - suffix.length) + suffix;
    if (!identifierErrors(candidate, kind, fullCtx)) return candidate;
  }
  return base;
}

// ─── Form ağacından bağlam çıkarımı ───────────────────────────────────────────
//
// Model formu: { label, entityName, columns: FormArray<{ columnName, label, … }>, subModels: FormArray<model> }
// Doğrulayıcı kendi konumundan kardeşlerini, modelini ve üst modelini bulur; böylece
// iç içe alt model taslaklarında dışarıdan bağlam geçirmek gerekmez.

const isModelGroup = (c: AbstractControl | null | undefined): c is FormGroup =>
  c instanceof FormGroup && !!c.get('entityName') && !!c.get('columns');

/** Ağaçtaki tüm model adları (`except` hariç). */
function collectModelNames(root: AbstractControl, except: AbstractControl): string[] {
  const names: string[] = [];
  const walk = (node: AbstractControl): void => {
    if (isModelGroup(node)) {
      const nameCtrl = node.get('entityName')!;
      if (nameCtrl !== except && nameCtrl.value) names.push(nameCtrl.value);
      const subs = node.get('subModels');
      if (subs instanceof FormArray) subs.controls.forEach(walk);
    }
  };
  walk(root);
  return names;
}

/** Kontrolün form ağacındaki konumundan çıkarılan bağlam. Ağaca bağlı değilse boş döner. */
export function structuralContext(control: AbstractControl, kind: IdentifierKind): IdentifierContext {
  if (kind === 'model') {
    let root: AbstractControl = control;
    while (root.parent) root = root.parent;
    return { taken: collectModelNames(root, control) };
  }

  const colGroup = control.parent;
  const columns = colGroup?.parent;
  if (!(columns instanceof FormArray)) return {};

  const model = columns.parent;
  const parentModel = model?.parent?.parent;
  return {
    taken: columns.controls.filter(c => c !== colGroup).map(c => c.get('columnName')?.value),
    modelName: model?.get('entityName')?.value ?? null,
    parentName: isModelGroup(parentModel) ? parentModel.get('entityName')!.value : null
  };
}

/** İki bağlamı birleştirir: `taken` listeleri birleşir, tekil alanlarda `extra` kazanır. */
function mergeContext(base: IdentifierContext, extra: IdentifierContext): IdentifierContext {
  return {
    taken: [...(base.taken ?? []), ...(extra.taken ?? [])],
    modelName: extra.modelName !== undefined ? extra.modelName : base.modelName,
    parentName: extra.parentName !== undefined ? extra.parentName : base.parentName
  };
}

/**
 * Ad doğrulayıcısı. Bağlam önce form ağacından çıkarılır; `extra` verilirse ağaçta
 * olmayan bilgiler (mevcut tablolar, popup'taki taslağın kardeşleri) onunla eklenir.
 * `extra` bir fonksiyondur — her doğrulamada güncel değeri okunur.
 */
export function identifierValidator(kind: IdentifierKind, extra?: () => IdentifierContext): ValidatorFn {
  return control => identifierErrors(
    control.value,
    kind,
    mergeContext(structuralContext(control, kind), extra ? extra() : {})
  );
}

/**
 * Kardeşler arası kurallar (çakışma) bir ad değişince diğerlerinin geçerliliğini de
 * etkiler; Angular bunu kendiliğinden yeniden hesaplamaz. Kaydetmeden önce tüm
 * ağaçtaki adlar yeniden doğrulanır.
 */
export function revalidateIdentifiers(root: AbstractControl): void {
  if (isModelGroup(root)) {
    root.get('entityName')!.updateValueAndValidity({ emitEvent: false });
    (root.get('columns') as FormArray).controls.forEach(c =>
      c.get('columnName')?.updateValueAndValidity({ emitEvent: false }));
    const subs = root.get('subModels');
    if (subs instanceof FormArray) subs.controls.forEach(revalidateIdentifiers);
  }
  // Grup geçerliliği alt kontrollerden sonra tazelenmeli.
  root.updateValueAndValidity({ emitEvent: false });
}

/** Şablonda gösterilecek hata: i18n anahtarı + yer tutucular. Hata yoksa null. */
export function identifierErrorMessage(
  control: AbstractControl | null | undefined
): { key: string; params: Record<string, string | number> } | null {
  const errors = control?.errors;
  if (!errors) return null;
  if (errors['required']) return { key: 'identifier.error.required', params: {} };

  const map: Record<IdentifierErrorKey, string> = {
    identifierMaxLength: 'identifier.error.maxLength',
    identifierPattern: 'identifier.error.pattern',
    identifierKeyword: 'identifier.error.keyword',
    identifierReserved: 'identifier.error.reserved',
    identifierSameAsModel: 'identifier.error.sameAsModel',
    identifierParentFk: 'identifier.error.parentFk',
    identifierDuplicate: 'identifier.error.duplicate'
  };
  for (const errKey of Object.keys(map) as IdentifierErrorKey[]) {
    if (errors[errKey]) {
      const params = typeof errors[errKey] === 'object' ? errors[errKey] : {};
      return { key: map[errKey], params };
    }
  }
  return null;
}

// ─── Etiket → ad senkronu ─────────────────────────────────────────────────────

/**
 * Etiket değiştikçe adı üretir. Ad, son üretilen değerde (ya da boş) durduğu sürece
 * etiketi takip eder; kullanıcı adı elle değiştirirse takip durur, adı silerse ya da
 * `regenerate()` çağrılırsa yeniden başlar. Ad kontrolü kilitliyse (kayıtlı kolon /
 * kayıtlı model) hiçbir şey yazılmaz.
 */
export class LabelNameSync {
  private lastAuto: string;
  private readonly sub: Subscription;

  constructor(
    private readonly labelCtrl: AbstractControl,
    private readonly nameCtrl: AbstractControl,
    private readonly kind: IdentifierKind,
    private readonly ctx: () => IdentifierContext = () => ({})
  ) {
    this.lastAuto = this.generate();
    this.sub = labelCtrl.valueChanges.subscribe(() => {
      if (this.nameCtrl.disabled) return;
      const current = this.nameCtrl.value ?? '';
      if (current !== '' && current !== this.lastAuto) return; // elle değiştirilmiş
      this.apply();
    });
  }

  /** Adı etiketten yeniden üretir ve takibi yeniden başlatır ("↺" düğmesi). */
  regenerate(): void {
    if (this.nameCtrl.disabled) return;
    this.apply();
    this.nameCtrl.markAsTouched();
  }

  unsubscribe(): void {
    this.sub.unsubscribe();
  }

  private apply(): void {
    this.lastAuto = this.generate();
    this.nameCtrl.setValue(this.lastAuto);
    this.nameCtrl.markAsDirty();
  }

  private generate(): string {
    const ctx = mergeContext(structuralContext(this.nameCtrl, this.kind), this.ctx());
    return uniqueIdentifier(toIdentifier(this.labelCtrl.value, this.kind), this.kind, ctx);
  }
}
