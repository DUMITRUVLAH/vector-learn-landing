// Etichetele task-urilor.
//
// Formatul stocat în `hr_tasks.tags` (text[]) e „label" sau „label|culoare" —
// convenția introdusă de pagina veche `/tasks`. O păstrăm ca cele două UI-uri
// să vadă aceleași etichete cât timp coexistă; funcțiile trăiesc aici, nu
// duplicate în fiecare pagină.

export const TAG_COLORS: Record<string, { bg: string; text: string; swatch: string }> = {
  gray: { bg: '#f3f4f6', text: '#4b5563', swatch: '#9ca3af' },
  blue: { bg: '#dbeafe', text: '#1d4ed8', swatch: '#3b82f6' },
  green: { bg: '#d1fae5', text: '#065f46', swatch: '#10b981' },
  yellow: { bg: '#fef3c7', text: '#92400e', swatch: '#f59e0b' },
  orange: { bg: '#ffedd5', text: '#9a3412', swatch: '#f97316' },
  red: { bg: '#fee2e2', text: '#b91c1c', swatch: '#ef4444' },
  purple: { bg: '#ede9fe', text: '#5b21b6', swatch: '#8b5cf6' },
  rose: { bg: '#fce7f3', text: '#9d174d', swatch: '#f43f5e' },
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
