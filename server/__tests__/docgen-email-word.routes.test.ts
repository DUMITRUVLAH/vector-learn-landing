/**
 * @vitest-environment node
 *
 * DG-115 — trimiterea actului și exportul pentru Word.
 *
 * Regula de aur pe care o apără primul test: în afara producției NU pleacă e-mailuri reale, iar
 * adresele demo sunt blocate oriunde. Motivul e scris cu sânge în CLAUDE.md §3.5.1 — o măturare
 * e2e a trimis odată mail real pe tenantul demo, care a făcut bounce și a ars reputația
 * expeditorului. Nicio comoditate nu justifică repetarea.
 *
 * Al doilea lucru testat: jurnalul consemnează ÎNCERCAREA, nu doar succesul. „Am trimis actul?"
 * trebuie să aibă răspuns și când livrarea a fost oprită de politica de mediu.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let vendorId: string;

const fetchSpy = vi.fn();

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
    c.set("user", { id: userId, tenantId, role: "admin", email: "ana@vector.md", name: "Ana" });
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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-mail" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;
  const [v] = await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL Alfa", idnp: "1111111111111", iban: "MD48ML000002259A19498121" })
    .returning();
  vendorId = v.id;

  vi.stubGlobal("fetch", fetchSpy);
  process.env.RESEND_API_KEY = "test-key";
}, 240_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  await pglite.close();
});

async function finalizedDoc() {
  const created = await app.request("/api/docs/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "act_primire_predare",
      title: "Act de primire-predare",
      counterparty: { kind: "vendor", id: vendorId },
      lines: [{ description: "Laptop", quantity: 1, unitPriceCents: 100000 }],
    }),
  });
  const { id } = (await created.json()) as { id: string };
  await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
  await app.request(`/api/docs/documents/${id}/pdf`);
  return id;
}

describe("DG-115 — trimiterea actului", () => {
  it("[blocant] actul fără PDF descărcat pleacă totuși cu atașament — se generează la trimitere", async () => {
    // Istoric: owner-ul a primit „s-a dus email, dar fără act", pentru că PDF-ul exista doar dacă
    // cineva îl descărcase din browser. DC-102 îl scrie pe server, deci trimiterea nu mai depinde
    // de un pas manual — dar atașamentul trebuie să existe, altfel textul minte iar.
    const created = await app.request("/api/docs/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "act_primire_predare",
        title: "Act fără PDF descărcat",
        counterparty: { kind: "vendor", id: vendorId },
        lines: [{ description: "Serviciu", quantity: 1, unitPriceCents: 100000 }],
      }),
    });
    const { id } = (await created.json()) as { id: string };
    await app.request(`/api/docs/documents/${id}/finalize`, { method: "POST" });
    // NU descărcăm PDF-ul: exact situația în care e-mailul pleca gol.

    fetchSpy.mockClear();
    const res = await app.request(`/api/docs/documents/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "furnizor@example.com" }),
    });
    const body = (await res.json()) as { sent: boolean; reason?: string };
    expect(body.reason).not.toBe("no_pdf");

    // Și, mai important: actul are acum PDF păstrat, deci ZIP-ul și atașamentul la cererea de
    // plată văd același fișier.
    const [stored] = await testDb
      .select()
      .from(schema.docDocuments)
      .where(eq(schema.docDocuments.id, id));
    expect(stored.pdfUrl ?? "").toMatch(/^data:application\/pdf;base64,/);
    expect(Buffer.from((stored.pdfUrl ?? "").split(",")[1] ?? "", "base64").subarray(0, 5).toString("latin1")).toBe(
      "%PDF-"
    );
  });

  it("[blocant] în afara producției NU pleacă niciun e-mail real", async () => {
    fetchSpy.mockClear();
    const id = await finalizedDoc();

    const res = await app.request(`/api/docs/documents/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "furnizor@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: boolean; reason: string; message: string };
    expect(body.sent).toBe(false);
    expect(fetchSpy, "niciun apel către serviciul de e-mail").not.toHaveBeenCalled();
    // Mesajul explică omenește de ce, nu întoarce un cod sec.
    expect(body.message).toMatch(/nu trimite e-mailuri reale|blocată/i);
  });

  it("[blocant] adresa nevalidă e refuzată înainte de orice", async () => {
    const id = await finalizedDoc();
    const res = await app.request(`/api/docs/documents/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "nu-e-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("[blocant] încercarea rămâne în jurnal, chiar dacă livrarea a fost oprită", async () => {
    const id = await finalizedDoc();
    await app.request(`/api/docs/documents/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "furnizor@example.com" }),
    });

    const doc = (await (await app.request(`/api/docs/documents/${id}`)).json()) as {
      audit: { action: string; details: Record<string, unknown> }[];
    };
    const emailed = doc.audit.find((a) => a.action === "emailed");
    expect(emailed).toBeTruthy();
    expect(emailed!.details.to).toBe("furnizor@example.com");
    expect(emailed!.details.sent).toBe(false);
  });
});

describe("DG-115 — exportul pentru Word", () => {
  it("[blocant] se descarcă un fișier Word cu conținutul actului", async () => {
    const id = await finalizedDoc();
    const res = await app.request(`/api/docs/documents/${id}/word`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("msword");
    expect(res.headers.get("Content-Disposition")).toMatch(/\.doc"$/);

    const html = await res.text();
    expect(html).toContain("Act de primire-predare");
    expect(html).toContain("MD48ML000002259A19498121");
  });

  it("[blocant] actul altui tenant nu se exportă", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-mail" }).returning();
    const [foreign] = await testDb
      .insert(schema.docDocuments)
      .values({ tenantId: other.id, title: "Act străin", kind: "act_primire_predare" })
      .returning();

    expect((await app.request(`/api/docs/documents/${foreign.id}/word`)).status).toBe(404);
    expect(
      (
        await app.request(`/api/docs/documents/${foreign.id}/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: "x@example.com" }),
        })
      ).status
    ).toBe(404);
  });
});
