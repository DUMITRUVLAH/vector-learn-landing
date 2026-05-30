/**
 * SCHED-504 — iCal export for teacher schedules
 *
 * POST /api/teachers/:id/calendar-token  → generates a signed read-only token + URL
 * GET  /api/calendar/teacher/:id.ics     → returns iCalendar (text/calendar) for the teacher
 */

import { Hono } from "hono";
import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, lessons, courses, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ─── Token utilities ────────────────────────────────────────────────────────

const TOKEN_SECRET = process.env.CALENDAR_TOKEN_SECRET ?? "vl-calendar-secret-dev";
const TOKEN_TTL_DAYS = 90;

interface CalendarTokenPayload {
  teacherId: string;
  tenantId: string;
  exp: number; // unix timestamp seconds
}

export function signCalendarToken(payload: CalendarTokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyCalendarToken(token: string): CalendarTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as CalendarTokenPayload;
    if (!payload.teacherId || !payload.tenantId || !payload.exp) return null;
    if (Date.now() / 1000 > payload.exp) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

// ─── iCal formatting helpers ─────────────────────────────────────────────────

/** Format a Date to iCal DTSTART;TZID=... or UTC format */
function toICalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Fold long iCal lines at 75 chars (RFC 5545) */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n");
}

/** Escape iCal text values */
function escapeIcal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

interface CalendarLesson {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  courseName: string;
  courseLevel: string | null;
  notes: string | null;
}

export function buildIcal(teacherName: string, lessons: CalendarLesson[]): string {
  const uid_base = `vectorlearn-${randomBytes(4).toString("hex")}`;
  const now = toICalDate(new Date());

  const events = lessons.map((l, i) => {
    const start = toICalDate(l.scheduledAt);
    const end = toICalDate(new Date(l.scheduledAt.getTime() + l.durationMinutes * 60_000));
    const summary = l.courseLevel ? `${l.courseName} (${l.courseLevel})` : l.courseName;
    const desc = l.notes ? escapeIcal(l.notes) : "";
    const uid = `${uid_base}-${i}@vectorlearn.io`;

    return [
      "BEGIN:VEVENT",
      foldLine(`UID:${uid}`),
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldLine(`SUMMARY:${escapeIcal(summary)}`),
      desc ? foldLine(`DESCRIPTION:${desc}`) : null,
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vector Learn//Teacher Schedule//RO",
    `X-WR-CALNAME:${escapeIcal(teacherName)} — Orar Vector Learn`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const calendarTokenRoutes = new Hono<{ Variables: AuthVariables }>();

calendarTokenRoutes.use("*", requireAuth);

/** POST /api/teachers/:id/calendar-token */
calendarTokenRoutes.post("/:id/calendar-token", async (c) => {
  const teacherId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify teacher belongs to tenant
  const teacher = await db.query.teachers.findFirst({
    where: and(eq(teachers.id, teacherId), eq(teachers.tenantId, tenantId)),
  });
  if (!teacher) return c.json({ error: "not_found" }, 404);

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60;
  const token = signCalendarToken({ teacherId, tenantId, exp });

  // Build absolute URL
  const baseUrl = c.req.url.replace(/\/api\/teachers\/[^/]+\/calendar-token$/, "");
  const calUrl = `${baseUrl}/api/calendar/teacher/${teacherId}.ics?token=${token}`;

  return c.json({ token, url: calUrl, expiresInDays: TOKEN_TTL_DAYS });
});

export const calendarIcsRoutes = new Hono();

/** GET /api/calendar/teacher/:idAndExt — e.g. :id.ics */
calendarIcsRoutes.get("/teacher/:idAndExt", async (c) => {
  const idAndExt = c.req.param("idAndExt");
  // Strip .ics suffix
  const teacherId = idAndExt.endsWith(".ics") ? idAndExt.slice(0, -4) : idAndExt;
  const token = c.req.query("token");

  if (!token) return c.text("Missing token", 401);

  const payload = verifyCalendarToken(token);
  if (!payload) return c.text("Invalid or expired token", 401);

  if (payload.teacherId !== teacherId) {
    return c.text("Token mismatch", 403);
  }

  // Get teacher name
  const teacher = await db.query.teachers.findFirst({
    where: and(eq(teachers.id, teacherId), eq(teachers.tenantId, payload.tenantId)),
  });
  if (!teacher) return c.text("Teacher not found", 404);

  const teacherUser = await db.query.users.findFirst({
    where: eq(users.id, teacher.userId),
  });
  const teacherName = teacherUser?.name ?? "Profesor";

  // Fetch upcoming + past 30 days lessons for this teacher
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      notes: lessons.notes,
      courseName: courses.name,
      courseLevel: courses.level,
    })
    .from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(
      and(
        eq(lessons.teacherId, teacherId),
        eq(lessons.tenantId, payload.tenantId),
        gte(lessons.scheduledAt, thirtyDaysAgo)
      )
    )
    .orderBy(lessons.scheduledAt);

  const ical = buildIcal(teacherName, rows);

  return new Response(ical, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${teacherId}.ics"`,
    },
  });
});
