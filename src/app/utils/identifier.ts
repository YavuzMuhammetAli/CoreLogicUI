import { AbstractControl, FormArray, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Single source for model (table) and field (column) names.
 *
 * The user writes a free-form LABEL ("satış pazarlama formu"); the identifier
 * ("SatisPazarlamaFormu") is derived from it here. The name can also be typed by hand, but
 * every name sent to the backend must pass the validators here —
 * the rules match the backend, the error is just caught before saving.
 *
 * Pure functions; tied to Angular only through the ValidatorFn type and the form tree.
 */

export type IdentifierKind = 'model' | 'column';

/** Model name: PascalCase starting with an uppercase letter (the generated C# class name). */
export const MODEL_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

/** Column name: same as backend `SqlIdentifier.Pattern`. */
export const COLUMN_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/**
 * Identifier upper limit. SQL Server allows 128, but the name is also embedded in derived
 * constraint names (`FK_{table}_{column}_Rel`) — both must fit side by side.
 */
export const IDENTIFIER_MAX_LENGTH = 50;

/** Label upper limit — backend `PublishedTable.Label` / `PublishedTableMember.Label` NVARCHAR(255). */
export const LABEL_MAX_LENGTH = 255;

/**
 * Columns the system already writes to every dynamic table. Mirror of backend
 * `Core/Constants/DbBaseObjectColumns.All` — if a column is added there, update this too.
 */
export const RESERVED_COLUMN_NAMES: readonly string[] = [
  'ID', 'Active', 'RecordStatus',
  'CreatedOn', 'CreatedBy', 'LastModifiedOn', 'LastModifiedBy',
  'WorkflowStatus'
];

/**
 * System tables in the tenant database (backend `CoreLogicContext` DbSets + migration
 * tables). Creating a dynamic model with the same name would mean attempting CREATE/ALTER on an existing system table.
 */
export const RESERVED_MODEL_NAMES: readonly string[] = [
  'User', 'OperationClaim', 'UserOperationClaim', 'Role', 'UserRole', 'RolePermission', 'Permission',
  'PublishedTable', 'PublishedTableMember', 'ModelDefinition', 'ApplicationAssembly',
  'DataBaseOperation', 'DataBaseOperations', 'AuditLog', 'ModelColumnSetting',
  'ReportDefinition', 'DashboardDefinition', 'RelationshipDefinition', 'RelationshipMigrationHistory',
  'AppSetting', 'AiConversation', 'AiMessage', 'AiProposal',
  'WorkflowDefinition', 'WorkflowInstance', 'WorkflowTask', 'WorkflowEvent', 'WorkflowOutbox',
  'UserNotification', 'UserPreference', 'SchemaVersion',
  // Would cause name collisions in the generated C# code
  'System', 'Object', 'String', 'Microsoft'
];

/** C# keywords — break Roslyn compilation as column properties (case-sensitive). */
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
 * Letters that NFD decomposition does not reduce to ASCII. Turkish letters are here too: `ı` does not
 * decompose under NFD, and `İ` becomes `I + dot`, producing `i̇` (two characters) when lowercased.
 */
const CHAR_MAP: Record<string, string> = {
  'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
  'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U',
  'ß': 'ss', 'æ': 'ae', 'Æ': 'Ae', 'œ': 'oe', 'Œ': 'Oe', 'ø': 'o', 'Ø': 'O',
  'đ': 'd', 'Đ': 'D', 'ł': 'l', 'Ł': 'L'
};

/** Converts Turkish and accented letters to their ASCII equivalents; leaves other characters alone. */
export function transliterate(text: string): string {
  let out = '';
  for (const ch of text) out += CHAR_MAP[ch] ?? ch;
  return out.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Builds an identifier from a free-form label.
 *   "satış pazarlama formu" → "SatisPazarlamaFormu"
 *   "İŞ EMRİ"               → "IsEmri"   (lowercased first if entirely uppercase)
 *   "KDV tutarı"            → "KDVTutari" (acronyms kept in mixed case)
 *   "2024 satışlar"         → "Model2024Satislar" / "Alan2024Satislar"
 * Returns empty if nothing can be produced (punctuation only).
 */
export function toIdentifier(label: string | null | undefined, kind: IdentifierKind): string {
  let text = transliterate((label ?? '').trim());
  // "SATIŞ FORMU" → "SatisFormu"; so an unreadable name like "SATISFORMU" is not produced.
  if (!/[a-z]/.test(text)) text = text.toLowerCase();

  const words = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  if (!name) return '';

  if (/^[0-9]/.test(name)) name = (kind === 'model' ? 'Model' : 'Alan') + name;
  return name.slice(0, IDENTIFIER_MAX_LENGTH);
}

/**
 * Applied on every keystroke while the user types the name BY HAND: converts Turkish letters, drops
 * disallowed characters (spaces, punctuation). Does not force PascalCase — respects what the user
 * typed; only capitalizes the first letter of a model name (required by the pattern).
 */
export function sanitizeIdentifierInput(raw: string, kind: IdentifierKind): string {
  const allowed = kind === 'model' ? /[^A-Za-z0-9]/g : /[^A-Za-z0-9_]/g;
  let out = transliterate(raw ?? '').replace(allowed, '');
  if (kind === 'model' && out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out.slice(0, IDENTIFIER_MAX_LENGTH);
}

/**
 * Called on the name input's `(input)` event: cleans the typed value immediately and keeps the caret
 * where the user was typing (so it does not jump as if typed at the end).
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

// ─── Validation ───────────────────────────────────────────────────────────────

/** The surroundings a name must not collide with. All optional; an omitted check is skipped. */
export interface IdentifierContext {
  /** Other names in the same scope (sibling columns or existing models). */
  taken?: Iterable<string | null | undefined>;
  /** Name of the column's model — in C# a member name cannot equal the class name (CS0542). */
  modelName?: string | null;
  /** For a sub-model, the parent model's name — the `{Parent}Id` FK column is generated by the system. */
  parentName?: string | null;
}

/** Error keys — `identifierErrorMessage` maps them to i18n keys. */
export type IdentifierErrorKey =
  | 'identifierMaxLength' | 'identifierPattern' | 'identifierKeyword' | 'identifierReserved'
  | 'identifierSameAsModel' | 'identifierParentFk' | 'identifierDuplicate';

const eqCi = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Pure check: null if the name is valid, otherwise a single error object. An empty name is `required`'s job. */
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
 * If the generated name breaks a rule (collision, reserved name…) finds the first valid name by
 * appending a number: "MusteriAdi" → "MusteriAdi2" → "MusteriAdi3".
 * Automatic generation itself never suggests an invalid name.
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

// ─── Deriving context from the form tree ─────────────────────────────────────
//
// Model form: { label, entityName, columns: FormArray<{ columnName, label, … }>, subModels: FormArray<model> }
// The validator finds its siblings, model and parent model from its own position; so
// nested sub-model drafts need no context passed in from outside.

const isModelGroup = (c: AbstractControl | null | undefined): c is FormGroup =>
  c instanceof FormGroup && !!c.get('entityName') && !!c.get('columns');

/** All model names in the tree (excluding `except`). */
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

/** Context derived from the control's position in the form tree. Empty if not attached to a tree. */
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

/** Merges two contexts: `taken` lists are concatenated, `extra` wins for single-valued fields. */
function mergeContext(base: IdentifierContext, extra: IdentifierContext): IdentifierContext {
  return {
    taken: [...(base.taken ?? []), ...(extra.taken ?? [])],
    modelName: extra.modelName !== undefined ? extra.modelName : base.modelName,
    parentName: extra.parentName !== undefined ? extra.parentName : base.parentName
  };
}

/**
 * Name validator. Context is first derived from the form tree; if `extra` is given, information not in
 * the tree (existing tables, siblings of the draft in the popup) is added from it.
 * `extra` is a function — its current value is read on every validation.
 */
export function identifierValidator(kind: IdentifierKind, extra?: () => IdentifierContext): ValidatorFn {
  return control => identifierErrors(
    control.value,
    kind,
    mergeContext(structuralContext(control, kind), extra ? extra() : {})
  );
}

/**
 * Cross-sibling rules (collisions) mean changing one name also affects the validity of the others;
 * Angular does not recompute this by itself. Before saving, all names in the
 * tree are re-validated.
 */
export function revalidateIdentifiers(root: AbstractControl): void {
  if (isModelGroup(root)) {
    root.get('entityName')!.updateValueAndValidity({ emitEvent: false });
    (root.get('columns') as FormArray).controls.forEach(c =>
      c.get('columnName')?.updateValueAndValidity({ emitEvent: false }));
    const subs = root.get('subModels');
    if (subs instanceof FormArray) subs.controls.forEach(revalidateIdentifiers);
  }
  // Group validity must be refreshed after the child controls.
  root.updateValueAndValidity({ emitEvent: false });
}

/** The error to show in the template: i18n key + placeholders. Null if there is no error. */
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

// ─── Label → name sync ────────────────────────────────────────────────────────

/**
 * Generates the name as the label changes. The name follows the label as long as it stays at the
 * last generated value (or empty); following stops if the user edits the name by hand, and resumes if
 * they clear it or `regenerate()` is called. If the name control is locked (saved column /
 * saved model) nothing is written.
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
      if (current !== '' && current !== this.lastAuto) return; // edited by hand
      this.apply();
    });
  }

  /** Regenerates the name from the label and restarts following (the "↺" button). */
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
