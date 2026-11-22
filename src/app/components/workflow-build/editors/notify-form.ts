import {
  NOTIFY_CHANNELS, NOTIFY_FIXED_PLACEHOLDERS, WorkflowNotifyChannel, WorkflowNotifyConfig, WorkflowRecipient, WorkflowStep
} from '../../../models/workflow.model';

/**
 * Pure helpers of the notification editor. Each returns a COPY of the step.
 *
 * On the server the channel list means "empty = all configured"; in the editor it
 * appears as two checkboxes, and if both are checked the list is written empty.
 */

export function notifyOf(step: WorkflowStep): WorkflowNotifyConfig {
  return step.notify ?? { recipients: [], channels: [], subject: '', body: '' };
}

export function patchNotify(step: WorkflowStep, patch: Partial<WorkflowNotifyConfig>): WorkflowStep {
  return { ...step, notify: { ...notifyOf(step), ...patch } };
}

function sameRecipient(a: WorkflowRecipient, b: WorkflowRecipient): boolean {
  return a.kind === b.kind
    && Number(a.id ?? 0) === Number(b.id ?? 0)
    && (a.stepKey ?? '').toLowerCase() === (b.stepKey ?? '').toLowerCase();
}

/** The same recipient is not added twice. */
export function addRecipient(step: WorkflowStep, recipient: WorkflowRecipient): WorkflowStep {
  const recipients = notifyOf(step).recipients;
  if (recipients.some(r => sameRecipient(r, recipient))) return step;
  return patchNotify(step, { recipients: [...recipients, recipient] });
}

export function removeRecipient(step: WorkflowStep, index: number): WorkflowStep {
  return patchNotify(step, { recipients: notifyOf(step).recipients.filter((_, i) => i !== index) });
}

/** Is the channel checked — an empty list means all. */
export function channelChecked(step: WorkflowStep, channel: WorkflowNotifyChannel): boolean {
  const channels = notifyOf(step).channels ?? [];
  return channels.length === 0 || channels.includes(channel);
}

/** Toggles a channel; if all are on the list empties, the last enabled channel cannot be turned off. */
export function toggleChannel(step: WorkflowStep, channel: WorkflowNotifyChannel, on: boolean): WorkflowStep {
  const checked = NOTIFY_CHANNELS.filter(c => c === channel ? on : channelChecked(step, c));
  if (checked.length === 0) return step;
  return patchNotify(step, { channels: checked.length === NOTIFY_CHANNELS.length ? [] : checked });
}

/** Available placeholders: record fields + constants. */
export function placeholderNames(columns: ReadonlyArray<string>): string[] {
  return [...columns.map(column => `record.${column}`), ...NOTIFY_FIXED_PLACEHOLDERS];
}

const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)\s*\}\}/g;

/**
 * Unrecognised placeholders in the template — the server rejects them on publish
 * (same rule as WorkflowTemplateRenderer.IsKnown). If the column list is empty
 * (no model selected) record fields are not checked.
 */
export function unknownPlaceholders(text: string | null | undefined, columns: ReadonlyArray<string>): string[] {
  const known = new Set(NOTIFY_FIXED_PLACEHOLDERS.map(n => n.toLowerCase()));
  const lowerColumns = new Set(columns.map(c => c.toLowerCase()));
  const unknown: string[] = [];

  for (const match of (text ?? '').matchAll(TOKEN)) {
    const name = match[1];
    const lower = name.toLowerCase();
    const ok = known.has(lower)
      || (lower.startsWith('record.') && lower.length > 7 && (columns.length === 0 || lowerColumns.has(lower.slice(7))));
    if (!ok && !unknown.includes(name)) unknown.push(name);
  }
  return unknown;
}

/** Inserts the placeholder at the caret position (or at the end); returns the new text and the new caret position. */
export function insertPlaceholder(
  text: string, name: string, caret: number | null
): { text: string; caret: number } {
  const token = `{{${name}}}`;
  const at = caret == null || caret < 0 || caret > text.length ? text.length : caret;
  return { text: text.slice(0, at) + token + text.slice(at), caret: at + token.length };
}
