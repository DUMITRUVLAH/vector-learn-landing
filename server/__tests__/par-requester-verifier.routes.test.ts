/**
 * @vitest-environment node
 *
 * Verificatorul solicitantului, capăt la capăt: PGlite, toate migrările, rutele reale.
 *
 * Cazul owner-ului (23.09.2026, ATIC): „Iulian m-a rugat ca mereu să aprobe de la colegele sale
 * Cristina Onicov și Marina Certan PAR-urile înainte să ajungă la aprobatori, și el să le poată
 * modifica sau întoarce — singur să schimbe budget line și alte modificări — și deja mai departe
 * se duc la aprobatorii workspace-ului."
 *
 * Configurația e cea de pe producție: toți sunt membri ai plătitorului ATIC (fără apartenență pe
 * proiect), Iulian și Cristina au doar rolul de solicitant, iar matricea DOA are Ana și Irina, pe
 * nume, pe același pas. Testul acționează rutele — nu verifică doar că un buton ar exista.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, asc, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parApprovals,
  parAttachments,
  parAudit,
  parBudgetCodes,
  parDoaMatrix,
  parEvents,
  parLineItems,
  parMemberProfiles,
  parMembers,
  parPayerMembers,
  parPayerModules,
  parPayers,
  parProjects,
  parRequests,
} from "../db/schema/par";
import { VERIFIER_LABEL } from "../lib/par/requesterVerifier";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let caller: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", caller);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let loadParFormData: typeof import("../lib/par/parFormData")["loadParFormData"];
let tenantId: string;
let payerId: string;
let led3: string;
let otherProject: string;
let bcDeplasari: string;
let bcMateriale: string;
let bcOtherProject: string;
let evAtelier: string;
let evOtherProject: string;

type U = { id: string; role: string };
let admin: U;
let iulian: U;
let cristina: U;
let marina: U;
let sirbu: U;
let ana: U;
let irina: U;
let outsider: U;

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

const as = (u: U) => {
  caller = { id: u.id, tenantId, role: u.role, email: `${u.id}@ict.md` };
};

async function call(u: U, method: string, url: string, body?: unknown) {
  as(u);
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* corp gol */
  }
  return { status: res.status, json };
}

let seq = 700;
/** O ciornă completă pe LED 3, gata de trimis — linia de buget greșită, ca în viața reală. */
async function draft(author: U, opts: { payerLevel?: boolean } = {}): Promise<string> {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId,
      // O cerere doar pe plătitor (fără proiect) nu intră sub regula „colegi de proiect".
      projectId: opts.payerLevel ? null : led3,
      budgetCodeId: opts.payerLevel ? null : bcDeplasari,
      requestNo: `PAR-2026-0${seq++}`,
      requestedByUserId: author.id,
      purpose: "execute_payment",
      chargeTo: "program",
      endUse: "Materiale pentru atelierul de robotică",
      payeeName: "Robotics Supply SRL",
      payeeIban: "MD24AG000225100013104168",
      currency: "MDL",
      totalEstimatedCents: 340090,
      status: "draft",
    })
    .returning();
  await testDb.insert(parLineItems).values({
    tenantId,
    parId: par.id,
    position: 1,
    description: "Kituri Arduino",
    quantity: "10",
    unitPriceCents: 34009,
    lineTotalCents: 340090,
  });
  return par.id;
}

async function submitted(author: U, opts: { payerLevel?: boolean } = {}): Promise<string> {
  const parId = await draft(author, opts);
  const res = await call(author, "POST", `/api/par/${parId}/submit`);
  expect(res.status, JSON.stringify(res.json)).toBe(200);
  return parId;
}

const chainOf = async (parId: string) =>
  testDb
    .select({
      step: parApprovals.step,
      approverUserId: parApprovals.approverUserId,
      approverRoleLabel: parApprovals.approverRoleLabel,
      decision: parApprovals.decision,
      locked: parApprovals.locked,
    })
    .from(parApprovals)
    .where(and(eq(parApprovals.parId, parId), eq(parApprovals.tenantId, tenantId)))
    .orderBy(asc(parApprovals.step));

const rowOf = async (parId: string) => (await testDb.select().from(parRequests).where(eq(parRequests.id, parId)))[0];

