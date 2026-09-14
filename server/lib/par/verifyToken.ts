/**
 * PARVERIFY-001 — tokenul de verificare al unei cereri, creat la nevoie.
 *
 * Nu există buton „generează QR" și nu există job care să pre-genereze tokenuri: primul PDF
 * tipărit creează rândul, restul îl refolosesc. Pentru cel care tipărește 500 de cereri, costul
 * în plus e un INSERT idempotent per cerere — desenul QR îl face pdfmake în proces, fără imagine
 * și fără apel de rețea (vezi `parFormPdf.ts`).
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parVerifyTokens } from "../../db/schema/parVerifyTokens";
import { newVerifyToken } from "./verifyCodes";

/**
 * Tokenul cererii; îl creează dacă lipsește. Întoarce `null` doar dacă scrierea a eșuat — PDF-ul
 * trebuie să iasă și atunci, fără QR: un formular fără cod de verificare e o pierdere, un buton
 * de descărcare care dă eroare e o oprire de lucru.
 *
 * Cursa dintre două descărcări simultane ale aceleiași cereri e rezolvată de indexul UNIC pe
 * `par_id`: al doilea INSERT nu scrie nimic, iar SELECT-ul care urmează întoarce rândul primului.
 */
export async function ensureVerifyToken(parId: string, tenantId: string): Promise<string | null> {
  try {
    const existing = await db
      .select({ token: parVerifyTokens.token })
      .from(parVerifyTokens)
      .where(and(eq(parVerifyTokens.parId, parId), eq(parVerifyTokens.tenantId, tenantId)));
    if (existing[0]?.token) return existing[0].token;

    await db
      .insert(parVerifyTokens)
      .values({ tenantId, parId, token: newVerifyToken() })
      .onConflictDoNothing();

    const after = await db
      .select({ token: parVerifyTokens.token })
      .from(parVerifyTokens)
      .where(and(eq(parVerifyTokens.parId, parId), eq(parVerifyTokens.tenantId, tenantId)));
    return after[0]?.token ?? null;
  } catch (err) {
    console.error("[par-verify] nu am putut asigura tokenul de verificare", err);
    return null;
  }
}
