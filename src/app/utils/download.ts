/**
 * Tarayıcıda dosya indirme — rapor dışa aktarımı ve akış paketi ortak kullanır.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Hemen iptal edilirse Android Chrome indirmeyi başlatamadan URL'yi kaybedebilir.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

/** Metni (JSON vb.) dosya olarak indirir. */
export function downloadText(text: string, filename: string, type = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}
