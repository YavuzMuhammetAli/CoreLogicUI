import {
  NAV_LIMITS, NAV_PAGES, NavFacts, NavIssue, NavIssueCode, NavIssueSeverity, NavValidationMode
} from './nav-layout.model';
import { utf8Length } from '../screen-layout/screen-layout.validate';

/**
 * Navigation document validation — PURE.
 *
 * Rules IDENTICAL to the server-side `Business/Concrete/Design/NavigationLayoutValidator.cs`;
 * the shared vectors `nav-layout.vectors.json` are byte-for-byte copies in both repos. Every edit that
 * changes a rule is made to both files together and a vector is added.
 *
 * Details kept in sync by hand: the integer check `Number.isInteger` ↔ `d == Math.Floor(d)` (10.0 is an
 * integer), text length in UTF-16 units, size in UTF-8 bytes, the .NET side uses `\z` in regular
 * expressions (JS `$` does not accept a trailing newline).
 */

const STRUCTURAL = new Set<NavIssueCode>([
  'unreadable', 'tooLarge', 'limit', 'badId', 'duplicateId', 'badKind', 'textTooLong',
  'badUrl', 'badIcon', 'badPage', 'badTarget', 'nestedFolder'
]);

const SEMANTIC = new Set<NavIssueCode>(['emptyLabel', 'unknownModel', 'unknownTarget', 'duplicateModel']);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const ICON_PATTERN = /^[a-z0-9_]{1,40}$/;
/** http(s) only; no whitespace or control characters. Schemes like `javascript:` are thus excluded. */
const URL_PATTERN = /^[Hh][Tt][Tt][Pp][Ss]?:\/\/[^\u0000- \u007f]+$/;
const INT_MAX = 2_147_483_647;

export function isNavStructural(code: NavIssueCode): boolean {
  return STRUCTURAL.has(code);
}

export function navSeverityOf(code: NavIssueCode, mode: NavValidationMode): NavIssueSeverity {
  if (STRUCTURAL.has(code)) return 'error';
  if (SEMANTIC.has(code)) return mode === 'publish' ? 'error' : 'warning';
  return 'warning';
}

/** Whether a link address is accepted (the designer's field validation uses this too). */
export function isAllowedNavUrl(url: string): boolean {
  return url.length <= NAV_LIMITS.maxUrl && URL_PATTERN.test(url);
}

/** Validates raw JSON text — including size and parsing (the path the server sees). */
export function validateNavLayoutText(text: string, facts: NavFacts | null, mode: NavValidationMode): NavIssue[] {
  if (!text.trim()) return [only('unreadable', mode)];
  if (utf8Length(text) > NAV_LIMITS.maxBytes) return [only('tooLarge', mode)];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [only('unreadable', mode)];
  }
  return validateNavLayout(parsed, facts, mode);
}

/** Validates a parsed document. If `facts` is null, target existence checks are skipped. */
export function validateNavLayout(input: unknown, facts: NavFacts | null, mode: NavValidationMode): NavIssue[] {
  try {
    if (!isObject(input) || input['schemaVersion'] !== 1) throw UNREADABLE;
    const walker = new Walker(facts, mode);
    walker.document(input);
    return walker.issues;
  } catch (e) {
    if (e === UNREADABLE) return [only('unreadable', mode)];
    throw e;
  }
}

// ─── Internal details ───────────────────────────────────────────────────────

const UNREADABLE = Symbol('unreadable');

type JsonObject = Record<string, unknown>;

