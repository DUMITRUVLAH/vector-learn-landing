/**
 * ITPARK-701: AI layer — CAEM code suggestion + invoice extraction
 * Mounted in server/app.ts: app.route("/api/itpark/ai", itparkAiRoutes)
 *
 * Routes:
 *   POST /api/itpark/ai/suggest-caem       — given description, suggest CAEM code
 *   POST /api/itpark/ai/extract-invoice    — given invoice text, extract line fields
 *
 * AI constraints (ITPARK-CORE.md §6.1):
 *   - AI NEVER recomputes totals/share/threshold (deterministic ITPARK-301/302 stays)
 *   - PII (client names) anonymized before prompt using pseudonymize()
 *   - All suggestions logged in ai_audit_log
 *   - Graceful degrade to deterministic CAEM lookup when AI off or budget exceeded
 *   - Gate: aiFeatureFlags.feature = "itpark_caem_suggest"
 *
 * How deterministic/AI coexist:
 *   1. Deterministic lookup (itpark_caem_codes table) runs FIRST — if confidence ≥ 90% skip AI
 *   2. AI suggestion is surfaced as a PROPOSAL with code+score+reason; user 1-click confirms
 *   3. AI result never modifies amounts or eligibility thresholds directly
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, like, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  itparkCaemCodes,
  itparkRevenueLines,
  itparkEngagements,
} from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireItparkRole } from "../lib/itparkAuth";
import { callAi } from "../lib/ai/client";
import { pseudonymize } from "../lib/ai/pseudonymize";

export const itparkAiRoutes = new Hono<{ Variables: AuthVariables }>();
itparkAiRoutes.use("*", requireAuth);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const suggestCaemSchema = z.object({
  /** Service/activity description from the invoice (will be pseudonymized) */
  description: z.string().min(3).max(2000),
  /** Optional: existing CAEM code to validate/improve */
  currentCaem: z.string().max(10).optional(),
  /** Engagement ID for context (tenant scoping) */
  engagementId: z.string().uuid(),
});

const extractInvoiceSchema = z.object({
  /** Raw invoice text (extracted from PDF/image by client-side OCR or pasted) */
  invoiceText: z.string().min(10).max(8000),
  /** Engagement ID for context + tenant scoping */
  engagementId: z.string().uuid(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministic CAEM lookup: exact code match → confidence 100%, fuzzy → 0 */
async function deterministicCaemLookup(
  description: string,
  currentCaem?: string
): Promise<{ code: string; reason: string; confidence: number } | null> {
  // If currentCaem is provided and valid, return it at 100%
  if (currentCaem && currentCaem.trim().length >= 4) {
    const [row] = await db
      .select({ code: itparkCaemCodes.code, label: itparkCaemCodes.label })
      .from(itparkCaemCodes)
      .where(eq(itparkCaemCodes.code, currentCaem.trim()))
      .limit(1);
    if (row) {
      return {
        code: row.code,
        reason: `Cod CAEM ${row.code} valid: ${row.label}`,
        confidence: 100,
      };
    }
  }

  // Keyword-based heuristic: common IT Park eligible codes
  const desc = description.toLowerCase();
  if (
    desc.includes("software") ||
    desc.includes("aplicat") ||
    desc.includes("development") ||
    desc.includes("programare") ||
    desc.includes("sisteme informatic")
  ) {
    return { code: "6201", reason: "Activităţi de realizare a software-ului la comandă (6201)", confidence: 85 };
  }
  if (
    desc.includes("consul") ||
    desc.includes("it consultant") ||
    desc.includes("suport tehnic") ||
    desc.includes("mentenanț")
  ) {
    return { code: "6202", reason: "Activităţi de consultanţă în domeniul TI (6202)", confidence: 80 };
  }
  if (
    desc.includes("procesare date") ||
    desc.includes("data proc") ||
    desc.includes("cloud") ||
    desc.includes("hosting")
  ) {
    return { code: "6311", reason: "Prelucrarea datelor, administrarea paginilor web (6311)", confidence: 78 };
  }
  if (
    desc.includes("design") ||
    desc.includes("ui ") ||
    desc.includes("ux ") ||
    desc.includes("interfata") ||
    desc.includes("interfață")
  ) {
    return { code: "7410", reason: "Activităţi de design specializat (7410)", confidence: 70 };
  }

  return null; // not confident enough for deterministic path
}

/** Parse AI response for CAEM suggestion */
function parseCaemResponse(text: string): {
  code: string;
  score: number;
  reason: string;
} {
  // Expected format: JSON { code: "XXXX", score: 0-100, reason: "..." }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { code?: string; score?: number; reason?: string };
      if (typeof parsed.code === "string" && typeof parsed.score === "number") {
        return {
          code: parsed.code.replace(/\./g, "").slice(0, 6),
          score: Math.min(100, Math.max(0, parsed.score)),
          reason: parsed.reason ?? "Sugestie AI",
        };
      }
    }
  } catch {
    // fall through to line parsing
  }

  // Fallback: look for "CODE: XXXX" or "CAEM: XXXX" pattern
  const codeMatch = text.match(/(?:cod|caem|code)[:\s]+([0-9]{4,6})/i);
  const scoreMatch = text.match(/(?:scor|score|confiden)[:\s]+([0-9]+)/i);

  return {
    code: codeMatch?.[1] ?? "6201",
    score: scoreMatch ? parseInt(scoreMatch[1], 10) : 60,
    reason: text.slice(0, 300),
  };
}

/** Parse AI response for invoice extraction */
function parseInvoiceResponse(text: string): {
  clientName: string;
  amountCents: number;
  invoiceDate: string;
  caemCode: string;
  serviceDescription: string;
  documentRefs: string;
} {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        clientName?: string;
        amountCents?: number;
        amountMdl?: number;
        invoiceDate?: string;
        caemCode?: string;
        serviceDescription?: string;
        documentRefs?: string;
      };
      return {
        clientName: parsed.clientName ?? "",
        amountCents: parsed.amountCents ?? Math.round((parsed.amountMdl ?? 0) * 100),
        invoiceDate: parsed.invoiceDate ?? new Date().toISOString().slice(0, 10),
        caemCode: parsed.caemCode ?? "6201",
        serviceDescription: parsed.serviceDescription ?? "",
        documentRefs: parsed.documentRefs ?? "",
      };
    }
  } catch {
    // fall through to defaults
  }
  return {
    clientName: "",
    amountCents: 0,
    invoiceDate: new Date().toISOString().slice(0, 10),
    caemCode: "6201",
    serviceDescription: "",
    documentRefs: "",
  };
}

