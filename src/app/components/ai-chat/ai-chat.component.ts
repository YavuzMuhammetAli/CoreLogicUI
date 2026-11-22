import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AiConversationListItem,
  AiDashboardPayload,
  AiMessage,
  AiModelChangePayload,
  AiModelPayload,
  AiProposal,
  AiReportPayload,
  AiStreamEvent,
  AiUsage
} from '../../models/ai.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { AiImportProgress, AiImportService } from '../../services/ai-import.service';
import { AiService } from '../../services/ai.service';
import { LanguageService } from '../../services/language.service';
import { formatNumber } from '../../utils/locale-format';
import { parseProposalPayload } from '../../utils/ai-import.mapper';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../shared/icon/icon.component';
import type { IconName } from '../shared/icon/icons.generated';

/** A single step (tool call) completed during the stream — "Model önerildi: Musteri" (Model proposed). */
interface StreamStep {
  id: number;
  icon: IconName;
  text: string;
}

/** Step icon for known tools; an unknown tool is shown with a generic row. */
const STEP_ICONS: Record<string, IconName> = {
  propose_model: 'table',
  propose_report: 'bar_chart',
  propose_dashboard: 'dashboard',
  list_published_models: 'search',
  propose_model_change: 'edit_note'
};

/** What the stream did most recently — selects the phase label. */
type StreamPhase = 'waiting' | 'thinking' | 'proposing' | 'writing';

/** View model of a proposal card in the right panel. */
interface ProposalCard {
  id: number;
  kind: AiProposal['kind'];
  name: string;
  status: AiProposal['status'];
  /** One-line summary under the card (column count, target model, etc.). */
  summary: string;
  /** Proposed new values per column on a model-change card. */
  details: string[];
  errorMessage?: string | null;
  /** The import/publish operation currently running. */
  progress?: AiImportProgress;
}

/**
 * AI assistant (G4).
 *
 * Three columns: conversation list · message stream · proposals. Nothing the model produces
 * is applied automatically here — proposals are listed as cards and are written only
 * when the user says "İçeri Aktar" (Import) / "Hepsini Yayınla" (Publish all), through the existing,
 * permission-checked services (see AiImportService).
 */
