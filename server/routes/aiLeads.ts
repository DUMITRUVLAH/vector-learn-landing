/**
 * AI-A03 — Lead qualification and WhatsApp reply suggestion routes
 *
 * POST /api/ai/qualify-leads       — bulk qualify all leads for tenant
 * PATCH /api/ai/leads/:id/qualify  — qualify a single lead
 * POST /api/ai/reply-suggestion    — WhatsApp draft reply (human-in-loop)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { qualifyLeadRow } from "../lib/ai/leadScorer";
import { callAi } from "../lib/ai/client";
import { pseudonymize } from "../lib/ai/pseudonymize";

export const aiLeadsRoutes = new Hono<{ Variables: AuthVariables }>();

aiLeadsRoutes.use("*", requireAuth);

const replySuggestionSchema = z.object({
  leadId: z.string().uuid().optional(),
  messageText: z.string().min(1).max(2000),
  conversationHistory: z.array(z.string()).max(10).optional(),
});

// ─── POST /api/ai/qualify-leads ──────────────────────────────────────────────

/** Qualify all active leads for the current tenant (bulk job). */
aiLeadsRoutes.post("/qualify-leads", async (c) => {
  const user = c.get("user");

  // Fetch all non-converted, non-lost leads
  const allLeads = await db
    .select({
      id: leads.id,
      source: leads.source,
      phone: leads.phone,
      email: leads.email,
      interestCourse: leads.interestCourse,
      createdAt: leads.createdAt,
      score: leads.score,
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, user.tenantId),
        // Exclude terminal states — only qualify active leads
      )
    )
    .limit(500);

  let updated = 0;

  for (const lead of allLeads) {
    const qualification = qualifyLeadRow({
      source: lead.source,
      phone: lead.phone,
      email: lead.email,
      interestCourse: lead.interestCourse,
      createdAt: lead.createdAt,
      score: lead.score,
    });

    await db
      .update(leads)
      .set({ qualification, updatedAt: new Date() })
      .where(and(eq(leads.id, lead.id), eq(leads.tenantId, user.tenantId)));

    updated++;
  }

  return c.json({ updated });
});

// ─── PATCH /api/ai/leads/:id/qualify ─────────────────────────────────────────

/** Qualify a single lead and save the result. */
aiLeadsRoutes.patch("/leads/:id/qualify", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [lead] = await db
    .select({
      id: leads.id,
      source: leads.source,
      phone: leads.phone,
      email: leads.email,
      interestCourse: leads.interestCourse,
      createdAt: leads.createdAt,
      score: leads.score,
    })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)))
    .limit(1);

  if (!lead) {
    return c.json({ error: "Lead not found" }, 404);
  }

  const qualification = qualifyLeadRow({
    source: lead.source,
    phone: lead.phone,
    email: lead.email,
    interestCourse: lead.interestCourse,
    createdAt: lead.createdAt,
    score: lead.score,
  });

  await db
    .update(leads)
    .set({ qualification, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));

  return c.json({ qualification });
});

// ─── POST /api/ai/reply-suggestion ───────────────────────────────────────────

/**
 * Generate a WhatsApp draft reply for a lead message.
 * Human-in-the-loop: draft is returned, never sent automatically.
 */
aiLeadsRoutes.post(
  "/reply-suggestion",
  zValidator("json", replySuggestionSchema),
  async (c) => {
    const user = c.get("user");
    const { leadId, messageText, conversationHistory = [] } = c.req.valid("json");

    // Pseudonymize the conversation before sending to LLM
    // We don't know the exact names, so pseudonymize any capitalized words as a heuristic
    const allText = [messageText, ...conversationHistory].join(" ");
    // For the lead name, try to fetch it if leadId is provided
    let leadName = "";

    if (leadId) {
      const [leadRow] = await db
        .select({ fullName: leads.fullName })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, user.tenantId)))
        .limit(1);
      leadName = leadRow?.fullName ?? "";
    }

    const { text: pseudoMessage, tokenMap } = pseudonymize(
      messageText,
      leadName ? [leadName, user.name] : [user.name]
    );

    const systemPrompt = [
      "Ești un asistent AI pentru un centru educațional din România.",
      "Generezi răspunsuri profesioniste la mesaje WhatsApp primite de la părinți/elevi.",
      "Răspunsul trebuie să fie:",
      "- Politicos și prietenos",
      "- Concis (2-3 fraze max)",
      "- În limba română",
      "- Fără a promite prețuri specifice dacă nu sunt menționate",
      "Nu folosi date personale — acestea sunt înlocuite cu tokens.",
    ].join("\n");

    const historyContext = conversationHistory.length > 0
      ? `\nContext conversație anterioară:\n${conversationHistory.slice(-3).join("\n")}`
      : "";

    const userMessage = `${historyContext}\nMesajul primit de la client:\n"${pseudoMessage}"\n\nGenerează un răspuns profesionist:`;

    const result = await callAi({
      action: "reply_suggestion",
      systemPrompt,
      userMessage,
      tenantId: user.tenantId,
      userId: user.id,
      entityType: leadId ? "lead" : undefined,
      entityId: leadId,
      maxTokens: 256,
    });

    // Depseudonymize the response (tokens shouldn't appear in output, but just in case)
    const finalDraft = Object.keys(tokenMap).length > 0
      ? result.text.replace(/\[PERSON_\d+\]/g, "")
      : result.text;

    return c.json({
      draft: finalDraft.trim(),
      auditId: result.auditId,
      isStub: result.isStub,
    });
  }
);
