/**
 * PARVERIFY-001 — verificarea publică a unui formular PAR tipărit.
 *
 *   GET /api/public/par/verify/:token[?v=<amprentă>]
 *
 * PUBLICĂ, fără sesiune: cel care ține hârtia e adesea un contabil, un auditor sau un furnizor —
 * oameni care n-au cont în platformă și pentru care un ecran de login ar însemna că QR-ul nu
 * servește la nimic. Apărarea nu e autentificarea, ci trei lucruri la un loc: tokenul de 80 de
 * biți (nu se enumeră și nu se ghicește), limitarea de rată și faptul că răspunsul nu conține
 * NIMIC în plus față de hârtia pe care e tipărit codul.
 *
 * De aceea lipsesc de aici IBAN-ul, IDNP-ul, banca beneficiarului și atașamentele — exact
 * câmpurile pentru care `GET /api/par/:id/form.pdf` cere drepturi. Regula de scriere a acestui
 * fișier: dacă un câmp nu e tipărit pe formular, nu are ce căuta în răspuns.
 *
 * Ruta e montată în AFARA lui `/api/par`, unde `app.use("/api/par/*", requireAuth)` i-ar da 401
 * unui vizitator nelogat — aceeași lecție ca la cronul de Drive (vezi `server/app.ts`).
 *
 * Ce NU face: nu aprobă nimic. Un buton de aprobare deschis oricui fotografiază un formular de pe
 * un birou ar transforma QR-ul dintr-o dovadă într-o breșă. Verificarea e citire, aprobarea
 * rămâne în aplicație, cu sesiune.
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { parVerifyTokens } from "../db/schema/parVerifyTokens";
import { tenants } from "../db/schema/tenants";
import { loadParFormData } from "../lib/par/parFormData";
import { normalizeToken, signatureCode, stateFingerprint } from "../lib/par/verifyCodes";
import { orderSignatureSlots } from "../../src/lib/par/signatureSlots";
import { publicVerifyRateLimit } from "../middleware/rateLimit";

export const parPublicVerifyRoutes = new Hono();

parPublicVerifyRoutes.use("/verify/*", publicVerifyRateLimit);

/** Un rând de aprobare așa cum îl vede publicul: cine, ce funcție, ce a decis, când și cu ce cod. */
interface PublicApproval {
  step: number;
  name: string | null;
  title: string | null;
  decision: string;
  decidedAt: string | null;
  /** Codul tipărit în rubrica `Signature`. `null` pe un rând încă nedecis. */
  signatureCode: string | null;
}

parPublicVerifyRoutes.get("/verify/:token", async (c) => {
  // Motoarele de căutare nu trebuie să indexeze niciodată un link scanat de pe o hârtie: ar
  // transforma un cod privat într-un rezultat public, permanent și în afara controlului nostru.
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");

  const token = normalizeToken(c.req.param("token"));
  if (!token) return c.json({ valid: false, reason: "invalid_code" }, 404);

  const rows = await db
    .select({
      id: parVerifyTokens.id,
      parId: parVerifyTokens.parId,
      tenantId: parVerifyTokens.tenantId,
      revokedAt: parVerifyTokens.revokedAt,
      scanCount: parVerifyTokens.scanCount,
    })
    .from(parVerifyTokens)
    .where(eq(parVerifyTokens.token, token));
  const row = rows[0];
  if (!row) return c.json({ valid: false, reason: "not_found" }, 404);
  // 410, nu 404: omul cu hârtia în mână trebuie să afle că documentul a fost RETRAS, nu că n-a
  // existat niciodată. Diferența decide dacă sună la finanțe sau aruncă hârtia.
  if (row.revokedAt) return c.json({ valid: false, reason: "revoked" }, 410);

  const [data, tenantRows] = await Promise.all([
    loadParFormData(row.parId, row.tenantId),
    db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, row.tenantId)),
  ]);
  if (!data) return c.json({ valid: false, reason: "not_found" }, 404);

  // Aceeași ordine ca pe hârtie (`src/lib/par/signatureSlots`), nu ordinea bazei de date: dacă
  // pagina ar înșira semnăturile altfel decât formularul, cel care compară ar crede că nu se
  // potrivesc.
  const { requestor, approvers } = orderSignatureSlots(
    data.signatures.map((s) => ({
      ...s,
      decision: s.decision as "pending" | "approved" | "rejected" | "changes_requested",
      decidedAt: s.decidedAt ? new Date(s.decidedAt).toISOString() : null,
      approverName: s.name,
    }))
  );

  const toPublic = (s: (typeof approvers)[number]): PublicApproval => ({
    step: s.step,
    name: s.name,
    title: s.title,
    decision: s.decision,
    decidedAt: s.decidedAt,
    signatureCode: signatureCode({
      parId: data.parId,
      approvalId: s.id,
      step: s.step,
      decision: s.decision,
      decidedAt: s.decidedAt,
    }),
  });

  const printed = c.req.query("v");
  const current = stateFingerprint(data);

  // Contorul de scanări e semnalul că un document de plată e citit de mai multe ori decât are
  // sens. Eșecul lui nu are voie să strice verificarea — de aceea e prins, nu propagat.
  // (Un răspuns servit din cache-ul de margine nu ajunge aici, deci contorul numără scanările
  // distincte, nu reîncărcările aceleiași pagini.)
  try {
    await db
      .update(parVerifyTokens)
      .set({ lastUsedAt: new Date(), scanCount: row.scanCount + 1 })
      .where(and(eq(parVerifyTokens.id, row.id), eq(parVerifyTokens.tenantId, row.tenantId)));
  } catch (err) {
    console.error("[par-verify] nu am putut înregistra scanarea", err);
  }

  // Cache de margine scurt: a doua scanare a aceleiași hârtii în intervalul următor e servită de
  // Vercel și nu atinge deloc pooler-ul Supabase. 30 de secunde e sub pragul la care cineva ar
  // apuca să aprobe și să reverifice, deci nu se poate citi o stare „învechită" care contează.
  c.header("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=60");

  return c.json({
    valid: true,
    /** `null` când hârtia nu poartă amprentă (formular tipărit înainte de PARVERIFY-001). */
    matchesPrinted: printed ? printed.toUpperCase() === current.toUpperCase() : null,
    checkedAt: new Date().toISOString(),
    organization: tenantRows[0]?.name ?? null,
    par: {
      requestNo: data.requestNo,
      status: data.status,
      dateOfRequest: data.dateOfRequest,
      dateNeeded: data.dateNeeded,
      requestedByName: data.requestedByName,
      requestorTitle: data.requestorTitle,
      departmentName: data.departmentName,
      projectName: data.projectName,
      eventName: data.eventName,
      purpose: data.purpose,
      currency: data.currency,
      totalEstimatedCents: data.totalEstimatedCents,
      totalMdlCents: data.totalMdlCents,
      submittedAt: data.submittedAt,
      approvedAt: data.approvedAt,
      lineItems: data.lineItems,
      requestor: requestor ? toPublic(requestor) : null,
      approvals: approvers.map(toPublic),
    },
  });
});
