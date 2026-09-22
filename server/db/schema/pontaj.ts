/**
 * PONTAJ-001 — tabelul de evidență a timpului de muncă, în regim self-service.
 *
 * Etapa asta NU are manager și NU are aprobări: fiecare angajat intră, își vede propriul rând,
 * își corectează orele, își înregistrează concediile pe interval și tipărește. Aprobarea e o
 * fază viitoare, iar modelul de aici o suportă fără migrare distructivă (un `status` pe
 * `pontaj_leaves` și un tabel de confirmări lunare se adaugă peste).
 *
 * Tabele:
 *   pontaj_org_settings — jurisdicția, norma și antetul formularului, per organizație
 *   pontaj_profiles     — norma zilnică și funcția fiecărui angajat
 *   pontaj_holidays     — zilele nelucrătoare pe care platforma NU le poate ști (Hramul localității)
 *   pontaj_leaves       — concediu / absență pe interval, cu un singur rând per cerere
 *   pontaj_day_entries  — corecția punctuală pe o zi; bate tot ce calculează motorul
 *
 * Migrare: drizzle/0184_pontaj_self_service.sql
 *
 * Decizii de proiectare:
 * - **Timpul în MINUTE, ca întregi** — aceeași regulă ca banii în cenți din FIN-CORE. Orele
 *   zecimale (7,5 · 8,25) adună drift la însumare, iar `numeric` se întoarce ca string din
 *   drizzle: două erori tăcute într-un document care se semnează.
 * - **Datele ca `date`, nu `timestamp`** — o zi de pontaj nu are fus orar. Un `timestamp` citit
 *   pe un server în UTC ar fi mutat concediul cu o zi pentru cineva din Chișinău.
 * - **Izolarea pe tenant e explicită în fiecare interogare**, ca peste tot în FinFlow. În plus,
 *   fiecare tabel cu date personale are `user_id`: în self-service, un rând se citește doar de
 *   cel care l-a scris.
 * - `country` e `varchar`, nu enum pg, ca `sync-schema.ts` să-l poată adăuga singur pe prod,
 *   unde migrările nu se aplică fiabil.
 */
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  date,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

// ─── pontaj_org_settings ──────────────────────────────────────────────────────

/**
 * Ce înseamnă „o zi de lucru" în organizația asta. Un singur rând per workspace; lipsa lui e
 * un caz normal, nu o eroare — motorul cade pe implicitele jurisdicției.
 */
export const pontajOrgSettings = pgTable(
  "pontaj_org_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** `MD` (implicit) · `RO` · `OTHER`. Decide sărbătorile, simbolurile și formularul tipărit. */
    country: varchar("country", { length: 8 }).notNull().default("MD"),
    /**
     * Norma zilnică întreagă a organizației, în minute. Implicit 480 = 8 ore, adică art. 95 din
     * Codul muncii RM la o săptămână de 5 zile. E reperul față de care se decide cine are
     * dreptul la ziua scurtă din ajun — nu norma fiecărui om, care stă pe profil.
     */
    fullDailyNormMinutes: integer("full_daily_norm_minutes").notNull().default(480),
    /** Zilele lucrătoare, ISO: 1 = luni … 7 = duminică. Implicit luni–vineri. */
    workWeekdays: jsonb("work_weekdays").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
    /** „Denumirea unității" din antetul formularului tipizat. */
    unitName: varchar("unit_name", { length: 300 }),
    /** „Denumirea subdiviziunii unității" din același antet. */
    subdivisionName: varchar("subdivision_name", { length: 300 }),
    /**
     * Numele care se tipăresc pe cele trei rânduri de semnătură din subsolul formularului, în
     * ordinea din Convenția colectivă nr. 17/2020: șeful subdiviziunii, persoana responsabilă de
     * evidența timpului de muncă, serviciul resurse umane.
     *
     * Necompletat = rămâne linia goală din formularul original, de completat cu pixul. NU punem
     * automat numele administratorului: cine răspunde de evidența timpului de muncă e o
     * desemnare a angajatorului, nu o deducție din cine a deschis ecranul.
     */
    signatoryHead: varchar("signatory_head", { length: 200 }),
    signatoryRecorder: varchar("signatory_recorder", { length: 200 }),
    signatoryHr: varchar("signatory_hr", { length: 200 }),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pontaj_org_settings_tenant_uniq").on(t.tenantId)]
);

export type PontajOrgSettings = typeof pontajOrgSettings.$inferSelect;
export type NewPontajOrgSettings = typeof pontajOrgSettings.$inferInsert;

// ─── pontaj_profiles ──────────────────────────────────────────────────────────

/**
 * Cum arată ziua unui angajat anume. Lipsa rândului înseamnă „norma organizației", nu zero:
 * cineva care nu a deschis niciodată setările trebuie să-și vadă luna completată corect.
 */
