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

/** Sağ paneldeki öneri kartının görünüm modeli. */
interface ProposalCard {
  id: number;
  kind: AiProposal['kind'];
  name: string;
  status: AiProposal['status'];
  /** Kartın altındaki tek satırlık özet (kolon sayısı, hedef model vb.). */
  summary: string;
  /** Model değişikliği kartında kolon başına önerilen yeni değerler. */
  details: string[];
  errorMessage?: string | null;
  /** O an süren aktarım/yayınlama durumu. */
  progress?: AiImportProgress;
}

/**
 * Yapay Zeka asistanı (G4).
 *
 * Üç sütun: sohbet listesi · mesaj akışı · öneriler. Modelin ürettiği hiçbir şey
 * burada otomatik uygulanmaz — öneriler kart olarak listelenir ve yalnızca
 * kullanıcı "İçeri Aktar" / "Hepsini Yayınla" dediğinde mevcut, izin denetimli
 * servisler üzerinden yazılır (bkz. AiImportService).
 */
@Component({
  selector: 'app-ai-chat',
  standalone: true,
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

  readonly loadError = signal('');
  readonly actionError = signal('');

  /** Aktarım/yayınlama sürerken butonları kilitler. */
  readonly busy = signal(false);
  readonly publishConfirmOpen = signal(false);
  readonly deleteConfirmId = signal<number | null>(null);

  private readonly proposals = signal<AiProposal[]>([]);
  private readonly progress = signal<Record<number, AiImportProgress>>({});

  private streamSub?: Subscription;
  private actionSub?: Subscription;

  // ── Türetilmiş durum ─────────────────────────────────────────────────────

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

  /** Aktarılmayı bekleyen model ve model değişikliği sayısı. */
  readonly importableCount = computed(
    () => this.proposals().filter(p => isModelKind(p.kind) && p.status === 'proposed').length
  );

  /**
   * Yayınlanacak öğe sayısı: aktarılmış modeller + bekleyen rapor/dashboard'lar.
   * Rapor ve dashboard'ların ayrı bir "aktarma" adımı yoktur; ikisi de yayınlama
   * aşamasında tanımlanır çünkü yayınlanmış bir model gerektirirler.
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

  /** Kota şeridi: "240.000 / 1.000.000". Plan AI içermiyorsa null. */
  readonly quotaLabel = computed(() => {
    const usage = this.usage();
    if (!usage?.entitled || usage.limit == null) return null;
    const lang = this.languageService.lang();
    return `${formatNumber(usage.used, lang)} / ${formatNumber(usage.limit, lang)}`;
  });

  /** Sunucunun başlatma kuralı (`canStart`) — arayüz kendi eşiğini hesaplamaz. */
  readonly quotaExhausted = computed(() => {
    const usage = this.usage();
    return !!usage && usage.entitled && !usage.canStart;
  });

  readonly notEntitled = computed(() => {
    const usage = this.usage();
    return !!usage && !usage.entitled;
  });

  // ── Yaşam döngüsü ────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadConversations();
    this.loadUsage();
  }

  ngOnDestroy(): void {
    // Abonelik sonlandırılınca fetch iptal edilir; sunucu tarafı akış da kapanır.
    this.streamSub?.unsubscribe();
    this.actionSub?.unsubscribe();
  }

  // ── Sohbet yönetimi ──────────────────────────────────────────────────────

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
      // Kota okunamazsa ekran çalışmaya devam eder; şerit gizlenir.
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

  // ── Mesaj gönderme ───────────────────────────────────────────────────────

  send(): void {
    const text = this.draft().trim();
    if (!text || this.isStreaming() || this.busy()) return;

    this.draft.set('');
    this.actionError.set('');
    this.streamingText.set('');
    this.streamingThinking.set('');
    this.isStreaming.set(true);

    // İyimser gösterim: kullanıcı turu sunucudan dönmeden ekranda belirir.
    // Geçici kimlik negatif — sunucudan gelen gerçek kimliklerle çakışmaz.
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
        // Yeni sohbette kimlik ilk olayla gelir; sonraki mesajlar buna eklenir.
        this.activeId.set(event.conversationId);
        break;
      case 'text':
        this.streamingText.update(current => current + event.text);
        break;
      case 'thinking':
        this.streamingThinking.update(current => current + event.text);
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
      // 'tool' ve 'usage' akış sonundaki yeniden yüklemeyle zaten yansır.
    }
  }

  private finishStream(error?: string): void {
    this.isStreaming.set(false);
    if (error) this.actionError.set(error);

    // Kalıcı hâli sunucudan çekilir: asistan mesajı, öneriler ve kota tek
    // kaynaktan gelir; akış tamponu böylece atılabilir.
    this.streamingText.set('');
    this.streamingThinking.set('');
    this.reloadConversation();
    this.loadUsage();
    this.loadConversations();
  }

  // ── İçeri aktarma / yayınlama ────────────────────────────────────────────

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
    // Kart durumları sunucuda güncellendi; tek kaynaktan tazele.
    this.reloadConversation();
  }

  // ── Görünüm yardımcıları ─────────────────────────────────────────────────

  /** Kart durumuna göre rozet sınıfı. */
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

  /** Kartın altındaki tek satırlık özet — payload'dan türetilir. */
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
   * Model değişikliği kartında kolon başına önerilen değerler ("Ad: zorunlu, etiket 'Ünvan'").
   * Yalnız önerinin taşıdığı alanlar yazılır; verilmeyen alan kayıtlı değerinde kalır.
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

/** Taslak olarak aktarılıp sonra yayınlanan öneri türleri (yeni model + model değişikliği). */
function isModelKind(kind: AiProposal['kind']): boolean {
  return kind === 'model' || kind === 'model_change';
}
