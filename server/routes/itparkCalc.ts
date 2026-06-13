/**
 * ITPARK-301: Endpoint calcul Anexa 3 — GET /api/itpark/engagements/:id/calc
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §3
 *
 * Wraps computeAnexa3() (pure helper din src/lib/itpark/calc.ts) cu date reale din DB.
 * Răspuns: { result: Anexa3Result, engagementId, computedAt }
 *
 * mount-exempt: mounted in server/app.ts as app.route("/api/itpark/engagements", itparkEngagementsRoutes)
 * (adăugat la rutele de engagement — vezi mai jos comentariul de montare)
 *
 * Notă de montare: această rută se montează DISTINCT pentru a evita conflictul cu
 * rutele existente de engagement CRUD. Montajul va fi:
 *   app.route("/api/itpark/calc", itparkCalcRoutes)   ← ITPARK-301
 * și endpoint-ul este: GET /api/itpark/calc/:engagementId
 */
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { itparkEngagements, itparkRevenueLines } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { computeAnexa3, type RevenueLineInput } from "../../src/lib/itpark/calc";

export const itparkCalcRoutes = new Hono<{ Variables: AuthVariables }>();
itparkCalcRoutes.use("*", requireAuth);

/**
 * GET /api/itpark/calc/:engagementId
 * Query params:
 *   ?totalSalesOverride=<cents>  — override opțional (venituri în afara Anexei 3)
 *
 * Răspuns: { result: Anexa3Result, engagementId, computedAt }
 * Erori: 404 dacă engagement nu aparține tenantului; 400 dacă totalSalesOverride invalid
 */
itparkCalcRoutes.get("/:engagementId", async (c) => {
  const user = c.get("user");
  const engagementId = c.req.param("engagementId");

  // Validare UUID basic
  if (!/^[0-9a-f-]{36}$/i.test(engagementId)) {
    return c.json({ error: "engagementId invalid" }, 400);
  }

  // Verificăm că engagement aparține tenantului
  const eng = await db.query.itparkEngagements.findFirst({
    where: and(
      eq(itparkEngagements.id, engagementId),
      eq(itparkEngagements.tenantId, user.tenantId)
    ),
  });
  if (!eng) return c.json({ error: "engagement not found" }, 404);

  // Obținem toate liniile de venit
  const rawLines = await db
    .select()
    .from(itparkRevenueLines)
    .where(
      and(
        eq(itparkRevenueLines.engagementId, engagementId),
        eq(itparkRevenueLines.tenantId, user.tenantId)
      )
    );

  // Conversie la RevenueLineInput
  const lines: RevenueLineInput[] = rawLines.map((l) => ({
    caemCode: l.caemCode,
    amountCents: l.amountCents,
    isEligible: l.isEligible,
    month: l.month ?? null,
  }));

  // Preluăm totalSalesOverride din engagement (sau din query param)
  const overrideParam = c.req.query("totalSalesOverride");
  let totalSalesOverride: number | undefined;

  if (overrideParam) {
    const parsed = parseInt(overrideParam, 10);
    if (isNaN(parsed) || parsed < 0) {
      return c.json({ error: "totalSalesOverride must be a non-negative integer (cents)" }, 400);
    }
    totalSalesOverride = parsed;
  } else if (eng.totalSalesCents && eng.totalSalesCents > 0) {
    // Folosim valoarea din engagement dacă e setată ca override
    totalSalesOverride = eng.totalSalesCents;
  }

  // Calculăm (DETERMINIST)
  const result = computeAnexa3(lines, totalSalesOverride ? { totalSalesOverride } : undefined);

  return c.json({
    result,
    engagementId,
    computedAt: new Date().toISOString(),
    // Informativ: dacă totalSalesOverride a fost folosit
    usedOverride: totalSalesOverride !== undefined,
  });
});
