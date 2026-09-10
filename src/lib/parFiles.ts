/**
 * VM3-01: shared helper for opening/downloading PAR attachments.
 *
 * Attachments are stored as `data:` URLs (base64). Chrome BLOCKS top-level navigation to
 * data: URLs, so a plain `<a href="data:…" target="_blank">` does nothing ("când apas nu se
 * descarcă"). Convert the data URL to a Blob object URL and trigger a real download with the
 * original filename. Real http(s) URLs just open in a new tab.
 *
 * Când documentul aparține unui PAR (avem `parId` + `attachmentId`), NU mai deschidem o filă nouă:
 * îl arătăm în vizualizatorul din aplicație (`ParAttachmentViewer`), peste lista pe care omul
 * lucrează. Fila nouă rămâne doar ca rezervă, dacă vizualizatorul nu e montat.
 *
 * Used by ParDetail (secțiunea Atașamente), ParInbox, ParFolders și ParFinanceQueue (butonul Documente).
 */
import { openParAttachmentViewer, parAttachmentPreviewUrl } from "@/lib/par/attachmentViewerBus";

/** Deschide un atașament PAR în vizualizatorul din aplicație (rezervă: filă nouă). */
export function viewParAttachment(parId: string, attachmentId: string, fileName: string): void {
  if (openParAttachmentViewer({ parId, attachmentId, fileName })) return;
  window.open(parAttachmentPreviewUrl(parId, attachmentId), "_blank", "noopener,noreferrer");
}

export async function openParAttachment(fileUrl: string, fileName: string, parId?: string, attachmentId?: string): Promise<void> {
  try {
    if (parId && attachmentId) {
      viewParAttachment(parId, attachmentId, fileName);
      return;
    }
    if (!fileUrl) return;
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
