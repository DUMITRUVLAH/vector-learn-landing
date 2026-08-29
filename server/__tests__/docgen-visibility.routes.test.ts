/**
 * @vitest-environment node
 *
 * DG-123 — cine vede ce.
 *
 * Contractele cu furnizorii unui proiect conțin sume și rechizite pe care alți donatori nu trebuie
 * să le vadă. Testul se face pe API, nu pe interfață: un utilizator fără acces la proiect trebuie
 * să primească 404 chiar dacă știe id-ul actului — ascunderea butonului nu e o măsură de securitate.
 *
 * Actele FĂRĂ proiect rămân vizibile pentru toți: sunt documente administrative, nu date de donator.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parProjects, parPayers, parProjectMembers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let adminId: string;
let outsiderId: string;
let memberId: string;
let projectAId: string;
let projectBId: string;

/** Cine e „logat" în cererea curentă — schimbat de la test la test. */
let currentUser: { id: string; role: string; name: string } = { id: "", role: "admin", name: "Admin" };

vi.mock("../lib/docmerge/htmlToPdf", () => ({
  htmlToPdfBuffer: async () => new TextEncoder().encode("%PDF-1.4\nx\n%%EOF"),
}));

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { ...currentUser, tenantId, email: "x@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

beforeAll(async () => {
  pglite = new PGlite();
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pglite.exec(stmt);
    }
  }
  testDb = drizzle(pglite, { schema });

  const { docsRoutes } = await import("../routes/docs");
  app = new Hono();
  app.route("/api/docs", docsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-vis" }).returning();
  tenantId = tenant.id;
  const [admin] = await testDb
    .insert(users)
    .values({ tenantId, email: "admin@vector.md", passwordHash: "x", name: "Admin", role: "admin" })
    .returning();
  adminId = admin.id;
  const [member] = await testDb
    .insert(users)
    .values({ tenantId, email: "membru@vector.md", passwordHash: "x", name: "Membru", role: "teacher" })
    .returning();
  memberId = member.id;
  const [outsider] = await testDb
    .insert(users)
    .values({ tenantId, email: "strain@vector.md", passwordHash: "x", name: "Străin", role: "teacher" })
    .returning();
  outsiderId = outsider.id;

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  const [pa] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Proiect A", payerId: payer.id })
    .returning();
  projectAId = pa.id;
  const [pb] = await testDb
    .insert(parProjects)
    .values({ tenantId, name: "Proiect B", payerId: payer.id })
    .returning();
  projectBId = pb.id;

  // Membrul lucrează DOAR pe proiectul A.
  await testDb.insert(parProjectMembers).values({ tenantId, projectId: projectAId, userId: memberId });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

async function createAct(projectId: string | null, title: string) {
  currentUser = { id: adminId, role: "admin", name: "Admin" };
  const res = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title,
      projectId,
      counterparty: { kind: "inline", name: "Furnizor" },
      lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 100000 }],
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

describe("DG-123 — actele unui proiect se văd doar de cine lucrează pe el", () => {
  it("[blocant] cine nu e pe proiect primește 404 pe id direct, nu 200", async () => {
    const actA = await createAct(projectAId, "Act pe proiectul A");

    currentUser = { id: outsiderId, role: "teacher", name: "Străin" };
    const res = await app.request(`/api/docs/documents/${actA}`);
    expect(res.status).toBe(404);

    // Nici PDF-ul nu se poate lua pe id.
    const pdf = await app.request(`/api/docs/documents/${actA}/pdf`);
    expect(pdf.status).toBe(404);
  });

  it("[blocant] lista arată doar actele proiectelor accesibile", async () => {
    await createAct(projectAId, "Act A2");
    await createAct(projectBId, "Act B1");

    currentUser = { id: memberId, role: "teacher", name: "Membru" };
    const list = (await (await app.request("/api/docs/documents")).json()) as { title: string; projectId: string | null }[];
    expect(list.some((d) => d.projectId === projectAId)).toBe(true);
    expect(list.some((d) => d.projectId === projectBId)).toBe(false);
  });

  it("[blocant] actele fără proiect rămân vizibile pentru toți din organizație", async () => {
    const admin = await createAct(null, "Act administrativ");

    currentUser = { id: outsiderId, role: "teacher", name: "Străin" };
    const res = await app.request(`/api/docs/documents/${admin}`);
    expect(res.status).toBe(200);
  });

  it("[blocant] adminul vede tot", async () => {
    currentUser = { id: adminId, role: "admin", name: "Admin" };
    const list = (await (await app.request("/api/docs/documents")).json()) as { projectId: string | null }[];
    expect(list.some((d) => d.projectId === projectAId)).toBe(true);
    expect(list.some((d) => d.projectId === projectBId)).toBe(true);
  });

  it("[blocant] jurnalul consemnează cine a făcut ce, în cuvinte, nu în JSON brut", async () => {
    const id = await createAct(projectAId, "Act cu jurnal");
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });

    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      audit: { action: string; actorUserId: string | null; createdAt: string }[];
    };
    const actions = doc.audit.map((a) => a.action);
    expect(actions).toContain("created");
    expect(actions).toContain("finalized");
    expect(doc.audit.every((a) => !!a.createdAt)).toBe(true);
    expect(doc.audit.some((a) => a.actorUserId === adminId)).toBe(true);
  });
});
