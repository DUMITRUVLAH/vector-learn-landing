/**
 * PLATFORM-001 — catalogul de module și rezolvarea drepturilor la nivel de workspace.
 *
 * Un singur loc definește ce module există în produs. Consola Platformă îl afișează,
 * signup-ul îl folosește pentru a scrie drepturile workspace-ului nou, iar shell-ul
 * clientului îl citește ca să știe ce meniuri arată.
 *
 * FAIL-OPEN: `isModuleEnabled` întoarce true când nu există niciun rând `tenant_modules`.
 * Doar un rând explicit `enabled = false` ascunde un modul. Motivul e concret: migrările
 * nu se aplică fiabil pe prod (docs/solutions/database-issues), iar un gating fail-closed
 * ar fi însemnat ca un deploy fără migrare să lase toți clienții cu un meniu gol.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformModuleDefaults, tenantModules } from "../db/schema/platform";

export interface ModuleCatalogEntry {
  key: string;
  label: string;
  description: string;
  /** Ruta din SPA sub care trăiește modulul — folosită de consolă pentru context. */
  route: string;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    key: "findesk",
    label: "FinDesk",
    description: "Facturi, cheltuieli, încasări, TVA, salarii și e-Factura.",
    route: "/business/fin/",
  },
  {
    key: "par",
    label: "PAR — Cereri de plată",
    description: "Cereri de plată cu aprobări multi-nivel, coadă de finanțe și rapoarte.",
    route: "/business/par",
  },
  {
    key: "itpark",
    label: "ITPark — Rezidenți",
    description: "Contracte MITP, declarații și raportare anuală pentru rezidenți IT Park.",
    route: "/business/fin/itpark",
  },
  {
    key: "docmerge",
    label: "Document Merge",
    description: "Generare de documente în masă din șablon + Excel.",
    route: "/business/docmerge",
  },
] as const;

export const MODULE_KEYS: readonly string[] = MODULE_CATALOG.map((m) => m.key);

export function isKnownModule(key: string): boolean {
  return MODULE_KEYS.includes(key);
}

/**
 * Ce module vede un workspace. Rândurile explicite câștigă; cheile fără rând rămân active.
 * O singură interogare per apel — se cheamă la hidratarea shell-ului, nu pe fiecare request.
 */
export async function getTenantModuleMap(tenantId: string): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  for (const m of MODULE_CATALOG) map[m.key] = true; // fail-open
  try {
    const rows = await db
      .select({ moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, tenantId));
    for (const row of rows) map[row.moduleKey] = row.enabled;
  } catch (e) {
    // Tabela poate lipsi câteva minute după un deploy fără migrare — degradăm la fail-open
    // în loc să prăbușim shell-ul clientului.
    console.warn("[platformModules] tenant_modules unavailable, defaulting to open:", e instanceof Error ? e.message : e);
  }
  return map;
}

/** Verificare punctuală pentru un singur modul (folosită de middleware). */
export async function isModuleEnabledForTenant(tenantId: string, moduleKey: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: tenantModules.enabled })
      .from(tenantModules)
      .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, moduleKey)))
      .limit(1);
    return row ? row.enabled : true;
  } catch {
    return true;
  }
}

/** Implicitele configurate de proprietar pentru workspace-urile NOI. */
export async function getModuleDefaults(): Promise<Record<string, boolean>> {
  const map: Record<string, boolean> = {};
  for (const m of MODULE_CATALOG) map[m.key] = true;
  try {
    const rows = await db
      .select({ moduleKey: platformModuleDefaults.moduleKey, enabled: platformModuleDefaults.enabled })
      .from(platformModuleDefaults);
    for (const row of rows) map[row.moduleKey] = row.enabled;
  } catch (e) {
    console.warn("[platformModules] module defaults unavailable:", e instanceof Error ? e.message : e);
  }
  return map;
}

/**
 * Scrie drepturile inițiale ale unui workspace nou din implicitele platformei.
 * Best-effort: un signup nu are voie să eșueze din cauza acestui pas.
 */
export async function applyDefaultsToTenant(tenantId: string, actorUserId?: string | null): Promise<void> {
  try {
    const defaults = await getModuleDefaults();
    const values = MODULE_CATALOG.map((m) => ({
      tenantId,
      moduleKey: m.key,
      enabled: defaults[m.key] !== false,
      updatedByUserId: actorUserId ?? null,
    }));
    await db.insert(tenantModules).values(values).onConflictDoNothing();
  } catch (e) {
    console.warn("[platformModules] applyDefaultsToTenant skipped:", e instanceof Error ? e.message : e);
  }
}
