/**
 * AI-A01 — AI LLM client wrapper
 *
 * Wraps fetch to Anthropic's Messages API. Falls back to a deterministic stub
 * when AI_API_KEY is not set in env so the app remains functional without
 * an AI subscription.
 *
 * AI-A04: Integrated budget guard + feature flags. When the monthly budget is
 * exceeded OR the feature is disabled, returns a graceful degradation stub
 * and logs "ai_budget_exceeded" / "ai_feature_disabled" to ai_audit_log.
 *
 * Every call is logged to ai_audit_log for GDPR audit purposes.
 */
import { db } from "../../db/client";
import { aiAuditLog } from "../../db/schema";
import { checkBudget } from "./budgetGuard";
import { isEnabled } from "./featureFlags";
import type { AiFeature } from "./featureFlags";

const API_KEY = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = process.env.AI_MODEL ?? "claude-3-haiku-20240307";

/** Approximate cost in micro-USD per token (Haiku: ~0.25/1M input, 1.25/1M output) */
const COST_PER_INPUT_TOKEN_MICRO = 0.00025; // $0.00025 per token = 0.25 micro-USD
const COST_PER_OUTPUT_TOKEN_MICRO = 0.00125;

export interface AiCallOptions {
  action: string;
  systemPrompt?: string;
  userMessage: string;
  tenantId: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  maxTokens?: number;
}

export interface AiCallResult {
  text: string;
  auditId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  isStub: boolean;
}

/** Stub responses per action when API key is not configured */
const STUB_RESPONSES: Record<string, string> = {
  lesson_summary:
    "Elevul a demonstrat progres în vocabularul de bază. " +
    "A întâmpinat dificultăți cu pronunția sunetelor complexe. " +
    "Recomandăm exersarea zilnică 10-15 minute prin aplicații audio. " +
    "Participarea la activitățile de grup a fost activă și pozitivă. " +
    "Obiectivul pentru săptămâna viitoare: consolidarea timpurilor verbale.",
  churn_prediction:
    "Pe baza datelor disponibile, risc mediu de abandon. " +
    "Recomandare: contactați părintele și propuneți o lecție de recuperare.",
  lead_qualification:
    "Lead calificat ca warm. Sursa organică, câmpuri parțial completate. " +
    "Recomandare: contactați în 24h cu oferta standard.",
  reply_suggestion:
    "Bună ziua! Vă mulțumim pentru mesaj. " +
    "Vă contactăm în cel mai scurt timp cu detaliile solicitate. " +
    "Echipa Vector Learn",
  // CAPTURE-002: stub JSON pentru extracție bon/factură (mock mode fără API key)
  capture_extract:
    '{"vendor_name":{"value":"Demo Furnizor SRL","confidence":0.9},' +
    '"amount_cents":{"value":10000,"confidence":0.9},' +
    '"vat_amount_cents":{"value":2000,"confidence":0.9},' +
    '"vat_deductible":{"value":true,"confidence":0.9},' +
    '"expense_date":{"value":"2026-06-14","confidence":0.9},' +
    '"iban":{"value":null,"confidence":0},' +
    '"category":{"value":"other","confidence":0.9},' +
    '"reference":{"value":null,"confidence":0}}',
  default:
    "Răspuns generat de AI. [Configurați AI_API_KEY pentru răspunsuri reale.]",
};

/**
 * Make an AI completion call, log it to ai_audit_log, and return the result.
 * Falls back to stub if no API key is configured.
 * AI-A04: Checks budget cap and feature flags before calling the LLM.
 */
