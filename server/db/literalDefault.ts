/**
 * Default-ul unei coloane Drizzle ca literal SQL — sau null când nu e o valoare simplă.
 *
 * Drizzle nu trimite default-ul în INSERT: omite coloana și lasă baza să-l pună. Heal-ul generic
 * din `sync-schema.ts` adăuga însă coloanele lipsă FĂRĂ default, deci pe producție fiecare INSERT
 * care nu numea coloana scria NULL (24.09.2026: `par_vendors.kind` pe 17 beneficiari,
 * `par_settings.enforce_three_way_match`, `tenants.institution_type`…). Doar valorile literale
 * (text, număr, boolean) se copiază; `defaultNow()` / `defaultRandom()` sunt expresii SQL și rămân
 * pe seama migrărilor.
 */
export function literalDefault(col: unknown): string | null {
  const c = col as { hasDefault?: boolean; default?: unknown };
  if (!c.hasDefault) return null;
  const v = c.default;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  return null;
}
