/**
 * FX-001: cursul oficial BNM pentru modulul PAR.
 *
 * Montat în server/app.ts: app.route("/api/par/fx", parFxRoutes)
 *
 *   GET /api/par/fx/rates?date=YYYY-MM-DD          → tabloul zilei + variația față de ziua precedentă
 *   GET /api/par/fx/series?codes=EUR,USD&days=30   → serie zilnică (grafic)
 *   GET /api/par/fx/convert?from=EUR&to=MDL&amount=100[&date=]  → conversie pe curs oficial
 *
 * De ce trăiește sub /api/par: e o secțiune a modulului PAR (cererile de plată se fac în EUR/USD
 * și se raportează în lei), deci moștenește requireAuth + requireModuleEntitlement("par") din
 * app.ts. Nu cere niciun rol PAR anume — cursul oficial e informație publică, oricine are acces
 * la modul îl poate citi.
 *
 * `convert` există ca endpoint, nu doar ca aritmetică în pagină, ca să poată fi apelat și din
 * afara UI-ului (script, agent, altă parte din aplicație) cu exact aceleași reguli.
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  convertVia,
  fromIso,
  getEffectiveQuotes,
  getSeries,
  isValidIso,
  isoDate,
  type BnmQuote,
} from "../lib/bnm/rates";

export const parFxRoutes = new Hono<{ Variables: AuthVariables }>();

parFxRoutes.use("*", requireAuth);

/**
 * PERF (audit 2026-08-29): `middleware/httpCache.ts` pune `no-store` pe tot `/api/*`, deci
 * cursul oficial — care se schimbă o dată pe zi, la ora BNM — se re-descărca la fiecare
 * navigare, din fiecare tab. E singura familie de rute PAR unde memorarea e sigură fără riscul
 * de a arăta cuiva date financiare vechi: cursul unei zile nu se mai schimbă retroactiv, iar
 * `private` îl ține în browserul unui singur utilizator, niciodată într-un proxy comun.
 *
 * Restul rutelor PAR rămân `no-store` intenționat: o listă de cereri sau o coadă de aprobări
 * memorată chiar și 30 de secunde ar arăta o decizie deja luată ca fiind încă în așteptare.
 */
parFxRoutes.use("*", async (c, next) => {
  await next();
  if (c.req.method === "GET" && c.res.status === 200) {
    c.header("Cache-Control", "private, max-age=300");
  }
});

/** Valutele scoase în față: cele în care ONG-urile din Moldova chiar primesc granturi. */
const PINNED = ["EUR", "USD", "RON", "GBP", "UAH", "RUB"];

const SOURCE_URL = "https://www.bnm.md/ro/official_exchange_rates";

/** Cea mai lungă perioadă pe care o servește un singur grafic: 5 ani. */
const MAX_RANGE_DAYS = 366 * 5;

function serialize(q: BnmQuote, prev?: BnmQuote) {
  const change = prev ? q.mdlPerUnit - prev.mdlPerUnit : null;
  return {
    code: q.code,
    name: q.name,
    nominal: q.nominal,
    /** Cursul publicat de BNM: lei pentru `nominal` unități. */
    value: q.value,
    /** Lei pentru O unitate — forma cu care se calculează. */
    mdl_per_unit: q.mdlPerUnit,
    previous_mdl_per_unit: prev ? prev.mdlPerUnit : null,
    change,
    change_pct: change != null && prev && prev.mdlPerUnit !== 0 ? (change / prev.mdlPerUnit) * 100 : null,
    pinned: PINNED.includes(q.code),
  };
}

