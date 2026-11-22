import { Injectable, inject } from '@angular/core';
import { Observable, concat, defer, from, of, throwError } from 'rxjs';
import { catchError, concatMap, map, startWith, switchMap, tap, toArray } from 'rxjs/operators';
import {
  AiDashboardPayload,
  AiModelChangePayload,
  AiModelPayload,
  AiProposal,
  AiProposedColumn,
  AiReportPayload
} from '../models/ai.model';
import { ResponseModel } from '../models/responseModel';
import { AiService } from './ai.service';
import { DashboardService } from './dashboard.service';
import { PublishedTableService } from './published-table.service';
import { RelationshipService } from './relationship.service';
import { ReportService } from './report.service';
import { RecordMetadataService } from './record-metadata.service';
import {
  ImportNode,
  flattenModelPayload,
  parseProposalPayload,
  toDashboardWidgets,
  toMemberMetadataUpdates,
  toRelationshipUpsert,
  toReportDefinition,
  validateModelChangePayload,
  validateModelPayload
} from '../utils/ai-import.mapper';

/** Import/publish progress of one proposal card. */
export interface AiImportProgress {
  proposalId: number;
  name: string;
  state: 'running' | 'done' | 'failed';
  /** Reason when state === 'failed'. */
  error?: string;
}

/**
 * Imports AI proposals (G4) into the system.
 *
 * There is NO new write path here: every step calls existing, permission-checked
 * services that the user could also call by hand (the same thing the `table-detail`
 * screen does). So no privileged channel is opened for the AI — the import is an
 * ordinary operation the user performs with their own permissions.
 *
 * The flow has two stages and the order is MANDATORY:
 *   1. importModels  → models are written as drafts
 *   2. publishAll    → models are compiled, THEN reports, THEN dashboards
 * Because the backend validates a report definition against the model name and its
 * columns, a report cannot be defined before the model is published.
 */
@Injectable({ providedIn: 'root' })
export class AiImportService {
  private readonly publishedTable = inject(PublishedTableService);
  private readonly relationships = inject(RelationshipService);
  private readonly reports = inject(ReportService);
  private readonly dashboards = inject(DashboardService);
  private readonly ai = inject(AiService);
  private readonly recordMetadata = inject(RecordMetadataService);

  // ── Stage 1: write models as drafts ──────────────────────────────────────

  /**
   * Imports only the model and model-change proposals in the `proposed` state, in order.
   * New models go first: a change proposal may refer to a model imported in the same run.
   */
  importModels(proposals: AiProposal[]): Observable<AiImportProgress> {
    const pending = proposals.filter(p => p.status === 'proposed');
    return concat(
      from(pending.filter(p => p.kind === 'model')).pipe(concatMap(proposal => this.importModel(proposal))),
      from(pending.filter(p => p.kind === 'model_change')).pipe(concatMap(proposal => this.importModelChange(proposal)))
    );
  }

