/**
 * MASS-003: CsvImportZone — drag-and-drop CSV upload zone
 *
 * A reusable component for uploading CSV files. Calls onUpload with the
 * selected File object; the parent decides what to do with it.
 *
 * Props:
 *   onUpload(file: File): void — called when user selects/drops a valid CSV
 *   accept?: string — file accept attribute (default ".csv,text/csv")
 *   label?: string — descriptive label for the zone
 *   disabled?: boolean
 *
 * Accessibility: WCAG AA
 *   - Role="button" + keyboard activation (Enter/Space)
 *   - aria-label on the zone
 *   - min touch target 44px
 *   - Visual feedback for drag-over state
 *
 * Design: Vector 365 semantic tokens, light + dark mode, no hardcoded colors
 */

import React, { useRef, useState, useCallback } from "react";

interface CsvImportZoneProps {
  onUpload: (file: File) => void;
  accept?: string;
  label?: string;
  disabled?: boolean;
}

export function CsvImportZone({
  onUpload,
  accept = ".csv,text/csv",
  label = "Drag CSV file here or click to select",
  disabled = false,
}: CsvImportZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (disabled) return;
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv" || file.type === "text/plain")) {
        onUpload(file);
      }
    },
    [disabled, onUpload]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled) inputRef.current?.click();
    }
  };

  const zoneClasses = [
    "flex flex-col items-center justify-center gap-2",
    "border-2 border-dashed rounded-lg",
    "p-6 min-h-[44px] cursor-pointer",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    isDragOver
      ? "border-primary bg-primary/5"
      : "border-border bg-card hover:border-primary/60 hover:bg-accent",
    disabled
      ? "opacity-50 cursor-not-allowed pointer-events-none"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      className={zoneClasses}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={onInputChange}
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabled}
      />

      {/* Upload icon — screen-reader hidden, purely decorative */}
      <svg
        aria-hidden="true"
        className="w-8 h-8 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
        />
      </svg>

      <span className="text-sm text-muted-foreground text-center">
        {isDragOver ? "Eliberează fișierul" : label}
      </span>

      <span className="text-xs text-muted-foreground/70">
        Acceptă: CSV (UTF-8, separator virgulă)
      </span>
    </div>
  );
}