// ─── GET /rates ──────────────────────────────────────────────────────────────
parFxRoutes.get("/rates", async (c) => {
  const dateParam = c.req.query("date");
  const date = dateParam && dateParam.length > 0 ? dateParam : isoDate(new Date());
  if (!isValidIso(date)) return c.json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);

  let day;
  try {
    day = await getEffectiveQuotes(date);
  } catch {
    return c.json({ error: "bnm_unavailable", date, source_url: SOURCE_URL }, 503);
  }
  if (day.quotes.length === 0) {
    return c.json({ error: "bnm_unavailable", date, source_url: SOURCE_URL }, 503);
  }

  // Ziua precedentă doar pentru variație; dacă lipsește, arătăm cursul fără săgeți.
  let prevQuotes: BnmQuote[] = [];
  try {
    const prevIso = (() => {
      const d = new Date(day.effectiveDate);
      d.setDate(d.getDate() - 1);
      return isoDate(d);
    })();
    prevQuotes = (await getEffectiveQuotes(prevIso, { maxBack: 4 })).quotes;
  } catch {
    prevQuotes = [];
  }
  const prevByCode = new Map(prevQuotes.map((q) => [q.code, q]));

  const rates = day.quotes
    .map((q) => serialize(q, prevByCode.get(q.code)))
    .sort((a, b) => {
      const ai = PINNED.indexOf(a.code);
      const bi = PINNED.indexOf(b.code);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.code.localeCompare(b.code);
    });

  return c.json({
    requested_date: day.requestedDate,
    /** Data pentru care BNM chiar are curs — poate fi mai veche decât cea cerută. */
    effective_date: day.effectiveDate,
    is_stale: day.effectiveDate !== day.requestedDate,
    base: "MDL",
    source: "BNM",
    source_url: SOURCE_URL,
    rates,
  });
});

// ─── GET /series ─────────────────────────────────────────────────────────────
parFxRoutes.get("/series", async (c) => {
  const codes = (c.req.query("codes") ?? "EUR,USD")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{3}$/.test(s))
    .slice(0, 5);
  if (codes.length === 0) return c.json({ error: "invalid_codes" }, 400);

  const today = isoDate(new Date());
  const toParam = c.req.query("to") ?? c.req.query("date");
  const to = toParam && toParam.length > 0 ? toParam : today;
  if (!isValidIso(to)) return c.json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);

  // `from` explicit, sau derivat din `days` (forma veche a rutei, păstrată).
  let from = c.req.query("from") ?? "";
  if (!from) {
    const daysRaw = Number(c.req.query("days") ?? "30");
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 2), MAX_RANGE_DAYS) : 30;
    const d = new Date(fromIso(to));
    d.setDate(d.getDate() - (days - 1));
    from = isoDate(d);
  }
  if (!isValidIso(from)) return c.json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);
  if (from > to) return c.json({ error: "invalid_range", from, to }, 400);

  // Plafon de 5 ani: peste atât nu e o întrebare de grafic, ci un export — și ar însemna un
  // număr de descărcări pe care nu-l cerem unui site public într-o singură cerere.
  const spanDays = Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return c.json({ error: "range_too_long", max_days: MAX_RANGE_DAYS, requested_days: spanDays }, 400);
  }

  try {
    const series = await getSeries(codes, from, to);
    return c.json({
      codes,
      from: series.from,
      to: series.to,
      /** Pasul în zile: 1 = zilnic; peste ~4 luni graficul se eșantionează. */
      step_days: series.step,
      /** true = perioada e încă în curs de completat; reîncarcă pentru restul punctelor. */
      partial: series.partial,
      base: "MDL",
      source: "BNM",
      points: series.points,
    });
  } catch {
    return c.json({ error: "bnm_unavailable", source_url: SOURCE_URL }, 503);
  }
});

// ─── GET /convert ────────────────────────────────────────────────────────────
parFxRoutes.get("/convert", async (c) => {
  const from = (c.req.query("from") ?? "").toUpperCase();
  const to = (c.req.query("to") ?? "MDL").toUpperCase();
  const amount = Number(c.req.query("amount") ?? "1");

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return c.json({ error: "invalid_currency", from, to }, 400);
  }
  if (!Number.isFinite(amount)) return c.json({ error: "invalid_amount" }, 400);

  const dateParam = c.req.query("date");
  const date = dateParam && dateParam.length > 0 ? dateParam : isoDate(new Date());
  if (!isValidIso(date)) return c.json({ error: "invalid_date", expected: "YYYY-MM-DD" }, 400);

  let day;
  try {
    day = await getEffectiveQuotes(date);
  } catch {
    return c.json({ error: "bnm_unavailable", date, source_url: SOURCE_URL }, 503);
  }
  if (day.quotes.length === 0) return c.json({ error: "bnm_unavailable", date, source_url: SOURCE_URL }, 503);

  const converted = convertVia(day.quotes, from, to, amount);
  if (!converted) return c.json({ error: "currency_not_quoted", from, to, date: day.effectiveDate }, 404);

  return c.json({
    from,
    to,
    amount,
    rate: converted.rate,
    result: converted.result,
    requested_date: day.requestedDate,
    effective_date: day.effectiveDate,
    source: "BNM",
    source_url: SOURCE_URL,
  });
});
