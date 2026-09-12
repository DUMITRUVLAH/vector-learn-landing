/**
 * VM5-19: pragul anual per prestator și bifa că procedura de achiziție s-a făcut.
 *
 *   GET    /api/par/tender/check          → cât s-a angajat anul ăsta către prestator + verdictul
 *   GET    /api/par/tender/clearances     → bifele existente (an curent, sau ?year=)
 *   POST   /api/par/tender/clearances     → finanțele bifează „tenderul s-a făcut" (prestator + an)
 *   DELETE /api/par/tender/clearances/:id → retrage bifa pusă din greșeală
 *
 * Regula și calculul stau în `server/lib/par/tenderThreshold.ts`, ca să poată fi verificate fără
 * bază de date. Aici rămân doar interogările și drepturile.
 *
 * Mounted in app.ts: app.route("/api/par/tender", parTenderRoutes)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lt, inArray, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  parRequests,
  parSettings,
  parTenderClearances,
  parVendors,
} from "../db/schema/par";
import { users } from "../db/schema/users";
import { toMdlCents } from "../lib/fx";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import {
  evaluateTenderThreshold,
  tenderYear,
  vendorKey,
  TENDER_COUNTED_STATUSES,
  type VendorIdentity,
} from "../lib/par/tenderThreshold";

export const parTenderRoutes = new Hono<{ Variables: AuthVariables }>();
parTenderRoutes.use("*", requireAuth);
parTenderRoutes.use("/clearances/:id", parUuidGuard("id"));

/** Pragul configurat pe organizație (0 = regula e oprită). */
async function thresholdOf(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ cents: parSettings.tenderThresholdCents })
    .from(parSettings)
    .where(eq(parSettings.tenantId, tenantId));
  return row?.cents ?? 0;
}

/**
 * Cât s-a angajat deja către prestatorul ăsta, în anul ăsta.
 *
 * Se adună echivalentul în lei (`total_mdl_cents`, înghețat la depunere) — pentru cererile în lei
 * el e chiar totalul. Fără asta, o cerere de 5.000 EUR ar cântări cât una de 5.000 MDL.
 */
async function yearToDateCents(
  tenantId: string,
  key: string,
  year: number,
  excludeParId?: string | null
): Promise<number> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const rows = await db
    .select({
      id: parRequests.id,
      vendorId: parRequests.vendorId,
      payeeIdnp: parRequests.payeeIdnp,
      payeeName: parRequests.payeeName,
      cents: sql<number>`coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents})`,
    })
    .from(parRequests)
    .where(
      and(
        eq(parRequests.tenantId, tenantId),
        inArray(parRequests.status, [...TENDER_COUNTED_STATUSES]),
        gte(parRequests.dateOfRequest, from),
        lt(parRequests.dateOfRequest, to)
      )
    );
  return rows
    .filter((r) => r.id !== excludeParId && vendorKey(r as VendorIdentity) === key)
    .reduce((sum, r) => sum + Number(r.cents ?? 0), 0);
}

/** Bifa pentru prestator + an, dacă există. */
async function clearanceFor(tenantId: string, key: string, year: number) {
  const [row] = await db
    .select()
    .from(parTenderClearances)
    .where(
      and(
        eq(parTenderClearances.tenantId, tenantId),
        eq(parTenderClearances.vendorKey, key),
        eq(parTenderClearances.year, year)
      )
    );
  return row ?? null;
}

// ─── GET /api/par/tender/check ────────────────────────────────────────────────

