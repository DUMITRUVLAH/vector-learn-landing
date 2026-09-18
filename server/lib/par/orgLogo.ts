/**
 * Logoul organizației: unde se ține și cum ajunge pe hârtie.
 *
 * Câmpul „Logo URL" din setările PAR exista de la PAR-003, se valida, se previzualiza — și nu
 * apărea pe NICIUN document. Valoarea se plimba până la generatorul de PDF ca `PrintableOrg.logoUrl`
 * și acolo se oprea: antetul desena doar denumirea. Owner, 18 sept. 2026: „logo să poți adăuga în
 * organizație ca să apară după unde trebuie."
 *
 * Două lucruri lipseau, nu unul:
 *
 * 1. CUM AJUNGE LOGOUL ÎN APLICAȚIE. Un câmp de URL cere ca omul să aibă deja fișierul găzduit
 *    undeva. Acum se încarcă fișierul: ajunge în bucket-ul PUBLIC `org-branding` din Supabase
 *    Storage, iar URL-ul public se scrie singur în setări. Public, pentru că exact asta e un logo
 *    — el se tipărește pe acte care pleacă la contraparte, iar exportul pentru Word descarcă
 *    imaginea fără sesiunea noastră.
 *
 * 2. CUM AJUNGE PE PAGINĂ. pdfmake nu descarcă imagini după URL: vrea octeții, ca data-URL. De
 *    aceea `logoDataUrl()` aduce fișierul o singură dată și îl ține în memoria procesului. Fără
 *    cache, fiecare act, fiecare formular și fiecare dosar (care are ZECI de pagini generate)
 *    ar fi așteptat un GET în plus — owner-ul a cerut logoul „peste tot, dacă nu îngreunează".
 *
 * Nimic de aici nu poate opri un document: orice eroare — storage căzut, link mort, fișier uriaș,
 * format pe care pdfmake nu-l știe — se întoarce ca `null`, iar documentul iese exact ca înainte,
 * fără logo. Un act care nu se generează e o problemă mai mare decât un act fără siglă.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parSettings } from "../../db/schema/par";
import { buildObjectPath, publicObjectUrl, uploadObject } from "../storage/objectStore";

export const ORG_BRANDING_BUCKET = "org-branding";

/** Ce acceptăm la încărcare. pdfmake desenează DOAR PNG și JPEG — un SVG n-ar ajunge pe hârtie. */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_MAX_BYTES = 1_000_000; // 1 MB — un logo de antet, nu o fotografie

/** Extensia din tipul MIME, ca fișierul din storage să se deschidă corect oriunde. */
function extFor(mime: string): string {
  return mime === "image/jpeg" ? "jpg" : "png";
}

/**
 * Urcă logoul și întoarce URL-ul public de scris în setări.
 * Calea poartă un timestamp (`buildObjectPath`), deci un logo nou nu e ascuns de cache-ul
 * browserului sau al nostru — e alt URL, pur și simplu.
 */
export async function uploadOrgLogo(
  tenantId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const path = buildObjectPath(tenantId, `logo.${extFor(mime)}`);
  await uploadObject(ORG_BRANDING_BUCKET, path, bytes, mime);
  const url = publicObjectUrl(ORG_BRANDING_BUCKET, path);
  if (!url) throw new Error("storage_not_configured");
  return url;
}

// ─── Citirea logoului pentru generatoarele de PDF ─────────────────────────────

interface CacheEntry {
  dataUrl: string | null;
  at: number;
}

/** Cât ține un logo în memoria procesului. Se schimbă o dată la câțiva ani, nu la câteva minute. */
const CACHE_TTL_MS = 15 * 60 * 1000;
/** Câte organizații ținem simultan. Un proces servește câteva, nu mii. */
const CACHE_MAX = 16;
const cache = new Map<string, CacheEntry>();

/** Un URL pe care serverul are voie să-l descarce: https public, nu rețeaua internă. */
function isFetchableLogoUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  // Serverul descarcă un URL pus de un admin de tenant. Fără gardul ăsta, câmpul „Logo URL" ar fi
  // un scaner de rețea internă cu o singură cerere (SSRF): pui un URL de metadata al cloud-ului și
  // aștepți să vezi ce iese. Un logo nu stă niciodată pe localhost.
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

/**
 * Logoul ca data-URL, gata de pus într-un nod pdfmake. `null` înseamnă „documentul iese fără logo",
 * niciodată o excepție — vezi antetul fișierului.
 */
export async function logoDataUrl(logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl || !isFetchableLogoUrl(logoUrl)) return null;

  const hit = cache.get(logoUrl);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.dataUrl;

  const dataUrl = await fetchLogo(logoUrl);
  // Și eșecul se ține minte: un link mort n-are voie să coste un GET la fiecare pagină de dosar.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(logoUrl, { dataUrl, at: Date.now() });
  return dataUrl;
}

async function fetchLogo(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: "follow" });
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(mime)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Doar pentru teste: golește cache-ul între cazuri. */
export function __resetLogoCache(): void {
  cache.clear();
}

// ─── Identitatea organizației, într-un singur loc ─────────────────────────────

export interface OrgIdentity {
  legalName: string | null;
  /** URL-ul public — pentru HTML și pentru fișierul care se deschide în Word. */
  logoUrl: string | null;
  /** Aceeași imagine ca octeți — pentru pdfmake. `null` dacă nu e sau nu se poate descărca. */
  logoDataUrl: string | null;
}

/**
 * Cine emite documentul. Toate generatoarele (acte, formular PAR, dosar, rapoarte) citesc de aici,
 * ca un act și formularul din același dosar să nu poarte două antete diferite.
 */
export async function loadOrgIdentity(tenantId: string): Promise<OrgIdentity> {
  const [settings] = await db
    .select({ legalName: parSettings.orgLegalName, logoUrl: parSettings.orgLogoUrl })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId))
    .limit(1);
  const logoUrl = settings?.logoUrl ?? null;
  return {
    legalName: settings?.legalName ?? null,
    logoUrl,
    logoDataUrl: await logoDataUrl(logoUrl),
  };
}
