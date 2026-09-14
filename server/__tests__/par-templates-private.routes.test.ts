/**
 * @vitest-environment node
 * ȘABLOANELE SUNT PRIVATE — INTEGRATION (ruta reală, PGlite, toate migrările).
 *
 * Reclamația clientei (WhatsApp, 2026-09): „se pare că pot vedea și șabloanele colegilor pe lângă
 * cele create de mine". Lista de la /api/par/templates întorcea șabloanele întregului workspace —
 * apoi, după auditul din 2026-08-29, pe cele din aria ei de proiect plus TOT pentru rolurile fără
 * arie. Un șablon poartă în snapshot beneficiarul cu IBAN/IDNP și suma, deci nu e conținut de
 * echipă. Regula de acum: fiecare își vede și își instanțiază DOAR propriile șabloane.
 *
 * Se testează ACȚIUNEA (endpoint-ul e chiar apelat), nu forma unei funcții.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parTemplates,
  parRequests,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
  parProjects,
  parProjectMembers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

/** Sesiunea curentă — fiecare test o comută pe omul care deschide ecranul. */
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

let tenantId: string;
/** Ana și Boris sunt colegi pe ACELAȘI proiect — cazul din reclamație. */
let ana: string;
let boris: string;
let adminTenant: string;
let sablonAna: string;
let sablonBoris: string;

interface TemplateRow {
  id: string;
  name: string;
  createdByUserId: string | null;
}

async function listTemplates(): Promise<{ status: number; templates: TemplateRow[] }> {
  const res = await app.request("/api/par/templates");
  const body = (await res.json()) as { templates?: TemplateRow[] };
  return { status: res.status, templates: body.templates ?? [] };
}

async function instantiate(id: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(`/api/par/templates/${id}/instantiate`, { method: "POST" });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

/** Snapshotul unui șablon, cu exact ce nu trebuie să ajungă la colegi. */
function snapshot(projectId: string, payeeName: string, iban: string) {
  return JSON.stringify({
    requestorTitle: null,
    departmentId: null,
    projectId,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Servicii",
    vendorId: null,
    payeeName,
    payeeIdnp: "2001234567890",
    payeeIban: iban,
    payeeBank: "MAIB",
    lineItems: [
      { position: 1, description: "Serviciu", quantity: 1, unit: null, unitPriceCents: 50000, lineTotalCents: 50000 },
    ],
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parTemplatesRoutes } = await import("../routes/parTemplates");
  app = new Hono();
  app.route("/api/par/templates", parTemplatesRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-sabloane" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });
  const [project] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Proiect comun", payerId: payer.id, active: true })
    .returning();

  const mkUser = async (email: string, name: string, role: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role })
      .returning();
    return u.id;
  };

  ana = await mkUser("ana@atic.md", "Ana", "teacher");
  boris = await mkUser("boris@atic.md", "Boris", "teacher");
  adminTenant = await mkUser("admin@atic.md", "Admin", "admin");

  // Amândoi au rol PAR și sunt alocați pe ACELAȘI proiect și plătitor: aria de acces coincide,
  // deci filtrarea pe arie nu i-ar fi despărțit.
  for (const userId of [ana, boris]) {
    await testDb.insert(parMembers).values({ tenantId, userId, role: "requestor" });
    await testDb.insert(parProjectMembers).values({ tenantId, projectId: project.id, userId });
    await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId });
  }

  const [tAna] = await testDb
    .insert(parTemplates)
    .values({
      tenantId,
      name: "Suplinire card ATIC",
      createdByUserId: ana,
      snapshot: snapshot(project.id, "Ana Popescu", "MD24AG000225100013104168"),
    })
    .returning();
  sablonAna = tAna.id;

  const [tBoris] = await testDb
    .insert(parTemplates)
    .values({
      tenantId,
      name: "Servicii Video Bulbas",
      createdByUserId: boris,
      snapshot: snapshot(project.id, "Boris Bulbas", "MD88AG000225100099887766"),
    })
    .returning();
  sablonBoris = tBoris.id;

  session = { id: ana, tenantId, role: "teacher", email: "ana@atic.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/par/templates — fiecare își vede doar șabloanele lui", () => {
  it("[blocant] Ana vede doar șablonul ei, nu și pe al lui Boris (reclamația din WhatsApp)", async () => {
    session = { id: ana, tenantId, role: "teacher", email: "ana@atic.md" };
    const { status, templates } = await listTemplates();

    expect(status).toBe(200);
    expect(templates.map((t) => t.name)).toEqual(["Suplinire card ATIC"]);
    expect(templates.every((t) => t.createdByUserId === ana)).toBe(true);
  });

  it("[blocant] nici IBAN-ul din snapshotul colegului nu pleacă pe fir", async () => {
    session = { id: ana, tenantId, role: "teacher", email: "ana@atic.md" };
    const res = await app.request("/api/par/templates");
    const raw = await res.text();

    expect(raw).not.toContain("MD88AG000225100099887766");
    expect(raw).not.toContain("Boris Bulbas");
  });

  it("[blocant] același proiect nu mai e o poartă deschisă — Boris vede doar ce a salvat el", async () => {
    session = { id: boris, tenantId, role: "teacher", email: "boris@atic.md" };
    const { templates } = await listTemplates();

    expect(templates.map((t) => t.name)).toEqual(["Servicii Video Bulbas"]);
  });

  it("[blocant] nici par_admin-ul (admin de tenant) nu vede șabloanele altora", async () => {
    session = { id: adminTenant, tenantId, role: "admin", email: "admin@atic.md" };
    const { templates } = await listTemplates();

    expect(templates).toHaveLength(0);
  });
});

describe("POST /api/par/templates/:id/instantiate — doar șablonul propriu", () => {
  it("[blocant] Ana nu poate instanția șablonul lui Boris, nici cu id-ul în mână", async () => {
    session = { id: ana, tenantId, role: "teacher", email: "ana@atic.md" };
    const inainte = await testDb.select().from(parRequests);

    const { status, body } = await instantiate(sablonBoris);

    expect(status).toBe(404); // NU 403 — nu confirmăm existența șablonului altui om
    expect(body.error).toBe("not_found");
    const dupa = await testDb.select().from(parRequests);
    expect(dupa).toHaveLength(inainte.length); // nicio ciornă cu beneficiarul lui Boris
  });

  it("[normal] pe șablonul propriu instanțierea merge mai departe", async () => {
    session = { id: ana, tenantId, role: "teacher", email: "ana@atic.md" };
    const { status, body } = await instantiate(sablonAna);

    expect(status).toBe(201);
    const par = body.par as { requestedByUserId: string; payeeIban: string };
    expect(par.requestedByUserId).toBe(ana);
    expect(par.payeeIban).toBe("MD24AG000225100013104168");
  });
});
