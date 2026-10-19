import {
  NOTIFY_CHANNELS, NOTIFY_FIXED_PLACEHOLDERS, WorkflowNotifyChannel, WorkflowNotifyConfig, WorkflowRecipient, WorkflowStep
} from '../../../models/workflow.model';

/**
 * Bildirim düzenleyicisinin saf yardımcıları. Her biri adımın KOPYASINI döner.
 *
 * Kanal listesi sunucuda "boş = yapılandırılmış hepsi" demektir; düzenleyicide
 * iki onay kutusu olarak görünür, ikisi de işaretliyse liste boş yazılır.
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

/** Aynı alıcı ikinci kez eklenmez. */
export function addRecipient(step: WorkflowStep, recipient: WorkflowRecipient): WorkflowStep {
  const recipients = notifyOf(step).recipients;
  if (recipients.some(r => sameRecipient(r, recipient))) return step;
  return patchNotify(step, { recipients: [...recipients, recipient] });
}

export function removeRecipient(step: WorkflowStep, index: number): WorkflowStep {
  return patchNotify(step, { recipients: notifyOf(step).recipients.filter((_, i) => i !== index) });
}

/** Kanal işaretli mi — boş liste hepsi demek. */
export function channelChecked(step: WorkflowStep, channel: WorkflowNotifyChannel): boolean {
  const channels = notifyOf(step).channels ?? [];
  return channels.length === 0 || channels.includes(channel);
}

/** Kanal aç/kapa; hepsi açıksa liste boşalır, son açık kanal kapatılamaz. */
export function toggleChannel(step: WorkflowStep, channel: WorkflowNotifyChannel, on: boolean): WorkflowStep {
  const checked = NOTIFY_CHANNELS.filter(c => c === channel ? on : channelChecked(step, c));
  if (checked.length === 0) return step;
  return patchNotify(step, { channels: checked.length === NOTIFY_CHANNELS.length ? [] : checked });
}

/** Kullanılabilir yer tutucular: kayıt alanları + sabitler. */
export function placeholderNames(columns: ReadonlyArray<string>): string[] {
  return [...columns.map(column => `record.${column}`), ...NOTIFY_FIXED_PLACEHOLDERS];
}

const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)\s*\}\}/g;

/**
 * Şablondaki tanınmayan yer tutucular — sunucu yayında reddeder
 * (WorkflowTemplateRenderer.IsKnown ile aynı kural). Kolon listesi boşsa
 * (model seçilmemiş) kayıt alanları denetlenmez.
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

/** Yer tutucuyu imleç konumuna (yoksa sona) ekler; yeni metin ve imlecin yeni yeri. */
export function insertPlaceholder(
  text: string, name: string, caret: number | null
): { text: string; caret: number } {
  const token = `{{${name}}}`;
  const at = caret == null || caret < 0 || caret > text.length ? text.length : caret;
  return { text: text.slice(0, at) + token + text.slice(at), caret: at + token.length };
}
