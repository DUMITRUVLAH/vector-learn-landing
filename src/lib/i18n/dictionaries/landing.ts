/**
 * Dicționar `landing.*` — pagina publică FinFlow (`/business`).
 *
 * Cheile urmăresc secțiunile din `BusinessLandingPage.tsx`, în ordinea în care
 * apar pe pagină, ca traducerea să se poată face secțiune cu secțiune fără să
 * pierzi firul:
 *
 *   nav · hero · trustedBy · pain · beforeAfter · flow · stats · ai · doa ·
 *   finance · efactura · more · security · modules · pricing · contact ·
 *   finalCta · footer
 *
 * Ce NU intră aici: datele de vitrină inventate din `DEMO` (nume, IBAN, IDNO) —
 * sunt identice în ambele limbi și trăiesc mai departe în pagină.
 *
 * Nota pentru pasul de traducere: EN nu e o transliterare. Titlurile de landing
 * sunt copy, nu propoziții — păstrează ritmul scurt și promisiunea, nu cuvintele.
 */
import type { Dict, Translated } from "../types";

export const ro = {
  // ── nav ────────────────────────────────────────────────────────────────────
  "landing.nav.ai": "AI",
  "landing.nav.approvals": "Aprobări",
  "landing.nav.flow": "Fluxul",
  "landing.nav.security": "Securitate",
  "landing.nav.pricing": "Prețuri",
  "landing.nav.guides": "Ghiduri",
  "landing.nav.login": "Autentificare",

  // ── hero ───────────────────────────────────────────────────────────────────
  "landing.hero.titleLead": "Nicio plată fără aprobare.",
  "landing.hero.titleAccent": "Nicio aprobare fără urmă",
  "landing.hero.subtitle":
    "Cereri de plată, aprobări și execuție — un singur traseu, cu dovada la capăt.",
  "landing.hero.ctaPrimary": "Intră în cont",
  "landing.hero.ctaSecondary": "Vezi fluxul",
  "landing.hero.note": "Nu ai cont? Îl creezi din aceeași pagină · fără card bancar",

  // ── secțiunile rămase se completează la pasul de traducere ─────────────────
} as const satisfies Dict;

export const en: Translated<typeof ro> = {
  // ── nav ────────────────────────────────────────────────────────────────────
  "landing.nav.ai": "AI",
  "landing.nav.approvals": "Approvals",
  "landing.nav.flow": "The flow",
  "landing.nav.security": "Security",
  "landing.nav.pricing": "Pricing",
  "landing.nav.guides": "Guides",
  "landing.nav.login": "Sign in",

  // ── hero ───────────────────────────────────────────────────────────────────
  "landing.hero.titleLead": "No payment without approval.",
  "landing.hero.titleAccent": "No approval without a trace",
  "landing.hero.subtitle":
    "Payment requests, approvals and execution — one path, with the proof at the end.",
  "landing.hero.ctaPrimary": "Go to your account",
  "landing.hero.ctaSecondary": "See the flow",
  "landing.hero.note": "No account? You create it on the same page · no card required",
};
