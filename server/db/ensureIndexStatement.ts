/**
 * Instrucțiunea cu care `sync-schema` recreează pe prod un index declarat în schema Drizzle.
 *
 * Funcție pură, separată de `sync-schema.ts` (care rulează la import), ca regula să poată fi
 * testată: `server/__tests__/ensure-index-statement.test.ts`.
 *
 * Întoarce `null` pentru ce NU se poate reconstrui fidel de aici:
 * - un index PARȚIAL (`.where(...)`): instrucțiunea n-ar avea clauza WHERE, deci ar crea varianta
 *   COMPLETĂ — pentru un index unic, altă regulă de business („un singur board implicit per
 *   workspace" ar fi devenit „un singur board per workspace"). Parțialii vin doar din migrare și
 *   din ENSURE_STATEMENTS. Vezi docs/solutions/database-issues/partial-index-rebuilt-without-where.md;
 * - un index pe expresii (nu pe coloane simple).
 */
export interface IndexConfigLike {
  name?: string;
  columns?: unknown[];
  unique?: boolean;
  where?: unknown;
}

export function ensureIndexStatement(tableName: string, cfg: IndexConfigLike | undefined): string | null {
  if (!cfg?.name || !Array.isArray(cfg.columns) || cfg.columns.length === 0) return null;
  if (cfg.where) return null;
  const cols = cfg.columns
    .map((col) => (col as { name?: string })?.name)
    .filter((n): n is string => typeof n === "string");
  if (cols.length !== cfg.columns.length) return null;
  const unique = cfg.unique ? "UNIQUE " : "";
  return `CREATE ${unique}INDEX IF NOT EXISTS "${cfg.name}" ON "${tableName}" (${cols.map((cn) => `"${cn}"`).join(", ")})`;
}