// ─── POST /suggest-caem ───────────────────────────────────────────────────────

/**
 * Suggests CAEM code for ambiguous service descriptions.
 *
 * Pipeline:
 * 1. Check aiFeatureFlags for "itpark_caem_suggest" — if disabled → deterministic fallback
 * 2. Run deterministic lookup — if confidence ≥ 90% → return without AI call
 * 3. Pseudonymize description (client names → PERSOANA_X)
 * 4. Call AI with CAEM taxonomy prompt
 * 5. Parse + validate response
 * 6. Log in ai_audit_log (via callAi)
 */
itparkAiRoutes.post(
  "/suggest-caem",
  zValidator("json", suggestCaemSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const { description, currentCaem, engagementId } = c.req.valid("json");

    // Verify engagement belongs to tenant
    const engagement = await db.query.itparkEngagements.findFirst({
      where: and(
        eq(itparkEngagements.id, engagementId),
        eq(itparkEngagements.tenantId, user.tenantId)
      ),
    });
    if (!engagement) {
      return c.json({ error: "engagement_not_found" }, 404);
    }

    // Step 1: Try deterministic lookup first
    const deterministic = await deterministicCaemLookup(description, currentCaem);
    if (deterministic && deterministic.confidence >= 90) {
      return c.json({
        source: "deterministic",
        code: deterministic.code,
        score: deterministic.confidence,
        reason: deterministic.reason,
        isStub: false,
      });
    }

    // Step 2: Pseudonymize description — replace company names with FIRMA_X
    const pseudoResult = pseudonymize(description);
    const pseudoDescription = pseudoResult.text;

    // Step 3: AI call (with deterministic fallback as context)
    const systemPrompt = `Ești expert în clasificarea activităților economice conform Nomenclatorului CAEM (Rev. 2) pentru Moldova, în contextul Parcului IT Moldova (MITP). Răspunde NUMAI cu un obiect JSON cu câmpurile: {"code": "XXXX", "score": 0-100, "reason": "..."}.
Coduri CAEM eligibile pentru MITP (principale): 6201 (software la comandă), 6202 (consultanță IT), 6209 (alte activități IT), 6311 (prelucrarea datelor), 6312 (portaluri web), 7110 (arhitectură/inginerie), 7410 (design), 7020 (consultanță management).
NU modifica sume, cote, sau calcule de eligibilitate — acestea sunt calcule deterministe.`;

    const userMessage = `Descrierea serviciului: "${pseudoDescription}"\n${currentCaem ? `Cod CAEM curent propus: ${currentCaem}\n` : ""}Sugerează cel mai potrivit cod CAEM pentru Parcul IT Moldova. Dacă nu ești sigur, setează score < 60.`;

    const aiResult = await callAi({
      action: "itpark_caem_suggest",
      systemPrompt,
      userMessage,
      tenantId: user.tenantId,
      userId: user.id,
      entityType: "itpark_engagement",
      entityId: engagementId,
      maxTokens: 256,
    });

    if (aiResult.isStub) {
      // AI disabled or budget exceeded — return deterministic fallback or generic
      const fallback = deterministic ?? { code: currentCaem ?? "6201", score: 50, reason: "Sugestie implicită (AI dezactivat)" };
      return c.json({
        source: "stub",
        code: fallback.code,
        score: fallback.confidence ?? fallback.score,
        reason: fallback.reason,
        isStub: true,
      });
    }

    const parsed = parseCaemResponse(aiResult.text);

    return c.json({
      source: "ai",
      code: parsed.code,
      score: parsed.score,
      reason: parsed.reason,
      auditId: aiResult.auditId,
      isStub: false,
    });
  }
);

