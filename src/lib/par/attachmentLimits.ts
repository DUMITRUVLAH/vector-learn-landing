/**
 * PERF audit (2026-08-29): the client-side cap on PAR attachments uploaded as a base64 JSON
 * `dataUrl` (`uploadAttachment()` in `src/lib/api/par.ts`).
 *
 * Vercel's request body limit is ~4.5 MB. Base64-encoding a file inflates it by ~33%, so a file
 * as small as ~3.3 MB can blow past that limit and fail with an unexplained 413 — well under the
 * "10 MB" the UI used to advertise. The real fix is a `multipart/form-data` upload (no base64
 * inflation), same pattern as `prefillParFromDocument()` — see `/FRONTEND-NEEDS-SERVER.md` at the
 * repo root for the exact server change that unblocks it. Until that ships, the client cap is
 * lowered to a size that can never hit the platform limit even after base64 inflation, with an
 * error that explains WHY (not just "too big").
 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024; // 3 MB
export const MAX_ATTACHMENT_LABEL = "3 MB";

/** Human-readable, explains the base64/Vercel-body-limit reason — not just a bare "too big". */
export function attachmentTooLargeMessage(fileName: string): string {
  return `${fileName}: depășește ${MAX_ATTACHMENT_LABEL}. Fișierele trimise ca text (base64) se ` +
    "umflă cu o treime — peste acest prag, trimiterea directă pică. Comprimă fișierul sau împarte-l.";
}
