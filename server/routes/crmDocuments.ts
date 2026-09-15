/**
 * CRM — oferte și contracte pornite dintr-un lead.
 *
 * DECIZIA DE PORTARE, spusă pe față: crm-vector are un motor propriu de acte
 * (`src/lib/crm/documents.ts` + `docs/*`) — dar acela a fost portat ACOLO
 * tocmai de aici. FinFlow are deja motorul complet: șabloane cu versiuni,
 * numerotare rezervată la finalizare, înghețarea rechizitelor, jurnal, PDF.
 * Un al doilea motor ar diverge de primul în câteva luni și n-am mai ști care
 * dintre ele produce actul adevărat.
 *
 * Deci modulul ăsta NU generează acte. Doar:
 *  - traduce un lead (+ fișa firmei, dacă are) în contrapartea actului;
 *  - transformă produsele CRM alese în rândurile actului, cu preț și TVA;
 *  - cheamă `createDocumentRecord` — exact funcția pe care o folosește și
 *    /api/docs/documents;
 *  - arată actele legate de un lead.
 *
 * Rechizitele se iau din fișa FIRMEI când lead-ul are una: un contract se
 * încheie cu firma, nu cu persoana care a răspuns la telefon. Când n-are firmă,
 * contrapartea e persoana, iar câmpurile de firmă rămân goale — actul le va
 * arăta ca necompletate, ceea ce e adevărul, nu o invenție.
 *
 * Montat la /api/crm/documents.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { leads } from "../db/schema/leads";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmProducts } from "../db/schema/crmProducts";
import { docDocuments } from "../db/schema/docs";
import { docShareLinks } from "../db/schema/docShareLinks";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { createDocumentRecord, ensureSystemTemplates } from "./docs";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

export const crmDocumentsRoutes = new Hono<{ Variables: AuthVariables }>();
crmDocumentsRoutes.use("/*", requireAuth);

/** Tipurile de act pe care le poate porni CRM-ul, cu titlul implicit. */
export const CRM_DOC_KINDS = {
  oferta_comerciala: "Ofertă comercială",
  contract_servicii: "Contract",
  act_primire_predare: "Act de primire-predare",
} as const;

/**
 * Care șablon se potrivește cel mai bine unui tip de act pornit din CRM.
 *
 * Preferințele nu sunt arbitrare: din vânzări, un contract se face „în baza ofertei acceptate"
 * (are clauza care leagă cele două acte), iar actul de primire-predare e cel de SERVICII —
 * CRM-ul vinde servicii, nu bunuri. Când preferatul lipsește (organizația l-a șters sau are
 * doar șabloane proprii), luăm orice șablon al tipului, cu prioritate celor proprii: un șablon
 * scris de firmă bate unul standard, dacă există.
 */
const PREFERRED_TEMPLATE: Record<string, string> = {
  oferta_comerciala: "Ofertă comercială",
  contract_servicii: "Contract în baza ofertei acceptate",
  act_primire_predare: "Act de primire-predare — servicii prestate",
};

export function pickTemplate(
  kind: string,
  candidates: { id: string; name: string; isSystem?: boolean | null }[]
): string | null {
  if (candidates.length === 0) return null;
  const preferred = candidates.find((t) => t.name === PREFERRED_TEMPLATE[kind]);
  if (preferred) return preferred.id;
  const own = candidates.find((t) => !t.isSystem);
  return (own ?? candidates[0]).id;
}

const createInput = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(["oferta_comerciala", "contract_servicii", "act_primire_predare"]).default("oferta_comerciala"),
  templateId: z.string().uuid().nullish(),
  title: z.string().max(300).nullish(),
  currency: z.string().length(3).optional(),
  /** Produse din catalogul CRM. Cantitatea e a ofertei, prețul vine din catalog. */
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive().default(1),
        /** Preț negociat, în cenți. Lipsă → prețul din catalog. */
        unitPriceCents: z.number().int().min(0).nullish(),
      })
    )
    .default([]),
  /** Rânduri scrise de mână, pentru ce nu e în catalog. */
  extraLines: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        unit: z.string().max(50).default("buc"),
        quantity: z.number().int().positive().default(1),
        unitPriceCents: z.number().int().min(0),
        vatPercent: z.number().int().min(0).max(100).optional(),
      })
    )
    .default([]),
  /** „În baza…" — de pildă numărul ofertei acceptate, când se face contractul. */
  basedOn: z.string().max(300).nullish(),
});

function isMissingSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|column .* does not exist|undefined_table|undefined_column/i.test(msg);
}

// ─── Actele unui lead ────────────────────────────────────────────────────────

crmDocumentsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");

  const filters = [eq(docDocuments.tenantId, user.tenantId), eq(docDocuments.counterpartyKind, "crm_lead")];
  if (leadId) filters.push(eq(docDocuments.counterpartyId, leadId));

  try {
    const items = await db
      .select({
        id: docDocuments.id,
        kind: docDocuments.kind,
        docNumber: docDocuments.docNumber,
        docDate: docDocuments.docDate,
        title: docDocuments.title,
        status: docDocuments.status,
        totalCents: docDocuments.totalCents,
        currency: docDocuments.currency,
        counterpartyId: docDocuments.counterpartyId,
        counterpartyName: docDocuments.counterpartyName,
        finalizedAt: docDocuments.finalizedAt,
        sentAt: docDocuments.sentAt,
        outcomeAt: docDocuments.outcomeAt,
        outcomeReason: docDocuments.outcomeReason,
        cancelledAt: docDocuments.cancelledAt,
      })
      .from(docDocuments)
      .where(and(...filters))
      .orderBy(desc(docDocuments.createdAt))
      .limit(200);

    // Starea linkului public, pentru toată lista dintr-o interogare (cerința 42). Fără ea, ecranul
    // ar cere linkul act cu act — 200 de cereri pentru o listă de 200 de rânduri.
    let shareByDoc = new Map<string, { token: string; firstViewedAt: Date | null; viewCount: number }>();
    if (items.length > 0) {
      try {
        const shares = await db
          .select({
            documentId: docShareLinks.documentId,
            token: docShareLinks.token,
            firstViewedAt: docShareLinks.firstViewedAt,
            viewCount: docShareLinks.viewCount,
          })
          .from(docShareLinks)
          .where(
            and(
              eq(docShareLinks.tenantId, user.tenantId),
              isNull(docShareLinks.revokedAt),
              inArray(
                docShareLinks.documentId,
                items.map((d) => d.id)
              )
            )
          );
        shareByDoc = new Map(shares.map((s) => [s.documentId, s]));
      } catch (err) {
        // Tabela lipsă (schemă în urma codului): lista se afișează fără coloana de link.
        if (!isMissingSchemaError(err)) throw err;
      }
    }

    return c.json({
      items: items.map((d) => {
        const share = shareByDoc.get(d.id);
        return {
          ...d,
          share: share
            ? {
                token: share.token,
                firstViewedAt: share.firstViewedAt ? share.firstViewedAt.toISOString() : null,
                viewCount: share.viewCount,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});

// ─── Un act nou, pornit dintr-un lead ────────────────────────────────────────

crmDocumentsRoutes.post("/", zValidator("json", createInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, body.leadId), eq(leads.tenantId, user.tenantId)));
  // Un id din alt workspace nu e „negăsit din întâmplare" — e exact cererea pe
  // care trebuie s-o refuzăm, fiindcă altfel am emite un act pe datele altcuiva.
  if (!lead) return c.json({ error: "not_found" }, 404);

  const company = lead.companyId
    ? (
        await db
          .select()
          .from(crmCompanies)
          .where(and(eq(crmCompanies.id, lead.companyId), eq(crmCompanies.tenantId, user.tenantId)))
      )[0]
    : undefined;

  // Rechizitele: firma dacă există, altfel persoana. Nimic inventat — un câmp
  // pe care nu-l avem rămâne gol și actul îl semnalează ca necompletat.
  const snapshot: Record<string, string> = {};
  const put = (k: string, v: string | null | undefined) => {
    if (v && v.trim()) snapshot[k] = v.trim();
  };
  put("denumire", company?.name ?? lead.company ?? lead.fullName);
  put("idno", company?.idno);
  put("adresa", company?.address);
  put("administrator", lead.fullName);
  put("telefon", company?.phone ?? lead.phone);
  put("email", company?.email ?? lead.email);

  /** Moneda actului: a produselor alese, dacă n-a cerut omul alta explicit. */
  let resolvedCurrency = body.currency ?? "MDL";

  const lines: {
    description: string;
    unit: string;
    quantity: number;
    unitPriceCents: number;
    vatPercent?: number;
  }[] = [];

  if (body.items.length > 0) {
    const products = await db
      .select()
      .from(crmProducts)
      .where(
        and(
          eq(crmProducts.tenantId, user.tenantId),
          inArray(
            crmProducts.id,
            body.items.map((i) => i.productId)
          )
        )
      );
    const byId = new Map(products.map((p) => [p.id, p]));

    for (const item of body.items) {
      const product = byId.get(item.productId);
      // Un produs din alt workspace (sau șters) nu se strecoară pe act ca rând gol.
      if (!product) return c.json({ error: "product_not_found", productId: item.productId }, 404);
      // TVA-ul e `numeric` în bază, deci ajunge aici ca text („20.00").
      const vat = Number(product.vatPercent);
      lines.push({
        description: product.name,
        unit: product.unit || "buc",
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents ?? product.listPriceCents ?? 0,
        vatPercent: Number.isFinite(vat) ? Math.round(vat) : undefined,
      });
    }

    // Un act are UN total, deci o singură monedă. Produse în monede diferite pe
    // aceeași ofertă ar da un total fără sens — refuzăm înainte, nu după.
    const currencies = new Set(products.map((p) => p.currency).filter(Boolean));
    const docCurrency = body.currency ?? [...currencies][0] ?? "MDL";
    if (currencies.size > 1 || (currencies.size === 1 && ![...currencies].includes(docCurrency))) {
      return c.json(
        {
          error: "currency_mismatch",
          message: `Produsele alese sunt în monede diferite (${[...currencies].join(", ")}). Fă câte o ofertă pentru fiecare monedă.`,
        },
        400
      );
    }
    resolvedCurrency = docCurrency;
  }

  for (const extra of body.extraLines) {
    lines.push({
      description: extra.description,
      unit: extra.unit,
      quantity: extra.quantity,
      unitPriceCents: extra.unitPriceCents,
      vatPercent: extra.vatPercent,
    });
  }

  /**
   * Șablonul actului. Fără el, `renderBody` întoarce un corp GOL — actul se năștea cu rechizitele
   * clientului înghețate, cu poziții și total, dar fără niciun text: omul deschidea editorul și
   * găsea o pagină albă. „Fă un contract din fișa clientului" nu înseamnă „fă un dosar gol".
   *
   * Ordinea: ce a ales omul explicit; altfel șablonul preferat al tipului de act; altfel orice
   * șablon al tipului. Dacă workspace-ul n-are încă biblioteca instalată, o instalăm acum —
   * aceeași funcție pe care o cheamă ecranul de șabloane la prima deschidere.
   */
  let templateId = body.templateId ?? null;
  if (!templateId) {
    try {
      await ensureSystemTemplates(user.tenantId);
      const candidates = await db
        .select({ id: docmergeTemplates.id, name: docmergeTemplates.name, isSystem: docmergeTemplates.isSystem })
        .from(docmergeTemplates)
        .where(and(eq(docmergeTemplates.tenantId, user.tenantId), eq(docmergeTemplates.kind, body.kind)));
      templateId = pickTemplate(body.kind, candidates);
    } catch (err) {
      // Biblioteca inaccesibilă (schemă în urma codului) nu blochează crearea actului: iese cu
      // corp gol, ca înainte, dar restul datelor sunt acolo.
      if (!isMissingSchemaError(err)) throw err;
    }
  }

  const partyName = snapshot.denumire ?? lead.fullName;
  const created = await createDocumentRecord(user as { id: string; tenantId: string; name?: string }, {
    templateId,
    kind: body.kind,
    title: body.title?.trim() || `${CRM_DOC_KINDS[body.kind]} — ${partyName}`,
    counterparty: {
      kind: "crm_lead",
      id: lead.id,
      name: partyName,
      snapshot,
    },
    context: body.basedOn ? { "document.baza": body.basedOn } : undefined,
    lines,
    currency: resolvedCurrency,
  });

  return c.json(created, 201);
});
