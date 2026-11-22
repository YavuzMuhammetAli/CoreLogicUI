/**
 * Browser file download — shared by report export and the workflow package.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // If revoked immediately, Android Chrome may lose the URL before starting the download.
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

/** Downloads text (JSON etc.) as a file. */
export function downloadText(text: string, filename: string, type = 'application/json'): void {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}
