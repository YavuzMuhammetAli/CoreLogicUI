import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import {
  NOTIFY_BODY_MAX, NOTIFY_CHANNELS, NOTIFY_SUBJECT_MAX, WorkflowNotifyChannel, WorkflowRecipient, WorkflowRecipientKind,
  WorkflowStep
} from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { Role } from '../../../models/role';
import { AppUser } from '../../../models/appUser';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { SummaryLookup, recipientText } from '../../../utils/workflow/workflow-step-summary';
import { StepTarget } from './condition-editor.component';
import {
  addRecipient, channelChecked, insertPlaceholder, notifyOf, patchNotify, placeholderNames, removeRecipient,
  toggleChannel, unknownPlaceholders
} from './notify-form';

/**
 * Bildirim düğümünün düzenleyicisi: alıcılar, kanallar, konu/metin şablonu ve
 * sonraki adım. Metin düz yazıdır; yer tutucu düğmeleri imlecin olduğu alana
 * `{{record.Alan}}` vb. ekler. Adımın KOPYASIYLA çalışır (bkz. condition-editor).
 */
@Component({
  selector: 'app-notify-editor',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './notify-editor.component.html',
  styleUrl: './editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotifyEditorComponent implements OnInit {
  private readonly languageService = inject(LanguageService);

  readonly step = input.required<WorkflowStep>();
  readonly columns = input<PublishedColumn[]>([]);
  readonly targets = input<StepTarget[]>([]);
  /** Görevlileri alıcı olabilecek insan adımları (onay, görev, paralel). */
  readonly humanSteps = input<StepTarget[]>([]);
  readonly roles = input<Role[]>([]);
  readonly users = input<AppUser[]>([]);
  readonly readonly = input(false);

  readonly stepChange = output<WorkflowStep>();

  readonly channels = NOTIFY_CHANNELS;
  readonly subjectMax = NOTIFY_SUBJECT_MAX;
  readonly bodyMax = NOTIFY_BODY_MAX;
  readonly recipientKinds: ReadonlyArray<WorkflowRecipientKind> = ['creator', 'starter', 'role', 'user', 'stepAssignees'];

  readonly draft = signal<WorkflowStep>({ key: '', type: 'notify', name: '' });
  readonly notify = computed(() => notifyOf(this.draft()));

  /** Eklenecek alıcı: tür + (rol/kişi/adım) seçimi. */
  readonly newKind = signal<WorkflowRecipientKind>('creator');
  readonly newRef = signal('');

  /** Yer tutucu düğmesinin yazacağı alan — en son odaklanan. */
  private lastField: 'subject' | 'body' = 'body';

  private readonly columnNames = computed(() => this.columns().map(c => c.columnName));
  readonly placeholders = computed(() => placeholderNames(this.columnNames()));
  readonly unknown = computed(() => [
    ...unknownPlaceholders(this.notify().subject, this.columnNames()),
    ...unknownPlaceholders(this.notify().body, this.columnNames())
  ].filter((name, index, all) => all.indexOf(name) === index));

  private readonly lookup = computed<SummaryLookup>(() => {
    this.languageService.lang();
    const roles = new Map(this.roles().map(role => [role.id, role.name]));
    const users = new Map(this.users().map(user => [user.id, `${user.firstName} ${user.lastName}`]));
    return {
      roleName: id => roles.get(id) ?? null,
      userName: id => users.get(id) ?? null,
      t: (key, params) => this.languageService.t(key, params)
    };
  });

  readonly canAdd = computed(() => {
    const kind = this.newKind();
    return kind === 'creator' || kind === 'starter' || !!this.newRef();
  });

  ngOnInit(): void {
    this.draft.set(structuredClone(this.step()));
  }

  private apply(transform: (step: WorkflowStep) => WorkflowStep): void {
    if (this.readonly()) return;
    const next = transform(this.draft());
    if (next === this.draft()) return;
    this.draft.set(next);
    this.stepChange.emit(next);
  }

  onName(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.apply(step => ({ ...step, name }));
  }

  onKey(event: Event): void {
    const key = (event.target as HTMLInputElement).value.trim();
    this.apply(step => ({ ...step, key }));
  }

  onNext(event: Event): void {
    const next = (event.target as HTMLSelectElement).value || null;
    this.apply(step => ({ ...step, next }));
  }

  // ── Alıcılar ──────────────────────────────────────────────────────────────

  onNewKind(event: Event): void {
    this.newKind.set((event.target as HTMLSelectElement).value as WorkflowRecipientKind);
    this.newRef.set('');
  }

  onNewRef(event: Event): void {
    this.newRef.set((event.target as HTMLSelectElement).value);
  }

  addRecipient(): void {
    if (!this.canAdd()) return;
    const kind = this.newKind();
    const ref = this.newRef();
    const recipient: WorkflowRecipient =
      kind === 'role' || kind === 'user' ? { kind, id: Number(ref) }
      : kind === 'stepAssignees' ? { kind, stepKey: ref }
      : { kind };
    this.apply(step => addRecipient(step, recipient));
    this.newRef.set('');
  }

  removeRecipient(index: number): void {
    this.apply(step => removeRecipient(step, index));
  }

  recipientLabel(recipient: WorkflowRecipient): string {
    if (recipient.kind === 'stepAssignees') {
      const target = this.humanSteps().find(s => s.key.toLowerCase() === (recipient.stepKey ?? '').toLowerCase());
      return this.languageService.t('workflow.recipient.stepAssigneesOf', { step: target?.label ?? recipient.stepKey ?? '—' });
    }
    return recipientText(recipient, this.lookup());
  }

  // ── Kanallar ve metin ─────────────────────────────────────────────────────

  isChannelChecked(channel: WorkflowNotifyChannel): boolean {
    return channelChecked(this.draft(), channel);
  }

  /** Son açık kanal kapatılamaz (en az bir kanal). */
  isLastChannel(channel: WorkflowNotifyChannel): boolean {
    return this.isChannelChecked(channel) && this.channels.filter(c => this.isChannelChecked(c)).length === 1;
  }

  onChannel(channel: WorkflowNotifyChannel, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.apply(step => toggleChannel(step, channel, on));
  }

  onSubject(event: Event): void {
    const subject = (event.target as HTMLInputElement).value;
    this.apply(step => patchNotify(step, { subject }));
  }

  onBody(event: Event): void {
    const body = (event.target as HTMLTextAreaElement).value;
    this.apply(step => patchNotify(step, { body }));
  }

  focusField(field: 'subject' | 'body'): void {
    this.lastField = field;
  }

  /** Yer tutucuyu en son odaklanan alanın imlecine ekler ve odağı geri verir. */
  insert(name: string, subject: HTMLInputElement, body: HTMLTextAreaElement): void {
    if (this.readonly()) return;
    const element = this.lastField === 'subject' ? subject : body;
    const result = insertPlaceholder(element.value, name, element.selectionStart);
    element.value = result.text;
    this.apply(step => patchNotify(step, this.lastField === 'subject' ? { subject: result.text } : { body: result.text }));
    element.focus();
    element.setSelectionRange(result.caret, result.caret);
  }

  placeholderLabel(name: string): string {
    return `{{${name}}}`;
  }
}
