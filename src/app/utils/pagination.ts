/**
 * Page numbers shown in pagination: a sliding window of at most 5.
 *
 * The first and last pages are drawn separately in the template (with "…" if needed); this function
 * returns only the middle window. With 7 or fewer pages, all are shown.
 *
 * Previously duplicated in model-data and audit-log; role-detail and user-permission-detail
 * drew ALL pages — with 60+ models the button row overflowed the screen on phones.
 */
export function pageWindow(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: Math.max(total, 0) }, (_, i) => i + 1);

  const half = 2;
  let start = Math.max(1, current - half);
  let end   = Math.min(total, current + half);

  if (current - half < 1)     end   = Math.min(total, 5);
  if (current + half > total) start = Math.max(1, total - 4);

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