async function setVerifier(requester: U, verifier: U | null) {
  return call(admin, "PATCH", `/api/par/profiles/${requester.id}`, { verifier_user_id: verifier?.id ?? null });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  // Aceeași ordine de montare ca `server/app.ts` — rutele cu prefix fix înaintea celor `/:id`.
  const [{ parMeRoutes }, { parProfilesRoutes }, { parApprovalsRoutes }, { parRoutes }, { parAttachmentsRoutes }] = await Promise.all([
    import("../routes/parMe"),
    import("../routes/parProfiles"),
    import("../routes/parApprovals"),
    import("../routes/par"),
    import("../routes/parAttachments"),
  ]);
  ({ loadParFormData } = await import("../lib/par/parFormData"));
  app = new Hono();
  app.route("/api/par/me", parMeRoutes);
  app.route("/api/par/profiles", parProfilesRoutes);
  app.route("/api/par", parApprovalsRoutes);
  app.route("/api/par", parRoutes);
  app.route("/api/par", parAttachmentsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-requester-verifier" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const [p1] = await testDb.insert(parProjects).values({ tenantId, payerId, name: "LED 3/Youth Maker club" }).returning();
  led3 = p1.id;
  const [p2] = await testDb.insert(parProjects).values({ tenantId, payerId, name: "EBRD" }).returning();
  otherProject = p2.id;

  const [b1] = await testDb.insert(parBudgetCodes).values({ tenantId, payerId, projectId: led3, code: "2.1", name: "Deplasări" }).returning();
  bcDeplasari = b1.id;
  const [b2] = await testDb.insert(parBudgetCodes).values({ tenantId, payerId, projectId: led3, code: "3.4", name: "Materiale atelier" }).returning();
  bcMateriale = b2.id;
  const [b3] = await testDb.insert(parBudgetCodes).values({ tenantId, payerId, projectId: otherProject, code: "9.9", name: "Alt proiect" }).returning();
  bcOtherProject = b3.id;
  const [e1] = await testDb.insert(parEvents).values({ tenantId, projectId: led3, name: "Atelier robotică" }).returning();
  evAtelier = e1.id;
  const [e2] = await testDb.insert(parEvents).values({ tenantId, projectId: otherProject, name: "Conferință EBRD" }).returning();
  evOtherProject = e2.id;

  const mkUser = async (email: string, name: string, role: "manager" | "teacher"): Promise<U> => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return { id: u.id, role };
  };
  admin = await mkUser("violeta@atic.md", "Violeta", "manager");
  iulian = await mkUser("ilungu@ict.md", "Iulian Lungu", "teacher");
  cristina = await mkUser("cristina.onicov@ict.md", "Cristina Onicov-Beselea", "teacher");
  marina = await mkUser("mcertan@ict.md", "Marina Certan", "teacher");
  sirbu = await mkUser("csirbu@ict.md", "Cristina Sirbu", "teacher");
  ana = await mkUser("achirita@ict.md", "Ana Chirita", "teacher");
  irina = await mkUser("ioriol@ict.md", "Irina Oriol", "teacher");
  outsider = await mkUser("extern@ict.md", "Fără Rol PAR", "teacher");

  await testDb.insert(parMembers).values([
    { tenantId, userId: iulian.id, role: "requestor" as const },
    { tenantId, userId: cristina.id, role: "requestor" as const },
    { tenantId, userId: marina.id, role: "requestor" as const },
    { tenantId, userId: sirbu.id, role: "requestor" as const },
    { tenantId, userId: ana.id, role: "approver" as const },
    { tenantId, userId: irina.id, role: "approver" as const },
  ]);
  for (const u of [iulian, cristina, marina, sirbu, ana, irina]) {
    await testDb.insert(parPayerMembers).values({ tenantId, payerId, userId: u.id });
  }

  // Matricea ATIC de pe producție (verificată pe 23.09.2026): Ana și Irina, pe nume, pe același
  // pas, `parallel`, legate de plătitor. Fără `parallel`, rezolvatorul păstrează un rând per pas.
  await testDb.insert(parDoaMatrix).values([
    { tenantId, payerId, step: 1, approvalMode: "parallel", approverRoleLabel: "Aprobator", approverUserId: ana.id, minAmountCents: 0, maxAmountCents: null },
    { tenantId, payerId, step: 1, approvalMode: "parallel", approverRoleLabel: "Aprobator", approverUserId: irina.id, minAmountCents: 0, maxAmountCents: null },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("configurarea verificatorului (Administrare PAR → Membri)", () => {
  it("[blocant] administratorul îl pune pe Iulian verificator pentru Cristina și Marina", async () => {
    for (const colega of [cristina, marina]) {
      const res = await setVerifier(colega, iulian);
      expect(res.status, JSON.stringify(res.json)).toBe(200);
    }
    const [profile] = await testDb
      .select({ verifierUserId: parMemberProfiles.verifierUserId })
      .from(parMemberProfiles)
      .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.userId, cristina.id)));
    expect(profile.verifierUserId).toBe(iulian.id);
  });

  it("[blocant] nimeni nu e propriul verificator, iar verificatorul trebuie să fie membru PAR", async () => {
    const self = await setVerifier(cristina, cristina);
    expect(self.status).toBe(400);
    expect(self.json.error).toBe("verifier_self");

    const stranger = await setVerifier(cristina, outsider);
    expect(stranger.status).toBe(400);
    expect(stranger.json.error).toBe("verifier_not_member");
    expect(String(stranger.json.detail)).toMatch(/membru PAR/);
  });

  it("[blocant] omul nu-și alege și nu-și scoate singur verificatorul (PATCH /me îl ignoră)", async () => {
    const res = await call(cristina, "PATCH", "/api/par/profiles/me", { verifier_user_id: null, job_title: "Asistent proiect" });
    expect(res.status).toBe(200);
    const [profile] = await testDb
      .select({ verifierUserId: parMemberProfiles.verifierUserId })
      .from(parMemberProfiles)
      .where(and(eq(parMemberProfiles.tenantId, tenantId), eq(parMemberProfiles.userId, cristina.id)));
    expect(profile.verifierUserId).toBe(iulian.id);
  });

  it("[blocant] Iulian, doar solicitant, primește inboxul de aprobare", async () => {
    const res = await call(iulian, "GET", "/api/par/me");
    expect(res.status).toBe(200);
    expect(res.json.preApprover).toBe(true);
    const plain = await call(sirbu, "GET", "/api/par/me");
    expect(plain.json.preApprover).toBe(false);
  });
});

