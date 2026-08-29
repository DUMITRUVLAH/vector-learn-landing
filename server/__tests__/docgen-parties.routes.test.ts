/**
 * @vitest-environment node
 *
 * Cerință owner — furnizorii se adună de peste tot.
 *
 * În practică, jumătate dintre cei plătiți n-au ajuns niciodată în registru: au fost tastați o
 * dată, pe o cerere de plată, și acolo au rămas. Când faci actul pentru ei, îi cauți și „nu
 * există", deși organizația i-a plătit de trei ori. Căutarea privește acum în ambele locuri, iar
 * un buton îi aduce pe toți în registru — idempotent, ca a doua apăsare să nu creeze dubluri.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors, parRequests } from "../db/schema/par";

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

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-parties" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@vector.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;

  // Unul în registru…
  await testDb
    .insert(parVendors)
    .values({ tenantId, name: "SRL În Registru", idnp: "1111111111111", iban: "MD48ML000002259A19498121" });

  // …și doi care există DOAR pe cereri de plată (unul repetat, ca în viața reală).
  for (const [no, name, idno, iban] of [
    ["PAR-2026-0001", "II Plătit Cândva", "2222222222222", "MD24AG000225100013104168"],
    ["PAR-2026-0002", "II Plătit Cândva", "2222222222222", "MD24AG000225100013104168"],
    ["PAR-2026-0003", "SRL Doar Pe Cerere", "3333333333333", "MD11AG000000000000000000"],
  ] as const) {
    await testDb.insert(parRequests).values({
      tenantId,
      requestNo: no,
      requestedByUserId: userId,
      payeeName: name,
      payeeIdnp: idno,
      payeeIban: iban,
      payeeBank: "MAIB",
      currency: "MDL",
      status: "paid",
    });
  }
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("Furnizorii se caută în registru ȘI în cereri", () => {
  it("[blocant] căutarea îl găsește pe cel care există doar pe o cerere de plată", async () => {
    const res = await app.request("/api/docs/parties?q=Plătit");
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as {
      items: { name: string; source: string; iban: string | null }[];
    };
    const found = items.find((i) => i.name === "II Plătit Cândva");
    expect(found, "beneficiarul plătit de două ori trebuie găsit").toBeTruthy();
    expect(found!.source).toBe("par");
    expect(found!.iban).toBe("MD24AG000225100013104168");
  });

  it("[blocant] cel care apare pe mai multe cereri nu se dublează în listă", async () => {
    const { items } = (await (await app.request("/api/docs/parties")).json()) as {
      items: { name: string }[];
    };
    expect(items.filter((i) => i.name === "II Plătit Cândva")).toHaveLength(1);
  });

  it("[blocant] importul aduce în registru doar ce lipsea, și e idempotent", async () => {
    const first = (await (
      await app.request("/api/docs/parties/import-from-par", { method: "POST" })
    ).json()) as { imported: number };
    expect(first.imported).toBe(2); // cei doi de pe cereri; cel din registru nu se dublează

    const vendors = await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantId));
    expect(vendors).toHaveLength(3);
    expect(vendors.find((v) => v.name === "II Plătit Cândva")?.iban).toBe(
      "MD24AG000225100013104168"
    );

    const second = (await (
      await app.request("/api/docs/parties/import-from-par", { method: "POST" })
    ).json()) as { imported: number };
    expect(second.imported, "a doua apăsare nu mai are ce aduce").toBe(0);
    expect(
      (await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantId))).length
    ).toBe(3);
  });

  it("[blocant] furnizorii altei organizații nu apar în căutare", async () => {
    const [other] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-parties" }).returning();
    await testDb.insert(parVendors).values({ tenantId: other.id, name: "SRL Străină", idnp: "9999999999999" });

    const { items } = (await (await app.request("/api/docs/parties?q=Străin")).json()) as {
      items: { name: string }[];
    };
    expect(items.some((i) => i.name === "SRL Străină")).toBe(false);
  });
});
