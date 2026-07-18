/**
 * VM3-01: shared helper for opening/downloading PAR attachments.
 *
 * Attachments are stored as `data:` URLs (base64). Chrome BLOCKS top-level navigation to
 * data: URLs, so a plain `<a href="data:…" target="_blank">` does nothing ("când apas nu se
 * descarcă"). Convert the data URL to a Blob object URL and trigger a real download with the
 * original filename. Real http(s) URLs just open in a new tab.
 *
 * Used by ParDetail (secțiunea Atașamente) and ParFinanceQueue (butonul Documente).
 */
export async function openParAttachment(fileUrl: string, fileName: string, parId?: string, attachmentId?: string): Promise<void> {
  try {
    if (!fileUrl) return;
    if (parId && attachmentId) {
      window.open(`/api/par/${parId}/attachments/${attachmentId}/preview`, "_blank", "noopener,noreferrer");
      return;
    }
    if (fileUrl.startsWith("data:")) {
      const blob = await (await fetch(fileUrl)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "atasament";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } else {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  } catch {
    /* non-blocking — nothing we can do if the blob conversion fails */
  }
}