export const pontajProfiles = pgTable(
  "pontaj_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Norma zilnică proprie, în minute. Implicit 480 = 8 ore. */
    dailyMinutes: integer("daily_minutes").notNull().default(480),
    /** Funcția, așa cum apare în coloana „Funcția" din formular. */
    jobTitle: varchar("job_title", { length: 300 }),
    /** Numărul matricol / codul de personal, dacă organizația îl folosește. */
    staffCode: varchar("staff_code", { length: 60 }),
    /**
     * Durată redusă a timpului de muncă (art. 96) sau zi de muncă parțială (art. 97) din Codul
     * muncii RM. Art. 102 scutește categoriile astea de scurtarea zilei din ajunul sărbătorii —
     * de aceea e un steag declarat, nu o deducție din numărul de ore: e o calificare pe care o
     * face contractul de muncă, nu produsul.
     */
    reducedSchedule: boolean("reduced_schedule").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pontaj_profiles_tenant_user_uniq").on(t.tenantId, t.userId),
    index("pontaj_profiles_tenant_idx").on(t.tenantId),
  ]
);

export type PontajProfile = typeof pontajProfiles.$inferSelect;
export type NewPontajProfile = typeof pontajProfiles.$inferInsert;

// ─── pontaj_holidays ──────────────────────────────────────────────────────────

/**
 * Zile nelucrătoare proprii organizației.
 *
 * Sărbătorile legale NU se stochează: sunt calculate în `lib/pontaj/holidays.ts` din textul
 * legii, deci nu pot rămâne în urmă. Aici ajunge doar ce platforma nu are cum să știe — în
 * primul rând ziua Hramului localității, pe care art. 111 alin. (1) lit. l) din Codul muncii RM
 * o declară nelucrătoare, dar o lasă la nivel de localitate.
 */
export const pontajHolidays = pgTable(
  "pontaj_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    holidayDate: date("holiday_date").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pontaj_holidays_tenant_date_uniq").on(t.tenantId, t.holidayDate),
    index("pontaj_holidays_tenant_idx").on(t.tenantId),
  ]
);

export type PontajHoliday = typeof pontajHolidays.$inferSelect;
export type NewPontajHoliday = typeof pontajHolidays.$inferInsert;

// ─── pontaj_leaves ────────────────────────────────────────────────────────────

/**
 * Concediu / absență pe INTERVAL — un singur rând pentru „15–28 iulie", nu 14 rânduri de zi.
 *
 * Intervalul e forma în care omul gândește cererea și forma în care o poate anula întreagă; dacă
 * am fi despicat-o în zile la scriere, ștergerea ar fi devenit o operație pe 14 rânduri, iar
 * „cât concediu am luat" ar fi cerut o reconstituire. Despicarea se face la citire, în motorul
 * pur (`indexLeaves`), unde e reversibilă.
 *
 * Fără `status`: etapa asta e self-service, deci un rând scris E realitatea declarată de angajat.
 * Când apare aprobarea managerului, coloana se adaugă cu implicit `approved`, ca istoricul să
 * rămână valid.
 */
export const pontajLeaves = pgTable(
  "pontaj_leaves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Cod stabil de pontaj: `C`, `Cn`, `Cm`, `Cc`, `Cs`, `Ls`, `D`, `A`. Vezi `lib/pontaj/jurisdiction.ts`. */
    symbol: varchar("symbol", { length: 4 }).notNull(),
    startDate: date("start_date").notNull(),
    /** Inclusiv. Egală cu `start_date` pentru o singură zi. */
    endDate: date("end_date").notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pontaj_leaves_tenant_user_idx").on(t.tenantId, t.userId),
    index("pontaj_leaves_range_idx").on(t.tenantId, t.userId, t.startDate, t.endDate),
  ]
);

export type PontajLeave = typeof pontajLeaves.$inferSelect;
export type NewPontajLeave = typeof pontajLeaves.$inferInsert;

// ─── pontaj_day_entries ───────────────────────────────────────────────────────

/**
 * Corecția punctuală a unei zile: „marți am lucrat 6 ore, nu 8" sau „sâmbăta asta am lucrat".
 * Bate tot ce calculează motorul, inclusiv concediul — e cuvântul explicit al omului despre o
 * zi anume.
 */
export const pontajDayEntries = pgTable(
  "pontaj_day_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    symbol: varchar("symbol", { length: 4 }).notNull(),
    /** Minutele lucrate. 0 pentru orice simbol în afară de `P`. */
    minutes: integer("minutes").notNull().default(0),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pontaj_day_entries_user_date_uniq").on(t.tenantId, t.userId, t.entryDate),
    index("pontaj_day_entries_month_idx").on(t.tenantId, t.userId, t.entryDate),
  ]
);

export type PontajDayEntry = typeof pontajDayEntries.$inferSelect;
export type NewPontajDayEntry = typeof pontajDayEntries.$inferInsert;
