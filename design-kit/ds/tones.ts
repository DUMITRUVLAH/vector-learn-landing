/**
 * HR365-001 — the tone vocabulary of the HR365 by Vector design system.
 *
 * Two families, deliberately kept apart:
 *  - ChipTone   → the small tinted square behind a 14–20px glyph (sidebar rows,
 *                 KPI tiles, card headers). Pale tint + saturated ink.
 *  - ModuleTone → the flat saturated-100 launcher card, monochrome text in the
 *                 matching -700 ink.
 *
 * Both resolve through CSS variables declared in `src/index.css`, so light and
 * dark mode swap automatically and no hex ever lands in a `.tsx` file.
 */
import type { CSSProperties } from "react";

export type ChipTone =
  | "indigo"
  | "violet"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "blue"
  | "orange"
  | "teal";

export type ModuleTone =
  | "indigo"
  | "violet"
  | "cyan"
  | "emerald"
  | "orange"
  | "teal"
  | "sky"
  | "rose"
  | "amber";

/** Rotation used when a caller has a list but no explicit tone per item. */
export const CHIP_CYCLE: readonly ChipTone[] = [
  "indigo",
  "violet",
  "sky",
  "emerald",
  "amber",
  "rose",
  "teal",
] as const;

/** Deterministic tone for a stable key (same key → same tone across renders). */
export function chipToneFor(key: string): ChipTone {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CHIP_CYCLE[hash % CHIP_CYCLE.length];
}

/** Background + glyph color for an icon chip. */
export function chipStyle(tone: ChipTone): CSSProperties {
  return {
    backgroundColor: `var(--chip-${tone}-bg)`,
    color: `var(--chip-${tone}-fg)`,
  };
}

/** Card surface + ink for a module launcher tile. */
export function moduleStyle(tone: ModuleTone): CSSProperties {
  return {
    backgroundColor: `var(--module-${tone}-bg)`,
    color: `var(--module-${tone}-fg)`,
  };
}
