/**
 * COMM-204: Broadcasts API — mass messaging with segmentation
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "../db/client";
import { broadcasts, leads, students, leadTags } from "../db/schema";
import type { SegmentFilter } from "../db/schema/broadcasts";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { MessagingService } from "../services/messaging";

export const broadcastRoutes = new Hono<{ Variables: AuthVariables }>();

broadcastRoutes.use("/*", requireAuth);

const messagingService = new MessagingService(db);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const segmentSchema = z.object({
  type: z.enum(["leads", "students"]),
  status_filter: z.string().optional().nullable(),
  course_filter: z.string().optional().nullable(), // for leads: interest_course; for students: course name
  tag_filter: z.string().optional().nullable(), // for leads only
});

const createBroadcastSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(["email", "sms", "whatsapp"]),
  segment: segmentSchema,
  template_id: z.string().uuid().optional().nullable(),
  body: z.string().min(1),
  subject: z.string().max(500).optional().nullable(),
});

// ─── Helper: resolve recipients ───────────────────────────────────────────────

interface Recipient {
  id: string;
  name: string;
  type: "lead" | "student";
  address: string; // email or phone
  consentRevoked: boolean;
}

async function resolveRecipients(
  tenantId: string,
  segment: SegmentFilter,
  channel: "email" | "sms" | "whatsapp"
): Promise<Recipient[]> {
  const recipients: Recipient[] = [];

  if (segment.type === "leads") {
    // Build conditions
    const conditions = [eq(leads.tenantId, tenantId)];
    if (segment.status_filter) {
      // Cast to string — pipeline stage key is varchar
      conditions.push(eq(leads.stage, segment.status_filter as "new" | "contacted" | "trial" | "paid" | "lost"));
    }
    if (segment.course_filter) {
      conditions.push(ilike(leads.interestCourse, `%${segment.course_filter}%`));
    }

    const rows = await db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        email: leads.email,
        phone: leads.phone,
        consentRevokedAt: leads.consentRevokedAt,
      })
      .from(leads)
      .where(and(...conditions))
      .orderBy(asc(leads.createdAt))
      .limit(1000);

    // If tag filter, load lead_ids with that tag
    let allowedIds: Set<string> | null = null;
    if (segment.tag_filter) {
      const tagRows = await db
        .select({ leadId: leadTags.leadId })
        .from(leadTags)
        .where(and(eq(leadTags.tenantId, tenantId), eq(leadTags.tag, segment.tag_filter)));
      allowedIds = new Set(tagRows.map((r) => r.leadId));
    }

    for (const row of rows) {
      if (allowedIds && !allowedIds.has(row.id)) continue;
      const address =
        channel === "email" ? (row.email ?? "") : (row.phone ?? "");
      if (!address) continue; // no address for this channel
      recipients.push({
        id: row.id,
        name: row.fullName,
        type: "lead",
        address,
        consentRevoked: !!row.consentRevokedAt,
      });
    }
  } else {
    // students
    const conditions = [eq(students.tenantId, tenantId)];
    if (segment.status_filter) {
      conditions.push(eq(students.status, segment.status_filter as "active" | "trial" | "paused" | "archived"));
    }

    const rows = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        email: students.email,
        phone: students.phone,
        parentEmail: students.parentEmail,
        parentPhone: students.parentPhone,
      })
      .from(students)
      .where(and(...conditions))
      .orderBy(asc(students.createdAt))
      .limit(1000);

    for (const row of rows) {
      // For students: use parent contact first, then student
      const address =
        channel === "email"
          ? (row.parentEmail ?? row.email ?? "")
          : (row.parentPhone ?? row.phone ?? "");
      if (!address) continue;
      recipients.push({
        id: row.id,
        name: row.fullName,
        type: "student",
        address,
        consentRevoked: false, // students don't have consent_revoked_at in current schema
      });
    }
  }

  return recipients;
}

// ─── GET /api/broadcasts/preview-count ───────────────────────────────────────

broadcastRoutes.get("/preview-count", async (c) => {
  const tenantId = c.get("user").tenantId;
  const segType = c.req.query("type") as "leads" | "students";
  const statusFilter = c.req.query("status_filter");
  const courseFilter = c.req.query("course_filter");
  const tagFilter = c.req.query("tag_filter");
  const channel = (c.req.query("channel") ?? "email") as "email" | "sms" | "whatsapp";

  if (!segType) return c.json({ error: "type required" }, 400);

  const segment: SegmentFilter = {
    type: segType,
    status_filter: statusFilter ?? undefined,
    course_filter: courseFilter ?? undefined,
    tag_filter: tagFilter ?? undefined,
  };

  const recipients = await resolveRecipients(tenantId, segment, channel);
  const validRecipients = recipients.filter((r) => !r.consentRevoked);

  return c.json({
    count: validRecipients.length,
    sample: validRecipients.slice(0, 5).map((r) => r.name),
  });
});

// ─── GET /api/broadcasts ──────────────────────────────────────────────────────

broadcastRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const items = await db
    .select()
    .from(broadcasts)
    .where(eq(broadcasts.tenantId, tenantId))
    .orderBy(desc(broadcasts.createdAt))
    .limit(100);

  return c.json({ items });
});

// ─── POST /api/broadcasts ─────────────────────────────────────────────────────

broadcastRoutes.post(
  "/",
  zValidator("json", createBroadcastSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const segment = body.segment as SegmentFilter;

    // Resolve recipients
    const recipients = await resolveRecipients(tenantId, segment, body.channel);
    const totalRecipients = recipients.length;
    const consentSkipped = recipients.filter((r) => r.consentRevoked).length;
    const valid = recipients.filter((r) => !r.consentRevoked);

    // Create broadcast row
    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        tenantId,
        name: body.name,
        channel: body.channel,
        segmentFilter: segment,
        templateId: body.template_id ?? null,
        body: body.body,
        subject: body.subject ?? null,
        status: "sending",
        totalRecipients,
        consentSkipped,
        queued: valid.length,
      })
      .returning();

    // Send messages (batch — stub is instant)
    let sentCount = 0;
    for (const r of valid) {
      try {
        await messagingService.sendMessage(tenantId, {
          channel: body.channel,
          toAddress: r.address,
          body: body.body,
          subject: body.subject ?? undefined,
          templateId: body.template_id ?? undefined,
          leadId: r.type === "lead" ? r.id : undefined,
          studentId: r.type === "student" ? r.id : undefined,
        });
        sentCount++;
      } catch {
        // Log individual failure but continue batch
      }
    }

    // Update broadcast status to done
    const [updated] = await db
      .update(broadcasts)
      .set({
        status: "done",
        queued: sentCount,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(broadcasts.id, broadcast.id))
      .returning();

    return c.json({
      broadcastId: updated.id,
      totalRecipients,
      consentSkipped,
      queued: sentCount,
    });
  }
);

// ─── GET /api/broadcasts/:id/messages ─────────────────────────────────────────

broadcastRoutes.get("/:id/messages", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");

  // Verify ownership
  const broadcast = await db.query.broadcasts.findFirst({
    where: and(eq(broadcasts.id, id), eq(broadcasts.tenantId, tenantId)),
  });
  if (!broadcast) return c.json({ error: "not_found" }, 404);

  // Messages linked to this broadcast template would need a broadcast_id on messages
  // For now return the broadcast summary
  return c.json({ broadcast, messages: [] });
});
