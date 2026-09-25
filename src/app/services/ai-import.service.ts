import { Injectable, inject } from '@angular/core';
import { Observable, concat, defer, from, of, throwError } from 'rxjs';
import { catchError, concatMap, map, startWith, switchMap, toArray } from 'rxjs/operators';
import {
  AiDashboardPayload,
  AiModelPayload,
  AiProposal,
  AiReportPayload
} from '../models/ai.model';
import { ResponseModel } from '../models/responseModel';
import { AiService } from './ai.service';
import { DashboardService } from './dashboard.service';
import { PublishedTableService } from './published-table.service';
import { RelationshipService } from './relationship.service';
import { ReportService } from './report.service';
import {
  ImportNode,
  flattenModelPayload,
  parseProposalPayload,
  toDashboardWidgets,
  toRelationshipUpsert,
  toReportDefinition,
  validateModelPayload
} from '../utils/ai-import.mapper';

/** Bir öneri kartının aktarım/yayınlama ilerlemesi. */
export interface AiImportProgress {
  proposalId: number;
  name: string;
  state: 'running' | 'done' | 'failed';
  /** state === 'failed' ise sebep. */
  error?: string;
}

/**
 * Yapay Zeka önerilerini (G4) sisteme aktarır.
 *
 * Burada YENİ bir yazma yolu yoktur: her adım kullanıcının elle yapabileceği
 * mevcut, izin denetimli servisleri çağırır (`table-detail` ekranının yaptığının
 * aynısı). Böylece AI'a ayrıcalıklı bir kanal açılmaz — aktarım, kullanıcının
 * kendi yetkisiyle yaptığı sıradan bir işlemdir.
 *
 * Akış iki aşamalıdır ve sıra ZORUNLUDUR:
 *   1. importModels  → modeller taslak olarak yazılır
 *   2. publishAll    → modeller derlenir, SONRA raporlar, SONRA dashboard'lar
 * Rapor tanımı backend'de model adına ve kolonlarına karşı doğrulandığı için
 * model yayınlanmadan rapor tanımlanamaz.
 */
@Injectable({ providedIn: 'root' })
export class AiImportService {
  private readonly publishedTable = inject(PublishedTableService);
  private readonly relationships = inject(RelationshipService);
  private readonly reports = inject(ReportService);
  private readonly dashboards = inject(DashboardService);
  private readonly ai = inject(AiService);

  // ── Aşama 1: modelleri taslak olarak yaz ─────────────────────────────────

  /** Yalnız `proposed` durumundaki model önerilerini sırayla aktarır. */
  importModels(proposals: AiProposal[]): Observable<AiImportProgress> {
    const pending = proposals.filter(p => p.kind === 'model' && p.status === 'proposed');
    return from(pending).pipe(concatMap(proposal => this.importModel(proposal)));
  }

  private importModel(proposal: AiProposal): Observable<AiImportProgress> {
    const payload = parseProposalPayload<AiModelPayload>(proposal.payloadJson);
    const invalid = validateModelPayload(payload);
    if (invalid || !payload) {
      return this.reportFailure(proposal, invalid ?? 'payload');
    }

    // parent-first: alt model, ana model kaydedilmeden eklenemez.
    const nodes = flattenModelPayload(payload);

    return this.assertNotExists(payload.entityName).pipe(
      switchMap(() => from(nodes).pipe(concatMap(node => this.saveNode(node)), toArray())),
      switchMap(() => this.saveRelationships(payload)),
      switchMap(() => this.markStatus(proposal.id, 'imported')),
      map(() => this.done(proposal)),
      catchError(error => this.reportFailure(proposal, this.describe(error))),
      startWith(this.running(proposal))
    );
  }

  /**
   * Aynı adda model varsa aktarımı durdurur.
   * `getSchema` bulunamadığında 400/404 döndürür — bu bir hata değil, aradığımız
   * durumdur (`table-detail.component.ts` `saveNode$` ile aynı yorum).
   */
  private assertNotExists(entityName: string): Observable<void> {
    return this.publishedTable.getSchema(entityName).pipe(
      catchError((err: { status?: number }) =>
        err?.status === 400 || err?.status === 404
          ? of({ success: false } as ResponseModel)
          : throwError(() => err)
      ),
      switchMap(existing =>
        existing.success
          ? throwError(() => new Error(`zaten-var:${entityName}`))
          : of(void 0)
      )
    );
  }

