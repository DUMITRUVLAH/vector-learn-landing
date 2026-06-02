/**
 * KINDER-007 — Incident/accident reports + parent acknowledgment signature
 *
 * GET    /api/kinder/incidents                 — list incidents (query: from, to, studentId)
 * POST   /api/kinder/incidents                 — create incident
 * GET    /api/kinder/incidents/:id             — get single incident
 * PUT    /api/kinder/incidents/:id             — update incident fields
 * POST   /api/kinder/incidents/:id/notify      — mark parent notified
 * POST   /api/kinder/incidents/:id/acknowledge — record parent signature + acknowledge
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { db } from "../db/client";
import { incidentReports } from "../db/schema/kinderIncidents";
import { students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderIncidentsRoutes = new Hono<{ Variables: AuthVariables }>();

kinderIncidentsRoutes.use("*", requireAuth);

const incidentTypeValues = [
  "fall",
  "bite",
  "cut",
  "allergy",
  "behavioral",
  "other",
] as const;

const createSchema = z.object({
  studentId: z.string().uuid(),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incidentTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  type: z.enum(incidentTypeValues).default("other"),
  description: z.string().min(1).max(5000),
  injuryLocation: z.string().max(200).optional(),
  firstAidGiven: z.string().max(2000).optional(),
  witnessName: z.string().max(200).optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(["open", "parent_notified", "acknowledged", "closed"]).optional(),
});

const acknowledgeSchema = z.object({
  signatureDataUrl: z.string().max(100000),
});

// ─── GET /api/kinder/incidents ────────────────────────────────────────────────
kinderIncidentsRoutes.get("/incidents", async (c) => {
  const user = c.get("user");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const studentId = c.req.query("studentId");

  const conditions = [eq(incidentReports.tenantId, user.tenantId)];
  if (from) conditions.push(gte(incidentReports.incidentDate, from));
  if (to) conditions.push(lte(incidentReports.incidentDate, to));
  if (studentId) conditions.push(eq(incidentReports.studentId, studentId));

  const rows = await db
    .select({
      id: incidentReports.id,
      studentId: incidentReports.studentId,
      studentName: students.fullName,
      incidentDate: incidentReports.incidentDate,
      incidentTime: incidentReports.incidentTime,
      type: incidentReports.type,
      description: incidentReports.description,
      injuryLocation: incidentReports.injuryLocation,
      status: incidentReports.status,
      parentNotifiedAt: incidentReports.parentNotifiedAt,
      parentAcknowledgedAt: incidentReports.parentAcknowledgedAt,
      createdAt: incidentReports.createdAt,
    })
    .from(incidentReports)
    .leftJoin(students, eq(students.id, incidentReports.studentId))
    .where(and(...conditions))
    .orderBy(desc(incidentReports.incidentDate), desc(incidentReports.createdAt));

  return c.json({ incidents: rows });
});

// ─── POST /api/kinder/incidents ───────────────────────────────────────────────
kinderIncidentsRoutes.post(
  "/incidents",
  zValidator("json", createSchema),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const [created] = await db
      .insert(incidentReports)
      .values({
        tenantId: user.tenantId,
        studentId: body.studentId,
        reportedByUserId: user.id,
        incidentDate: body.incidentDate,
        incidentTime: body.incidentTime ?? null,
        type: body.type,
        description: body.description,
        injuryLocation: body.injuryLocation ?? null,
        firstAidGiven: body.firstAidGiven ?? null,
        witnessName: body.witnessName ?? null,
        status: "open",
      })
      .returning();

    return c.json({ incident: created }, 201);
  }
);

// ─── GET /api/kinder/incidents/:id ───────────────────────────────────────────
kinderIncidentsRoutes.get("/incidents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .select()
    .from(incidentReports)
    .where(and(eq(incidentReports.id, id), eq(incidentReports.tenantId, user.tenantId)));

  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json({ incident: row });
});

// ─── PUT /api/kinder/incidents/:id ───────────────────────────────────────────
kinderIncidentsRoutes.put(
  "/incidents/:id",
  zValidator("json", updateSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: incidentReports.id })
      .from(incidentReports)
      .where(and(eq(incidentReports.id, id), eq(incidentReports.tenantId, user.tenantId)));

    if (!existing) return c.json({ error: "not_found" }, 404);

    const [updated] = await db
      .update(incidentReports)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(incidentReports.id, id))
      .returning();

    return c.json({ incident: updated });
  }
);

// ─── POST /api/kinder/incidents/:id/notify ───────────────────────────────────
kinderIncidentsRoutes.post("/incidents/:id/notify", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: incidentReports.id })
    .from(incidentReports)
    .where(and(eq(incidentReports.id, id), eq(incidentReports.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(incidentReports)
    .set({
      status: "parent_notified",
      parentNotifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(incidentReports.id, id))
    .returning();

  return c.json({ incident: updated });
});

// ─── POST /api/kinder/incidents/:id/acknowledge ──────────────────────────────
kinderIncidentsRoutes.post(
  "/incidents/:id/acknowledge",
  zValidator("json", acknowledgeSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { signatureDataUrl } = c.req.valid("json");

    const [existing] = await db
      .select({ id: incidentReports.id })
      .from(incidentReports)
      .where(and(eq(incidentReports.id, id), eq(incidentReports.tenantId, user.tenantId)));

    if (!existing) return c.json({ error: "not_found" }, 404);

    const [updated] = await db
      .update(incidentReports)
      .set({
        status: "acknowledged",
        parentSignatureUrl: signatureDataUrl,
        parentAcknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(incidentReports.id, id))
      .returning();

    return c.json({ incident: updated });
  }
);