@Component({
    selector: 'app-ai-chat',
    imports: [FormsModule, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './ai-chat.component.html',
    styleUrl: './ai-chat.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiChatComponent implements OnInit, OnDestroy {
  private readonly aiService = inject(AiService);
  private readonly importService = inject(AiImportService);
  private readonly languageService = inject(LanguageService);

  readonly conversations = signal<AiConversationListItem[]>([]);
  readonly activeId = signal<number | null>(null);
  readonly messages = signal<AiMessage[]>([]);
  readonly usage = signal<AiUsage | null>(null);

  readonly draft = signal('');
  readonly streamingText = signal('');
  readonly streamingThinking = signal('');
  readonly isStreaming = signal(false);

  /**
   * Live progress: the model may call tools before writing text (Gemini often does),
   * and during that time only the spinner was visible. Steps, phase label and elapsed time make the wait visible;
   * while the provider is busy, the server's "retrying" text is kept in `streamStatus`.
   */
  readonly streamSteps = signal<StreamStep[]>([]);
  readonly streamStatus = signal('');
  readonly streamPhase = signal<StreamPhase>('waiting');
  readonly elapsedSeconds = signal(0);
  private elapsedTimer?: ReturnType<typeof setInterval>;

  readonly loadError = signal('');
  readonly actionError = signal('');

  /** Locks the buttons while import/publish is running. */
  readonly busy = signal(false);
  readonly publishConfirmOpen = signal(false);
  readonly deleteConfirmId = signal<number | null>(null);

  private readonly proposals = signal<AiProposal[]>([]);
  private readonly progress = signal<Record<number, AiImportProgress>>({});

  private streamSub?: Subscription;
  private actionSub?: Subscription;

  // ── Derived state ────────────────────────────────────────────────────────

  readonly cards = computed<ProposalCard[]>(() => {
    const progress = this.progress();
    return this.proposals().map(proposal => ({
      id: proposal.id,
      kind: proposal.kind,
      name: proposal.name,
      status: proposal.status,
      summary: this.summarize(proposal),
      details: this.changeLines(proposal),
      errorMessage: proposal.errorMessage,
      progress: progress[proposal.id]
    }));
  });

  /** Number of models and model changes waiting to be imported. */
  readonly importableCount = computed(
    () => this.proposals().filter(p => isModelKind(p.kind) && p.status === 'proposed').length
  );

  /**
   * Number of items to publish: imported models + pending reports/dashboards.
   * Reports and dashboards have no separate "import" step; both are defined
   * during the publish phase because they require a published model.
   */
  readonly publishableCount = computed(
    () =>
      this.proposals().filter(
        p =>
          (isModelKind(p.kind) && p.status === 'imported') ||
          (!isModelKind(p.kind) && p.status === 'proposed')
      ).length
  );

  readonly canSend = computed(
    () => this.draft().trim().length > 0 && !this.isStreaming() && !this.busy() && !this.quotaExhausted()
  );

  /** Quota strip: "240.000 / 1.000.000". null if the plan has no AI. */
  readonly quotaLabel = computed(() => {
    const usage = this.usage();
    if (!usage?.entitled || usage.limit == null) return null;
    const lang = this.languageService.lang();
    return `${formatNumber(usage.used, lang)} / ${formatNumber(usage.limit, lang)}`;
  });

  /** The server's start rule (`canStart`) — the UI does not compute its own threshold. */
  readonly quotaExhausted = computed(() => {
    const usage = this.usage();
    return !!usage && usage.entitled && !usage.canStart;
  });

  readonly notEntitled = computed(() => {
    const usage = this.usage();
    return !!usage && !usage.entitled;
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadConversations();
    this.loadUsage();
  }

  ngOnDestroy(): void {
    // Unsubscribing aborts the fetch; the server-side stream closes as well.
    this.streamSub?.unsubscribe();
    this.actionSub?.unsubscribe();
    this.stopElapsed();
  }

  // ── Conversation management ──────────────────────────────────────────────

  private loadConversations(): void {
    this.aiService.getConversations().subscribe({
      next: res => {
        if (res.success) this.conversations.set(res.data ?? []);
        else this.loadError.set(res.message);
      },
      error: () => this.loadError.set(this.languageService.t('ai.loadFailed'))
    });
  }

  private loadUsage(): void {
    this.aiService.getUsage().subscribe({
      next: res => {
        if (res.success) this.usage.set(res.data);
      },
      // If the quota can't be read the screen keeps working; the strip is hidden.
      error: () => this.usage.set(null)
    });
  }

  startNew(): void {
    if (this.isStreaming()) return;
    this.activeId.set(null);
    this.messages.set([]);
    this.proposals.set([]);
    this.progress.set({});
    this.actionError.set('');
  }

  select(id: number): void {
    if (this.isStreaming() || id === this.activeId()) return;
    this.activeId.set(id);
    this.progress.set({});
    this.actionError.set('');
    this.reloadConversation();
  }

  private reloadConversation(): void {
    const id = this.activeId();
    if (id == null) return;

    this.aiService.getConversation(id).subscribe({
      next: res => {
        if (!res.success || !res.data) return;
        this.messages.set(res.data.messages ?? []);
        this.proposals.set(res.data.proposals ?? []);
      },
      error: () => this.loadError.set(this.languageService.t('ai.loadFailed'))
    });
  }

  /**
   * While streaming, refreshes only the proposal cards — does not touch messages (on the server the assistant
   * message is empty until the turn ends; the optimistic user bubble must also stay in place).
   */
  private reloadProposals(): void {
    const id = this.activeId();
    if (id == null) return;

    this.aiService.getConversation(id).subscribe({
      next: res => {
        // If another conversation was opened meanwhile, the old one's cards are not written.
        if (res.success && res.data && this.activeId() === id) this.proposals.set(res.data.proposals ?? []);
      },
      // Silent: the full reload at the end of the turn fetches the cards anyway.
      error: () => undefined
    });
  }

  requestDelete(id: number): void {
    this.deleteConfirmId.set(id);
  }

  cancelDelete(): void {
    this.deleteConfirmId.set(null);
  }

  confirmDelete(): void {
    const id = this.deleteConfirmId();
    if (id == null) return;

    this.aiService.deleteConversation(id).subscribe({
      next: () => {
        this.deleteConfirmId.set(null);
        if (this.activeId() === id) this.startNew();
        this.loadConversations();
      },
      error: () => {
        this.deleteConfirmId.set(null);
        this.actionError.set(this.languageService.t('ai.deleteFailed'));
      }
    });
  }

  // ── Sending messages ─────────────────────────────────────────────────────

  send(): void {
    const text = this.draft().trim();
    if (!text || this.isStreaming() || this.busy()) return;

    this.draft.set('');
    this.actionError.set('');
    this.streamingText.set('');
    this.streamingThinking.set('');
    this.streamSteps.set([]);
    this.streamStatus.set('');
    this.streamPhase.set('waiting');
    this.isStreaming.set(true);
    this.startElapsed();

    // Optimistic display: the user turn appears before the server responds.
    // Temporary id is negative — never collides with real ids from the server.
    this.messages.update(list => [
      ...list,
      {
        id: -Date.now(),
        role: 'user',
        content: text,
        inputTokens: 0,
        outputTokens: 0,
        createdOn: new Date().toISOString()
      }
    ]);

    this.streamSub = this.aiService
      .streamChat({ conversationId: this.activeId(), message: text })
      .subscribe({
        next: event => this.handleStreamEvent(event),
        error: () => this.finishStream(this.languageService.t('ai.streamFailed')),
        complete: () => this.finishStream()
      });
  }

  private handleStreamEvent(event: AiStreamEvent): void {
    switch (event.type) {
      case 'meta':
        // In a new conversation the id arrives with the first event; later messages attach to it.
        this.activeId.set(event.conversationId);
        break;
      case 'text':
        this.streamingText.update(current => current + event.text);
        this.streamStatus.set('');
        this.streamPhase.set('writing');
        break;
      case 'thinking':
        this.streamingThinking.update(current => current + event.text);
        this.streamStatus.set('');
        this.streamPhase.set('thinking');
        break;
      case 'tool':
        this.addStep(event.name, event.subject);
        this.streamStatus.set('');
        this.streamPhase.set('proposing');
        // Show the card in the right panel as soon as it is created (it used to arrive at turn end).
        if (event.name !== 'list_published_models') this.reloadProposals();
        break;
      case 'status':
        this.streamStatus.set(event.message);
        break;
      case 'refusal':
        this.actionError.set(this.languageService.t('ai.refused'));
        break;
      case 'error':
        this.actionError.set(event.message || this.languageService.t('ai.streamFailed'));
        break;
      case 'quota':
        this.actionError.set(event.message || this.languageService.t('ai.quotaExhaustedMidStream'));
        break;
      // 'usage' is reflected anyway by the reload at the end of the stream.
    }
  }

  private addStep(name: string, subject?: string): void {
    const key = name in STEP_ICONS ? `ai.step.${name}` : 'ai.step.other';
    const label = this.languageService.t(key);
    this.streamSteps.update(steps => [
      ...steps,
      {
        id: steps.length,
        icon: STEP_ICONS[name] ?? 'check_circle',
        text: subject ? `${label}: ${subject}` : label
      }
    ]);
  }

  private startElapsed(): void {
    this.stopElapsed();
    this.elapsedSeconds.set(0);
    this.elapsedTimer = setInterval(() => this.elapsedSeconds.update(s => s + 1), 1000);
  }

  private stopElapsed(): void {
    if (this.elapsedTimer !== undefined) clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
  }

  private finishStream(error?: string): void {
    this.isStreaming.set(false);
    this.stopElapsed();
    if (error) this.actionError.set(error);

    // The persisted state is fetched from the server: the assistant message (including the error note of an interrupted turn),
    // proposals and quota come from one source; so the stream buffer can be discarded.
    this.streamingText.set('');
    this.streamingThinking.set('');
    this.streamSteps.set([]);
    this.streamStatus.set('');
    this.reloadConversation();
    this.loadUsage();
    this.loadConversations();
  }

  // ── Import / publish ─────────────────────────────────────────────────────

  runImport(): void {
    if (this.busy() || this.importableCount() === 0) return;

    this.busy.set(true);
    this.actionError.set('');
    this.progress.set({});

    this.actionSub = this.importService.importModels(this.proposals()).subscribe({
      next: item => this.trackProgress(item),
      error: () => this.finishAction(this.languageService.t('ai.importFailed')),
      complete: () => this.finishAction()
    });
  }

  requestPublish(): void {
    if (this.busy() || this.publishableCount() === 0) return;
    this.publishConfirmOpen.set(true);
  }

  cancelPublish(): void {
    this.publishConfirmOpen.set(false);
  }

  confirmPublish(): void {
    this.publishConfirmOpen.set(false);
    this.busy.set(true);
    this.actionError.set('');
    this.progress.set({});

    this.actionSub = this.importService.publishAll(this.proposals()).subscribe({
      next: item => this.trackProgress(item),
      error: () => this.finishAction(this.languageService.t('ai.publishFailed')),
      complete: () => this.finishAction()
    });
  }

  private trackProgress(item: AiImportProgress): void {
    this.progress.update(current => ({ ...current, [item.proposalId]: item }));
  }

  private finishAction(error?: string): void {
    this.busy.set(false);
    if (error) this.actionError.set(error);
    // Card statuses were updated on the server; refresh from the single source.
    this.reloadConversation();
  }

  // ── View helpers ─────────────────────────────────────────────────────────

  /** Badge class for the card status. */
  badgeClass(card: ProposalCard): string {
    if (card.progress?.state === 'running') return 'badge badge-meta';
    switch (card.status) {
      case 'published':
        return 'badge badge-success';
      case 'imported':
        return 'badge badge-meta';
      case 'failed':
        return 'badge badge-danger';
      default:
        return 'badge badge-warn';
    }
  }

  statusLabel(card: ProposalCard): string {
    if (card.progress?.state === 'running') return this.languageService.t('ai.status.running');
    return this.languageService.t(`ai.status.${card.status}`);
  }

  /** One-line summary under the card — derived from the payload. */
  private summarize(proposal: AiProposal): string {
    const t = (key: string, params?: Record<string, string | number>) =>
      this.languageService.t(key, params);

    if (proposal.kind === 'model_change') {
      const payload = parseProposalPayload<AiModelChangePayload>(proposal.payloadJson);
      if (!payload) return '';
      return payload.reason || t('ai.summary.modelChange', {
        a: payload.alterColumns?.length ?? 0,
        n: payload.addColumns?.length ?? 0
      });
    }

    if (proposal.kind === 'model') {
      const payload = parseProposalPayload<AiModelPayload>(proposal.payloadJson);
      if (!payload) return '';
      const columns = payload.columns?.length ?? 0;
      const subModels = payload.subModels?.length ?? 0;
      return subModels > 0
        ? t('ai.summary.modelWithSub', { n: columns, s: subModels })
        : t('ai.summary.model', { n: columns });
    }

    if (proposal.kind === 'report') {
      const payload = parseProposalPayload<AiReportPayload>(proposal.payloadJson);
      if (!payload) return '';
      return t('ai.summary.report', {
        model: payload.modelName,
        chart: payload.chartType
      });
    }

    const payload = parseProposalPayload<AiDashboardPayload>(proposal.payloadJson);
    if (!payload) return '';
    return t('ai.summary.dashboard', { n: payload.widgets?.length ?? 0 });
  }

  /**
   * Proposed values per column on a model-change card ("Ad: zorunlu, etiket 'Ünvan'").
   * Only the fields the proposal carries are written; an omitted field keeps its stored value.
   */
  private changeLines(proposal: AiProposal): string[] {
    if (proposal.kind !== 'model_change') return [];
    const payload = parseProposalPayload<AiModelChangePayload>(proposal.payloadJson);
    if (!payload) return [];
    const t = (key: string, params?: Record<string, string | number>) =>
      this.languageService.t(key, params);

    const lines = (payload.alterColumns ?? []).map(change => {
      const parts: string[] = [];
      if (change.label != null) parts.push(t('ai.change.label', { value: change.label }));
      if (change.isNullable != null) parts.push(t(change.isNullable ? 'ai.change.optional' : 'ai.change.required'));
      if (change.enumValues != null) parts.push(t('ai.change.enum', { value: change.enumValues }));
      const ruleTouched = [change.minLength, change.maxLength, change.min, change.max, change.regex, change.lookupDisplayColumn]
        .some(v => v != null);
      if (ruleTouched) parts.push(t('ai.change.rules'));
      if (change.description != null) parts.push(t('ai.change.description'));
      return `${change.columnName}: ${parts.join(', ') || t('ai.change.none')}`;
    });

    for (const column of payload.addColumns ?? []) {
      lines.push(t('ai.change.add', { column: column.columnName, type: column.dataType }));
    }
    return lines;
  }
}

/** Proposal types imported as drafts and published later (new model + model change). */
function isModelKind(kind: AiProposal['kind']): boolean {
  return kind === 'model' || kind === 'model_change';
}