// ─── POST /extract-invoice ────────────────────────────────────────────────────

/**
 * Extracts revenue line fields from raw invoice text.
 *
 * The client provides text extracted from the invoice (via browser-side copy-paste,
 * or FileReader + basic text extraction). The AI parses it into structured fields.
 *
 * The returned proposal is purely advisory — user must confirm before it's saved.
 * AI NEVER creates the line directly — the confirm action calls /api/itpark/lines (POST).
 */
itparkAiRoutes.post(
  "/extract-invoice",
  zValidator("json", extractInvoiceSchema),
  async (c) => {
    const deny = await requireItparkRole("accountant", c);
    if (deny) return deny;

    const user = c.get("user");
    const { invoiceText, engagementId } = c.req.valid("json");

    // Verify engagement ownership
    const engagement = await db.query.itparkEngagements.findFirst({
      where: and(
        eq(itparkEngagements.id, engagementId),
        eq(itparkEngagements.tenantId, user.tenantId)
      ),
    });
    if (!engagement) {
      return c.json({ error: "engagement_not_found" }, 404);
    }

    // Pseudonymize invoice text before sending to LLM
    const pseudoResult = pseudonymize(invoiceText.slice(0, 4000));
    const pseudoText = pseudoResult.text;

    const systemPrompt = `Ești expert în extragerea datelor din facturi fiscale moldovenești. Răspunde NUMAI cu un obiect JSON cu câmpurile exacte: {"clientName": "...", "amountMdl": 12345.67, "invoiceDate": "YYYY-MM-DD", "caemCode": "XXXX", "serviceDescription": "...", "documentRefs": "..."}.
- amountMdl: suma totală în lei MDL (number)
- caemCode: codul CAEM cel mai potrivit pentru serviciul facturat (ex: "6201")
- invoiceDate: data facturii în format ISO "YYYY-MM-DD"
- documentRefs: numărul și data facturii (ex: "Factura EBC000276766 din 27.10.2025")
- clientName va fi anonimizat ulterior — extrage ce e în factură
NU modifica sume sau calcule de eligibilitate.`;

    const userMessage = `Text factură:\n${pseudoText}`;

    const aiResult = await callAi({
      action: "itpark_caem_suggest", // reuse same feature gate
      systemPrompt,
      userMessage,
      tenantId: user.tenantId,
      userId: user.id,
      entityType: "itpark_engagement",
      entityId: engagementId,
      maxTokens: 512,
    });

    if (aiResult.isStub) {
      return c.json({
        source: "stub",
        proposal: {
          clientName: "",
          amountCents: 0,
          invoiceDate: new Date().toISOString().slice(0, 10),
          caemCode: "6201",
          serviceDescription: "",
          documentRefs: "",
        },
        isStub: true,
        message: "AI dezactivat — completați câmpurile manual.",
      });
    }

    const proposal = parseInvoiceResponse(aiResult.text);

    return c.json({
      source: "ai",
      proposal,
      auditId: aiResult.auditId,
      isStub: false,
    });
  }
);
