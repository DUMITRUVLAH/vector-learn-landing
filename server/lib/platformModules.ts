/**
 * PLATFORM-001 — catalogul de module și rezolvarea drepturilor la nivel de workspace.
 *
 * Un singur loc definește ce module există în produs. Consola Platformă îl afișează,
 * signup-ul îl folosește pentru a scrie drepturile workspace-ului nou, iar shell-ul
 * clientului îl citește ca să știe ce meniuri arată.
 *
 * IMPLICITUL PRODUSULUI (decizie owner, 2026-08-28): orice organizație are PAR. Restul
 * modulelor (FinDesk, ITPark, Document Merge) sunt OPRITE până le aprinde proprietarul din
 * Consola Platformă. Implicitul trăiește în cod (`defaultEnabled` din catalog), NU în date:
 * migrările nu se aplică fiabil pe prod (docs/solutions/database-issues), deci un implicit
 * ținut într-un rând de tabelă ar fi însemnat comportament diferit pe prod față de local.
 *
 * Regula de citire: rândul explicit din `tenant_modules` câștigă întotdeauna; lipsa rândului
 * (sau o interogare picată) cade pe implicitul din cod — adică PAR vizibil, restul ascuns.
 * Superadminul nu e filtrat niciodată (vezi routes/myModules + requireModuleEntitlement).
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
  /** Îl primește un workspace fără setare explicită? Doar PAR — restul se aprind din consolă. */
  defaultEnabled: boolean;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    key: "findesk",
    label: "FinDesk",
    description: "Facturi, cheltuieli, încasări, TVA, salarii și e-Factura.",
    route: "/business/fin/",
    defaultEnabled: false,
  },
  {
    key: "par",
    label: "PAR — Cereri de plată",
    description: "Cereri de plată cu aprobări multi-nivel, coadă de finanțe și rapoarte.",
    route: "/business/par",
    defaultEnabled: true,
  },
  {
    key: "itpark",
    label: "ITPark — Rezidenți",
    description: "Contracte MITP, declarații și raportare anuală pentru rezidenți IT Park.",
    route: "/business/fin/itpark",
    defaultEnabled: false,
  },
  {
    key: "docmerge",
    label: "Document Merge",
    description: "Generare de documente în masă din șablon + Excel.",
    route: "/business/docmerge",
    defaultEnabled: false,
  },
] as const;

export const MODULE_KEYS: readonly string[] = MODULE_CATALOG.map((m) => m.key);

/** Modulele pe care le primește oricine, fără nicio setare — azi doar PAR. */
export const DEFAULT_ENABLED_MODULE_KEYS: readonly string[] = MODULE_CATALOG.filter(
  (m) => m.defaultEnabled,
).map((m) => m.key);

export function isKnownModule(key: string): boolean {
  return MODULE_KEYS.includes(key);
}

/** Implicitul din cod pentru o cheie necunoscută în date. Necunoscut = oprit. */
export function isModuleDefaultEnabled(key: string): boolean {
  return MODULE_CATALOG.some((m) => m.key === key && m.defaultEnabled);
}

/** Harta de pornire pentru orice citire: PAR pornit, restul oprit. */
export function defaultModuleMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const m of MODULE_CATALOG) map[m.key] = m.defaultEnabled;
  return map;
}

/**
 * Ce module vede un workspace. Rândurile explicite câștigă; cheile fără rând cad pe implicit.
 * O singură interogare per apel — se cheamă la hidratarea shell-ului, nu pe fiecare request.
 */
export async function getTenantModuleMap(tenantId: string): Promise<Record<string, boolean>> {
  const map = defaultModuleMap();
  try {
    const rows = await db
      .select({ moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, tenantId));
    for (const row of rows) map[row.moduleKey] = row.enabled;
  } catch (e) {
    // Tabela poate lipsi câteva minute după un deploy fără migrare — rămânem pe implicitul
    // din cod (PAR) în loc să prăbușim shell-ul clientului.
    console.warn("[platformModules] tenant_modules unavailable, falling back to code defaults:", e instanceof Error ? e.message : e);
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
    return row ? row.enabled : isModuleDefaultEnabled(moduleKey);
  } catch {
    return isModuleDefaultEnabled(moduleKey);
  }
}

/** Implicitele configurate de proprietar pentru workspace-urile NOI. */
export async function getModuleDefaults(): Promise<Record<string, boolean>> {
  const map = defaultModuleMap();
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
      enabled: defaults[m.key] === true,
      updatedByUserId: actorUserId ?? null,
    }));
    await db.insert(tenantModules).values(values).onConflictDoNothing();
  } catch (e) {
    console.warn("[platformModules] applyDefaultsToTenant skipped:", e instanceof Error ? e.message : e);
  }
}