  /**
   * Change to a saved model: new columns via `addMember`, metadata via `updateMemberMetadata`
   * (both are the endpoints the schema screen uses). A metadata change does not alter the schema —
   * it takes effect immediately and the card becomes `published`. If there is a new column, the SQL
   * column is created on publish, so the card stays `imported` and "Hepsini Yayınla" (Publish all) republishes the model.
   */
  private importModelChange(proposal: AiProposal): Observable<AiImportProgress> {
    const payload = parseProposalPayload<AiModelChangePayload>(proposal.payloadJson);
    const invalid = validateModelChangePayload(payload);
    if (invalid || !payload) {
      return this.reportFailure(proposal, invalid ?? 'payload');
    }

    const added = payload.addColumns ?? [];

    return this.publishedTable.getSchema(payload.entityName).pipe(
      this.ensureSuccess(),
      switchMap(res => {
        const { updates, error } = toMemberMetadataUpdates(res.data, payload);
        if (error) return throwError(() => new Error(error));

        return concat(
          this.addColumns(payload.entityName, added),
          from(updates).pipe(
            concatMap(update => this.publishedTable.updateMemberMetadata(update).pipe(this.ensureSuccess()))
          )
        ).pipe(toArray());
      }),
      // Let record forms in the open session use the new rules right away.
      tap(() => this.recordMetadata.invalidate(payload.entityName)),
      switchMap(() => this.markStatus(proposal.id, added.length > 0 ? 'imported' : 'published')),
      map(() => this.done(proposal)),
      catchError(error => this.reportFailure(proposal, this.describe(error))),
      startWith(this.running(proposal))
    );
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
   * Stops the import if a model with the same name exists.
   * `getSchema` returns 400/404 when not found — that is not an error but exactly
   * the state we are looking for (same note as `saveNode$` in `table-detail.component.ts`).
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
          ? throwError(() => new Error(`already-exists:${entityName}`))
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
        switchMap(() => this.addColumns(node.entityName, node.columns))
      );
  }

  /** Adds the proposed columns in order (new model, or extra columns on a saved model). */
  private addColumns(typeName: string, columns: AiProposedColumn[]): Observable<unknown> {
    if (columns.length === 0) return of([]);
    return from(columns).pipe(
      concatMap(column =>
        this.publishedTable
          .addMember({
            typeName,
            memberName: column.columnName,
            memberType: column.dataType,
            // CAUTION: the form/proposal side uses isNullable, the API expects isRequired.
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
    );
  }

  /**
   * Saves the relationships. `RelationshipService` wants the table ID, not its NAME,
   * so it is resolved with `getAllTables()` AFTER the model has been written
   * (same pattern as `flush()` in `relationships-tab.component.ts`).
   */
  private saveRelationships(payload: AiModelPayload): Observable<unknown> {
    const list = payload.relationships ?? [];
    if (list.length === 0) return of(void 0);

    return this.publishedTable.getAllTables().pipe(
      switchMap(res => {
        const match = (res.data ?? []).find(
          t => t.tableName.toLowerCase() === payload.entityName.toLowerCase()
        );
        if (!match) return throwError(() => new Error('table-not-found'));

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

  // ── Stage 2: publish, then define reports and dashboards ─────────────────

  /**
   * Publishes the imported models, then defines the reports and dashboards.
   * The order is binding; each stage depends on the records produced by the previous one.
   */
  publishAll(proposals: AiProposal[]): Observable<AiImportProgress> {
    // Report name → ID. Starts with the existing reports; ones defined in this run are added.
    const reportIds = new Map<string, number>();

    const seed = defer(() =>
      this.reports.list().pipe(
        map(res => {
          for (const report of res.data ?? []) {
            reportIds.set(report.name.toLowerCase(), report.id);
          }
          return null;
        }),
        // If the report list cannot be fetched, publishing does not stop; only name
        // matching is limited to the reports defined in this run.
        catchError(() => of(null))
      )
    ).pipe(concatMap(() => from([] as AiImportProgress[])));

    // Change proposals with new columns also republish the model (the SQL column is created on publish).
    const models = from(proposals.filter(p =>
      (p.kind === 'model' || p.kind === 'model_change') && p.status === 'imported'))
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

    // Publishing the root model publishes the whole subtree with it.
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
        // Dashboards refer to reports by NAME, so the mapping is built
        // here — right after the definition, while we still have the ID.
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
      return this.reportFailure(proposal, `report-not-found:${unresolved.join(', ')}`);
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

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Also treats HTTP 200 + success:false as an error. */
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
   * Writes the card state to the backend. This is a ledger entry — its failure
   * does not invalidate the import itself, so the error is swallowed.
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

  /** Both notifies the user of the error and writes it to the card permanently. */
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
    return http?.error?.message ?? (http?.status ? `HTTP ${http.status}` : 'unknown-error');
  }
}
