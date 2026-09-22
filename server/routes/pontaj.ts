/**
 * PONTAJ-001 — tabelul de evidență a timpului de muncă, în regim self-service.
 *
 * Montat la `/api/pontaj`, în spatele comutatorului de modul din Consola Platformă
 * (`requireTenantModule("pontaj")`). Etapa asta nu are manager și nu are aprobări: fiecare om
 * își vede DOAR propriul rând, îl corectează și îl tipărește. De aceea nu există niciun
 * parametru `user_id` în rutele de mai jos — identitatea vine din sesiune, nu din cerere. Ziua
 * în care apare rolul de manager, el va primi rute proprii; până atunci, „doar al meu" e o
 * proprietate a formei API-ului, nu o verificare care poate fi uitată într-un handler.
 *
 *   GET    /api/pontaj/month?month=YYYY-MM  — luna mea, compusă și totalizată
 *   PUT    /api/pontaj/day                  — corecția unei zile
 *   DELETE /api/pontaj/day/:date            — înapoi la ce calculează motorul
 *   GET    /api/pontaj/leaves               — concediile mele
 *   POST   /api/pontaj/leaves               — concediu pe interval (mai multe zile deodată)
 *   DELETE /api/pontaj/leaves/:id           — anulare
 *   GET    /api/pontaj/settings             — profilul meu + setările organizației + jurisdicția
 *   PUT    /api/pontaj/settings             — norma mea zilnică, funcția, programul redus
 *   PUT    /api/pontaj/org                  — setările organizației (doar admin/manager)
 *   GET    /api/pontaj/holidays?year=YYYY   — sărbătorile legale + zilele proprii
 *   POST   /api/pontaj/holidays             — zi nelucrătoare proprie, ex. Hramul (admin/manager)
 *   DELETE /api/pontaj/holidays/:id         — ștergerea ei (admin/manager)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  pontajDayEntries,
  pontajHolidays,
  pontajLeaves,
  pontajOrgSettings,
  pontajProfiles,
} from "../db/schema/pontaj";
import { tenants } from "../db/schema/tenants";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  addDaysToKey,
  diffDays,
  enumerateDays,
  enumerateMonth,
  holidayMap,
  legalHolidays,
} from "../lib/pontaj/holidays";
import {
  getJurisdiction,
  isKnownSymbol,
  isLeaveSymbol,
  resolveCountry,
  SUMMARY_COLS,
} from "../lib/pontaj/jurisdiction";
import { composeDays, minutesToHours, monthTotals } from "../lib/pontaj/day";

export const pontajRoutes = new Hono<{ Variables: AuthVariables }>();
pontajRoutes.use("/*", requireAuth);

/** Rolurile care pot schimba setările organizației. Restul își văd doar propriul profil. */
const ORG_ADMIN_ROLES = new Set(["admin", "manager", "owner"]);

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Luna curentă, în fusul organizației. Serverul rulează în UTC, deci nu întrebăm `new Date()` local. */
function currentMonthKey(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" })
    .format(new Date());
  return parts.slice(0, 7);
}

interface OrgConfig {
  country: string;
  fullDailyNormMinutes: number;
  workWeekdays: number[];
  unitName: string | null;
  subdivisionName: string | null;
  signatoryHead: string | null;
  signatoryRecorder: string | null;
  signatoryHr: string | null;
}

/**
 * Setările organizației, cu implicitele produsului când rândul lipsește.
 *
 * Lipsa rândului e cazul NORMAL (nimeni n-a deschis încă setările), nu o eroare — o organizație
 * moldovenească cu program luni–vineri și normă de 8 ore trebuie să-și vadă luna completată
 * corect din prima secundă. O interogare picată duce în același loc, ca un deploy fără migrare
 * să nu golească pontajul nimănui.
 */
