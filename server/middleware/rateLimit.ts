/**
 * SEC-002 — limitare de rată pentru endpoint-urile sensibile.
 *
 * `hono-rate-limiter` era deja în `package.json`, dar nu era importat nicăieri: login-ul accepta
 * un număr NELIMITAT de încercări de parolă. Cu bcrypt pe 10 runde, asta e o invitație la
 * credential stuffing pe o aplicație care aprobă plăți.
 *
 * Cheia e IP + rută, nu doar IP: două persoane din spatele aceluiași NAT de birou nu trebuie să se
 * blocheze reciproc pe rute diferite, dar un atacator care lovește același login e prins.
 *
 * ATENȚIE — limită de arhitectură asumată conștient: pe Vercel fiecare instanță serverless are
 * propria memorie, deci contorul e per instanță, nu global. Nu oprește un atac distribuit, dar
 * taie complet cazul obișnuit (un singur client care încearcă mii de parole) și nu introduce
 * nicio dependență nouă de infrastructură. Un contor global cere Redis/Upstash — notat ca pas
 * următor în raportul de audit, nu ca blocant aici.
 */
import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";

/**
 * IP-ul real al clientului. Pe Vercel/proxy, `x-forwarded-for` e o listă „client, proxy1, proxy2";
 * primul element e clientul. Fără antet (local) cădem pe o constantă — local nu are rost să
 * limităm după IP, dar contorul rămâne funcțional pentru teste.
 */
function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return c.req.header("x-real-ip") ?? "local";
}

function keyFor(c: Context): string {
  return `${clientIp(c)}:${new URL(c.req.url).pathname}`;
}

/**
 * Poarta E2E (CLAUDE.md §3.5.1quinquies) se rulează după FIECARE modificare, iar suitele
 * dedicate autentifică 4 roluri fiecare — adică peste cota de 10/15 minute în câteva rulări.
 * Rezultatul era un `429 too_many_attempts` raportat ca „suită picată", deci un test care
 * mințea despre starea codului.
 *
 * Sărim limitarea DOAR când sunt adevărate simultan două lucruri:
 *   1. nu suntem în producție, ȘI
 *   2. cererea nu vine printr-un proxy (fără `x-forwarded-for` / `x-real-ip`) — adică e local.
 *
 * Pe Vercel ambele condiții pică: `NODE_ENV=production` și proxy-ul pune mereu
 * `x-forwarded-for`. Deci clientul plătitor rămâne protejat chiar și dacă NODE_ENV ar fi
 * configurat greșit. `RATE_LIMIT_FORCE=1` reactivează limitarea local, când chiar ea e ce testezi.
 */
export function skipLocalDev(c: Context): boolean {
  if (process.env.RATE_LIMIT_FORCE === "1") return false;
  if (process.env.NODE_ENV === "production") return false;
  return !c.req.header("x-forwarded-for") && !c.req.header("x-real-ip");
}

/**
 * Autentificare: 10 încercări / 15 minute / IP / rută.
 * Suficient pentru un om care greșește parola de câteva ori, inutil pentru un atac prin forță brută.
 */
export const authRateLimit = rateLimiter({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-6",
  keyGenerator: keyFor,
  skip: skipLocalDev,
  message: { error: "too_many_attempts" },
});

/**
 * Endpoint-uri scumpe (apeluri AI, extragere din PDF): 20 / oră / IP.
 * Aici limita protejează factura, nu doar securitatea.
 */
export const expensiveRateLimit = rateLimiter({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-6",
  keyGenerator: keyFor,
  skip: skipLocalDev,
  message: { error: "rate_limit_exceeded" },
});
