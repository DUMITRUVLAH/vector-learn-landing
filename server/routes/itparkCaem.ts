/**
 * ITPARK-002: Nomenclator CAEM versionat — API read
 * ITPARK-203: GET /api/itpark/caem-codes/suggest?q=:text → sugestie CAEM deterministă
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §4 + §6
 * Mounted in server/app.ts: app.route("/api/itpark/caem-codes", itparkCaemRoutes)
 *
 * Routes:
 *   GET /api/itpark/caem-codes              → lista coduri CAEM active (la data curentă)
 *   GET /api/itpark/caem-codes/suggest?q=  → sugestie CAEM deterministă (ITPARK-203)
 *   GET /api/itpark/caem-codes/:code        → detalii cod specific
 *
 * Query params:
 *   ?eligible=true|false   → filtrare după eligibilitate
 *   ?q=<search>            → filtrare după cod sau label (case-insensitive)
 */
import { Hono } from "hono";
import { eq, lte, ilike, or, and } from "drizzle-orm";
import { db } from "../db/client";
import { itparkCaemCodes } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
// ITPARK-203: helper determinist (config-driven, nu scattered literals)
import { suggestCaem } from "../../src/lib/itpark/caemSuggest";

export const itparkCaemRoutes = new Hono<{ Variables: AuthVariables }>();
itparkCaemRoutes.use("*", requireAuth);

/**
 * isEligibleCaem(code) — helper determinist: returnează true dacă codul e eligibil.
 * Caută în DB codul activ (effectiveFrom <= azi); dacă nu există → false.
 * Export pentru utilizare în alte rute ITPARK.
 */
export async function isEligibleCaem(code: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rows = await db
    .select({ eligible: itparkCaemCodes.eligible })
    .from(itparkCaemCodes)
    .where(
      and(
        eq(itparkCaemCodes.code, code),
        lte(itparkCaemCodes.effectiveFrom, today)
      )
    )
    .orderBy(itparkCaemCodes.effectiveFrom) // ascending → last is newest active
    .limit(10);

  if (!rows || rows.length === 0) return false;
  // Newest active version (last in ascending order by effectiveFrom)
  return rows[rows.length - 1].eligible;
}

// GET /api/itpark/caem-codes
itparkCaemRoutes.get("/", async (c) => {
  const eligibleParam = c.req.query("eligible");
  const q = c.req.query("q");
  const today = new Date().toISOString().slice(0, 10);

  // Build conditions
  const conditions = [lte(itparkCaemCodes.effectiveFrom, today)];

  if (eligibleParam === "true") {
    conditions.push(eq(itparkCaemCodes.eligible, true));
  } else if (eligibleParam === "false") {
    conditions.push(eq(itparkCaemCodes.eligible, false));
  }

  if (q) {
    conditions.push(
      or(
        ilike(itparkCaemCodes.code, `%${q}%`),
        ilike(itparkCaemCodes.label, `%${q}%`)
      )!
    );
  }

  const rows = await db
    .select()
    .from(itparkCaemCodes)
    .where(and(...conditions));

  return c.json({ caemCodes: rows });
});

// ─── GET /suggest?q=:text — sugestie CAEM deterministă (ITPARK-203) ─────────
// Sugestie ONLY — nu suprascrie cod manual. Config-driven via CAEM_RULES.
// Răspuns: { suggestion: { code, confidence, reason } | null }
itparkCaemRoutes.get("/suggest", (c) => {
  const q = c.req.query("q") ?? "";
  const suggestion = suggestCaem(q);
  return c.json({ suggestion });
});

// GET /api/itpark/caem-codes/:code
itparkCaemRoutes.get("/:code", async (c) => {
  const code = c.req.param("code");
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(itparkCaemCodes)
    .where(
      and(
        eq(itparkCaemCodes.code, code),
        lte(itparkCaemCodes.effectiveFrom, today)
      )
    );

  if (!rows || rows.length === 0) {
    return c.json({ error: "Cod CAEM negăsit sau inactiv" }, 404);
  }

  // Return the most recent active version
  const latest = rows[rows.length - 1];
  return c.json({ caemCode: latest });
});
