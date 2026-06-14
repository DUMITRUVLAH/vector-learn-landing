/**
 * MULTICURRENCY-001: BNM daily exchange rates API
 * Mounted in server/app.ts: app.route("/api/fin/exchange-rates", finExchangeRatesRoutes)
 *
 * Routes:
 *   GET  /api/fin/exchange-rates?from=EUR&to=MDL&date=2026-06-13  → rate for date
 *   GET  /api/fin/exchange-rates/latest?from=EUR&to=MDL            → latest available rate
 *   POST /api/fin/exchange-rates                                   → insert manual rate
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lte, desc } from "drizzle-orm";
import { db } from "../db/client";
import { finExchangeRates } from "../db/schema/finExchangeRates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finExchangeRatesRoutes = new Hono<{ Variables: AuthVariables }>();
finExchangeRatesRoutes.use("*", requireAuth);

// ─── GET /api/fin/exchange-rates/latest ──────────────────────────────────────
finExchangeRatesRoutes.get("/latest", async (c) => {
  const { from, to } = c.req.query();
  const tenantId = c.get("tenantId") as string;

  if (!from || !to) {
    return c.json({ error: "from and to query params are required" }, 400);
  }

  const [rate] = await db
    .select()
    .from(finExchangeRates)
    .where(
      and(
        eq(finExchangeRates.tenantId, tenantId),
        eq(finExchangeRates.currencyFrom, from.toUpperCase()),
        eq(finExchangeRates.currencyTo, to.toUpperCase())
      )
    )
    .orderBy(desc(finExchangeRates.rateDate))
    .limit(1);

  if (!rate) {
    return c.json({ error: "no_rate_found", from, to }, 404);
  }

  return c.json({
    rate: rate.rate,
    rate_date: rate.rateDate,
    source: rate.source,
    currency_from: rate.currencyFrom,
    currency_to: rate.currencyTo,
  });
});

// ─── GET /api/fin/exchange-rates?from=EUR&to=MDL&date=2026-06-13 ─────────────
finExchangeRatesRoutes.get("/", async (c) => {
  const { from, to, date } = c.req.query();
  const tenantId = c.get("tenantId") as string;

  if (!from || !to) {
    return c.json({ error: "from and to query params are required" }, 400);
  }

  let rows;

  if (date) {
    // Exact date or closest rate <= date
    rows = await db
      .select()
      .from(finExchangeRates)
      .where(
        and(
          eq(finExchangeRates.tenantId, tenantId),
          eq(finExchangeRates.currencyFrom, from.toUpperCase()),
          eq(finExchangeRates.currencyTo, to.toUpperCase()),
          lte(finExchangeRates.rateDate, date)
        )
      )
      .orderBy(desc(finExchangeRates.rateDate))
      .limit(1);
  } else {
    // Return the 30 most recent rates for the pair
    rows = await db
      .select()
      .from(finExchangeRates)
      .where(
        and(
          eq(finExchangeRates.tenantId, tenantId),
          eq(finExchangeRates.currencyFrom, from.toUpperCase()),
          eq(finExchangeRates.currencyTo, to.toUpperCase())
        )
      )
      .orderBy(desc(finExchangeRates.rateDate))
      .limit(30);
  }

  if (date && rows.length === 0) {
    return c.json({ error: "no_rate_found", from, to, date }, 404);
  }

  if (date) {
    const r = rows[0];
    return c.json({
      rate: r.rate,
      rate_date: r.rateDate,
      source: r.source,
      currency_from: r.currencyFrom,
      currency_to: r.currencyTo,
    });
  }

  return c.json(
    rows.map((r) => ({
      id: r.id,
      rate: r.rate,
      rate_date: r.rateDate,
      source: r.source,
      currency_from: r.currencyFrom,
      currency_to: r.currencyTo,
      created_at: r.createdAt,
    }))
  );
});

// ─── POST /api/fin/exchange-rates ─────────────────────────────────────────────
const insertRateSchema = z.object({
  currency_from: z.string().length(3).toUpperCase(),
  currency_to: z.string().length(3).toUpperCase(),
  rate: z.number().positive(),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  source: z.enum(["BNM", "manual"]).default("manual"),
});

finExchangeRatesRoutes.post(
  "/",
  zValidator("json", insertRateSchema),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const body = c.req.valid("json");

    const [created] = await db
      .insert(finExchangeRates)
      .values({
        tenantId,
        currencyFrom: body.currency_from,
        currencyTo: body.currency_to,
        rate: String(body.rate),
        rateDate: body.rate_date,
        source: body.source,
      })
      .onConflictDoUpdate({
        target: [
          finExchangeRates.tenantId,
          finExchangeRates.currencyFrom,
          finExchangeRates.currencyTo,
          finExchangeRates.rateDate,
        ],
        set: {
          rate: String(body.rate),
          source: body.source,
        },
      })
      .returning();

    return c.json(
      {
        id: created.id,
        rate: created.rate,
        rate_date: created.rateDate,
        source: created.source,
        currency_from: created.currencyFrom,
        currency_to: created.currencyTo,
      },
      201
    );
  }
);
