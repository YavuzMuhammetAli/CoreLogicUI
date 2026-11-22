import { Observable } from 'rxjs';
import { ResponseModel } from '../../../models/responseModel';

/**
 * Shared item shape of the deleted-record lists.
 *
 * Four screens (model / draft / report / dashboard) drew the same card; they differed
 * only in the badges shown and the restore key. This type reduces those differences
 * to data, so the view and state management stay in one place.
 */
export interface DeletedItem {
  /** Unique key in the list (@for track). */
  id: number;
  /** Card title — model/table/report/dashboard name. */
  title: string;
  /** Description shown under the title (if any). */
  description?: string | null;
  /**
   * Extra meta badges shown next to the title
   * (e.g. the model name for a report, "3 widget" for a dashboard).
   */
  badges?: string[];
  /**
   * Key passed to the restore call. Models/drafts are restored by table NAME,
   * reports/dashboards by ID; this field encapsulates the difference.
   */
  restoreKey: string | number;
}

/**
 * Data source and text prefix of a "deleted" screen.
 * Screens provide this; the listing/error/restore flow is run by
 * <c>DeletedListComponent</c>.
 */
export interface DeletedListSource {
  /**
   * Translation key prefix (e.g. 'deleted.models'). Screen-specific texts are read
   * from keys such as `{prefix}.title`, `{prefix}.empty`, `{prefix}.restoreConfirm`;
   * shared texts are under `deleted.*`.
   */
  i18nPrefix: string;

  /** Target of the "Geri" (Back) link. */
  backLink: string;

  /** Fetches deleted records and maps them to the shared item shape. */
  load(): Observable<{ success: boolean; message: string; items: DeletedItem[] }>;

  /** Reactivates the record. */
  restore(item: DeletedItem): Observable<ResponseModel>;
}
