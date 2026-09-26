// Etichetele task-urilor.
//
// Formatul stocat în `board_tasks.tags` e „label" sau „label|culoare" (convenția din
// HR365). Funcțiile trăiesc aici, nu duplicate în fiecare pagină.

/**
 * Culorile etichetelor. Cheile (`blue`, `green`…) sunt cele stocate în task („label|blue"), deci nu se
 * schimbă; valorile sunt tokenii de „chip" din `index.css` (au variantă light ȘI dark), nu hex-uri —
 * sursa din HR365 avea hex fix, care în tema întunecată rămânea o pastilă deschisă pe fundal închis.
 */
export const TAG_COLORS: Record<string, { bg: string; text: string; swatch: string }> = {
  gray: { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))", swatch: "hsl(var(--muted-foreground))" },
  blue: { bg: "var(--chip-blue-bg)", text: "var(--chip-blue-fg)", swatch: "var(--chip-blue-fg)" },
  green: { bg: "var(--chip-emerald-bg)", text: "var(--chip-emerald-fg)", swatch: "var(--chip-emerald-fg)" },
  yellow: { bg: "var(--chip-amber-bg)", text: "var(--chip-amber-fg)", swatch: "var(--chip-amber-fg)" },
  orange: { bg: "var(--chip-orange-bg)", text: "var(--chip-orange-fg)", swatch: "var(--chip-orange-fg)" },
  red: { bg: "hsl(var(--destructive) / 0.12)", text: "hsl(var(--destructive))", swatch: "hsl(var(--destructive))" },
  purple: { bg: "var(--chip-violet-bg)", text: "var(--chip-violet-fg)", swatch: "var(--chip-violet-fg)" },
  rose: { bg: "var(--chip-rose-bg)", text: "var(--chip-rose-fg)", swatch: "var(--chip-rose-fg)" },
};

export interface ParsedTag {
  label: string;
  color: string;
}

export function parseTag(raw: string): ParsedTag {
  const i = raw.lastIndexOf('|');
  if (i === -1) return { label: raw, color: 'gray' };
  const color = raw.slice(i + 1);
  return { label: raw.slice(0, i), color: TAG_COLORS[color] ? color : 'gray' };
}

export function serializeTag(tag: ParsedTag): string {
  return tag.color === 'gray' ? tag.label : `${tag.label}|${tag.color}`;
}

export function normalizeTagLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').slice(0, 60);
}

/** Etichetele distincte dintr-un set de task-uri, pentru dropdown-ul de filtre. */
export function distinctTags(tasks: { tags: string[] | null }[]): ParsedTag[] {
  const seen = new Map<string, ParsedTag>();
  for (const t of tasks) {
    for (const raw of t.tags ?? []) {
      const parsed = parseTag(raw);
      const key = parsed.label.toLowerCase();
      if (key && !seen.has(key)) seen.set(key, parsed);
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'ro'));
}