async function loadOrgConfig(tenantId: string): Promise<OrgConfig> {
  const fallback: OrgConfig = {
    country: "MD",
    fullDailyNormMinutes: 480,
    workWeekdays: [1, 2, 3, 4, 5],
    unitName: null,
    subdivisionName: null,
    signatoryHead: null,
    signatoryRecorder: null,
    signatoryHr: null,
  };
  try {
    const [row] = await db
      .select()
      .from(pontajOrgSettings)
      .where(eq(pontajOrgSettings.tenantId, tenantId))
      .limit(1);
    if (!row) return fallback;
    const weekdays = Array.isArray(row.workWeekdays)
      ? row.workWeekdays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      : [];
    return {
      country: row.country,
      fullDailyNormMinutes: row.fullDailyNormMinutes,
      // O listă golită din greșeală ar face fiecare zi să fie repaus, adică o lună goală fără
      // nicio eroare vizibilă. Cădem pe săptămâna standard.
      workWeekdays: weekdays.length ? weekdays : fallback.workWeekdays,
      unitName: row.unitName,
      subdivisionName: row.subdivisionName,
      signatoryHead: row.signatoryHead,
      signatoryRecorder: row.signatoryRecorder,
      signatoryHr: row.signatoryHr,
    };
  } catch (e) {
    console.warn("[pontaj] setările organizației indisponibile:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

interface ProfileConfig {
  dailyMinutes: number;
  jobTitle: string | null;
  staffCode: string | null;
  reducedSchedule: boolean;
}

async function loadProfile(tenantId: string, userId: string, orgNorm: number): Promise<ProfileConfig> {
  const fallback: ProfileConfig = {
    // Fără profil propriu, omul lucrează norma organizației — 8 ore în implicitul produsului.
    dailyMinutes: orgNorm,
    jobTitle: null,
    staffCode: null,
    reducedSchedule: false,
  };
  try {
    const [row] = await db
      .select()
      .from(pontajProfiles)
      .where(and(eq(pontajProfiles.tenantId, tenantId), eq(pontajProfiles.userId, userId)))
      .limit(1);
    if (!row) return fallback;
    return {
      dailyMinutes: row.dailyMinutes,
      jobTitle: row.jobTitle,
      staffCode: row.staffCode,
      reducedSchedule: row.reducedSchedule,
    };
  } catch (e) {
    console.warn("[pontaj] profilul indisponibil:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

/**
 * Denumirea care intră în antetul formularului.
 *
 * Dacă administratorul n-a scris nimic, folosim numele workspace-ului: compania E deja setată în
 * FinFlow, iar un act intern tipărit cu o linie goală acolo unde platforma știe răspunsul e o
 * lipsă pe care o observă abia cel care semnează. Rămâne un IMPLICIT: orice text scris în setări
 * îl bate, iar numele juridic complet tot de acolo se ia.
 */
async function resolveUnitName(tenantId: string, explicit: string | null): Promise<string | null> {
  if (explicit) return explicit;
  try {
    const [row] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return row?.name ?? null;
  } catch {
    return null;
  }
}

/** Zilele nelucrătoare proprii organizației care ating un interval. */
async function loadCompanyHolidays(tenantId: string, fromDate: string, toDate: string) {
  try {
    return await db
      .select({ id: pontajHolidays.id, date: pontajHolidays.holidayDate, name: pontajHolidays.name })
      .from(pontajHolidays)
      .where(
        and(
          eq(pontajHolidays.tenantId, tenantId),
          gte(pontajHolidays.holidayDate, fromDate),
          lte(pontajHolidays.holidayDate, toDate),
        ),
      )
      .orderBy(asc(pontajHolidays.holidayDate));
  } catch (e) {
    console.warn("[pontaj] zilele proprii indisponibile:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Ce descrie jurisdicția pentru interfață și pentru formularul tipărit. */
function jurisdictionPayload(country: string) {
  const j = getJurisdiction(country);
  return {
    code: j.code,
    label: j.label,
    isAdapted: j.isAdapted,
    labourCode: j.labourCode,
    annualLeaveDays: j.annualLeaveDays,
    annualLeaveUnit: j.annualLeaveUnit,
    annualLeaveLegalRef: j.annualLeaveLegalRef,
    preHolidayReductionMinutes: j.preHolidayReductionMinutes,
    preHolidayLegalRef: j.preHolidayLegalRef,
    fullDailyNormMinutes: j.fullDailyNormMinutes,
    fullDailyNormLegalRef: j.fullDailyNormLegalRef,
    maxDailyMinutes: j.maxDailyMinutes,
    symbols: j.timesheetSymbols,
    summaryCols: SUMMARY_COLS.map((key) => ({ key, short: j.summaryShorts[key] ?? key })),
    form: j.timesheetForm,
  };
}

// ─── GET /month ───────────────────────────────────────────────────────────────

pontajRoutes.get("/month", async (c) => {
  const user = c.get("user");
  const requested = c.req.query("month");
  const month = requested && MONTH_RE.test(requested)
    ? requested
    : currentMonthKey(user.timezone || "Europe/Chisinau");

  const days = enumerateMonth(month);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const org = await loadOrgConfig(user.tenantId);
  const profile = await loadProfile(user.tenantId, user.id, org.fullDailyNormMinutes);
  const jur = getJurisdiction(org.country);

  // Ziua de DUPĂ ultima zi a lunii intră în hartă intenționat: 31 decembrie e ajun fiindcă 1
  // ianuarie e sărbătoare, iar fără ea ziua scurtă ar dispărea tăcut la granița dintre ani.
  const nextDay = addDaysToKey(lastDay, 1);
  const years = [Number(month.slice(0, 4)), Number(nextDay.slice(0, 4))];
  const companyHolidays = await loadCompanyHolidays(user.tenantId, firstDay, nextDay);
  const holidays = holidayMap(resolveCountry(org.country), years, companyHolidays);

  let leaves: { id: string; symbol: string; startDate: string; endDate: string; note: string | null }[] = [];
  let entries: { date: string; symbol: string; minutes: number; note: string | null }[] = [];
  let schemaLag = false;
  try {
    // Orice concediu care ATINGE luna, nu doar cele care încep în ea: un concediu 20 iulie –
    // 10 august trebuie să se vadă și în august.
    leaves = (
      await db
        .select()
        .from(pontajLeaves)
        .where(
          and(
            eq(pontajLeaves.tenantId, user.tenantId),
            eq(pontajLeaves.userId, user.id),
            lte(pontajLeaves.startDate, lastDay),
            gte(pontajLeaves.endDate, firstDay),
          ),
        )
        .orderBy(asc(pontajLeaves.startDate))
    ).map((l) => ({ id: l.id, symbol: l.symbol, startDate: l.startDate, endDate: l.endDate, note: l.note }));

    entries = (
      await db
        .select()
        .from(pontajDayEntries)
        .where(
          and(
            eq(pontajDayEntries.tenantId, user.tenantId),
            eq(pontajDayEntries.userId, user.id),
            gte(pontajDayEntries.entryDate, firstDay),
            lte(pontajDayEntries.entryDate, lastDay),
          ),
        )
    ).map((e) => ({ date: e.entryDate, symbol: e.symbol, minutes: e.minutes, note: e.note }));
  } catch (e) {
    // Tabelele pot lipsi în fereastra dintre deploy și migrare. Luna se arată calculată din
    // calendar — corectă pentru cine n-are corecții — în loc să întoarcem 500.
    console.error("[pontaj/month] citire eșuată:", e instanceof Error ? e.message : e);
    schemaLag = true;
  }

  const composed = composeDays({
    days,
    workWeekdays: org.workWeekdays,
    holidays,
    dailyMinutes: profile.dailyMinutes,
    fullDailyNormMinutes: org.fullDailyNormMinutes,
    preHolidayReductionMinutes: jur.preHolidayReductionMinutes,
    reducedSchedule: profile.reducedSchedule,
    leaves,
    entries,
  });
  const totals = monthTotals(composed);

  return c.json({
    month,
    employee: {
      userId: user.id,
      name: user.name,
      email: user.email,
      jobTitle: profile.jobTitle,
      staffCode: profile.staffCode,
      dailyMinutes: profile.dailyMinutes,
      dailyHours: minutesToHours(profile.dailyMinutes),
      reducedSchedule: profile.reducedSchedule,
    },
    org: { ...org, unitName: await resolveUnitName(user.tenantId, org.unitName) },
    canEditOrg: ORG_ADMIN_ROLES.has(user.role),
    jurisdiction: jurisdictionPayload(org.country),
    days: composed.map((d) => ({ ...d, hours: minutesToHours(d.minutes) })),
    totals: { ...totals, workedHours: minutesToHours(totals.workedMinutes) },
    leaves,
    holidays: [...holidays.entries()]
      .filter(([date]) => date >= firstDay && date <= lastDay)
      .map(([date, name]) => ({ date, name }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    schemaLag,
  });
});

// ─── PUT /day ─────────────────────────────────────────────────────────────────

const daySchema = z.object({
  date: z.string().regex(DATE_RE, "Data trebuie să fie în formatul AAAA-LL-ZZ"),
  symbol: z.string().min(1).max(4),
  /** Minute, nu ore: stocarea e în minute, deci conversia se face o singură dată, în interfață. */
  minutes: z.number().int().min(0).max(1440).optional(),
  note: z.string().trim().max(300).optional(),
});

pontajRoutes.put("/day", zValidator("json", daySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  if (!isKnownSymbol(body.symbol)) return c.json({ error: "unknown_symbol" }, 400);

  const org = await loadOrgConfig(user.tenantId);
  const jur = getJurisdiction(org.country);
  // Orele se scriu doar pe zilele lucrate. Un `Cm` cu 8 ore ar fi o contradicție consemnată într-un
  // document care se semnează, așa că o tăiem la scriere, nu la afișare.
  const minutes = body.symbol === "P" ? (body.minutes ?? 0) : 0;
  if (body.symbol === "P" && minutes <= 0) return c.json({ error: "hours_required" }, 400);
  if (minutes > jur.maxDailyMinutes) {
    return c.json({ error: "hours_too_large", maxMinutes: jur.maxDailyMinutes }, 400);
  }

  try {
    await db
      .insert(pontajDayEntries)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        entryDate: body.date,
        symbol: body.symbol,
        minutes,
        note: body.note || null,
      })
      .onConflictDoUpdate({
        target: [pontajDayEntries.tenantId, pontajDayEntries.userId, pontajDayEntries.entryDate],
        set: { symbol: body.symbol, minutes, note: body.note || null, updatedAt: new Date() },
      });
    return c.json({ ok: true, date: body.date, symbol: body.symbol, minutes });
  } catch (e) {
    console.error("[pontaj/day] scriere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "write_failed" }, 500);
  }
});

pontajRoutes.delete("/day/:date", async (c) => {
  const user = c.get("user");
  const date = c.req.param("date");
  if (!DATE_RE.test(date)) return c.json({ error: "invalid_date" }, 400);
  try {
    await db
      .delete(pontajDayEntries)
      .where(
        and(
          eq(pontajDayEntries.tenantId, user.tenantId),
          eq(pontajDayEntries.userId, user.id),
          eq(pontajDayEntries.entryDate, date),
        ),
      );
    return c.json({ ok: true });
  } catch (e) {
    console.error("[pontaj/day] ștergere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "delete_failed" }, 500);
  }
});

// ─── /leaves ──────────────────────────────────────────────────────────────────

pontajRoutes.get("/leaves", async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const conditions = [eq(pontajLeaves.tenantId, user.tenantId), eq(pontajLeaves.userId, user.id)];
  if (from && DATE_RE.test(from)) conditions.push(gte(pontajLeaves.endDate, from));
  if (to && DATE_RE.test(to)) conditions.push(lte(pontajLeaves.startDate, to));
  try {
    const items = await db
      .select()
      .from(pontajLeaves)
      .where(and(...conditions))
      .orderBy(asc(pontajLeaves.startDate));
    return c.json({ items });
  } catch (e) {
    console.error("[pontaj/leaves] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

const leaveSchema = z.object({
  symbol: z.string().min(1).max(4),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE),
  note: z.string().trim().max(500).optional(),
});

/**
 * Concediu pe INTERVAL — cerința „să putem adăuga concediu pe mai multe zile concomitent".
 *
 * Se scrie un singur rând, oricât de lung ar fi intervalul; despicarea pe zile se face la
 * citire. Răspunsul spune câte zile lucrătoare atinge, fiindcă aia e cifra pe care omul o
 * verifică — nu numărul de zile calendaristice.
 */
pontajRoutes.post("/leaves", zValidator("json", leaveSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  if (!isLeaveSymbol(body.symbol)) return c.json({ error: "unknown_symbol" }, 400);
  const span = diffDays(body.endDate, body.startDate);
  if (span < 0) return c.json({ error: "end_before_start" }, 400);
  // Un an întreg e deja peste orice concediu legal; peste atât e o greșeală de tastare, iar
  // rândul ar umple luni întregi de pontaj fără ca nimeni să observe.
  if (span > 365) return c.json({ error: "range_too_long", maxDays: 366 }, 400);

  const org = await loadOrgConfig(user.tenantId);
  const dates = enumerateDays(body.startDate, body.endDate);
  const holidays = holidayMap(
    resolveCountry(org.country),
    [Number(body.startDate.slice(0, 4)), Number(body.endDate.slice(0, 4))],
    await loadCompanyHolidays(user.tenantId, body.startDate, body.endDate),
  );
  const workingDays = dates.filter((d) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    const iso = wd === 0 ? 7 : wd;
    return org.workWeekdays.includes(iso) && !holidays.has(d);
  }).length;

  try {
    const [created] = await db
      .insert(pontajLeaves)
      .values({
        tenantId: user.tenantId,
        userId: user.id,
        symbol: body.symbol,
        startDate: body.startDate,
        endDate: body.endDate,
        note: body.note || null,
      })
      .returning();
    return c.json({ ok: true, leave: created, calendarDays: dates.length, workingDays }, 201);
  } catch (e) {
    console.error("[pontaj/leaves] creare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "write_failed" }, 500);
  }
});

pontajRoutes.delete("/leaves/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  try {
    // Filtrarea după `userId` nu e redundantă cu `id`: e gardul care ține self-service-ul
    // self-service dacă cineva încearcă un id din altă sesiune.
    const deleted = await db
      .delete(pontajLeaves)
      .where(
        and(
          eq(pontajLeaves.id, id),
          eq(pontajLeaves.tenantId, user.tenantId),
          eq(pontajLeaves.userId, user.id),
        ),
      )
      .returning({ id: pontajLeaves.id });
    if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("[pontaj/leaves] ștergere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "delete_failed" }, 500);
  }
});

// ─── /settings ────────────────────────────────────────────────────────────────

pontajRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  const org = await loadOrgConfig(user.tenantId);
  const profile = await loadProfile(user.tenantId, user.id, org.fullDailyNormMinutes);
  return c.json({
    profile: { ...profile, dailyHours: minutesToHours(profile.dailyMinutes) },
    org: { ...org, unitName: await resolveUnitName(user.tenantId, org.unitName) },
    /** Ce a scris explicit administratorul — formularul de setări nu trebuie să arate implicitul ca text introdus. */
    orgExplicitUnitName: org.unitName,
    jurisdiction: jurisdictionPayload(org.country),
    canEditOrg: ORG_ADMIN_ROLES.has(user.role),
  });
});

const profileSchema = z.object({
  dailyMinutes: z.number().int().min(30).max(1440).optional(),
  jobTitle: z.string().trim().max(300).nullable().optional(),
  staffCode: z.string().trim().max(60).nullable().optional(),
  reducedSchedule: z.boolean().optional(),
});

pontajRoutes.put("/settings", zValidator("json", profileSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const org = await loadOrgConfig(user.tenantId);
  const current = await loadProfile(user.tenantId, user.id, org.fullDailyNormMinutes);
  const next = {
    dailyMinutes: body.dailyMinutes ?? current.dailyMinutes,
    jobTitle: body.jobTitle === undefined ? current.jobTitle : (body.jobTitle || null),
    staffCode: body.staffCode === undefined ? current.staffCode : (body.staffCode || null),
    reducedSchedule: body.reducedSchedule ?? current.reducedSchedule,
  };
  try {
    await db
      .insert(pontajProfiles)
      .values({ tenantId: user.tenantId, userId: user.id, ...next })
      .onConflictDoUpdate({
        target: [pontajProfiles.tenantId, pontajProfiles.userId],
        set: { ...next, updatedAt: new Date() },
      });
    return c.json({ ok: true, profile: { ...next, dailyHours: minutesToHours(next.dailyMinutes) } });
  } catch (e) {
    console.error("[pontaj/settings] scriere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "write_failed" }, 500);
  }
});

const orgSchema = z.object({
  country: z.enum(["MD", "RO", "OTHER"]).optional(),
  fullDailyNormMinutes: z.number().int().min(60).max(1440).optional(),
  workWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  unitName: z.string().trim().max(300).nullable().optional(),
  subdivisionName: z.string().trim().max(300).nullable().optional(),
  signatoryHead: z.string().trim().max(200).nullable().optional(),
  signatoryRecorder: z.string().trim().max(200).nullable().optional(),
  signatoryHr: z.string().trim().max(200).nullable().optional(),
});

pontajRoutes.put("/org", zValidator("json", orgSchema), async (c) => {
  const user = c.get("user");
  if (!ORG_ADMIN_ROLES.has(user.role)) return c.json({ error: "forbidden" }, 403);
  const body = c.req.valid("json");
  const current = await loadOrgConfig(user.tenantId);
  const next = {
    country: body.country ?? current.country,
    fullDailyNormMinutes: body.fullDailyNormMinutes ?? current.fullDailyNormMinutes,
    workWeekdays: body.workWeekdays ? [...new Set(body.workWeekdays)].sort() : current.workWeekdays,
    unitName: body.unitName === undefined ? current.unitName : (body.unitName || null),
    subdivisionName:
      body.subdivisionName === undefined ? current.subdivisionName : (body.subdivisionName || null),
    signatoryHead: body.signatoryHead === undefined ? current.signatoryHead : (body.signatoryHead || null),
    signatoryRecorder:
      body.signatoryRecorder === undefined ? current.signatoryRecorder : (body.signatoryRecorder || null),
    signatoryHr: body.signatoryHr === undefined ? current.signatoryHr : (body.signatoryHr || null),
  };
  try {
    await db
      .insert(pontajOrgSettings)
      .values({ tenantId: user.tenantId, ...next, updatedByUserId: user.id })
      .onConflictDoUpdate({
        target: pontajOrgSettings.tenantId,
        set: { ...next, updatedByUserId: user.id, updatedAt: new Date() },
      });
    return c.json({ ok: true, org: next, jurisdiction: jurisdictionPayload(next.country) });
  } catch (e) {
    console.error("[pontaj/org] scriere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "write_failed" }, 500);
  }
});

// ─── /holidays ────────────────────────────────────────────────────────────────

pontajRoutes.get("/holidays", async (c) => {
  const user = c.get("user");
  const org = await loadOrgConfig(user.tenantId);
  const raw = Number(c.req.query("year"));
  const year = Number.isInteger(raw) && raw >= 1900 && raw <= 2100
    ? raw
    : Number(currentMonthKey(user.timezone || "Europe/Chisinau").slice(0, 4));
  const company = await loadCompanyHolidays(user.tenantId, `${year}-01-01`, `${year}-12-31`);
  return c.json({
    year,
    country: org.country,
    legal: legalHolidays(resolveCountry(org.country), year),
    company: company.map((h) => ({ id: h.id, date: h.date, name: h.name, source: "company" as const })),
    canEdit: ORG_ADMIN_ROLES.has(user.role),
  });
});

const holidaySchema = z.object({
  date: z.string().regex(DATE_RE),
  name: z.string().trim().min(1).max(200),
});

pontajRoutes.post("/holidays", zValidator("json", holidaySchema), async (c) => {
  const user = c.get("user");
  if (!ORG_ADMIN_ROLES.has(user.role)) return c.json({ error: "forbidden" }, 403);
  const body = c.req.valid("json");
  try {
    const [created] = await db
      .insert(pontajHolidays)
      .values({
        tenantId: user.tenantId,
        holidayDate: body.date,
        name: body.name,
        createdByUserId: user.id,
      })
      .onConflictDoUpdate({
        target: [pontajHolidays.tenantId, pontajHolidays.holidayDate],
        set: { name: body.name },
      })
      .returning();
    return c.json({ ok: true, holiday: created }, 201);
  } catch (e) {
    console.error("[pontaj/holidays] scriere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "write_failed" }, 500);
  }
});

pontajRoutes.delete("/holidays/:id", async (c) => {
  const user = c.get("user");
  if (!ORG_ADMIN_ROLES.has(user.role)) return c.json({ error: "forbidden" }, 403);
  try {
    const deleted = await db
      .delete(pontajHolidays)
      .where(and(eq(pontajHolidays.id, c.req.param("id")), eq(pontajHolidays.tenantId, user.tenantId)))
      .returning({ id: pontajHolidays.id });
    if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  } catch (e) {
    console.error("[pontaj/holidays] ștergere eșuată:", e instanceof Error ? e.message : e);
    return c.json({ error: "delete_failed" }, 500);
  }
});
