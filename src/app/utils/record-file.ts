import { environment } from '../../environments/environment';

/**
 * Server-side representation of a file/image column — NOT THE CONTENT (backend `DynamicRowShaper`).
 *
 * List, record and sub-list responses used to carry the file itself as base64
 * (a 5 MB photo column on a 20-row page ≈ 130 MB of JSON) and templates built a `data:` URL from it
 * on every check cycle. Now the row carries the size + a short-lived signed link:
 * the image is fetched from the link when visible, downloads go straight to the link (not buffered in memory).
 *
 * An unchanged file is not sent on save (`sanitizePayload` removes the key); the server does not touch
 * a file column whose key is absent. A new file is still sent as base64 text, deletion as `null`.
 */
export interface FileRef {
  $file: true;
  /** Column type from the schema: the content is not read, so an image cannot be recognized from its bytes. */
  kind: 'image' | 'file';
  size: number;
  /** Server-relative address (`PublishedModel/file?token=…`). */
  url: string;
}

export function isFileRef(value: unknown): value is FileRef {
  return typeof value === 'object' && value !== null && (value as { $file?: unknown }).$file === true;
}

/** Returns the value if it is a file representation, otherwise null — for `@if (...; as file)` in templates. */
export function asFileRef(value: unknown): FileRef | null {
  return isFileRef(value) ? value : null;
}

/** Full address of the link: the server gives a relative path, the API root is added per environment. */
export function fileRefUrl(ref: FileRef): string {
  return `${environment.apiBaseUrl}/${ref.url}`;
}
