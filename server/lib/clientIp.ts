/**
 * IP-ul real al clientului, dedus în siguranță în spatele proxy-ului.
 *
 * SECURITY (audit 2026-08-29): peste tot în cod se citea PRIMUL element din `x-forwarded-for`.
 * Antetul e o listă „client, proxy1, proxy2" pe care proxy-ul o EXTINDE — deci prima poziție e
 * exact partea pe care o trimite clientul, adică o valoare aleasă de atacator. Consecința:
 * limitarea de rată la login (cheie = IP + rută) se ocolea trivial trimițând un
 * `X-Forwarded-For` aleator la fiecare cerere, iar istoricul de logări reținea IP-uri inventate.
 *
 * Ordinea corectă a surselor:
 *   1. `x-vercel-forwarded-for` — pus de Vercel, nu de client;
 *   2. ULTIMUL element din `x-forwarded-for` — cel adăugat de proxy-ul din față (de încredere),
 *      nu cel trimis de client;
 *   3. `cf-connecting-ip` / `x-real-ip` — proxy-uri care scriu un singur IP.
 */
import type { Context } from "hono";

export function clientIp(c: Context): string | null {
  const vercel = c.req.header("x-vercel-forwarded-for");
  if (vercel) {
    const last = vercel.split(",").pop()?.trim();
    if (last) return last;
  }
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) {
    const last = fwd.split(",").pop()?.trim();
    if (last) return last;
  }
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? null;
}
