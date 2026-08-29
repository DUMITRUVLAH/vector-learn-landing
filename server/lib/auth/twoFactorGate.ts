/**
 * Poarta 2FA, într-un singur loc.
 *
 * SECURITY (audit 2026-08-29): `POST /api/auth/login` verifica `two_factor_settings`, dar
 * `POST /api/business/auth/login` — ruta prin care intră de fapt clienții FinFlow — nu o
 * verifica deloc și emitea direct sesiune completă. Cine avea 2FA activat era protejat pe o
 * rută și complet neprotejat pe cealaltă, adică deloc. Două implementări ale aceleiași reguli
 * înseamnă că una dintre ele va rămâne în urmă; de aceea regula stă aici, iar ambele rute o apelează.
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { twoFactorSettings } from "../../db/schema";

/** True dacă utilizatorul are 2FA activat (confirmat, nu doar inițiat). */
export async function hasTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await db.query.twoFactorSettings.findFirst({
    where: eq(twoFactorSettings.userId, userId),
  });
  return !!(row && row.enabledAt);
}