describe("cererea Cristinei trece întâi pe la Iulian", () => {
  let parId: string;

  it("[blocant] lanțul începe cu Verificare — Iulian, iar Ana și Irina așteaptă blocate după el", async () => {
    parId = await submitted(cristina);
    const chain = await chainOf(parId);
    expect(chain.map((s) => [s.step, s.approverUserId, s.approverRoleLabel, s.locked])).toEqual([
      [0, cristina.id, "Requestor", false],
      [1, iulian.id, VERIFIER_LABEL, false],
      [2, ana.id, "Aprobator", true],
      [2, irina.id, "Aprobator", true],
    ]);
  });

  it("[blocant] cererea e în inboxul lui Iulian, nu și în al Anei", async () => {
    const inIulian = await call(iulian, "GET", "/api/par/inbox");
    expect((inIulian.json.inbox as Array<{ id: string }>).map((r) => r.id)).toContain(parId);
    const inAna = await call(ana, "GET", "/api/par/inbox");
    expect((inAna.json.inbox as Array<{ id: string }>).map((r) => r.id)).not.toContain(parId);
  });

  it("[blocant] Ana nu poate sări peste verificare", async () => {
    const res = await call(ana, "POST", `/api/par/${parId}/approve`, {});
    expect(res.status).toBe(409);
  });

  it("[blocant] pe fișă, Iulian vede că poate corecta și vede cui pleacă banii", async () => {
    const res = await call(iulian, "GET", `/api/par/${parId}`);
    expect(res.status).toBe(200);
    expect(res.json.verifier_amend).toBe(true);
    expect(res.json.payeeIban).toBe("MD24AG000225100013104168");
    // Cristina, pe propria cerere, nu e verificator.
    const own = await call(cristina, "GET", `/api/par/${parId}`);
    expect(own.json.verifier_amend).toBe(false);
  });

  it("[blocant] Iulian schimbă singur linia de buget — jurnal, sigiliu refăcut, fișa o arată", async () => {
    const before = await rowOf(parId);
    const res = await call(iulian, "PATCH", `/api/par/${parId}`, { budget_code_id: bcMateriale, budget_code_note: "e material, nu deplasare" });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.verifier_amended).toBe(true);

    const after = await rowOf(parId);
    expect(after.budgetCodeId).toBe(bcMateriale);
    expect(after.status).toBe("pending_approval");
    expect(after.bodyHash).not.toBe(before.bodyHash);

    const audit = await testDb.select().from(parAudit).where(and(eq(parAudit.parId, parId), eq(parAudit.event, "verifier_amended")));
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(iulian.id);
    expect(audit[0].detail).toMatch(/linia de buget/);

    const detail = await call(cristina, "GET", `/api/par/${parId}`);
    expect(detail.json.body_hash_valid).toBe(true);
    const amendments = detail.json.verifier_amendments as Array<{ byName: string; fields: string[] }>;
    expect(amendments[0].byName).toBe("Iulian Lungu");
    expect(amendments[0].fields).toContain("linia de buget");
  });

  it("[blocant] formularul tipărit (și dosarul) spun că verificatorul a corectat cererea", async () => {
    const form = await loadParFormData(parId, tenantId);
    expect(form?.verifierAmendments?.[0]).toMatchObject({ byName: "Iulian Lungu", fields: ["budget line", "budget line note"] });
    expect(form?.financeAmendments ?? []).toHaveLength(0);
  });

  it("[blocant] Iulian deschide documentele cererii; alt coleg de proiect nu", async () => {
    await testDb.insert(parAttachments).values({
      tenantId,
      parId,
      fileName: "factura.pdf",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQK",
      mimeType: "application/pdf",
      kind: "invoice",
      uploadedBy: cristina.id,
    });
    const mine = await call(iulian, "GET", `/api/par/${parId}/attachments`);
    expect(mine.status, JSON.stringify(mine.json)).toBe(200);
    expect(JSON.stringify(mine.json)).toContain("factura.pdf");
    const other = await call(sirbu, "GET", `/api/par/${parId}/attachments`);
    expect(other.status).toBe(404);
    // Citire, nu scriere: verificatorul nu adaugă documente în locul solicitantului.
    const up = await call(iulian, "POST", `/api/par/${parId}/attachment-upload/sign`, { file_name: "x.pdf", mime: "application/pdf", size_bytes: 10 });
    expect(up.status).toBe(403);
  });

  it("[blocant] corectează și evenimentul, descrierea și data necesară", async () => {
    const res = await call(iulian, "PATCH", `/api/par/${parId}`, {
      event_id: evAtelier,
      end_use: "Kituri Arduino pentru atelierul de robotică, grupa de 10 copii",
      date_needed: "2026-10-15T00:00:00.000Z",
    });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const row = await rowOf(parId);
    expect(row.eventId).toBe(evAtelier);
    expect(row.endUse).toMatch(/grupa de 10 copii/);
    expect(row.dateNeeded?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("[blocant] suma și beneficiarul NU — pentru ele cererea se întoarce", async () => {
    const res = await call(iulian, "PATCH", `/api/par/${parId}`, { payee_iban: "MD00XX0000000000000000" });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("forbidden_for_verifier");
    expect(String(res.json.detail)).toMatch(/Cere modificări/);
    expect((await rowOf(parId)).payeeIban).toBe("MD24AG000225100013104168");
  });

  it("[blocant] linia de buget și evenimentul rămân în proiectul cererii", async () => {
    const bc = await call(iulian, "PATCH", `/api/par/${parId}`, { budget_code_id: bcOtherProject });
    expect(bc.status).toBe(400);
    expect(bc.json.error).toBe("budget_code_not_in_project");
    const ev = await call(iulian, "PATCH", `/api/par/${parId}`, { event_id: evOtherProject });
    expect(ev.status).toBe(400);
    expect(ev.json.error).toBe("event_not_in_project");
  });

  it("[blocant] alt coleg de proiect nu poate corecta cererea Cristinei", async () => {
    const res = await call(sirbu, "PATCH", `/api/par/${parId}`, { budget_code_id: bcDeplasari });
    expect(res.status).toBe(403);
    expect((await rowOf(parId)).budgetCodeId).toBe(bcMateriale);
  });

  it("[blocant] Iulian aprobă → cererea ajunge la Ana și Irina, în varianta corectată", async () => {
    const res = await call(iulian, "POST", `/api/par/${parId}/approve`, {});
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json.chain_status).toBe("advanced");

    const chain = await chainOf(parId);
    expect(chain.filter((s) => s.step === 2).every((s) => !s.locked)).toBe(true);
    const inAna = await call(ana, "GET", "/api/par/inbox");
    expect((inAna.json.inbox as Array<{ id: string }>).map((r) => r.id)).toContain(parId);
  });

  it("[blocant] după semnătura lui, Iulian nu mai rescrie cererea", async () => {
    const res = await call(iulian, "PATCH", `/api/par/${parId}`, { budget_code_id: bcDeplasari });
    expect(res.status).toBe(403);
    const detail = await call(iulian, "GET", `/api/par/${parId}`);
    expect(detail.json.verifier_amend).toBe(false);
  });

  it("[blocant] Ana și Irina semnează fără alarmă de integritate → cererea ajunge la finanțe", async () => {
    const a = await call(ana, "POST", `/api/par/${parId}/approve`, {});
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    const i = await call(irina, "POST", `/api/par/${parId}/approve`, {});
    expect(i.status, JSON.stringify(i.json)).toBe(200);
    expect((await rowOf(parId)).status).toBe("in_finance");
  });
});

describe("întoarcerea și cazurile de margine", () => {
  it("[blocant] Iulian întoarce cererea Marinei; la re-trimitere, trece din nou pe la el", async () => {
    const parId = await submitted(marina);
    const back = await call(iulian, "POST", `/api/par/${parId}/request-changes`, { comment: "Suma e pe alt contract — refă cererea." });
    expect(back.status, JSON.stringify(back.json)).toBe(200);
    expect((await rowOf(parId)).status).toBe("changes_requested");

    const again = await call(marina, "POST", `/api/par/${parId}/submit`);
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    const chain = await chainOf(parId);
    expect(chain.find((s) => s.step === 1)).toMatchObject({ approverUserId: iulian.id, approverRoleLabel: VERIFIER_LABEL, decision: "pending", locked: false });
  });

  it("[blocant] cererea lui Iulian și a unui coleg fără verificator merg direct la aprobatori", async () => {
    for (const author of [iulian, sirbu]) {
      const parId = await submitted(author);
      const chain = await chainOf(parId);
      expect(chain.some((s) => s.approverRoleLabel === VERIFIER_LABEL)).toBe(false);
      expect(chain.filter((s) => s.step === 1).map((s) => s.approverUserId).sort()).toEqual([ana.id, irina.id].sort());
    }
  });

  it("[blocant] cererea fără proiect (doar pe plătitor): Iulian o deschide, o corectează și o semnează", async () => {
    const parId = await submitted(cristina, { payerLevel: true });
    const detail = await call(iulian, "GET", `/api/par/${parId}`);
    expect(detail.status, JSON.stringify(detail.json)).toBe(200);
    expect(detail.json.verifier_amend).toBe(true);
    const patch = await call(iulian, "PATCH", `/api/par/${parId}`, { end_use: "Kituri Arduino — plată din fondurile generale" });
    expect(patch.status, JSON.stringify(patch.json)).toBe(200);
    const approve = await call(iulian, "POST", `/api/par/${parId}/approve`, {});
    expect(approve.status, JSON.stringify(approve.json)).toBe(200);
    // Un coleg fără pas pe cerere nu o vede (regula colegilor de proiect nu se aplică aici).
    const other = await call(sirbu, "GET", `/api/par/${parId}`);
    expect(other.status).toBe(404);
  });

  it("[blocant] nu golește descrierea unei plăți (fără ea cererea n-ar fi putut fi depusă)", async () => {
    const parId = await submitted(cristina);
    for (const empty of ["", "   ", null]) {
      const res = await call(iulian, "PATCH", `/api/par/${parId}`, { end_use: empty });
      expect(res.status).toBe(400);
      expect(res.json.error).toBe("end_use_required");
    }
    expect((await rowOf(parId)).endUse).toBe("Materiale pentru atelierul de robotică");
  });

  it("[blocant] o modificare făcută PE LA SPATE nu se „spală” sub corectura verificatorului", async () => {
    const parId = await submitted(cristina);
    const sealed = (await rowOf(parId)).bodyHash;
    // Cineva schimbă IBAN-ul direct în bază, după depunere.
    await testDb.update(parRequests).set({ payeeIban: "MD99XX0000000000000000" }).where(eq(parRequests.id, parId));
    const res = await call(iulian, "PATCH", `/api/par/${parId}`, { budget_code_id: bcMateriale });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe("integrity_violation");
    const row = await rowOf(parId);
    expect(row.bodyHash).toBe(sealed);
    expect(row.budgetCodeId).toBe(bcDeplasari);
  });

  it("[blocant] verificatorul scos din profil între timp: poate semna pasul rămas, dar nu mai corectează", async () => {
    const parId = await submitted(cristina);
    expect((await setVerifier(cristina, null)).status).toBe(200);

    const detail = await call(iulian, "GET", `/api/par/${parId}`);
    expect(detail.json.verifier_amend).toBe(false);
    const patch = await call(iulian, "PATCH", `/api/par/${parId}`, { budget_code_id: bcMateriale });
    expect(patch.status).toBe(403);
    const approve = await call(iulian, "POST", `/api/par/${parId}/approve`, {});
    expect(approve.status, JSON.stringify(approve.json)).toBe(200);

    // Restabilit pentru orice test care ar urma.
    expect((await setVerifier(cristina, iulian)).status).toBe(200);
  });
});
