/**
 * Sayfalamada gösterilecek sayfa numaraları: en fazla 5'lik kayan pencere.
 *
 * İlk ve son sayfa şablonda ayrıca (gerekirse "…" ile) çizilir; bu fonksiyon yalnız
 * ortadaki pencereyi döndürür. 7 ve daha az sayfada hepsi gösterilir.
 *
 * Eskiden model-data ve audit-log'da kopyaydı; role-detail ve user-permission-detail
 * ise TÜM sayfaları çiziyordu — 60+ modelde düğme satırı telefonda ekrandan taşıyordu.
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
