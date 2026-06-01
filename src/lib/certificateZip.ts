/**
 * DIPLOMA-804 — certificateZip
 *
 * Utilities for bulk certificate generation and ZIP packaging.
 * Ported from copy-roas src/pages/DiplomaGenerator.tsx:
 *   buildCertificateFileName, handleGenerateAll (the download path).
 */
import JSZip from "jszip";
import { generateCertificatePdf, downloadBlob, type ExportFormat, type RenderOptions } from "./certificateRender";

/**
 * Build a safe filename for a certificate file.
 * Strips characters invalid in filenames (/ : * ? " < > | \) and collapses spaces.
 */
export function buildCertificateFileName(
  index: number,
  name: string,
  ext: ExportFormat
): string {
  const safeExt = ext === "pdf" ? "pdf" : "jpg";
  // Strip invalid chars: / : * ? " < > | \
  const safeName = name
    .replace(/[/:*?"<>|\\]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const n = index + 1;
  return `Certificat_${n}_${safeName}.${safeExt}`;
}

export interface BulkParticipant {
  index: number;
  name: string;
  certificateId: string;
  verificationToken: string;
}

export interface BulkGenerateOptions {
  participants: BulkParticipant[];
  renderOptions: Omit<RenderOptions, "participantName" | "certificateId" | "verificationToken">;
  format: ExportFormat;
  zipName?: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Generate certificates for all participants, pack into a ZIP blob.
 */
export async function generateBulkZip(options: BulkGenerateOptions): Promise<Blob> {
  const { participants, renderOptions, format, zipName = "Certificate.zip", onProgress } = options;
  const zip = new JSZip();

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const blob = await generateCertificatePdf(
      {
        ...renderOptions,
        participantName: p.name,
        certificateId: p.certificateId,
        verificationToken: p.verificationToken,
      },
      format
    );

    const fileName = buildCertificateFileName(p.index, p.name, format);
    zip.file(fileName, blob);
    onProgress?.(i + 1, participants.length);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  return zipBlob;
}
