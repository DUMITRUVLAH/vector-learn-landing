/**
 * Line-item suggestions — "am mai plătit asta o dată".
 *
 * Mounted in server/app.ts: app.route("/api/par/suggestions", parSuggestionsRoutes)
 * (mounted BEFORE `app.route("/api/par", parRoutes)` so it is not swallowed by `/:id`).
 *
 * Routes:
 *   GET /api/par/suggestions/line-items?q=…  → past line items, deduped, with their payee
 *
 * Why this exists: most requests in an NGO repeat — the same trainer, the same venue,
 * the same monthly service. Retyping the description and re-entering the beneficiary's
 * IBAN from a paper copy is where the mistakes come from. Offering what was actually
 * paid before, together with the payee it was paid to, turns a form into a pick-list.
 *
 * Scoped to the SIGNED-IN requester, not the whole tenant (owner decision, 2026-08-29):
 * "doar persoana care în trecut a făcut astfel de plăți să apară a lui". A colleague's past
 * payments are their working context — and their payees' IBANs — not a shared autocomplete.
 * Mixing them in both spreads the org's payment history through every form and buries your
 * own repeated lines under someone else's.
 *
 * Deliberately aggregated in JS, not SQL: prod is Postgres and local/tests are PGlite,
 * and their aggregate/result shapes differ (see CLAUDE.md §3.5.1 DB-portability). We
 * pull a bounded window of recent lines through the query builder and group them here.
 */
import { Hono } from "hono";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parLineItems, parRequests } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { getMdlRate } from "../lib/fx";

export const parSuggestionsRoutes = new Hono<{ Variables: AuthVariables }>();
parSuggestionsRoutes.use("*", requireAuth);
/**
 * SECURITY (audit 2026-08-29), apărare în adâncime: răspunsul conține IDNP-ul și IBAN-ul
 * beneficiarilor, deci ruta cere explicit un rol PAR, nu doar un cont autentificat.
 *
 * Filtrul care contează rămâne cel din interogare — istoricul PROPRIU al celui autentificat
 * (`requestedByUserId = user.id`). Un cont fără roluri PAR nu are oricum istoric propriu, deci
 * garda nu schimbă ce vede cineva azi; e aici ca următoarea modificare a interogării să nu poată
 * deschide din greșeală rechizitele bancare către tot workspace-ul.
 */
parSuggestionsRoutes.use("*", requirePARRole("requestor", "approver", "finance", "par_admin"));

/**
 * Statuses worth learning from — must stay a subset of `parStatusEnum` (server/db/schema/par.ts),
 * or Postgres rejects the whole query with "invalid input value for enum par_status".
 *
 * Excluded on purpose: `draft` and `changes_requested` are unreviewed typing (and would include
 * the request being filled in right now); `rejected`/`cancelled` were decided against, so
 * re-proposing them would be recommending a known mistake.
 */
const LEARNABLE_STATUSES = [
  "pending_approval",
  "approved",
  "in_finance",
  "reapproval_required",
  "paid",
] as const;

/** How many recent lines to scan before grouping. Bounds the query on a busy tenant. */
const SCAN_LIMIT = 400;
/** How many suggestions to hand back. More than this is a list, not a shortlist. */
const RESULT_LIMIT = 8;

export interface ParLineItemSuggestion {
  /** Normalised key — the description lower-cased and whitespace-collapsed. */
  key: string;
  description: string;
  unit: string | null;
  unitPriceCents: number;
  /** Currency of the PAR this price came from — a EUR price must not land in an MDL request. */
  currency: string;
  /**
   * The same unit price restated in the currency asked for via `?currency=`, at today's BNM
   * rate. `null` when nothing was asked for, or when BNM could not be reached — the form then
   * asks for the amount by hand instead of inventing one.
   */
  targetUnitPriceCents: number | null;
  /** The currency `targetUnitPriceCents` is expressed in; echoes the `currency` query param. */
  targetCurrency: string | null;
  quantity: number;
  /** How many past requests used this description. Drives the ordering. */
  usageCount: number;
  lastUsedAt: string | null;
  /** The request the suggested values were copied from — shown so the user can trust it. */
  sourceRequestNo: string;
  /** Payee snapshot from that request, so picking a line can also fill the beneficiary. */
  payee: {
    vendorId: string | null;
    name: string | null;
    idnp: string | null;
    iban: string | null;
    bank: string | null;
    type: string | null;
  };
}

/** Collapse case and whitespace so "Servicii  de  audit" and "servicii de audit" are one entry. */
function normalize(description: string): string {
  return description.trim().toLocaleLowerCase("ro").replace(/\s+/g, " ");
}

