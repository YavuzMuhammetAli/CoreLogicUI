import {
  LAYOUT_LIMITS, GRID_COLUMNS, LayoutColumnFact, LayoutIssue, LayoutIssueCode, LayoutIssueSeverity,
  LayoutValidationMode, ScreenViewType
} from './screen-layout.model';

/**
 * Yerleşim belgesi doğrulaması — SAF.
 *
 * Sunucudaki `Business/Concrete/ScreenLayout/ScreenLayoutValidator.cs` ile BİREBİR aynı
 * kurallar: tasarımcı "yayınlanabilir" deyip sunucu reddetmesin (ya da tersi). Ortak
 * vektörler `screen-layout.vectors.json` iki repoda birebir kopyadır; kural değiştiren her
 * düzenleme iki dosyaya birlikte yapılır ve vektör eklenir.
 *
 * Elle eşitlenen ayrıntılar: tam sayı kararı `Number.isInteger` ↔ `d == Math.Floor(d)`
 * (12.0 tam sayıdır), metin uzunluğu UTF-16 birimi (iki tarafta da `.length`), boyut UTF-8 bayt.
 */

const STRUCTURAL = new Set<LayoutIssueCode>([
  'unreadable', 'tooLarge', 'limit', 'badId', 'duplicateId', 'badKind', 'spanRange', 'rowsRange',
  'textTooLong', 'badTone', 'widthRange', 'noTabs'
]);

