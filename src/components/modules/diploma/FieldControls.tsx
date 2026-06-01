/**
 * DIPLOMA-802 — FieldControls
 *
 * Left panel: per-field configuration (font, X/Y %, fontSize, color, bold, maxWidth, visible).
 * Ported from copy-roas src/pages/DiplomaGenerator.tsx field control section.
 */
import { type ChangeEvent } from "react";
import type { FieldsConfig, FieldConfig } from "@/lib/api/certificateTemplates";
import { DEFAULT_FIELDS, FONT_OPTIONS, FIELD_LABELS } from "@/hooks/useCertificateTemplate";
import { cn } from "@/lib/utils";

const FIELD_ORDER = [
  "participant_name",
  "course_name",
  "edition",
  "mentor_name",
  "completion_date",
  "certificate_id",
  "qr_code",
] as const;

type FieldKey = (typeof FIELD_ORDER)[number];

interface FieldControlsProps {
  fieldsConfig: FieldsConfig;
  onFieldsChange: (cfg: FieldsConfig) => void;
}

function NumberInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        className="w-full border border-input rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function FieldControls({ fieldsConfig, onFieldsChange }: FieldControlsProps) {
  function getField(key: string): FieldConfig {
    const fc = fieldsConfig as Record<string, FieldConfig | undefined>;
    const df = DEFAULT_FIELDS as Record<string, FieldConfig | undefined>;
    return { ...(df[key] ?? { x: 50, y: 50 }), ...(fc[key] ?? {}) };
  }

  function updateField(key: string, patch: Partial<FieldConfig>) {
    const current = getField(key);
    onFieldsChange({
      ...fieldsConfig,
      [key]: { ...current, ...patch },
    });
  }

  const qrField = getField("qr_code");

  return (
    <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] pr-1">
      {FIELD_ORDER.map((key) => {
        if (key === "qr_code") {
          // QR block
          return (
            <section key="qr_code" className="rounded-lg border border-border p-3 flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">QR Code</h3>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="X %"
                  value={qrField.x}
                  min={0}
                  max={100}
                  step={0.5}
                  onChange={(v) => updateField("qr_code", { x: v })}
                />
                <NumberInput
                  label="Y %"
                  value={qrField.y}
                  min={0}
                  max={100}
                  step={0.5}
                  onChange={(v) => updateField("qr_code", { y: v })}
                />
                <NumberInput
                  label="Size (% latura)"
                  value={qrField.size ?? 80}
                  min={20}
                  max={200}
                  step={5}
                  onChange={(v) => updateField("qr_code", { size: v })}
                />
              </div>
            </section>
          );
        }

        const cfg = getField(key);
        const label = FIELD_LABELS[key] ?? key;

        return (
          <section key={key} className="rounded-lg border border-border p-3 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">{label}</h3>
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="X %"
                value={cfg.x}
                min={0}
                max={100}
                step={0.5}
                onChange={(v) => updateField(key, { x: v })}
              />
              <NumberInput
                label="Y %"
                value={cfg.y}
                min={0}
                max={100}
                step={0.5}
                onChange={(v) => updateField(key, { y: v })}
              />
              <NumberInput
                label="Font size"
                value={cfg.fontSize ?? 24}
                min={8}
                max={120}
                onChange={(v) => updateField(key, { fontSize: v })}
              />
              <NumberInput
                label="Max width %"
                value={cfg.maxWidth ?? 50}
                min={10}
                max={100}
                step={5}
                onChange={(v) => updateField(key, { maxWidth: v })}
              />
            </div>

            {/* Font family */}
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Font</span>
              <select
                className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={cfg.fontFamily ?? "Onest"}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateField(key, { fontFamily: e.target.value })
                }
                aria-label={`Font pentru ${label}`}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>

            {/* Align */}
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Aliniere</span>
              <select
                className="border border-input rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={cfg.align ?? "left"}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  updateField(key, { align: e.target.value as "left" | "center" | "right" })
                }
                aria-label={`Aliniere pentru ${label}`}
              >
                <option value="left">Stânga</option>
                <option value="center">Centru</option>
                <option value="right">Dreapta</option>
              </select>
            </label>

            {/* Color */}
            <label className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Culoare</span>
              <input
                type="color"
                className="h-7 w-10 cursor-pointer border border-input rounded"
                value={cfg.color ?? "#1a1a1a"}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField(key, { color: e.target.value })
                }
                aria-label={`Culoare text ${label}`}
              />
              <span className="text-xs text-muted-foreground font-mono">{cfg.color ?? "#1a1a1a"}</span>
            </label>

            {/* Bold toggle */}
            <label className={cn("flex items-center gap-2 cursor-pointer select-none")}>
              <input
                type="checkbox"
                className="accent-primary"
                checked={Boolean(cfg.bold)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField(key, { bold: e.target.checked })
                }
                aria-label={`Bold pentru ${label}`}
              />
              <span className="text-xs text-foreground">Bold</span>
            </label>
          </section>
        );
      })}
    </div>
  );
}
