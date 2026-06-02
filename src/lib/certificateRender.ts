/**
 * DIPLOMA-803 — certificateRender
 *
 * Generates a certificate canvas with real participant name + QR code, then exports
 * to PDF (A4 landscape) or JPG.
 *
 * Ported from copy-roas src/pages/DiplomaGenerator.tsx:
 *   generateCertificateCanvas, generateCertificate.
 */
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { wrapText } from "./certificateText";
import { normalizeCertificateText } from "./certificateText";
import type { FieldsConfig, FieldConfig } from "./api/certificateTemplates";
import { DEFAULT_FIELDS } from "@/hooks/useCertificateTemplate";

export const CANVAS_W = 3508;
export const CANVAS_H = 2480;

export type ExportFormat = "pdf" | "jpg";

export interface RenderOptions {
  backgroundUrl: string | null;
  fieldsConfig: FieldsConfig;
  participantName: string;
  courseName: string;
  mentorName?: string | null;
  completionDate?: string | null;
  certificateId: string;
  edition?: string | null;
  /** Verification token for QR code URL */
  verificationToken: string;
  /** Base URL for verification link, e.g. https://app.vector.com */
  publicBaseUrl?: string;
}

/** Load an image from a URL and return an HTMLImageElement */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Render a single certificate onto a new canvas element.
 * Returns the canvas (caller can convert to data URL / blob).
 */
export async function generateCertificateCanvas(
  options: RenderOptions
): Promise<HTMLCanvasElement> {
  const {
    backgroundUrl,
    fieldsConfig,
    participantName,
    courseName,
    mentorName,
    completionDate,
    certificateId,
    edition,
    verificationToken,
    publicBaseUrl = window.location.origin,
  } = options;

  // Ensure fonts are loaded
  try {
    await document.fonts.load("48px Onest");
  } catch {
    // best-effort
  }

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;

  // Background
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);
    } catch {
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  } else {
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Field values
  const fieldValues: Record<string, string> = {
    participant_name: normalizeCertificateText(participantName),
    course_name: normalizeCertificateText(courseName),
    edition: normalizeCertificateText(edition ?? ""),
    mentor_name: normalizeCertificateText(mentorName ?? ""),
    completion_date: normalizeCertificateText(completionDate ?? ""),
    certificate_id: normalizeCertificateText(certificateId),
  };

  // Merge with defaults
  const fields = { ...DEFAULT_FIELDS, ...fieldsConfig };

  (Object.entries(fields) as [string, FieldConfig | undefined][]).forEach(([key, cfg]) => {
    if (key === "qr_code" || !cfg) return;
    const value = fieldValues[key];
    if (value === undefined || value === "") return;

    const x = (cfg.x / 100) * CANVAS_W;
    const y = (cfg.y / 100) * CANVAS_H;
    const fontSize = (cfg.fontSize ?? 24) * 3;
    const fontFamily = cfg.fontFamily ?? "Onest";
    const isBold = cfg.bold ? "bold " : "";
    const color = cfg.color ?? "#1a1a1a";
    const maxWidthPx = ((cfg.maxWidth ?? 50) / 100) * CANVAS_W;
    const align = cfg.align ?? "left";

    ctx.font = `${isBold}${fontSize}px '${fontFamily}', sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;

    const lines = wrapText(ctx, value, maxWidthPx);
    const lineHeight = fontSize * 1.3;
    lines.forEach((line, i) => {
      ctx.fillText(line, x, y + i * lineHeight);
    });
  });

  // QR code
  const qrCfg = fields.qr_code;
  if (qrCfg) {
    const verifyUrl = `${publicBaseUrl}/#/verify/${verificationToken}`;
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 600, margin: 1 });
      const qrImg = await loadImage(qrDataUrl);
      const qSize = qrCfg.size ?? 80;
      const qPx = (qSize / 100) * Math.min(CANVAS_W, CANVAS_H);
      const qx = (qrCfg.x / 100) * CANVAS_W - qPx / 2;
      const qy = (qrCfg.y / 100) * CANVAS_H - qPx / 2;
      ctx.drawImage(qrImg, qx, qy, qPx, qPx);
    } catch {
      // QR draw failed — draw placeholder
      const qSize = qrCfg.size ?? 80;
      const qPx = (qSize / 100) * Math.min(CANVAS_W, CANVAS_H);
      const qx = (qrCfg.x / 100) * CANVAS_W - qPx / 2;
      const qy = (qrCfg.y / 100) * CANVAS_H - qPx / 2;
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 4;
      ctx.strokeRect(qx, qy, qPx, qPx);
    }
  }

  return canvas;
}

/**
 * Export a rendered certificate canvas to PDF (A4 landscape) or JPG blob.
 */
export async function generateCertificatePdf(
  options: RenderOptions,
  format: ExportFormat = "pdf"
): Promise<Blob> {
  const canvas = await generateCertificateCanvas(options);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);

  if (format === "jpg") {
    const res = await fetch(jpegDataUrl);
    return res.blob();
  }

  // PDF: A4 landscape (297×210mm)
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.addImage(jpegDataUrl, "JPEG", 0, 0, 297, 210);
  return pdf.output("blob");
}

/**
 * Trigger a browser download of a blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
