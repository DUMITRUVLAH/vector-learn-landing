/**
 * Motivele pentru care o cerere PAR nu poate fi trimisă spre aprobare, în română.
 *
 * Serverul răspunde la `POST /api/par/:id/submit` cu
 * `{ error: "validation_failed", errors: [{ field, message }] }` — mesajele lui sunt în
 * engleză și scrise pentru dezvoltatori. Formularul de creare le traducea deja, dar pagina
 * de detaliu (de unde se apasă „Trimite spre aprobare" pe o ciornă existentă) afișa doar
 * codul brut `validation_failed` — omul vedea o bandă roșie fără niciun motiv și nu avea
 * cum să ghicească CE lipsește (raportat 2026-08-28: două ciorne, una trece, alta nu).
 *
 * Sursa mesajelor e una singură, folosită de ambele ecrane.
 */
import { ApiError } from "@/lib/api";

/** `errors[].field` de la server → mesaj prietenos pentru utilizator. */
export const PAR_FIELD_MESSAGES: Record<string, string> = {
  line_items: "Adaugă cel puțin un articol în secțiunea „Articole” (totalul trebuie să fie > 0).",
  total: "Totalul estimat trebuie să fie mai mare ca 0 — adaugă articole.",
  end_use: "Completează „Descrierea utilizării finale” (obligatoriu pentru plăți).",
  payee: "Completează beneficiarul: nume + IBAN (sau alege un furnizor salvat).",
  payee_iban: "IBAN invalid.",
  payee_idnp: "IDNP invalid.",
  payee_bank: "Numele băncii e prea lung (max 300 caractere) — scurtează-l sau corectează-l.",
};

/** Mesajul pentru un câmp, cu întoarcere la textul serverului dacă nu îl cunoaștem. */
export function parFieldMessage(field: string, serverMessage?: string): string {
  return PAR_FIELD_MESSAGES[field] ?? serverMessage ?? "Câmp invalid.";
}

export interface ParSubmitErrorSummary {
  /** Titlul benzii de eroare. */
  summary: string;
  /** Câte un rând per motiv, în română. */
  reasons: string[];
}

/**
 * Traduce o eroare de la `/submit` într-un sumar afișabil.
 * Întoarce `null` dacă eroarea nu e o validare pe câmpuri (atunci arată mesajul obișnuit).
 */
export function describeParSubmitError(e: unknown): ParSubmitErrorSummary | null {
  if (!(e instanceof ApiError) || e.details.length === 0) return null;
  return {
    summary: "Cererea nu poate fi trimisă spre aprobare — mai lipsesc:",
    reasons: e.details.map((d) => parFieldMessage(d.field, d.message)),
  };
}

/**
 * Codurile cu care serverul refuză antetul unei cereri (plătitor/proiect/cod bugetar/date), în
 * română. Fără ele, ecranul arăta „payer_not_found" sau — mai rău — un generic „NU s-a salvat",
 * iar omul nu avea de unde ști că problema e la plătitor, nu la fișierul pe care tocmai l-a ales
 * (patenta, 23.09.2026).
 */
export const PAR_SCOPE_ERROR_MESSAGES: Record<string, string> = {
  payer_not_found: "Plătitorul ales nu mai e activ — alege altul la „Plătitor / Organizație”.",
  project_not_found: "Proiectul ales nu mai e activ — alege altul la „Proiect / Program”.",
  project_not_in_payer: "Proiectul ales nu aparține plătitorului — verifică „Plătitor” și „Proiect”.",
  event_not_found: "Evenimentul ales nu mai e activ — alege altul.",
  event_not_in_project: "Evenimentul ales nu aparține proiectului.",
  budget_code_not_found: "Codul bugetar ales nu mai e activ — alege altul.",
  budget_code_not_in_payer: "Codul bugetar nu aparține plătitorului ales.",
  budget_code_not_in_project: "Codul bugetar nu aparține proiectului ales.",
  department_not_found: "Departamentul ales nu mai există — alege altul.",
  forbidden_payer: "Nu ai acces la plătitorul ales.",
  forbidden_project: "Nu ai acces la proiectul ales.",
  module_disabled: "Modulul PAR nu e activ pentru plătitorul ales.",
  "date_needed must be >= date_of_request": "„Data necesară” e înaintea datei cererii.",
};

/**
 * O eroare de scriere a cererii, spusă omenește: detaliul serverului, câmpurile refuzate sau codul
 * tradus. Întoarce null când nu e o eroare a API-ului (apelantul își pune textul lui).
 */
export function describeParWriteError(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  if (typeof e.body.detail === "string" && e.body.detail.trim()) return e.body.detail;
  if (e.details.length) return e.details.map((d) => parFieldMessage(d.field, d.message)).join(" ");
  if (PAR_SCOPE_ERROR_MESSAGES[e.code]) return PAR_SCOPE_ERROR_MESSAGES[e.code];
  // `network_error` / `request_timeout` vin cu mesajul lor deja în română.
  if (e.message && e.message !== e.code) return e.message;
  return null;
}

