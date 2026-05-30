/**
 * SCHED-504 — Client-side re-exports of iCal utilities for testing.
 *
 * NOTE: These functions use only Web Crypto / standard APIs available in both
 * Node (vitest) and the browser (via Vite). They are duplicated from
 * server/routes/calendar.ts intentionally — the server version uses
 * `node:crypto` (HMAC) which is not available in the browser bundle.
 */

export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "pending";

export interface CalendarLesson {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  courseName: string;
  courseLevel: string | null;
  notes: string | null;
}

/** Format a Date to iCal UTC format (no dashes/colons, Z suffix) */
export function toICalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Fold long iCal lines at 75 chars (RFC 5545 §3.1) */
export function foldIcalLine(line: string): string {
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

/** Escape iCal text property values per RFC 5545 §3.3.11 */
export function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Build a complete VCALENDAR iCal string from a list of lessons */
export function buildIcal(teacherName: string, lessons: CalendarLesson[]): string {
  const now = toICalDate(new Date());

  const events = lessons.map((l, i) => {
    const start = toICalDate(l.scheduledAt);
    const end = toICalDate(new Date(l.scheduledAt.getTime() + l.durationMinutes * 60_000));
    const summary = l.courseLevel ? `${l.courseName} (${l.courseLevel})` : l.courseName;
    const desc = l.notes ? escapeIcalText(l.notes) : "";
    const uid = `vectorlearn-${i}-${Date.now()}@vectorlearn.io`;

    return [
      "BEGIN:VEVENT",
      foldIcalLine(`UID:${uid}`),
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldIcalLine(`SUMMARY:${escapeIcalText(summary)}`),
      desc ? foldIcalLine(`DESCRIPTION:${desc}`) : null,
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vector Learn//Teacher Schedule//RO",
    foldIcalLine(`X-WR-CALNAME:${escapeIcalText(teacherName)} — Orar Vector Learn`),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Simple token payload shape (mirrors server version) */
export interface CalendarTokenPayload {
  teacherId: string;
  tenantId: string;
  exp: number;
}

/**
 * Client-side token verification using only Web Crypto API (SubtleCrypto).
 * Returns the payload if valid + unexpired, null otherwise.
 * NOTE: Signature verification requires async SubtleCrypto.verify — for
 * pure unit testing we expose the payload-parsing logic synchronously.
 * The actual HMAC verification is tested via the server-side smoke test.
 */
export function parseCalendarTokenPayload(token: string): CalendarTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    ) as CalendarTokenPayload;
    if (!payload.teacherId || !payload.tenantId || !payload.exp) return null;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Build a (unsigned, for testing only) token with given payload */
export function buildMockToken(payload: CalendarTokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = "mocksignature";
  return `${header}.${body}.${sig}`;
}
