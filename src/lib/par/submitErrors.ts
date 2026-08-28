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
