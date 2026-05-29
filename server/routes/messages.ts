/**
 * COMM-201/203: Messages API — send messages + list per lead/student + threads inbox
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { messages, leads, students } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  MessagingService,
  ConsentRevokedError,
} from "../services/messaging";

export const messageRoutes = new Hono<{ Variables: AuthVariables }>();

messageRoutes.use("/*", requireAuth);

// ─── Shared service instance ──────────────────────────────────────────────────

const messagingService = new MessagingService(db);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sendMessageSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp"]),
  to_address: z.string().min(1).max(255),
  body: z.string().min(1),
  subject: z.string().max(500).optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  lead_id: z.string().uuid().optional().nullable(),
  student_id: z.string().uuid().optional().nullable(),
});

// ─── POST /api/messages/send ─────────────────────────────────────────────────

messageRoutes.post(
  "/send",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    try {
      const message = await messagingService.sendMessage(tenantId, {
        channel: body.channel,
        toAddress: body.to_address,
        body: body.body,
        subject: body.subject ?? undefined,
        templateId: body.template_id ?? undefined,
        leadId: body.lead_id ?? undefined,
        studentId: body.student_id ?? undefined,
      });
      return c.json({ message });
    } catch (err) {
      if (err instanceof ConsentRevokedError) {
        return c.json({ error: "consent_revoked" }, 403);
      }
      throw err;
    }
  }
);

// ─── GET /api/messages ───────────────────────────────────────────────────────

messageRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const leadId = c.req.query("lead_id");
  const studentId = c.req.query("student_id");
  const channel = c.req.query("channel") as
    | "email"
    | "sms"
    | "whatsapp"
    | undefined;
  const limitParam = c.req.query("limit");
  const limit = Math.min(Number(limitParam ?? 50), 200);

  const conditions = [eq(messages.tenantId, tenantId)];

  if (leadId) conditions.push(eq(messages.leadId, leadId));
  if (studentId) conditions.push(eq(messages.studentId, studentId));
  if (channel) conditions.push(eq(messages.channel, channel));

  const items = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return c.json({ items });
});

// ─── GET /api/messages/threads ────────────────────────────────────────────────
// Returns conversations grouped per (contact, channel), sorted desc by last message.

messageRoutes.get("/threads", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Get all messages for tenant, latest-first
  const allMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.tenantId, tenantId))
    .orderBy(desc(messages.createdAt))
    .limit(500);

  // Group by (leadId|studentId, channel) — pick the latest message per group
  const threadMap = new Map<
    string,
    {
      contactId: string;
      contactType: "lead" | "student";
      channel: typeof allMessages[0]["channel"];
      lastMessageAt: string;
      lastMessagePreview: string;
      unreadCount: number;
    }
  >();

  for (const msg of allMessages) {
    const contactId = msg.leadId ?? msg.studentId;
    if (!contactId) continue;
    const contactType: "lead" | "student" = msg.leadId ? "lead" : "student";
    const key = `${contactId}::${msg.channel}`;
    if (!threadMap.has(key)) {
      threadMap.set(key, {
        contactId,
        contactType,
        channel: msg.channel,
        lastMessageAt: msg.createdAt.toISOString(),
        lastMessagePreview: msg.body.slice(0, 80),
        unreadCount: msg.direction === "inbound" && msg.status !== "delivered" ? 1 : 0,
      });
    } else {
      const t = threadMap.get(key)!;
      if (msg.direction === "inbound" && msg.status !== "delivered") {
        t.unreadCount += 1;
      }
    }
  }

  const threads = Array.from(threadMap.values());

  // Enrich with contact names
  const leadIds = [...new Set(threads.filter((t) => t.contactType === "lead").map((t) => t.contactId))];
  const studentIds = [...new Set(threads.filter((t) => t.contactType === "student").map((t) => t.contactId))];

  const leadNames = new Map<string, string>();
  const studentNames = new Map<string, string>();

  if (leadIds.length > 0) {
    const leadRows = await db
      .select({ id: leads.id, fullName: leads.fullName })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), sql`${leads.id} = ANY(${leadIds})`));
    for (const row of leadRows) leadNames.set(row.id, row.fullName);
  }

  if (studentIds.length > 0) {
    const studentRows = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(and(eq(students.tenantId, tenantId), sql`${students.id} = ANY(${studentIds})`));
    for (const row of studentRows) studentNames.set(row.id, row.fullName);
  }

  const enriched = threads.map((t) => ({
    ...t,
    contactName:
      t.contactType === "lead"
        ? (leadNames.get(t.contactId) ?? "Lead")
        : (studentNames.get(t.contactId) ?? "Elev"),
  }));

  return c.json({ threads: enriched });
});

// ─── GET /api/messages/threads/:contactId/:channel ─────────────────────────

messageRoutes.get("/threads/:contactId/:channel", async (c) => {
  const tenantId = c.get("user").tenantId;
  const contactId = c.req.param("contactId");
  const channel = c.req.param("channel") as "email" | "sms" | "whatsapp";

  // Find messages for this contact+channel
  const leadMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.leadId, contactId),
        eq(messages.channel, channel)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  const studentMessages =
    leadMessages.length === 0
      ? await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.tenantId, tenantId),
              eq(messages.studentId, contactId),
              eq(messages.channel, channel)
            )
          )
          .orderBy(desc(messages.createdAt))
          .limit(100)
      : [];

  const threadMessages = leadMessages.length > 0 ? leadMessages : studentMessages;
  const isLead = leadMessages.length > 0;

  // Get contact name
  let contactName = "Contact";
  const contactType: "lead" | "student" = isLead ? "lead" : "student";

  if (isLead) {
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, contactId), eq(leads.tenantId, tenantId)),
      columns: { fullName: true },
    });
    if (lead) contactName = lead.fullName;
  } else {
    const student = await db.query.students.findFirst({
      where: and(eq(students.id, contactId), eq(students.tenantId, tenantId)),
      columns: { fullName: true },
    });
    if (student) contactName = student.fullName;
  }

  return c.json({
    messages: threadMessages,
    contact: { id: contactId, name: contactName, type: contactType },
  });
});
