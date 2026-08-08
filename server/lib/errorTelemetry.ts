/**
 * PLATFORM-002 — colectorul de erori.
 *
 * Un singur punct prin care trec TOATE erorile (din browser și de pe server) înainte de a
 * ajunge în `error_events` / `error_groups`.
 *
 * Trei decizii care contează:
 *
 * 1. **Amprentare (fingerprint).** Mesajele conțin id-uri, numere și date care diferă la
 *    fiecare apariție. Fără normalizare, aceeași eroare ar produce mii de grupuri distincte
 *    și lista ar fi inutilizabilă. Normalizăm uuid-urile, numerele și ghilimelele, apoi
 *    hash-uim `kind + locație + mesaj normalizat`.
 *
 * 2. **Nu doborâm nimic.** Se cheamă din `app.onError`, adică fix când ceva deja e stricat.
 *    Orice eșec al colectorului e înghițit — o telemetrie care aruncă peste eroarea inițială
 *    transformă un bug într-un incident.
 *
 * 3. **Zgomotul e filtrat la sursă.** 401/403/404 „normale" (sesiune expirată, drepturi
 *    lipsă) NU sunt bug-uri; dacă ar intra aici, lista de erori ar fi inutilă în două zile.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { errorEvents, errorGroups, type ErrorKind } from "../db/schema/telemetry";

export interface RecordErrorInput {
  kind: ErrorKind;
  message: string;
  stack?: string | null;
  /** Ruta API sau ruta din SPA — „unde mă uit ca să repar". */
  location?: string | null;
  method?: string | null;
  statusCode?: number | null;
  url?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
}

/** Scoate din mesaj tot ce diferă între apariții, ca să rămână „forma" erorii. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+/g, "<date>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/["'`][^"'`]{0,80}["'`]/g, "<val>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Înlocuiește segmentele variabile din cale, ca `/api/par/<uuid>` să fie UN grup, nu o mie. */
export function normalizeLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  return location
    .split("?")[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:n")
    .slice(0, 300);
}

export function fingerprintOf(kind: string, location: string | null, message: string): string {
  const basis = `${kind}|${normalizeLocation(location) ?? "-"}|${normalizeMessage(message)}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 64);
}

/**
 * Erori care NU sunt bug-uri: sesiune expirată, drepturi lipsă, validare respinsă,
 * resursă inexistentă cerută corect. Le lăsăm afară ca lista să rămână despre bug-uri reale.
 */
const NOT_A_BUG = new Set([
  "unauthenticated",
  "invalid_session",
  "account_disabled",
  "platform_admin_required",
  "module_disabled",
  "wrong_app",
  "workspace_suspended",
  "invalid_credentials",
  "email_taken",
  "not_found",
  "validation_failed",
]);

export function isNoise(message: string, statusCode?: number | null): boolean {
  const m = message.trim().toLowerCase();
  if (NOT_A_BUG.has(m)) return true;
  // 4xx în general = clientul a cerut ceva greșit. Excepția e 404 pe /api/*, tratat
  // separat ca `api_route_missing` — în repo-ul ăsta o rută nemontată e un bug real.
  if (statusCode && statusCode >= 400 && statusCode < 500) return true;
  return false;
}

/** Titlu scurt și lizibil pentru listă — mesajul brut poate avea sute de caractere. */
function titleOf(kind: string, message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return (clean.length > 200 ? `${clean.slice(0, 197)}…` : clean) || kind;
}

/**
 * Înregistrează o apariție și actualizează grupul. Întoarce grupul (sau null dacă a fost
 * filtrat / a eșuat), plus dacă e PRIMA apariție — de asta atârnă alerta pe email.
 */
export async function recordError(
  input: RecordErrorInput,
): Promise<{ groupId: string; isNew: boolean; occurrences: number } | null> {
  try {
    if (!input.message) return null;
    if (isNoise(input.message, input.statusCode) && input.kind !== "api_route_missing") return null;

    const location = normalizeLocation(input.location);
    const fingerprint = fingerprintOf(input.kind, location, input.message);

    const [existing] = await db
      .select({ id: errorGroups.id, occurrences: errorGroups.occurrences, status: errorGroups.status })
      .from(errorGroups)
      .where(eq(errorGroups.fingerprint, fingerprint));

    let groupId: string;
    let isNew = false;
    let occurrences: number;

    if (existing) {
      occurrences = existing.occurrences + 1;
      groupId = existing.id;
      await db
        .update(errorGroups)
        .set({
          occurrences,
          lastSeenAt: new Date(),
          // O eroare marcată „rezolvat" care reapare se redeschide singură — altfel ar
          // dispărea tăcut din listă exact când redevine o problemă.
          ...(existing.status === "resolved" ? { status: "open", resolvedAt: null } : {}),
        })
        .where(eq(errorGroups.id, groupId));
    } else {
      const [created] = await db
        .insert(errorGroups)
        .values({
          fingerprint,
          kind: input.kind,
          title: titleOf(input.kind, input.message),
          location,
          occurrences: 1,
          affectedTenants: input.tenantId ? 1 : 0,
        })
        .returning({ id: errorGroups.id });
      groupId = created.id;
      isNew = true;
      occurrences = 1;
    }

    await db.insert(errorEvents).values({
      groupId,
      fingerprint,
      kind: input.kind,
      message: input.message.slice(0, 4000),
      stack: input.stack ? input.stack.slice(0, 8000) : null,
      location,
      method: input.method ?? null,
      statusCode: input.statusCode ?? null,
      url: input.url ? input.url.slice(0, 1000) : null,
      tenantId: input.tenantId ?? null,
      userId: input.userId ?? null,
      userEmail: input.userEmail ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 512) : null,
      ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
    });

    // Câte workspace-uri distincte au lovit-o — recalculat, nu incrementat, ca să rămână corect.
    if (!isNew) {
      const distinct = await db
        .selectDistinct({ tenantId: errorEvents.tenantId })
        .from(errorEvents)
        .where(and(eq(errorEvents.groupId, groupId), sql`${errorEvents.tenantId} IS NOT NULL`));
      await db
        .update(errorGroups)
        .set({ affectedTenants: distinct.length })
        .where(eq(errorGroups.id, groupId));
    }

    return { groupId, isNew, occurrences };
  } catch (e) {
    // Ultima plasă: telemetria nu are voie să transforme un bug într-un incident.
    console.warn("[errorTelemetry] record skipped:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Câte grupuri deschise sunt — pentru insigna din meniu. */
export async function openErrorCount(sinceDays = 30): Promise<number> {
  try {
    const rows = await db
      .select({ id: errorGroups.id })
      .from(errorGroups)
      .where(
        and(
          eq(errorGroups.status, "open"),
          gte(errorGroups.lastSeenAt, new Date(Date.now() - sinceDays * 86_400_000)),
        ),
      );
    return rows.length;
  } catch {
    return 0;
  }
}
