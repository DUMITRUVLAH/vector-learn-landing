/**
 * SCHOOL-006 — API orar master (timetable_slots)
 *
 * Routes:
 *   GET    /api/school/timetable?classId=&yearId=
 *   POST   /api/school/timetable
 *   PATCH  /api/school/timetable/:id
 *   DELETE /api/school/timetable/:id
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import {
  timetableSlots,
  schoolClasses,
  schoolSubjects,
  teachers,
  rooms,
  users,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { detectConflicts, type SlotLike } from "../lib/timetable";

export const timetableRoutes = new Hono<{ Variables: AuthVariables }>();

timetableRoutes.use("*", requireAuth);

// ─── Validators ───────────────────────────────────────────────────────────────

const slotSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  /** 1=Luni … 6=Sâmbătă */
  dayOfWeek: z.number().int().min(1).max(6),
  /** HH:MM */
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
  /** HH:MM */
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Format HH:MM"),
  notes: z.string().max(200).nullable().optional(),
});

const listQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

// ─── GET /api/school/timetable ────────────────────────────────────────────────

timetableRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = c.get("user");
  const { classId } = c.req.valid("query");

  const conditions = [eq(timetableSlots.tenantId, user.tenantId)];
  if (classId) conditions.push(eq(timetableSlots.classId, classId));

  const rows = await db
    .select({
      id: timetableSlots.id,
      tenantId: timetableSlots.tenantId,
      classId: timetableSlots.classId,
      subjectId: timetableSlots.subjectId,
      teacherId: timetableSlots.teacherId,
      roomId: timetableSlots.roomId,
      dayOfWeek: timetableSlots.dayOfWeek,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      notes: timetableSlots.notes,
      createdAt: timetableSlots.createdAt,
      updatedAt: timetableSlots.updatedAt,
      subjectName: schoolSubjects.name,
      teacherName: users.name,
      roomName: rooms.name,
    })
    .from(timetableSlots)
    .leftJoin(schoolSubjects, eq(timetableSlots.subjectId, schoolSubjects.id))
    .leftJoin(teachers, eq(timetableSlots.teacherId, teachers.id))
    .leftJoin(users, eq(teachers.userId, users.id))
    .leftJoin(rooms, eq(timetableSlots.roomId, rooms.id))
    .where(and(...conditions))
    .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.startTime));

  const slots = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;
  return c.json({ slots });
});

// ─── POST /api/school/timetable ───────────────────────────────────────────────

timetableRoutes.post("/", zValidator("json", slotSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verifică clasa aparține tenantului
  const [cls] = await db
    .select()
    .from(schoolClasses)
    .where(and(eq(schoolClasses.id, body.classId), eq(schoolClasses.tenantId, user.tenantId)));

  if (!cls) return c.json({ error: "class_not_found" }, 404);

  // Verifică materia
  const [subject] = await db
    .select()
    .from(schoolSubjects)
    .where(and(eq(schoolSubjects.id, body.subjectId), eq(schoolSubjects.tenantId, user.tenantId)));

  if (!subject) return c.json({ error: "subject_not_found" }, 404);

  // Verifică profesorul dacă e specificat
  if (body.teacherId) {
    const [teacher] = await db
      .select()
      .from(teachers)
      .where(and(eq(teachers.id, body.teacherId), eq(teachers.tenantId, user.tenantId)));
    if (!teacher) return c.json({ error: "teacher_not_found" }, 404);
  }

  // Verifică sala dacă e specificată
  if (body.roomId) {
    const [room] = await db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, body.roomId), eq(rooms.tenantId, user.tenantId)));
    if (!room) return c.json({ error: "room_not_found" }, 404);
  }

  // Detectare conflicte — încarcă toate sloturile relevante
  const existingRows = await db
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.tenantId, user.tenantId),
        eq(timetableSlots.dayOfWeek, body.dayOfWeek)
      )
    );

  const existing = Array.isArray(existingRows)
    ? existingRows
    : (existingRows as unknown as { rows: typeof existingRows }).rows ?? existingRows;

  const newSlotLike: SlotLike = {
    classId: body.classId,
    teacherId: body.teacherId,
    roomId: body.roomId,
    dayOfWeek: body.dayOfWeek,
    startTime: body.startTime,
    endTime: body.endTime,
  };

  const conflicts = detectConflicts(
    existing.map((s) => ({
      id: s.id,
      classId: s.classId,
      teacherId: s.teacherId,
      roomId: s.roomId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime as string,
      endTime: s.endTime as string,
    })),
    newSlotLike
  );

  if (conflicts.length > 0) {
    return c.json({ error: "conflict", conflicts }, 409);
  }

  const [created] = await db
    .insert(timetableSlots)
    .values({
      tenantId: user.tenantId,
      classId: body.classId,
      subjectId: body.subjectId,
      teacherId: body.teacherId ?? null,
      roomId: body.roomId ?? null,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ slot: created }, 201);
});

// ─── PATCH /api/school/timetable/:id ─────────────────────────────────────────

timetableRoutes.patch("/:id", zValidator("json", slotSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(timetableSlots)
    .where(and(eq(timetableSlots.id, id), eq(timetableSlots.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  // Construiește slotul rezultat pentru verificarea conflictelor
  const merged: SlotLike = {
    id,
    classId: body.classId ?? existing.classId,
    teacherId: body.teacherId !== undefined ? body.teacherId : existing.teacherId,
    roomId: body.roomId !== undefined ? body.roomId : existing.roomId,
    dayOfWeek: body.dayOfWeek ?? existing.dayOfWeek,
    startTime: body.startTime ?? (existing.startTime as string),
    endTime: body.endTime ?? (existing.endTime as string),
  };

  // Detectare conflicte (exclude slotul curent din comparație)
  const existingRows = await db
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.tenantId, user.tenantId),
        eq(timetableSlots.dayOfWeek, merged.dayOfWeek)
      )
    );

  const allSlots = Array.isArray(existingRows)
    ? existingRows
    : (existingRows as unknown as { rows: typeof existingRows }).rows ?? existingRows;

  const conflicts = detectConflicts(
    allSlots.map((s) => ({
      id: s.id,
      classId: s.classId,
      teacherId: s.teacherId,
      roomId: s.roomId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime as string,
      endTime: s.endTime as string,
    })),
    merged
  );

  if (conflicts.length > 0) {
    return c.json({ error: "conflict", conflicts }, 409);
  }

  const [updated] = await db
    .update(timetableSlots)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(timetableSlots.id, id))
    .returning();

  return c.json({ slot: updated });
});

// ─── DELETE /api/school/timetable/:id ────────────────────────────────────────

timetableRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(timetableSlots)
    .where(and(eq(timetableSlots.id, id), eq(timetableSlots.tenantId, user.tenantId)));

  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(timetableSlots).where(eq(timetableSlots.id, id));
  return c.json({ ok: true });
});