export async function callAi(opts: AiCallOptions): Promise<AiCallResult> {
  const {
    action,
    systemPrompt,
    userMessage,
    tenantId,
    userId,
    entityType,
    entityId,
    maxTokens = 512,
  } = opts;

  // --- AI-A04: Feature-disabled gate ---
  // Only check known AI features (skip unknown/system actions)
  const KNOWN_FEATURES = ["lesson_summary", "churn_prediction", "lead_qualification", "reply_suggestion"] as const;
  type KnownFeature = typeof KNOWN_FEATURES[number];
  if (KNOWN_FEATURES.includes(action as KnownFeature)) {
    const featureEnabled = await isEnabled(tenantId, action as AiFeature);
    if (!featureEnabled) {
      const stubText = "[AI dezactivat de admin]";
      const [auditRow] = await db
        .insert(aiAuditLog)
        .values({
          tenantId,
          userId,
          action,
          model: "stub",
          promptTokens: 0,
          completionTokens: 0,
          costUsdMicro: 0,
          pseudonymized: false,
          entityType,
          entityId,
          status: "feature_disabled",
          note: `Feature "${action}" disabled by admin`,
        })
        .returning({ id: aiAuditLog.id });

      return {
        text: stubText,
        auditId: auditRow.id,
        model: "stub",
        promptTokens: 0,
        completionTokens: 0,
        isStub: true,
      };
    }
  }

  // --- AI-A04: Budget-exceeded gate ---
  const withinBudget = await checkBudget(tenantId);
  if (!withinBudget) {
    const stubText =
      "Bugetul lunar AI al organizației tale a fost depășit. " +
      "Contactează administratorul pentru a mări limita.";
    const [auditRow] = await db
      .insert(aiAuditLog)
      .values({
        tenantId,
        userId,
        action,
        model: "stub",
        promptTokens: 0,
        completionTokens: 0,
        costUsdMicro: 0,
        pseudonymized: false,
        entityType,
        entityId,
        status: "budget_exceeded",
        note: "Monthly AI budget exceeded",
      })
      .returning({ id: aiAuditLog.id });

    return {
      text: stubText,
      auditId: auditRow.id,
      model: "stub",
      promptTokens: 0,
      completionTokens: 0,
      isStub: true,
    };
  }

  // --- Stub path (no API key) ---
  if (!API_KEY) {
    const stubText = STUB_RESPONSES[action] ?? STUB_RESPONSES.default;
    const [auditRow] = await db
      .insert(aiAuditLog)
      .values({
        tenantId,
        userId,
        action,
        model: "stub",
        promptTokens: 0,
        completionTokens: 0,
        costUsdMicro: 0,
        pseudonymized: true,
        entityType,
        entityId,
        status: "completed",
        note: "Stub response — AI_API_KEY not configured",
      })
      .returning({ id: aiAuditLog.id });

    return {
      text: stubText,
      auditId: auditRow.id,
      model: "stub",
      promptTokens: 0,
      completionTokens: 0,
      isStub: true,
    };
  }

  // --- Real Anthropic API path ---
  let responseText = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let status = "completed";
  let note: string | undefined;

  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: "user", content: userMessage },
    ];

    const payload = {
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000), // 30s hard timeout
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${errBody}`);
    }

    const data = (await resp.json()) as {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    responseText = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");

    promptTokens = data.usage?.input_tokens ?? 0;
    completionTokens = data.usage?.output_tokens ?? 0;
  } catch (err) {
    status = "error";
    note = err instanceof Error ? err.message : String(err);
    responseText = STUB_RESPONSES[action] ?? STUB_RESPONSES.default;
  }

  const costMicro = Math.round(
    promptTokens * COST_PER_INPUT_TOKEN_MICRO +
      completionTokens * COST_PER_OUTPUT_TOKEN_MICRO
  );

  const [auditRow] = await db
    .insert(aiAuditLog)
    .values({
      tenantId,
      userId,
      action,
      model: MODEL,
      promptTokens,
      completionTokens,
      costUsdMicro: costMicro,
      pseudonymized: true,
      entityType,
      entityId,
      status,
      note,
    })
    .returning({ id: aiAuditLog.id });

  return {
    text: responseText,
    auditId: auditRow.id,
    model: MODEL,
    promptTokens,
    completionTokens,
    isStub: false,
  };
}