  private saveNode(node: ImportNode): Observable<unknown> {
    return this.publishedTable
      .addTable({
        tableName: node.entityName,
        description: `${node.entityName} dinamik modeli`,
        version: 1,
        parentTableName: node.parentName ?? undefined
      })
      .pipe(
        this.ensureSuccess(),
        switchMap(() =>
          from(node.columns).pipe(
            concatMap(column =>
              this.publishedTable
                .addMember({
                  typeName: node.entityName,
                  memberName: column.columnName,
                  memberType: column.dataType,
                  // DİKKAT: form/öneri tarafı isNullable, API isRequired bekler.
                  isRequired: !column.isNullable,
                  maxLength: column.maxLength ?? null,
                  enumValues: column.enumValues ?? null,
                  lookupTargetTable: column.lookupTargetTable ?? null,
                  lookupDisplayColumn: column.lookupDisplayColumn ?? null,
                  label: column.label ?? null
                })
                .pipe(this.ensureSuccess())
            ),
            toArray()
          )
        )
      );
  }

  /**
   * İlişkileri kaydeder. `RelationshipService` tablo ADINI değil ID'sini ister,
   * bu yüzden model yazıldıktan SONRA `getAllTables()` ile çözülür
   * (`relationships-tab.component.ts` `flush()` ile aynı desen).
   */
  private saveRelationships(payload: AiModelPayload): Observable<unknown> {
    const list = payload.relationships ?? [];
    if (list.length === 0) return of(void 0);

    return this.publishedTable.getAllTables().pipe(
      switchMap(res => {
        const match = (res.data ?? []).find(
          t => t.tableName.toLowerCase() === payload.entityName.toLowerCase()
        );
        if (!match) return throwError(() => new Error('tablo-bulunamadi'));

        return from(list).pipe(
          concatMap((relationship, index) =>
            this.relationships
              .add(match.id, toRelationshipUpsert(relationship, index))
              .pipe(this.ensureSuccess())
          ),
          toArray()
        );
      })
    );
  }

  // ── Aşama 2: yayınla, sonra rapor ve dashboard tanımla ───────────────────

  /**
   * Aktarılmış modelleri yayınlar, ardından raporları ve dashboard'ları tanımlar.
   * Sıra bağlayıcıdır; her aşama bir öncekinin ürettiği kayıtlara dayanır.
   */
  publishAll(proposals: AiProposal[]): Observable<AiImportProgress> {
    // Rapor adı → ID. Mevcut raporlarla başlar; bu turda tanımlananlar eklenir.
    const reportIds = new Map<string, number>();

    const seed = defer(() =>
      this.reports.list().pipe(
        map(res => {
          for (const report of res.data ?? []) {
            reportIds.set(report.name.toLowerCase(), report.id);
          }
          return null;
        }),
        // Rapor listesi alınamazsa yayınlama durmaz; yalnızca ada göre
        // eşleşme bu turda tanımlananlarla sınırlı kalır.
        catchError(() => of(null))
      )
    ).pipe(concatMap(() => from([] as AiImportProgress[])));

    const models = from(proposals.filter(p => p.kind === 'model' && p.status === 'imported'))
      .pipe(concatMap(proposal => this.publishModel(proposal)));

    const reports = from(proposals.filter(p => p.kind === 'report' && p.status === 'proposed'))
      .pipe(concatMap(proposal => this.defineReport(proposal, reportIds)));

    const dashboards = from(proposals.filter(p => p.kind === 'dashboard' && p.status === 'proposed'))
      .pipe(concatMap(proposal => this.defineDashboard(proposal, reportIds)));

    return concat(seed, models, reports, dashboards);
  }

