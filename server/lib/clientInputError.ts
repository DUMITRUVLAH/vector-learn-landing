/**
 * Care excepții sunt vina CERERII, nu a serverului — ca `app.onError` să le răspundă cu 4xx.
 *
 * De ce (suita CRM de 1000 de scenarii, 2026-09-26): `app.onError` întorcea 500 pentru ORICE
 * excepție, deci trei feluri de input greșit al clientului arătau ca pene de server:
 *   1. JSON stricat sau corp gol → validatorul Hono aruncă `HTTPException(400)`, iar handlerul
 *      global o transforma în 500 (72 de rute CRM, dar și restul aplicației);
 *   2. un id care nu e uuid în URL (`/api/crm/leads/abc`) → Postgres `22P02` → 500 (129 de rute);
 *   3. un octet nul într-un câmp de text (îl trimite ușor un formular lipit din PDF) → `22021` → 500.
 * Fiecare 500 fals ajungea și în Consola Platformă ca „eroare nouă" și costa un email de alertă.
 *
 * Ce NU intră aici: orice altă eroare de bază (constrângeri, coloane lipsă, timeouturi) — acelea
 * sunt bug-uri reale și rămân 500, cu telemetrie.
 */
import { HTTPException } from "hono/http-exception";

/** Coduri SQLSTATE care înseamnă „valoarea trimisă nu e de tipul coloanei". */
const INPUT_SQLSTATES = new Set([
  "22P02", // invalid_text_representation — ex. `invalid input syntax for type uuid: "abc"`
  "22021", // character_not_in_repertoire — octet nul (0x00) într-un text
]);

export interface ClientError {
  status: 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 422 | 429;
  error: string;
}

function sqlState(err: unknown): string | null {
  // drizzle/postgres.js pun codul pe eroare; unele versiuni o împachetează în `cause`.
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/**
 * @param hasJsonBody cererea a trimis un corp JSON — doar atunci un `SyntaxError` e al
 *   clientului; un `JSON.parse` stricat pe date din bază rămâne bug de server.
 */
export function classifyClientError(err: unknown, hasJsonBody: boolean): ClientError | null {
  if (err instanceof HTTPException && err.status >= 400 && err.status < 500) {
    const status = err.status as ClientError["status"];
    return { status, error: status === 400 ? "invalid_body" : err.message || "request_error" };
  }
  if (err instanceof SyntaxError && hasJsonBody) return { status: 400, error: "invalid_json" };
  const state = sqlState(err);
  if (state && INPUT_SQLSTATES.has(state)) return { status: 400, error: "invalid_input" };
  // PGlite (baza locală și a testelor) nu pune mereu `code`; mesajul e același ca în Postgres.
  const msg = err instanceof Error ? err.message : "";
  if (/invalid input syntax for type (uuid|integer|bigint|numeric|boolean|date|timestamp)/i.test(msg)) {
    return { status: 400, error: "invalid_input" };
  }
  if (/invalid byte sequence for encoding "UTF8": 0x00|unsupported Unicode escape sequence/i.test(msg)) {
    return { status: 400, error: "invalid_input" };
  }
  return null;
}
