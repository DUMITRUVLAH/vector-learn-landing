/**
 * @vitest-environment node
 *
 * DG-104 — curățarea trebuie să se întâmple pe DRUMUL REAL al salvării, nu doar în funcția pură.
 * Testul apelează chiar endpoint-ul de șabloane cu un corp otrăvit și verifică ce a rămas ÎN BAZĂ:
 * dacă cineva scoate apelul din rută, testul unitar al sanitizer-ului ar rămâne verde degeaba.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "ana@vector.md" });
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

  const { docmergeTemplatesRoutes } = await import("../routes/docmergeTemplates");
  app = new Hono();
  app.route("/api/docmerge", docmergeTemplatesRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-tpl" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "manager" })
    .returning();
  userId = u.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

const POISONED = `<h1>ACT</h1><script>fetch("/api/steal")</script><p onclick="alert(1)">Predător: {{noi.denumire}}</p><a href="javascript:alert(1)">x</a>`;

describe("DG-104 — un șablon otrăvit nu ajunge în bază", () => {
  it("[blocant] POST salvează corpul curățat, nu cel trimis", async () => {
    const res = await app.request("/api/docmerge/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Act", bodyHtml: POISONED, kind: "act_primire_predare" }),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const [row] = await testDb
      .select()
      .from(docmergeTemplates)
      .where(eq(docmergeTemplates.id, id));

    expect(row.bodyHtml).not.toContain("<script");
    expect(row.bodyHtml).not.toContain("onclick");
    expect(row.bodyHtml).not.toContain("javascript:");
    // Textul actului și câmpurile rămân întregi — curățarea nu are voie să mutileze șablonul.
    expect(row.bodyHtml).toContain("<h1>ACT</h1>");
    expect(row.bodyHtml).toContain("{{noi.denumire}}");
    expect(row.kind).toBe("act_primire_predare");
  });

  it("[blocant] PUT curăță la fel — nu doar la creare", async () => {
    const created = await app.request("/api/docmerge/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Curat", bodyHtml: "<p>ok</p>" }),
    });
    const { id } = (await created.json()) as { id: string };

    const res = await app.request(`/api/docmerge/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bodyHtml: POISONED }),
    });
    expect(res.status).toBe(200);

    const [row] = await testDb
      .select()
      .from(docmergeTemplates)
      .where(eq(docmergeTemplates.id, id));
    expect(row.bodyHtml).not.toContain("<script");
    expect(row.bodyHtml).not.toContain("onclick");
  });

  it("[blocant] câmpurile detectate includ numele grupate pe sursă", async () => {
    const res = await app.request("/api/docmerge/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cu câmpuri",
        bodyHtml: "<p>{{contraparte.iban}} · {{noi.idno}}</p>",
      }),
    });
    const body = (await res.json()) as { placeholders: string[] };
    expect(body.placeholders).toEqual(["contraparte.iban", "noi.idno"]);
  });
});