parTenderRoutes.get("/check", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const identity: VendorIdentity = {
    vendorId: c.req.query("vendor_id") || null,
    payeeIdnp: c.req.query("payee_idnp") || null,
    payeeName: c.req.query("payee_name") || null,
  };
  const key = vendorKey(identity);
  const year = Number(c.req.query("year")) || tenderYear(c.req.query("date") || null);
  // Suma cererii vine în moneda ei; pragul e anual și peste monede, deci se compară în lei — la
  // fel ca `total_mdl_cents` înghețat la depunere. Dacă BNM nu răspunde, se compară suma brută:
  // mai bine un avertisment aproximativ decât niciunul (regula e oricum consultativă).
  const rawAmount = Math.max(0, Number(c.req.query("amount_cents")) || 0);
  const amountCurrency = (c.req.query("currency") || "MDL").toUpperCase();
  let currentParCents = rawAmount;
  if (rawAmount > 0 && amountCurrency !== "MDL") {
    try {
      currentParCents = (await toMdlCents(rawAmount, amountCurrency)).mdlCents;
    } catch {
      currentParCents = rawAmount;
    }
  }
  const excludeParId = c.req.query("exclude_par_id") || null;

  const thresholdCents = await thresholdOf(tenantId);
  if (!key || thresholdCents <= 0) {
    return c.json({
      ...evaluateTenderThreshold({
        thresholdCents, yearToDateCents: 0, currentParCents, cleared: false, hasVendor: !!key,
      }),
      year,
      vendorName: identity.payeeName ?? null,
    });
  }

  const [ytd, clearance] = await Promise.all([
    yearToDateCents(tenantId, key, year, excludeParId),
    clearanceFor(tenantId, key, year),
  ]);

  let vendorName = identity.payeeName ?? null;
  if (!vendorName && identity.vendorId) {
    const [v] = await db
      .select({ name: parVendors.name })
      .from(parVendors)
      .where(and(eq(parVendors.id, identity.vendorId), eq(parVendors.tenantId, tenantId)));
    vendorName = v?.name ?? null;
  }

  const verdict = evaluateTenderThreshold({
    thresholdCents,
    yearToDateCents: ytd,
    currentParCents,
    cleared: !!clearance,
    hasVendor: true,
  });

  return c.json({
    ...verdict,
    year,
    vendorKey: key,
    vendorName,
    clearedAt: clearance?.createdAt ?? null,
    clearedNote: clearance?.note ?? null,
  });
});

// ─── GET /api/par/tender/clearances ───────────────────────────────────────────

parTenderRoutes.get("/clearances", async (c) => {
  const user = c.get("user");
  const year = Number(c.req.query("year")) || tenderYear(null);
  const rows = await db
    .select({
      id: parTenderClearances.id,
      vendorId: parTenderClearances.vendorId,
      vendorKey: parTenderClearances.vendorKey,
      vendorName: parTenderClearances.vendorName,
      year: parTenderClearances.year,
      note: parTenderClearances.note,
      createdAt: parTenderClearances.createdAt,
      clearedByName: users.name,
    })
    .from(parTenderClearances)
    .leftJoin(users, eq(users.id, parTenderClearances.clearedByUserId))
    .where(and(eq(parTenderClearances.tenantId, user.tenantId), eq(parTenderClearances.year, year)))
    .orderBy(desc(parTenderClearances.createdAt));
  return c.json({ items: rows, year });
});

// ─── POST /api/par/tender/clearances ──────────────────────────────────────────

const clearanceSchema = z.object({
  vendor_key: z.string().min(1).max(300),
  vendor_id: z.string().uuid().optional().nullable(),
  vendor_name: z.string().max(300).optional().nullable(),
  year: z.number().int().min(2000).max(2100),
  note: z.string().max(2000).optional().nullable(),
});

parTenderRoutes.post("/clearances", zValidator("json", clearanceSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const body = c.req.valid("json");

  // Cine bifează: finanțele (cerința owner-ului) sau administratorul PAR. Un solicitant nu-și poate
  // ridica singur semnul de pe drum — asta ar goli regula de conținut.
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.includes("finance") && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden: finance role required" }, 403);
  }

  const existing = await clearanceFor(tenantId, body.vendor_key, body.year);
  if (existing) return c.json(existing);

  const [row] = await db
    .insert(parTenderClearances)
    .values({
      tenantId,
      vendorId: body.vendor_id ?? null,
      vendorKey: body.vendor_key,
      vendorName: body.vendor_name ?? null,
      year: body.year,
      clearedByUserId: user.id,
      note: body.note ?? null,
    })
    .returning();

  return c.json(row, 201);
});

// ─── DELETE /api/par/tender/clearances/:id ────────────────────────────────────

parTenderRoutes.delete("/clearances/:id", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const roles = await getUserPARRoles(user.id, tenantId);
  if (!roles.includes("finance") && !roles.includes("par_admin")) {
    return c.json({ error: "forbidden: finance role required" }, 403);
  }

  const [removed] = await db
    .delete(parTenderClearances)
    .where(
      and(
        eq(parTenderClearances.id, c.req.param("id")),
        eq(parTenderClearances.tenantId, tenantId)
      )
    )
    .returning();

  if (!removed) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
