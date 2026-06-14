/**
 * ITPARK-701: Client API for ITPARK AI endpoints
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §6.1 (AI constraints)
 *
 * Key rule: AI NEVER modifies amounts or eligibility thresholds.
 * All AI results are PROPOSALS that the user confirms before saving.
 */

const AI_BASE = "/api/itpark/ai";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaemSuggestion {
  source: "ai" | "deterministic" | "stub";
  code: string;
  score: number;
  reason: string;
  auditId?: string;
  isStub: boolean;
}

export interface InvoiceExtractionProposal {
  clientName: string;
  amountCents: number;
  invoiceDate: string;
  caemCode: string;
  serviceDescription: string;
  documentRefs: string;
}

export interface InvoiceExtractionResult {
  source: "ai" | "stub";
  proposal: InvoiceExtractionProposal;
  auditId?: string;
  isStub: boolean;
  message?: string;
}

// ─── suggest-caem ─────────────────────────────────────────────────────────────

/**
 * Get AI suggestion for CAEM code given a service description.
 * AI NEVER changes amounts or eligibility — purely informational.
 */
export async function suggestCaem(opts: {
  description: string;
  currentCaem?: string;
  engagementId: string;
}): Promise<CaemSuggestion> {
  const res = await fetch(`${AI_BASE}/suggest-caem`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`suggestCaem: ${res.status} ${err.error ?? ""}`);
  }

  return res.json();
}

// ─── extract-invoice ──────────────────────────────────────────────────────────

/**
 * Extract revenue line fields from raw invoice text.
 * Returns a PROPOSAL — must be confirmed by user before being saved.
 */
export async function extractInvoice(opts: {
  invoiceText: string;
  engagementId: string;
}): Promise<InvoiceExtractionResult> {
  const res = await fetch(`${AI_BASE}/extract-invoice`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(`extractInvoice: ${res.status} ${err.error ?? ""}`);
  }

  return res.json();
}