  private publishModel(proposal: AiProposal): Observable<AiImportProgress> {
    const payload = parseProposalPayload<AiModelPayload>(proposal.payloadJson);
    if (!payload) return this.reportFailure(proposal, 'payload');

    // Kök modeli yayınlamak alt ağacın tamamını birlikte yayınlar.
    return this.publishedTable.publish(payload.entityName).pipe(
      this.ensureSuccess(),
      switchMap(() => this.markStatus(proposal.id, 'published')),
      map(() => this.done(proposal)),
      catchError(error => this.reportFailure(proposal, this.describe(error))),
      startWith(this.running(proposal))
    );
  }

  private defineReport(
    proposal: AiProposal,
    reportIds: Map<string, number>
  ): Observable<AiImportProgress> {
    const payload = parseProposalPayload<AiReportPayload>(proposal.payloadJson);
    if (!payload) return this.reportFailure(proposal, 'payload');

    return this.reports.define(toReportDefinition(payload)).pipe(
      switchMap(res => {
        if (!res.success) return throwError(() => new Error(res.message));
        // Dashboard'lar raporlara ADIYLA referans verdiği için eşleme burada
        // kurulur — tanımın hemen ardından, ID hâlâ elimizdeyken.
        reportIds.set(payload.name.toLowerCase(), res.data);
        return this.markStatus(proposal.id, 'published', res.data);
      }),
      map(() => this.done(proposal)),
      catchError(error => this.reportFailure(proposal, this.describe(error))),
      startWith(this.running(proposal))
    );
  }

  private defineDashboard(
    proposal: AiProposal,
    reportIds: Map<string, number>
  ): Observable<AiImportProgress> {
    const payload = parseProposalPayload<AiDashboardPayload>(proposal.payloadJson);
    if (!payload) return this.reportFailure(proposal, 'payload');

    const { widgets, unresolved } = toDashboardWidgets(payload, reportIds);
    if (widgets.length === 0) {
      return this.reportFailure(proposal, `rapor-yok:${unresolved.join(', ')}`);
    }

    return this.dashboards.define({ name: payload.name, widgets }).pipe(
      switchMap(res =>
        res.success
          ? this.markStatus(proposal.id, 'published', res.data)
          : throwError(() => new Error(res.message))
      ),
      map(() => this.done(proposal)),
      catchError(error => this.reportFailure(proposal, this.describe(error))),
      startWith(this.running(proposal))
    );
  }

  // ── yardımcılar ──────────────────────────────────────────────────────────

  /** HTTP 200 + success:false durumunu da hata sayar. */
  private ensureSuccess<T extends ResponseModel>() {
    return (source: Observable<T>): Observable<T> =>
      source.pipe(
        map(res => {
          if (!res.success) throw new Error(res.message);
          return res;
        })
      );
  }

  /**
   * Kart durumunu backend'e yazar. Bu bir defter kaydıdır — başarısız olması
   * aktarımın kendisini geçersiz kılmaz, o yüzden hata yutulur.
   */
  private markStatus(
    proposalId: number,
    status: 'imported' | 'published',
    importedEntityId?: number
  ): Observable<unknown> {
    return this.ai
      .updateProposalStatus(proposalId, { status, importedEntityId: importedEntityId ?? null })
      .pipe(catchError(() => of(null)));
  }

  private running(proposal: AiProposal): AiImportProgress {
    return { proposalId: proposal.id, name: proposal.name, state: 'running' };
  }

  private done(proposal: AiProposal): AiImportProgress {
    return { proposalId: proposal.id, name: proposal.name, state: 'done' };
  }

  /** Hatayı hem kullanıcıya bildirir hem de karta kalıcı olarak yazar. */
  private reportFailure(proposal: AiProposal, error: string): Observable<AiImportProgress> {
    const progress: AiImportProgress = {
      proposalId: proposal.id,
      name: proposal.name,
      state: 'failed',
      error
    };

    return this.ai
      .updateProposalStatus(proposal.id, { status: 'failed', errorMessage: error })
      .pipe(
        catchError(() => of(null)),
        map(() => progress)
      );
  }

  private describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    const http = error as { error?: { message?: string }; status?: number };
    return http?.error?.message ?? (http?.status ? `HTTP ${http.status}` : 'bilinmeyen-hata');
  }
}
