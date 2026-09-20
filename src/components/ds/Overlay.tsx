/**
 * HR365-006 — overlays: Dialog and Sheet.
 *
 * Both are fixed to the viewport, trap Escape, and restore scroll on unmount.
 * The scrim is the navy foreground at 60%. Dialog fades in, Sheet slides.
 *
 * These deliberately do NOT trap focus with a full focus-lock implementation —
 * they set initial focus and close on Escape, which is what the app's existing
 * hand-rolled modals did. Anything more belongs in a real dialog library.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function useDismiss(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Închide"
      // MOB-002: pe telefon „×" era de 32px — sub degetul care trebuie să închidă dialogul.
      className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground max-sm:h-11 max-sm:w-11"
    >
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  /** Tailwind max-width class for the panel. */
  size?: "sm" | "md" | "lg" | "xl";
  children?: ReactNode;
}

const DIALOG_SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" } as const;

export function Dialog({ open, onClose, title, description, footer, size = "md", children }: DialogProps) {
  useDismiss(open, onClose);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-foreground/60"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          // `grid-cols-[minmax(0,1fr)]`, nu doar `grid`: un element de grilă are implicit
          // `min-width: auto`, așa că un rând lung (numele unui beneficiar, de pildă) lățea
          // coloana peste panou. Panoul e plafonat de max-width, deci TOT conținutul se așeza
          // pe o lățime mai mare și era tăiat la marginea din dreapta — pe telefon, dialogul
          // „Cum începem cererea?" apărea cu textul retezat (owner, 2026-08-29).
          "relative grid grid-cols-[minmax(0,1fr)] max-h-[90vh] w-full gap-4 overflow-y-auto rounded-lg border border-border bg-background p-4 sm:p-6 shadow-lg outline-none animate-fade-in",
          DIALOG_SIZES[size],
        )}
      >
        <div className="flex flex-col gap-1.5 pr-8">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
        <CloseButton onClose={onClose} />
      </div>
    </div>
  );
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  /** `full` = ecran întreg. Pentru fișe de lucru (fișa leadului), unde panoul lateral obliga la
   *  un scroll lung printr-o singură coloană: pe ecran întreg încap două, context în stânga și
   *  lucrul în dreapta. */
  size?: "sm" | "md" | "lg" | "full";
  children?: ReactNode;
}

const SHEET_SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", full: "max-w-none" } as const;

export function Sheet({ open, onClose, title, description, side = "right", size = "md", children }: SheetProps) {
  useDismiss(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-foreground/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 w-full overflow-y-auto border-border p-6 shadow-xl animate-slide-in",
          // Pe ecran întreg fundalul e STINS, nu alb: singurul fel în care se văd ca secțiuni
          // separate cardurile dinăuntru (`--card` e alb, `--background` e gri deschis). Un panou
          // alb cu conținut alb e o coală, nu un ecran.
          // OPAC, fără `/40`: cu transparență se vedea tabla prin fișă, ca un ecran stricat.
          "bg-background",
          SHEET_SIZES[size],
          // Pe ecran întreg nu mai există „lateral": panoul ocupă tot, deci nici bordura de
          // margine n-are ce despărți.
          size === "full" ? "inset-x-0" : side === "right" ? "right-0 border-l" : "left-0 border-r",
        )}
      >
        <div className="mb-6 flex flex-col gap-1 pr-8">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
        <CloseButton onClose={onClose} />
      </div>
    </div>
  );
}
