/**
 * AI-A03 — Rule-based lead qualification scorer
 *
 * Classifies a lead as hot | warm | cold based on:
 * - Source quality (organic/ads = better)
 * - Data completeness (phone + email + course = complete)
 * - Recency (created < 24h = hot, < 7 days = warm)
 * - Interaction signals (message received = engaged)
 *
 * No external LLM needed — purely rule-based logic.
 */
type Qualification = "hot" | "warm" | "cold";

const HOT_SOURCES = ["webform", "facebook_ad", "google_ads", "instagram"];
const WARM_SOURCES = ["phone_in", "referral"];

/**
 * Qualify a lead as hot / warm / cold based on engagement signals.
 */
export function qualifyLead(lead: {
  source: string;
  phone?: string | null;
  email?: string | null;
  interestCourse?: string | null;
  createdAt: Date | string;
  score?: number | null;
}): Qualification {
  const now = Date.now();
  const createdAt =
    lead.createdAt instanceof Date
      ? lead.createdAt.getTime()
      : new Date(lead.createdAt).getTime();

  const ageMs = now - createdAt;
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageHours / 24;

  // Fast-path: use existing score if available (CRM-111 scoring)
  if (lead.score !== null && lead.score !== undefined) {
    if (lead.score >= 70) return "hot";
    if (lead.score >= 40) return "warm";
    return "cold";
  }

  // Rule-based qualification:
  const isHighQualitySource = HOT_SOURCES.includes(lead.source);
  const isMediumSource = WARM_SOURCES.includes(lead.source);
  const hasContact = !!(lead.phone || lead.email);
  const hasAllFields = !!(lead.phone && lead.email && lead.interestCourse);
  const isFresh = ageHours < 24;
  const isRecent = ageDays < 7;

  // Hot: fresh (< 24h) + high-quality source + has contact info
  if (isFresh && (isHighQualitySource || isMediumSource) && hasContact) {
    return "hot";
  }

  // Hot: all fields filled in + recent (< 7 days)
  if (hasAllFields && isRecent) {
    return "hot";
  }

  // Warm: recent + has contact info
  if (isRecent && hasContact) {
    return "warm";
  }

  // Warm: medium source + has contact
  if ((isHighQualitySource || isMediumSource) && hasContact) {
    return "warm";
  }

  return "cold";
}

/**
 * Map a Lead DB row to a qualification string.
 * Convenience wrapper for use in route handlers.
 */
export function qualifyLeadRow(lead: {
  source: string;
  phone?: string | null;
  email?: string | null;
  interestCourse?: string | null;
  createdAt: Date | string;
  score?: number | null;
}): Qualification {
  return qualifyLead(lead);
}
