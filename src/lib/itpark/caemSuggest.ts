/**
 * ITPARK-203: suggestCaem(description) — helper determinist de sugestie cod CAEM
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §6 (AI = accelerator, nu sursă de cifre)
 *
 * Reguli keyword-driven (config-driven, nu scattered literals).
 * Sugestie ONLY — NICIODATĂ nu suprascrie codul setat manual de contabil.
 *
 * Utilizare:
 *   import { suggestCaem } from "src/lib/itpark/caemSuggest";
 *   const suggestion = suggestCaem("Servicii instruire domeniu digital");
 *   // → { code: "85.59", confidence: 0.9, reason: "keyword: instruire" }
 *
 * Serverul poate expune GET /api/itpark/caem-suggest?q=:text (ITPARK-203 endpoint).
 */

// ─── Config (keyword rules) ───────────────────────────────────────────────────
//
// Structură per regulă:
//   keywords: termeni de căutat (lowercase, fără diacritice; se acceptă și cu diacritice)
//   code: codul CAEM eligibil MITP sugerat
//   confidence: 0.0–1.0 (scor de încredere — informatv, nu blocant)
//   reason: descrierea scurtă a regulii (pentru UI tooltip)
//
// Ordinea contează: prima regulă care se potrivește câștigă.
// Nomenclator: CORE §4 + Decizia MITP nr. 4/11.03.2025.

export interface CaemRule {
  keywords: string[];
  code: string;
  confidence: number;
  reason: string;
}

export const CAEM_RULES: CaemRule[] = [
  // ── 85.59 — Alte forme de învățământ (instruire în domeniu digital) ──────
  {
    keywords: [
      "instruire",
      "invatamant",
      "învatamânt",
      "învatamant",
      "educatie",
      "educație",
      "curs",
      "cursuri",
      "formare",
      "training",
      "learning",
      "predare",
      "lectii",
      "lecții",
      "antrenament",
      "antrenamente",
      "workshop",
      "webinar",
    ],
    code: "85.59",
    confidence: 0.9,
    reason: "keyword: instruire/educație",
  },
  // ── 62.02 — Consultanță în tehnologia informației ────────────────────────
  {
    keywords: [
      "consultanta",
      "consultanță",
      "consulting",
      "consiliere",
      "advisory",
      "audit",
      "analiza",
      "analiză",
      "implementare",
      "implementación",
      "strategie",
      "outsourcing",
    ],
    code: "62.02",
    confidence: 0.85,
    reason: "keyword: consultanță IT",
  },
  // ── 62.01 — Realizarea de software la comandă ─────────────────────────────
  {
    keywords: [
      "software",
      "dezvoltare",
      "development",
      "programare",
      "programming",
      "aplicatie",
      "aplicație",
      "app",
      "website",
      "web",
      "cod",
      "codificare",
      "customizare",
      "customizare",
      "personalizare",
      "modulul",
      "crm",
      "erp",
      "platform",
      "platforma",
    ],
    code: "62.01",
    confidence: 0.85,
    reason: "keyword: software/dezvoltare",
  },
  // ── 63.11 — Prelucrarea datelor, hosting ──────────────────────────────────
  {
    keywords: [
      "hosting",
      "date",
      "data",
      "server",
      "cloud",
      "stocare",
      "baza de date",
      "database",
      "infrastructura",
      "infrastructură",
      "devops",
      "deploy",
      "mentenanta",
      "mentenanță",
      "suport",
      "support",
      "helpdesk",
    ],
    code: "63.11",
    confidence: 0.8,
    reason: "keyword: hosting/date",
  },
  // ── 62.09 — Alte activități de servicii IT ───────────────────────────────
  {
    keywords: [
      "servicii it",
      "it services",
      "tehnic",
      "technical",
      "administrare",
      "management",
      "configurare",
      "instalare",
      "retea",
      "rețea",
      "network",
      "securitate",
      "security",
      "cybersecurity",
    ],
    code: "62.09",
    confidence: 0.75,
    reason: "keyword: servicii IT diverse",
  },
  // ── 62.03 — Managementul mijloacelor de calcul ────────────────────────────
  {
    keywords: [
      "calcul",
      "hardware",
      "echipament",
      "calculator",
      "server management",
      "system administration",
      "sysadmin",
    ],
    code: "62.03",
    confidence: 0.7,
    reason: "keyword: management calcul",
  },
  // ── 58.21/58.29 — Editare jocuri / alte software ─────────────────────────
  {
    keywords: [
      "joc",
      "game",
      "gaming",
      "editare joc",
    ],
    code: "58.21",
    confidence: 0.85,
    reason: "keyword: jocuri de calculator",
  },
];

// ─── Core helper ─────────────────────────────────────────────────────────────

export interface CaemSuggestion {
  code: string;
  confidence: number;
  reason: string;
}

/**
 * suggestCaem(description) → prima regulă care se potrivește, sau null.
 *
 * Normalizare: lowercase, diacritice tolerate (ă→a, â→a, î→i, ș→s, ț→t),
 * spații multiple comprimate. Match parțial (includes).
 *
 * Sugestie ONLY — nu suprascrie codul manual. Verificați că `caemCode === ""`
 * înainte de a aplica sugestia.
 */
export function suggestCaem(description: string): CaemSuggestion | null {
  if (!description || !description.trim()) return null;

  const normalized = normalizeForMatch(description);

  for (const rule of CAEM_RULES) {
    for (const keyword of rule.keywords) {
      const normKeyword = normalizeForMatch(keyword);
      if (normalized.includes(normKeyword)) {
        return {
          code: rule.code,
          confidence: rule.confidence,
          reason: rule.reason,
        };
      }
    }
  }

  return null;
}

/** Normalizare text pentru matching (lowercase, fără diacritice, spații comprimate) */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ăâ]/g, "a")
    .replace(/[î]/g, "i")
    .replace(/[ș]/g, "s")
    .replace(/[ț]/g, "t")
    .replace(/\s+/g, " ")
    .trim();
}
