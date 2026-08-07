/**
 * HR365-002 — PastelIcon: a small tinted square behind a 14–20px glyph.
 *
 * The visual signature of HR365. Used in sidebar rows, KPI tiles and card
 * headers. One tint per category — never two adjacent.
 */
import type { ReactNode } from "react";
import { chipStyle, type ChipTone } from "./tones";
import { cn } from "@/lib/utils";

export interface PastelIconProps {
  children: ReactNode;
  tone?: ChipTone;
  /** Square side in px. ≤28 uses the tighter `rounded-sm`, larger uses `rounded-xl`. */
  size?: number;
  className?: string;
  /** Overrides the tone tint — used by the active sidebar row (white-on-primary). */
  inverted?: boolean;
}

export function PastelIcon({
  children,
  tone = "indigo",
  size = 28,
  className,
  inverted = false,
}: PastelIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size <= 28 ? "rounded-sm" : "rounded-xl",
        inverted && "bg-primary-foreground/20 text-primary-foreground",
        className,
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ...(inverted ? {} : chipStyle(tone)),
      }}
    >
      {children}
    </span>
  );
}
