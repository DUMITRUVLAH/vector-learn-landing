/**
 * CRM — Motive de pierdere, configurabile PER WORKSPACE
 *
 * Mounted at /api/crm/lost-reasons (rămâne de conectat: app.ts: app.route("/api/crm/lost-reasons", crmLostReasonsRoutes))
 *
 * GET    /api/crm/lost-reasons           — listă, ordonată după orderIndex (seed automat la
 *                                           prima citire dacă tenantul nu are încă niciun motiv)
 * POST   /api/crm/lost-reasons           — creare, intră implicit la finalul ordinii
 * PATCH  /api/crm/lost-reasons/:id       — redenumire (orderIndex se schimbă doar din /reorder)
 * DELETE /api/crm/lost-reasons/:id       — ștergere (motivul e text liber pe `leads.lostReason`,
 *                                           NU o cheie străină — ștergerea definiției nu orfanizează
 *                                           niciun lead existent, spre deosebire de etapele pipeline)
 * POST   /api/crm/lost-reasons/reorder   — { ids: string[] } → rescrie orderIndex după poziție
 *
 * De ce o tabelă și nu text liber pe formular: raportarea „de ce pierdem" trebuie să grupeze pe
 * valori stabile, alese dintr-o listă — nu pe ce a scris fiecare agent din cap (variante ca „preț",
 * „prea scump", „pretul" ar fi trei rânduri diferite în raport). Vezi `LostReasonDialog.tsx`, care
 * citește acum lista tenantului aici, în loc de un `const` fix din front-end.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { crmLostReasons } from "../db/schema/crmTasks";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const crmLostReasonsRoutes = new Hono<{ Variables: AuthVariables }>();
crmLostReasonsRoutes.use("/*", requireAuth);

type NewCrmLostReason = typeof crmLostReasons.$inferInsert;

// ─── Seed implicit, per tenant, la cerere ─────────────────────────────────────

/** Motivele implicite, în română — aceleași pe care le vede orice workspace nou. „Altul" rămâne
 *  ultimul, ca o opțiune general valabilă, dar e un rând normal, configurabil (redenumibil/
 *  ștergibil) — nu un caz special tratat separat în UI. */
const DEFAULT_LOST_REASONS: readonly string[] = [
  "Preț prea mare",
  "A ales alt furnizor",
  "Nu mai are nevoie",
  "Nu răspunde",
  "Buget amânat",
  "Altul",
];

/**
 * Idempotent: dacă tenantul are deja ORICE motiv, nu face nimic. Altfel inserează cele 6
 * implicite. La fel ca `ensureTenantStages` (server/lib/crm/stages.ts) — never throws, best-effort:
 * apelantul (GET) trebuie să răspundă cu o listă goală, nu cu un 500, dacă seed-ul eșuează.
 *
 * Spre deosebire de etape, `crm_lost_reasons` nu are un index unic pe (tenant,label) — motivele
 * n-au o „cheie" stabilă scrisă altundeva (leads.lostReason reține eticheta, ca text), deci nu e
 * nimic de tip `onConflictDoNothing` la care să ne agățăm; garda de numărare de mai jos e
 * suficientă pentru cazul normal (necurent) de „primul GET al unui tenant nou".
 */
async function ensureTenantLostReasons(tenantId: string): Promise<void> {
  try {
    const [existing] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(crmLostReasons)
      .where(eq(crmLostReasons.tenantId, tenantId));

    if ((existing?.cnt ?? 0) > 0) return;

    const rows: NewCrmLostReason[] = DEFAULT_LOST_REASONS.map((label, orderIndex) => ({
      tenantId,
      label,
      orderIndex,
    }));
    await db.insert(crmLostReasons).values(rows);
  } catch (e) {
    console.error(
      "[crm/lost-reasons] ensureTenantLostReasons eșec pentru tenant",
      tenantId,
      ":",
      e instanceof Error ? e.message : e
    );
  }
}

// ─── Validation schemas ───────────────────────────────────────────────────────

// Eticheta se curăță de spații înainte de validare: un motiv „   " ar apărea ca opțiune goală în
// dialogul de pierdere și ar strica gruparea din raportul „de ce pierdem" (două variante ale
// aceluiași text, una cu spații la capete).
const lostReasonLabel = z.string().trim().min(1, "Eticheta este obligatorie").max(200);

const createLostReasonSchema = z.object({
  label: lostReasonLabel,
});

const updateLostReasonSchema = z.object({
  label: lostReasonLabel,
});

const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

// ─── GET / ────────────────────────────────────────────────────────────────────

crmLostReasonsRoutes.get("/", async (c) => {
  const user = c.get("user");

  await ensureTenantLostReasons(user.tenantId);

  const items = await db
    .select()
    .from(crmLostReasons)
    .where(eq(crmLostReasons.tenantId, user.tenantId))
    .orderBy(asc(crmLostReasons.orderIndex));

  return c.json({ items });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmLostReasonsRoutes.post("/", zValidator("json", createLostReasonSchema), async (c) => {
  const user = c.get("user");
  const { label } = c.req.valid("json");

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${crmLostReasons.orderIndex}), -1)::int` })
    .from(crmLostReasons)
    .where(eq(crmLostReasons.tenantId, user.tenantId));

  const values: NewCrmLostReason = {
    tenantId: user.tenantId,
    label,
    orderIndex: (maxOrder ?? -1) + 1,
  };

  const [row] = await db.insert(crmLostReasons).values(values).returning();
  return c.json(row, 201);
});

// ─── POST /reorder ────────────────────────────────────────────────────────────

crmLostReasonsRoutes.post("/reorder", zValidator("json", reorderSchema), async (c) => {
  const user = c.get("user");
  const { ids } = c.req.valid("json");

  // Orice id care nu aparține tenantului curent e ignorat — un payload manipulat nu poate
  // rescrie ordinea motivelor altui workspace.
  const owned = await db
    .select({ id: crmLostReasons.id })
    .from(crmLostReasons)
    .where(and(eq(crmLostReasons.tenantId, user.tenantId), inArray(crmLostReasons.id, ids)));
  const ownedIds = new Set(owned.map((r) => r.id));
  const orderedOwnedIds = ids.filter((id) => ownedIds.has(id));

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedOwnedIds.length; i++) {
      await tx
        .update(crmLostReasons)
        .set({ orderIndex: i })
        .where(and(eq(crmLostReasons.id, orderedOwnedIds[i]), eq(crmLostReasons.tenantId, user.tenantId)));
    }
  });

  const items = await db
    .select()
    .from(crmLostReasons)
    .where(eq(crmLostReasons.tenantId, user.tenantId))
    .orderBy(asc(crmLostReasons.orderIndex));

  return c.json({ items });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmLostReasonsRoutes.patch("/:id", zValidator("json", updateLostReasonSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { label } = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmLostReasons.id })
    .from(crmLostReasons)
    .where(and(eq(crmLostReasons.id, id), eq(crmLostReasons.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .update(crmLostReasons)
    .set({ label })
    .where(and(eq(crmLostReasons.id, id), eq(crmLostReasons.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmLostReasonsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmLostReasons.id })
    .from(crmLostReasons)
    .where(and(eq(crmLostReasons.id, id), eq(crmLostReasons.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(crmLostReasons).where(and(eq(crmLostReasons.id, id), eq(crmLostReasons.tenantId, user.tenantId)));

  return c.json({ ok: true });
});
