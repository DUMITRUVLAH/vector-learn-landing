/**
 * DIPLOMA-802 — CertificateCanvas
 *
 * Canvas 3508×2480 with drag&drop field positioning.
 * Ported from copy-roas src/pages/DiplomaGenerator.tsx canvas logic.
 */
import { useRef, useEffect, useCallback, useState } from "react";
import { wrapText, type TextMeasurer } from "@/lib/certificateText";
import type { FieldsConfig, FieldConfig } from "@/lib/api/certificateTemplates";
import { DEFAULT_FIELDS, FONT_OPTIONS } from "@/hooks/useCertificateTemplate";

export const CANVAS_W = 3508;
export const CANVAS_H = 2480;

interface PreviewData {
  participant_name?: string;
  course_name?: string;
  edition?: string;
  mentor_name?: string;
  completion_date?: string;
  certificate_id?: string;
}

interface CertificateCanvasProps {
  backgroundUrl: string | null;
  fieldsConfig: FieldsConfig;
  onFieldsChange: (cfg: FieldsConfig) => void;
  preview?: PreviewData;
}

function loadFonts() {
  const families = FONT_OPTIONS.filter((f) => f !== "Onest"); // Onest is already loaded
  families.forEach((family) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;700&display=swap`;
    if (!document.head.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
  });
}

/** Scale canvas coordinates to percentage */
function toPercent(px: number, total: number): number {
  return Math.max(0, Math.min(100, (px / total) * 100));
}

/** Get canvas-relative coordinates from a mouse/touch event */
function getCanvasCoords(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement
): { cx: number; cy: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return {
    cx: (e.clientX - rect.left) * scaleX,
    cy: (e.clientY - rect.top) * scaleY,
  };
}

const SAMPLE_VALUES: Record<string, string> = {
  participant_name: "Ion Popescu",
  course_name: "Facebook Ads",
  edition: "Mai 2026",
  mentor_name: "Maria Ionescu",
  completion_date: "31 Mai 2026",
  certificate_id: "FACEBO-2026VA-1",
};

export function CertificateCanvas({
  backgroundUrl,
  fieldsConfig,
  onFieldsChange,
  preview,
}: CertificateCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef<{ key: string; startX: number; startY: number } | null>(null);

  // Load fonts once on mount
  useEffect(() => {
    loadFonts();
  }, []);

  // Draw preview on canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = "#f8f8f8";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.strokeStyle = "#ddd";
      ctx.strokeRect(4, 4, CANVAS_W - 8, CANVAS_H - 8);
      ctx.fillStyle = "#bbb";
      ctx.font = "60px Onest, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Fundal diplomă", CANVAS_W / 2, CANVAS_H / 2);
    }

    // Fields
    const fields = { ...DEFAULT_FIELDS, ...fieldsConfig };

    (Object.entries(fields) as [string, FieldConfig | undefined][]).forEach(([key, cfg]) => {
      if (key === "qr_code" || !cfg) return;

      const x = (cfg.x / 100) * CANVAS_W;
      const y = (cfg.y / 100) * CANVAS_H;
      const fontSize = (cfg.fontSize ?? 24) * 3; // scale up for 3508px canvas
      const fontFamily = cfg.fontFamily ?? "Onest";
      const color = cfg.color ?? "#1a1a1a";
      const maxWidthPx = ((cfg.maxWidth ?? 50) / 100) * CANVAS_W;
      const align = cfg.align ?? "left";

      ctx.font = `${fontSize}px '${fontFamily}', sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;

      const value = preview
        ? (preview[key as keyof PreviewData] ?? SAMPLE_VALUES[key] ?? key)
        : (SAMPLE_VALUES[key] ?? key);

      const lines = wrapText(ctx, value, maxWidthPx);
      const lineHeight = fontSize * 1.3;
      lines.forEach((line, i) => {
        ctx.fillText(line, x, y + i * lineHeight);
      });
    });

    // QR placeholder
    const qr = fields.qr_code;
    if (qr) {
      const qx = (qr.x / 100) * CANVAS_W;
      const qy = (qr.y / 100) * CANVAS_H;
      const qSize = qr.size ?? 80;
      const qPx = (qSize / 100) * Math.min(CANVAS_W, CANVAS_H);
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 4;
      ctx.strokeRect(qx - qPx / 2, qy - qPx / 2, qPx, qPx);
      ctx.fillStyle = "#bbb";
      ctx.font = "40px Onest, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR", qx, qy + 14);
    }
  }, [fieldsConfig, preview]);

  // Load background image
  useEffect(() => {
    if (!backgroundUrl) {
      bgImageRef.current = null;
      drawPreview();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImageRef.current = img;
      drawPreview();
    };
    img.onerror = () => {
      bgImageRef.current = null;
      drawPreview();
    };
    img.src = backgroundUrl;
  }, [backgroundUrl, drawPreview]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  // Drag&drop hit test: which field is under the click?
  function hitTest(cx: number, cy: number): string | null {
    const fields = { ...DEFAULT_FIELDS, ...fieldsConfig };
    for (const [key, cfg] of Object.entries(fields)) {
      if (!cfg) continue;
      const fx = (cfg.x / 100) * CANVAS_W;
      const fy = (cfg.y / 100) * CANVAS_H;
      const hitRadius = 80; // px in canvas space
      if (Math.abs(cx - fx) < hitRadius && Math.abs(cy - fy) < hitRadius) {
        return key;
      }
    }
    return null;
  }

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { cx, cy } = getCanvasCoords(e, canvas);
      const key = hitTest(cx, cy);
      if (key) {
        draggingRef.current = { key, startX: cx, startY: cy };
        e.preventDefault();
      }
    },
    [fieldsConfig] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { cx, cy } = getCanvasCoords(e, canvas);
      const key = draggingRef.current.key;
      const newX = toPercent(cx, CANVAS_W);
      const newY = toPercent(cy, CANVAS_H);
      const existing = (fieldsConfig as Record<string, FieldConfig | undefined>)[key] ??
        (DEFAULT_FIELDS as Record<string, FieldConfig | undefined>)[key] ?? { x: 50, y: 50 };
      const updated: FieldsConfig = {
        ...fieldsConfig,
        [key]: { ...existing, x: newX, y: newY },
      };
      onFieldsChange(updated);
    },
    [fieldsConfig, onFieldsChange]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="w-full border border-border rounded-md cursor-crosshair"
        aria-label="Canvas editabil diplomă — trage câmpurile pentru repoziționare"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <p className="text-xs text-muted-foreground mt-1">
        Trage câmpurile direct pe canvas pentru repoziționare.
      </p>
    </div>
  );
}

export { FONT_OPTIONS, SAMPLE_VALUES };
export type { PreviewData };
