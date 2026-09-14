/**
 * @vitest-environment node
 * DIGESTUL DE TASKURI RESTANTE — INTEGRATION (cerința 18 din caietul de sarcini).
 *
 * Clopoțelul din aplicație presupune că omul E în aplicație. Digestul pe e-mail e pentru cel care
 * n-a intrat de două zile — adică exact pentru cine are taskuri restante.
 *
 * Ce trebuie să fie adevărat ca să nu devină spam: fereastra orară se decide în cod (nu de cron,
 * care lovește în UTC), iar un digest deja trimis oprește al doilea.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads } from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { messages } from "../db/schema/messages";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

/** Nu trimitem e-mailuri reale: reținem ce s-ar fi trimis ȘI scriem în jurnal, ca în producție. */
const sent: Array<{ tenantId: string; to: string; subject: string; body: string }> = [];
vi.mock("../services/messaging/index", () => ({
  MessagingService: class {
    async sendMessage(tenantId: string, msg: { toAddress: string; subject: string; body: string }) {
      sent.push({ tenantId, to: msg.toAddress, subject: msg.subject, body: msg.body });
      await testDb.insert(messages).values({
        tenantId,
        channel: "email",
        toAddress: msg.toAddress,
        subject: msg.subject,
        body: msg.body,
        status: "sent",
      });
    }
  },
}));

let tenantId: string;
let ana: string;
let boris: string;
let plecat: string;

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

/** 08:30, ora Chișinăului — fereastra digestului. */
function inWindow(): Date {
  const d = new Date();
  d.setUTCHours(5, 30, 0, 0); // vara = 08:30 local; iarna = 07:30 — vezi testul dedicat
  return d;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-digest" }).returning();
  tenantId = t.id;
  const mkUser = async (email: string, isActive = true) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: "teacher", isActive })
      .returning();
    return u.id;
  };
  ana = await mkUser("ana@eco.md");
  boris = await mkUser("boris@eco.md");
  plecat = await mkUser("plecat@eco.md", false);

  const [lead] = await testDb
    .insert(leads)
    .values({ tenantId, fullName: "Primăria Ialoveni", stage: "new", source: "manual" })
    .returning();

  const zi = 86_400_000;
  await testDb.insert(crmLeadTasks).values([
    { tenantId, leadId: lead.id, title: "Sună clientul", status: "open", assignedTo: ana, dueAt: new Date(Date.now() - 3 * zi) },
    { tenantId, leadId: lead.id, title: "Trimite oferta", status: "open", assignedTo: ana, dueAt: new Date(Date.now() - zi) },
    // Al lui Boris, dar încheiat — nu are ce căuta în digest.
    { tenantId, leadId: lead.id, title: "Deja făcut", status: "done", assignedTo: boris, dueAt: new Date(Date.now() - 2 * zi) },
    // Scadent mâine: nu e restant.
    { tenantId, leadId: lead.id, title: "De mâine", status: "open", assignedTo: boris, dueAt: new Date(Date.now() + zi) },
    // Al unui cont dezactivat.
    { tenantId, leadId: lead.id, title: "Al celui plecat", status: "open", assignedTo: plecat, dueAt: new Date(Date.now() - 5 * zi) },
    // Fără responsabil: rămâne treaba clopoțelului, n-are cui fi trimis.
    { tenantId, leadId: lead.id, title: "Al nimănui", status: "open", assignedTo: null, dueAt: new Date(Date.now() - 4 * zi) },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(async () => {
  sent.length = 0;
  await testDb.delete(messages);
});

describe("Cine primește digestul", () => {
  it("[blocant] doar cine are taskuri CHIAR restante, și doar ale lui", async () => {
    const { runCrmTaskDigestForTenant } = await import("../services/crm/taskDigest");
    const summary = await runCrmTaskDigestForTenant(tenantId, { force: true });

    expect(summary.emails).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("ana@eco.md");

    // Cele două restante ale ei, cu vechimea lor.
    expect(sent[0].subject).toContain("2 taskuri restante");
    expect(sent[0].body).toContain("Sună clientul");
    expect(sent[0].body).toContain("restant de 3 zile");
    expect(sent[0].body).toContain("Trimite oferta");

    // Nimic din ce nu e restant sau nu e al ei.
    expect(sent[0].body).not.toContain("De mâine");
    expect(sent[0].body).not.toContain("Deja făcut");
    expect(sent[0].body).not.toContain("Al nimănui");
  });

  it("[blocant] contul dezactivat nu mai primește nimic — omul a plecat din firmă", async () => {
    const { runCrmTaskDigestForTenant } = await import("../services/crm/taskDigest");
    await runCrmTaskDigestForTenant(tenantId, { force: true });

    expect(sent.some((s) => s.to === "plecat@eco.md")).toBe(false);
  });
});

describe("Ca să nu devină spam", () => {
  it("[blocant] al doilea digest în aceeași zi nu mai pleacă, oricâte ori ar rula cronul", async () => {
    const { runCrmTaskDigestForTenant } = await import("../services/crm/taskDigest");
    await runCrmTaskDigestForTenant(tenantId, { force: true });
    expect(sent).toHaveLength(1);

    const alDoilea = await runCrmTaskDigestForTenant(tenantId, { force: true });
    expect(alDoilea.emails).toBe(0);
    expect(alDoilea.skipped).toBe(1);
    expect(sent).toHaveLength(1); // tot unul
  });

  it("[blocant] în afara ferestrei orare nu pleacă nimic", async () => {
    const { runCrmTaskDigestForTenant } = await import("../services/crm/taskDigest");
    const laPranz = new Date();
    laPranz.setUTCHours(12, 0, 0, 0);

    const summary = await runCrmTaskDigestForTenant(tenantId, { now: laPranz });

    expect(summary.emails).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("Fereastra orară", () => {
  it("[normal] se decide pe ora LOCALĂ, nu pe UTC — altfel ora de iarnă mută digestul", async () => {
    const { inDigestWindow, localHour } = await import("../services/crm/taskDigest");

    // 1 iulie, 05:30 UTC = 08:30 la Chișinău (UTC+3, ora de vară).
    const vara = new Date("2026-07-01T05:30:00.000Z");
    expect(localHour(vara)).toBe(8);
    expect(inDigestWindow(vara)).toBe(true);

    // 1 ianuarie, 05:30 UTC = 07:30 la Chișinău (UTC+2). NU e fereastra.
    const iarna = new Date("2026-01-01T05:30:00.000Z");
    expect(localHour(iarna)).toBe(7);
    expect(inDigestWindow(iarna)).toBe(false);

    // 1 ianuarie, 06:30 UTC = 08:30 local — aceeași oră locală, altă oră UTC.
    expect(inDigestWindow(new Date("2026-01-01T06:30:00.000Z"))).toBe(true);
  });

  it("[normal] vechimea se numără în zile întregi, de la miezul nopții", async () => {
    const { overdueDays } = await import("../services/crm/taskDigest");
    const acum = new Date("2026-09-14T10:00:00");

    expect(overdueDays(new Date("2026-09-14T08:00:00"), acum)).toBe(0); // scadent azi
    expect(overdueDays(new Date("2026-09-13T23:00:00"), acum)).toBe(1); // ieri, chiar dacă sunt 11 ore
    expect(overdueDays(new Date("2026-09-11T10:00:00"), acum)).toBe(3);
  });
});
