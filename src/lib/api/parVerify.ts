/**
 * PARVERIFY-001 — clientul paginii publice de verificare.
 *
 * Nu trece prin `src/lib/api.ts`: acela trimite cookie-uri, deduplică și raportează erorile prin
 * telemetrie, toate potrivite pentru o aplicație cu sesiune. Aici vorbim cu o rută anonimă,
 * deschisă de un om care poate nici n-are cont — un `fetch` simplu, fără credențiale, e exact
 * cât trebuie și nu trimite nimic despre cine scanează.
 */

export interface VerifyLineItem {
  description: string;
  quantity: number | string;
  unit: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface VerifyApproval {
  step: number;
  name: string | null;
  title: string | null;
  decision: string;
  decidedAt: string | null;
  signatureCode: string | null;
}

export interface VerifyResult {
  valid: true;
  /** `true`/`false` față de amprenta din QR; `null` pe o hârtie tipărită înainte de această funcție. */
  matchesPrinted: boolean | null;
  checkedAt: string;
  organization: string | null;
  par: {
    requestNo: string | null;
    status: string;
    dateOfRequest: string | null;
    dateNeeded: string | null;
    requestedByName: string | null;
    requestorTitle: string | null;
    departmentName: string | null;
    projectName: string | null;
    eventName: string | null;
    purpose: string;
    currency: string;
    totalEstimatedCents: number;
    totalMdlCents: number | null;
    submittedAt: string | null;
    approvedAt: string | null;
    lineItems: VerifyLineItem[];
    requestor: VerifyApproval | null;
    approvals: VerifyApproval[];
  };
}

/** De ce a eșuat verificarea — fiecare caz are alt mesaj pe ecran, vezi pagina. */
export type VerifyFailure = "invalid_code" | "not_found" | "revoked" | "rate_limited" | "network";

export class VerifyError extends Error {
  constructor(public readonly reason: VerifyFailure) {
    super(reason);
  }
}

/**
 * Ce a tastat omul → tokenul din bază, sau `null` dacă nu poate fi unul.
 *
 * Oglindește `normalizeToken` de pe server (`server/lib/par/verifyCodes.ts`) și e aici ca ecranul
 * să respingă un cod evident greșit fără să mai plece o cerere: alfabetul nu conține I, L, O și U
 * tocmai fiindcă se confundă cu 1, 0 și V pe o hârtie fotocopiată, iar cratimele și spațiile pe
 * care le pune omul nu au nicio semnificație.
 */
export function normalizeVerifyCode(raw: string): string | null {
  const norm = raw.replace(/[^0-9a-z]/gi, "").toUpperCase();
  if (norm.length !== 16) return null;
  if (!/^[0-9A-HJKMNP-TV-Z]+$/.test(norm)) return null;
  return norm;
}

export async function verifyParDocument(token: string, fingerprint?: string): Promise<VerifyResult> {
  const qs = fingerprint ? `?v=${encodeURIComponent(fingerprint)}` : "";
  let res: Response;
  try {
    res = await fetch(`/api/public/par/verify/${encodeURIComponent(token)}${qs}`, {
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new VerifyError("network");
  }
  if (res.status === 429) throw new VerifyError("rate_limited");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason;
    if (reason === "revoked" || reason === "not_found" || reason === "invalid_code") {
      throw new VerifyError(reason);
    }
    throw new VerifyError("network");
  }
  return (await res.json()) as VerifyResult;
}
