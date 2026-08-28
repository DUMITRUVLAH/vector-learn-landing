/**
 * @vitest-environment node
 *
 * Organizația plătitoare are identitate completă — și sunt mai multe pe același workspace.
 *
 * De ce există testul: datele de identitate (denumire juridică, IDNO, cod TVA, adresă,
 * rechizite bancare, semnatar) stăteau în `par_settings`, care e UNA pe tenant. Un client cu
 * două entități care plătesc nu le putea descrie separat. Acum stau pe fiecare `par_payers`.
 *
 * CLAUDE.md §3.5.1quater: rutele sunt CHEMATE cu date realiste, nu doar montate — POST creează,
 * GET întoarce câmpurile, iar PATCH-ul parțial NU are voie să șteargă ce nu i s-a trimis.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let userA: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  getSessionUser: vi.fn(async (token: string) => {
    if (token !== "a") return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, userA) });
    return user ? { session: { id: "s" }, user } : null;
  }),
}));

import { parPayersRoutes } from "../routes/parPayers";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/par/payers", parPayersRoutes);

interface PayerRow {
  id: string;
  name: string;
  legalName: string | null;
  idno: string | null;
  vatCode: string | null;
  address: string | null;
  bankName: string | null;
  iban: string | null;
  bankCode: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  directorName: string | null;
  directorRole: string | null;
  logoUrl: string | null;
  notes: string | null;
  active: boolean;
}

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const post = (p: string, body: unknown) =>
  app.request(p, {
    method: "POST",
    headers: { cookie: "vl_session=a", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (p: string, body: unknown) =>
  app.request(p, {
    method: "PATCH",
    headers: { cookie: "vl_session=a", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (p: string) => app.request(p, { headers: { cookie: "vl_session=a" } });

const ATIC = {
  name: "ATIC",
  legal_name: "Asociația Națională a Companiilor din Domeniul TIC",
  idno: "1012620008289",
  vat_code: "0301234",
  address: "str. Maria Cebotari 37, mun. Chișinău, MD-2012",
  bank_name: 'BC "MAIB" S.A.',
  iban: "MD24AG000225100013104168",
  bank_code: "AGRNMD2X885",
  contact_email: "contabilitate@atic.md",
  contact_phone: "+373 22 000 000",
  director_name: "Ana Popescu",
  director_role: "Director executiv",
  logo_url: "https://exemplu.md/logo.png",
  notes: "Entitatea principală.",
};

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [t] = await testDb
    .insert(tenants)
    .values({ name: "ONG A", slug: "ong-a", plan: "starter", appKind: "business" })
    .returning();
  tenantA = t.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "a@ong.md", passwordHash: "x", name: "A", role: "admin" })
    .returning();
  userA = u.id;
}, 90_000);

afterAll(async () => {
  await pglite.close();
});

describe("Organizații plătitoare — identitate completă", () => {
  let aticId = "";

  it("POST salvează toate datele organizației, nu doar denumirea", async () => {
    const res = await post("/api/par/payers", ATIC);
    expect(res.status).toBe(201);
    const row = (await res.json()) as PayerRow;
    aticId = row.id;

    expect(row.legalName).toBe(ATIC.legal_name);
    expect(row.idno).toBe(ATIC.idno);
    expect(row.vatCode).toBe(ATIC.vat_code);
    expect(row.address).toBe(ATIC.address);
    expect(row.bankName).toBe(ATIC.bank_name);
    expect(row.iban).toBe(ATIC.iban);
    expect(row.bankCode).toBe(ATIC.bank_code);
    expect(row.contactEmail).toBe(ATIC.contact_email);
    expect(row.contactPhone).toBe(ATIC.contact_phone);
    expect(row.directorName).toBe(ATIC.director_name);
    expect(row.directorRole).toBe(ATIC.director_role);
    expect(row.logoUrl).toBe(ATIC.logo_url);
    expect(row.notes).toBe(ATIC.notes);
    expect(row.active).toBe(true);
  });

  it("mai multe organizații coexistă pe același workspace, fiecare cu rechizitele ei", async () => {
    const res = await post("/api/par/payers", {
      name: "Fundația Vector",
      legal_name: "A.O. Fundația Vector",
      idno: "1015600001234",
      iban: "MD03AG000000022512323419",
      bank_name: 'BC "Victoriabank" S.A.',
    });
    expect(res.status).toBe(201);

    const list = await get("/api/par/payers");
    expect(list.status).toBe(200);
    const { payers } = (await list.json()) as { payers: PayerRow[] };
    expect(payers).toHaveLength(2);

    const atic = payers.find((p) => p.name === "ATIC");
    const fundatia = payers.find((p) => p.name === "Fundația Vector");
    expect(atic?.iban).toBe(ATIC.iban);
    expect(fundatia?.iban).toBe("MD03AG000000022512323419");
    // Rechizitele nu se amestecă între entități.
    expect(fundatia?.bankCode).toBeNull();
    expect(fundatia?.address).toBeNull();
  });

  it("PATCH parțial nu șterge câmpurile pe care nu le-a trimis", async () => {
    const res = await patch(`/api/par/payers/${aticId}`, { director_name: "Ion Rusu" });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PayerRow;

    expect(row.directorName).toBe("Ion Rusu");
    // Aici ar fi picat o implementare care rescrie tot obiectul: restul rămâne intact.
    expect(row.iban).toBe(ATIC.iban);
    expect(row.idno).toBe(ATIC.idno);
    expect(row.address).toBe(ATIC.address);
    expect(row.directorRole).toBe(ATIC.director_role);
  });

  it("un câmp golit explicit se salvează ca gol, nu ca șir vid", async () => {
    const res = await patch(`/api/par/payers/${aticId}`, { vat_code: "", contact_phone: "  " });
    expect(res.status).toBe(200);
    const row = (await res.json()) as PayerRow;
    expect(row.vatCode).toBeNull();
    expect(row.contactPhone).toBeNull();
    expect(row.idno).toBe(ATIC.idno);
  });
});