/**
 * Restate each suggested price in the currency of the request being written.
 *
 * Picking "the same thing I paid last month" and getting an EMPTY price field because that
 * request happened to be in MDL and this one is in USD reads as a broken pick-list — filling the
 * row is the whole promise. So we convert at today's official BNM rate (the same source the
 * budget balance and the submit-time threshold use) and the form says so out loud, with the
 * original amount, so the number is checkable rather than magic.
 *
 * Never throws: BNM is an external service on a keystroke-debounced path. No rate → `null` →
 * the form asks for the amount by hand, which is what it did before this existed.
 */
async function priceInTargetCurrency(
  suggestions: ParLineItemSuggestion[],
  target: string | null
): Promise<void> {
  if (!target) return;
  const needed = new Set(suggestions.map((s) => s.currency.toUpperCase()));
  needed.add(target);
  const rates = new Map<string, number>();
  for (const code of needed) {
    try {
      rates.set(code, await getMdlRate(code));
    } catch {
      /* a missing rate only disables conversion for the currencies that need it */
    }
  }
  const targetRate = rates.get(target);
  if (!targetRate) return;
  for (const s of suggestions) {
    const sourceRate = rates.get(s.currency.toUpperCase());
    if (!sourceRate) continue;
    s.targetUnitPriceCents = Math.round((s.unitPriceCents * sourceRate) / targetRate);
  }
}

// ─── GET /line-items ──────────────────────────────────────────────────────────

parSuggestionsRoutes.get("/line-items", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  // Currency of the request being filled in. Optional: without it we just hand back the
  // historical price and let the form decide what to do with it.
  const target = (c.req.query("currency") ?? "").trim().toUpperCase() || null;

  const where = [
    eq(parLineItems.tenantId, user.tenantId),
    // Own history only — see the file header.
    eq(parRequests.requestedByUserId, user.id),
    inArray(parRequests.status, [...LEARNABLE_STATUSES]),
  ];
  // Substring match, not prefix: people search by the distinctive word in the middle
  // ("audit", "Zoom"), not by how the description happens to start.
  if (q) where.push(ilike(parLineItems.description, `%${q}%`));

  const rows = await db
    .select({
      description: parLineItems.description,
      unit: parLineItems.unit,
      quantity: parLineItems.quantity,
      unitPriceCents: parLineItems.unitPriceCents,
      currency: parRequests.currency,
      requestNo: parRequests.requestNo,
      submittedAt: parRequests.submittedAt,
      createdAt: parRequests.createdAt,
      vendorId: parRequests.vendorId,
      payeeName: parRequests.payeeName,
      payeeIdnp: parRequests.payeeIdnp,
      payeeIban: parRequests.payeeIban,
      payeeBank: parRequests.payeeBank,
      payeeType: parRequests.payeeType,
    })
    .from(parLineItems)
    .innerJoin(parRequests, eq(parLineItems.parId, parRequests.id))
    .where(and(...where))
    .orderBy(desc(parRequests.createdAt))
    .limit(SCAN_LIMIT);

  // Rows arrive newest-first, so the FIRST row for a key is the most recent use —
  // that is the one whose price and payee we propose. Later rows only add to the count.
  const byKey = new Map<string, ParLineItemSuggestion>();
  for (const r of rows) {
    const key = normalize(r.description);
    if (!key) continue;
    const seen = byKey.get(key);
    if (seen) {
      seen.usageCount += 1;
      continue;
    }
    const used = r.submittedAt ?? r.createdAt;
    byKey.set(key, {
      key,
      description: r.description,
      unit: r.unit,
      unitPriceCents: r.unitPriceCents,
      currency: r.currency,
      targetUnitPriceCents: null,
      targetCurrency: target,
      quantity: r.quantity,
      usageCount: 1,
      lastUsedAt: used ? new Date(used).toISOString() : null,
      sourceRequestNo: r.requestNo,
      payee: {
        vendorId: r.vendorId,
        name: r.payeeName,
        idnp: r.payeeIdnp,
        iban: r.payeeIban,
        bank: r.payeeBank,
        type: r.payeeType,
      },
    });
  }

  // Most-repeated first — the point of the feature is the thing you keep paying for.
  // Recency breaks ties so a burst of old duplicates can't outrank last month's work.
  const suggestions = [...byKey.values()]
    .sort((a, b) =>
      b.usageCount - a.usageCount ||
      (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "")
    )
    .slice(0, RESULT_LIMIT);

  await priceInTargetCurrency(suggestions, target);

  return c.json({ suggestions, total: suggestions.length });
});