const SEMANTIC = new Set<LayoutIssueCode>([
  'unknownColumn', 'duplicateColumn', 'requiredHidden', 'emptyTab', 'widgetType', 'noColumns'
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export function isStructural(code: LayoutIssueCode): boolean {
  return STRUCTURAL.has(code);
}

export function severityOf(code: LayoutIssueCode, mode: LayoutValidationMode): LayoutIssueSeverity {
  if (STRUCTURAL.has(code)) return 'error';
  if (SEMANTIC.has(code)) return mode === 'publish' ? 'error' : 'warning';
  return 'warning';
}

/** Hata (engelleyen) sorun var mı. */
export function hasErrors(issues: readonly LayoutIssue[]): boolean {
  return issues.some(i => i.severity === 'error');
}

/** Ham JSON metnini doğrular — boyut ve ayrıştırma dahil (sunucunun gördüğü yol). */
export function validateLayoutText(
  text: string,
  viewType: ScreenViewType,
  facts: readonly LayoutColumnFact[] | null,
  mode: LayoutValidationMode
): LayoutIssue[] {
  if (!text.trim()) return [only('unreadable', mode)];
  if (utf8Length(text) > LAYOUT_LIMITS.maxBytes) return [only('tooLarge', mode)];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [only('unreadable', mode)];
  }
  return validateLayout(parsed, viewType, facts, mode);
}

/** Ayrıştırılmış belgeyi doğrular. `facts` null ise kolon kuralları atlanır. */
export function validateLayout(
  input: unknown,
  viewType: ScreenViewType,
  facts: readonly LayoutColumnFact[] | null,
  mode: LayoutValidationMode
): LayoutIssue[] {
  try {
    if (!isObject(input) || input['schemaVersion'] !== 1) throw UNREADABLE;
    const walker = new Walker(facts, mode);
    if (viewType === 'list') walker.list(input);
    else walker.form(input);
    return walker.issues;
  } catch (e) {
    if (e === UNREADABLE) return [only('unreadable', mode)];
    throw e;
  }
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ─── İç ayrıntılar ──────────────────────────────────────────────────────────

/** Belgenin okunamaz olduğu an — tek sorun "unreadable" döner. */
const UNREADABLE = Symbol('unreadable');

type JsonObject = Record<string, unknown>;

function only(code: LayoutIssueCode, mode: LayoutValidationMode): LayoutIssue {
  return { code, severity: severityOf(code, mode) };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown): JsonObject {
  if (!isObject(value)) throw UNREADABLE;
  return value;
}

function requireArray(obj: JsonObject, name: string): unknown[] {
  const value = obj[name];
  if (!Array.isArray(value)) throw UNREADABLE;
  return value;
}

function optString(obj: JsonObject, name: string): string | null {
  const value = obj[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw UNREADABLE;
  return value;
}

function optBool(obj: JsonObject, name: string): boolean {
  const value = obj[name];
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw UNREADABLE;
  return value;
}

function optStringArray(obj: JsonObject, name: string): string[] {
  const value = obj[name];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw UNREADABLE;
  return value.map(entry => {
    if (typeof entry !== 'string' || entry === '') throw UNREADABLE;
    return entry;
  });
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/** "Çok satırlı" yalnız metin, "seçenek düğmeleri" yalnız enum kolonunda anlamlı. */
function widgetFits(widget: string, dataType: string): boolean {
  return widget === 'multiline' ? dataType === 'string' || dataType === 'text' : dataType === 'enum';
}

class Walker {
  readonly issues: LayoutIssue[] = [];
  private readonly facts: Map<string, LayoutColumnFact> | null;
  private readonly ids = new Set<string>();
  private readonly issueKeys = new Set<string>();

  constructor(private readonly factList: readonly LayoutColumnFact[] | null, private readonly mode: LayoutValidationMode) {
    if (factList) {
      this.facts = new Map();
      for (const fact of factList) if (!this.facts.has(fact.name)) this.facts.set(fact.name, fact);
    } else {
      this.facts = null;
    }
  }

  form(root: JsonObject): void {
    const tabs = requireArray(root, 'tabs');
    const hidden = optStringArray(root, 'hiddenColumns');
    if (tabs.length === 0) this.add('noTabs');

    const placedOrder: string[] = [];
    const placedCount = new Map<string, number>();
    let tabCount = 0, sectionCount = 0, itemCount = 0;

    for (const rawTab of tabs) {
      tabCount++;
      const tab = requireObject(rawTab);
      const tabId = this.checkId(tab);
      const tabTitle = optString(tab, 'title') ?? '';
      if (tabTitle.length > LAYOUT_LIMITS.maxTitleLength) this.add('textTooLong', tabId);

      let tabItems = 0;
      for (const rawSection of requireArray(tab, 'sections')) {
        sectionCount++;
        const section = requireObject(rawSection);
        const sectionId = this.checkId(section);
        const title = optString(section, 'title');
        if (title !== null && title.length > LAYOUT_LIMITS.maxTitleLength) this.add('textTooLong', sectionId);
        optBool(section, 'collapsible');
        optBool(section, 'collapsed');

        const items = requireArray(section, 'items');
        if (items.length === 0) this.add('emptySection', sectionId);
        for (const rawItem of items) {
          itemCount++;
          tabItems++;
          this.item(rawItem, placedOrder, placedCount);
        }
      }
      if (tabItems === 0) this.add('emptyTab', tabId);
    }

    if (tabCount > LAYOUT_LIMITS.maxTabs || sectionCount > LAYOUT_LIMITS.maxSections || itemCount > LAYOUT_LIMITS.maxItems) {
      this.add('limit');
    }

    // ── Kolon kuralları ──
    for (const column of placedOrder) {
      if (this.facts && !this.facts.has(column)) this.add('unknownColumn', undefined, column);
      if ((placedCount.get(column) ?? 0) > 1) this.add('duplicateColumn', undefined, column);
    }

    const hiddenSeen = new Set<string>();
    for (const column of hidden) {
      if (hiddenSeen.has(column)) {
        this.add('duplicateColumn', undefined, column);
        continue;
      }
      hiddenSeen.add(column);
      if (placedCount.has(column)) this.add('duplicateColumn', undefined, column);
      if (!this.facts) continue;
      const fact = this.facts.get(column);
      if (!fact) this.add('unknownColumn', undefined, column);
      else if (fact.mustStayVisible) this.add('requiredHidden', undefined, column);
    }

    if (this.factList) {
      for (const fact of this.factList) {
        if (!placedCount.has(fact.name) && !hiddenSeen.has(fact.name)) this.add('unplacedColumn', undefined, fact.name);
      }
    }
  }

  private item(rawItem: unknown, placedOrder: string[], placedCount: Map<string, number>): void {
    const item = requireObject(rawItem);
    const id = this.checkId(item);
    const kind = optString(item, 'kind');

    switch (kind) {
      case 'field': {
        const column = optString(item, 'column');
        if (!column) throw UNREADABLE;
        this.checkSpan(item, id);
        optBool(item, 'newRow');
        const widget = optString(item, 'widget');
        if (widget !== null && widget !== 'multiline' && widget !== 'radio') throw UNREADABLE;
        this.checkRows(item, id);

        const count = placedCount.get(column);
        if (count === undefined) {
          placedCount.set(column, 1);
          placedOrder.push(column);
        } else {
          placedCount.set(column, count + 1);
        }

        const fact = this.facts?.get(column);
        if (widget !== null && fact && !widgetFits(widget, fact.dataType)) this.add('widgetType', id, column);
        return;
      }
      case 'spacer':
        this.checkSpan(item, id);
        optBool(item, 'newRow');
        return;
      case 'divider':
        return;
      case 'note': {
        const text = optString(item, 'text') ?? '';
        if (text.length > LAYOUT_LIMITS.maxNoteLength) this.add('textTooLong', id);
        const tone = optString(item, 'tone');
        if (tone !== 'info' && tone !== 'warn') this.add('badTone', id);
        this.checkSpan(item, id);
        optBool(item, 'newRow');
        return;
      }
      default:
        this.add('badKind', id);
    }
  }

  list(root: JsonObject): void {
    const columns = requireArray(root, 'columns');
    if (columns.length === 0) this.add('noColumns');
    if (columns.length > LAYOUT_LIMITS.maxListColumns) this.add('limit');

    const seen = new Set<string>();
    for (const rawEntry of columns) {
      const entry = requireObject(rawEntry);
      const column = optString(entry, 'column');
      if (!column) throw UNREADABLE;

      const width = entry['width'];
      if (width !== undefined && width !== null && !isIntegerIn(width, LAYOUT_LIMITS.minWidth, LAYOUT_LIMITS.maxWidth)) {
        this.add('widthRange', undefined, column);
      }

      if (seen.has(column)) {
        this.add('duplicateColumn', undefined, column);
        continue;
      }
      seen.add(column);
      if (this.facts && !this.facts.has(column)) this.add('unknownColumn', undefined, column);
    }
  }

  private checkId(obj: JsonObject): string {
    const raw = obj['id'];
    const id = typeof raw === 'string' ? raw : undefined;
    if (id === undefined || !ID_PATTERN.test(id)) {
      this.add('badId', id);
      return id ?? '';
    }
    if (this.ids.has(id)) this.add('duplicateId', id);
    else this.ids.add(id);
    return id;
  }

  private checkSpan(item: JsonObject, id: string): void {
    if (!isIntegerIn(item['span'], 1, GRID_COLUMNS)) this.add('spanRange', id);
  }

  private checkRows(item: JsonObject, id: string): void {
    const rows = item['rows'];
    if (rows === undefined || rows === null) return;
    if (!isIntegerIn(rows, LAYOUT_LIMITS.minRows, LAYOUT_LIMITS.maxRows)) this.add('rowsRange', id);
  }

  private add(code: LayoutIssueCode, targetId?: string, column?: string): void {
    // Aynı sorun aynı hedefte bir kez yazılır (ör. üç kez yerleştirilen kolon).
    const key = `${code}|${targetId ?? ''}|${column ?? ''}`;
    if (this.issueKeys.has(key)) return;
    this.issueKeys.add(key);
    const issue: { -readonly [K in keyof LayoutIssue]: LayoutIssue[K] } = { code, severity: severityOf(code, this.mode) };
    if (targetId !== undefined) issue.targetId = targetId;
    if (column !== undefined) issue.column = column;
    this.issues.push(issue);
  }
}
