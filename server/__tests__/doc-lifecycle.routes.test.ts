/**
 * @vitest-environment node
 * CICLUL DE VIAȚĂ AL ACTULUI — INTEGRATION (cerințele 42 și 45 din caietul de sarcini Ecosolar).
 *
 * Interfața avea de mult etichete pentru „Trimis", „Semnat" și „Refuzat", dar nimic nu le scria:
 * motorul cunoștea doar ciornă → finalizat → anulat. Adică nimeni nu putea răspunde la întrebarea
 * de bază a unei vânzări — „a acceptat clientul oferta?".
 *
 * Împărțirea testată aici: „trimis" îl știe sistemul (a plecat e-mailul), „semnat"/„refuzat" le
 * marchează omul, fiindcă numai el a vorbit cu clientul.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { docDocuments, docAudit } from "../db/schema/docs";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
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
let userId: string;
let docId: string;

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

async function outcome(id: string, body: Record<string, unknown>) {
  const res = await app.request(`/api/docs/documents/${id}/outcome`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { docsRoutes } = await import("../routes/docs");
  app = new Hono();
  app.route("/api/docs", docsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-doc" }).returning();
  tenantId = t.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;
  session = { id: userId, tenantId, role: "admin", email: "ana@eco.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  await testDb.delete(docAudit);
  await testDb.delete(docDocuments);
  const [doc] = await testDb
    .insert(docDocuments)
    .values({
      tenantId,
      kind: "oferta_comerciala",
      title: "Ofertă panouri 50 kW",
      status: "final",
      createdByUserId: userId,
    })
    .returning();
  docId = doc.id;
});

describe("Ce a răspuns clientul", () => {
  it("[blocant] „semnat” se marchează manual și lasă urmă în jurnalul actului", async () => {
    const res = await outcome(docId, { status: "signed" });

    expect(res.status).toBe(200);
    const [after] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, docId));
    expect(after.status).toBe("signed");
    expect(after.outcomeAt).not.toBeNull();

    const audit = await testDb.select().from(docAudit).where(eq(docAudit.documentId, docId));
    expect(audit.some((a) => a.action === "status:signed")).toBe(true);
  });

  it("[blocant] refuzul FĂRĂ motiv e respins — altfel raportul nu poate spune de ce pierdem", async () => {
    const res = await outcome(docId, { status: "rejected" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("reason_required");

    const [after] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, docId));
    expect(after.status).toBe("final"); // neatins
  });

  it("[blocant] refuzul cu motiv se scrie, iar motivul rămâne pe act", async () => {
    const res = await outcome(docId, { status: "rejected", reason: "Preț peste buget" });

    expect(res.status).toBe(200);
    const [after] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, docId));
    expect(after.status).toBe("rejected");
    expect(after.outcomeReason).toBe("Preț peste buget");
  });

  it("[blocant] o CIORNĂ nu poate fi semnată — n-a ajuns la nimeni", async () => {
    await testDb.update(docDocuments).set({ status: "draft" }).where(eq(docDocuments.id, docId));

    const res = await outcome(docId, { status: "signed" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("document_not_final");
  });

  it("[blocant] un act anulat nu se mai semnează", async () => {
    await testDb.update(docDocuments).set({ status: "cancelled" }).where(eq(docDocuments.id, docId));

    const res = await outcome(docId, { status: "signed" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("document_cancelled");
  });

  it("[blocant] actul altui workspace → 404", async () => {
    const [alt] = await testDb.insert(tenants).values({ name: "Altul", slug: "alt-doc" }).returning();
    const [strain] = await testDb
      .insert(docDocuments)
      .values({ tenantId: alt.id, kind: "oferta_comerciala", title: "Al altcuiva", status: "final" })
      .returning();

    const res = await outcome(strain.id, { status: "signed" });
    expect(res.status).toBe(404);
  });

  it("[normal] „semnat” după „trimis” merge — asta e chiar drumul normal", async () => {
    await testDb.update(docDocuments).set({ status: "sent", sentAt: new Date() }).where(eq(docDocuments.id, docId));

    const res = await outcome(docId, { status: "signed" });
    expect(res.status).toBe(200);
    const [after] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, docId));
    expect(after.status).toBe("signed");
    // Data trimiterii NU se pierde: ea spune cât a durat decizia clientului.
    expect(after.sentAt).not.toBeNull();
  });
});