function only(code: NavIssueCode, mode: NavValidationMode): NavIssue {
  return { code, severity: navSeverityOf(code, mode) };
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

function optBool(obj: JsonObject, name: string): boolean | null {
  const value = obj[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw UNREADABLE;
  return value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= INT_MAX;
}

class Walker {
  readonly issues: NavIssue[] = [];
  private readonly ids = new Set<string>();
  private readonly models = new Set<string>();
  private readonly issueKeys = new Set<string>();
  private folders = 0;
  private nodes = 0;

  constructor(private readonly facts: NavFacts | null, private readonly mode: NavValidationMode) {}

  document(root: JsonObject): void {
    const items = requireArray(root, 'items');
    optBool(root, 'appendUnplaced');

    for (const raw of items) {
      const item = requireObject(raw);
      if (optString(item, 'kind') === 'folder') this.folder(item);
      else this.link(item);
    }

    if (this.folders > NAV_LIMITS.maxFolders || this.nodes > NAV_LIMITS.maxNodes) this.add('limit');
  }

  private folder(folder: JsonObject): void {
    this.folders++;
    this.nodes++;
    const id = this.checkId(folder);
    this.checkLabel(optString(folder, 'label') ?? '', id, true);
    this.checkIcon(folder, id);
    optBool(folder, 'collapsed');

    const children = requireArray(folder, 'children');
    for (const raw of children) {
      const child = requireObject(raw);
      if (optString(child, 'kind') === 'folder') {
        this.nodes++;
        this.add('nestedFolder', this.checkId(child));
        continue;
      }
      this.link(child);
    }
    if (children.length === 0) this.add('emptyFolder', id);
  }

  private link(link: JsonObject): void {
    this.nodes++;
    const id = this.checkId(link);
    const kind = optString(link, 'kind');
    const label = optString(link, 'label') ?? '';

    switch (kind) {
      case 'model': {
        const typeName = optString(link, 'typeName');
        if (!typeName) throw UNREADABLE;
        this.checkLabel(label, id, false);
        if (this.facts?.models && !this.facts.models.has(typeName)) this.add('unknownModel', id);
        if (this.models.has(typeName)) this.add('duplicateModel', id);
        else this.models.add(typeName);
        return;
      }
      case 'dashboard':
      case 'report': {
        const target = link[kind === 'dashboard' ? 'dashboardId' : 'reportId'];
        const valid = isPositiveInteger(target);
        if (!valid) this.add('badTarget', id);
        this.checkLabel(label, id, true);
        const known = kind === 'dashboard' ? this.facts?.dashboards : this.facts?.reports;
        if (valid && known && !known.has(target)) this.add('unknownTarget', id);
        return;
      }
      case 'page': {
        const page = optString(link, 'page');
        if (page === null || !(NAV_PAGES as readonly string[]).includes(page)) this.add('badPage', id);
        this.checkLabel(label, id, false);
        return;
      }
      case 'url': {
        const url = optString(link, 'url') ?? '';
        if (!isAllowedNavUrl(url)) this.add('badUrl', id);
        this.checkLabel(label, id, true);
        this.checkIcon(link, id);
        return;
      }
      default:
        this.add('badKind', id);
    }
  }

  private checkId(element: JsonObject): string {
    const value = element['id'];
    const id = typeof value === 'string' ? value : null;
    if (id === null || !ID_PATTERN.test(id)) {
      this.add('badId', id ?? undefined);
      return id ?? '';
    }
    if (this.ids.has(id)) this.add('duplicateId', id);
    else this.ids.add(id);
    return id;
  }

  private checkLabel(label: string, id: string, required: boolean): void {
    if (label.length > NAV_LIMITS.maxLabel) this.add('textTooLong', id);
    if (required && label.length === 0) this.add('emptyLabel', id);
  }

  private checkIcon(element: JsonObject, id: string): void {
    const icon = optString(element, 'icon');
    if (icon && !ICON_PATTERN.test(icon)) this.add('badIcon', id);
  }

  private add(code: NavIssueCode, targetId?: string): void {
    const key = `${code}|${targetId ?? ''}`;
    if (this.issueKeys.has(key)) return;
    this.issueKeys.add(key);
    const issue: NavIssue = targetId === undefined
      ? { code, severity: navSeverityOf(code, this.mode) }
      : { code, severity: navSeverityOf(code, this.mode), targetId };
    this.issues.push(issue);
  }
}
