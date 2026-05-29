/**
 * COMM-201: Messages API — send messages + list per lead/student
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { messages } from "../db/schema";
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
