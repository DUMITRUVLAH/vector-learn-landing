/**
 * PERF/SEC-001 — headere de securitate pentru fiecare răspuns.
 *
 * Înainte de acest middleware aplicația nu trimitea NICIUN header de securitate: putea fi
 * încadrată într-un iframe (clickjacking pe butoanele de aprobare a plăților), browserul avea
 * voie să ghicească tipul conținutului, iar `Referer` pleca întreg către terți.
 *
 * CSP-ul propriu-zis trăiește în `shared/csp.mjs`, pentru că pe Vercel PAGINA e servită de CDN
 * (regulile din `scripts/build-vercel.mjs`), nu de middleware-ul ăsta — iar politica de pe
 * document e cea care decide ce poate face aplicația în browser. Două copii ținute egale „prin
 * comentariu" au produs deja o pană (vezi acolo).
 *
 * SINGURA excepție de la „nimeni nu ne încadrează": chiar răspunsul rutei
 * `GET /api/par/:id/attachments/:attId/preview`. Un `X-Frame-Options: DENY` pe EL bloca pagina
 * noastră să-și arate propriul document („This content is blocked"), deși cine cere e tot originea
 * noastră. Documentul e conținut static (PDF/imagine), fără butoane care să acționeze în numele
 * cuiva, deci `SAMEORIGIN` + `frame-ancestors 'self'` nu deschid nicio cale de clickjacking; restul
 * aplicației rămâne pe `DENY` / `'none'`.
 *
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` sunt intenționat duplicate: primul e
 * standardul, al doilea acoperă browserele/proxy-urile care încă nu-l citesc pe primul.
 */
import type { MiddlewareHandler } from "hono";
import { csp } from "../../shared/csp.mjs";
import { bySuffix } from "../db/env";

/** Originea Storage-ului se citește o dată, la pornire — nu se schimbă în timpul vieții funcției. */
const STORAGE_ORIGIN = (() => {
  const url = bySuffix("SUPABASE_URL");
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
})();

const CSP = csp({ storageOrigin: STORAGE_ORIGIN });
/** Același CSP, dar documentul poate fi încadrat de propria noastră aplicație. Vezi comentariul de sus. */
const CSP_SELF_FRAMEABLE = csp({ storageOrigin: STORAGE_ORIGIN, frameAncestors: "'self'" });

/** Ruta care servește atașamentul PAR inline — singurul răspuns pe care îl încadrăm noi înșine. */
const FRAMEABLE_BY_US = /^\/api\/par\/[^/]+\/attachments\/[^/]+\/preview$/;

const IS_PROD = process.env.NODE_ENV === "production";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  const framedByUs = FRAMEABLE_BY_US.test(new URL(c.req.url).pathname);
  c.header("Content-Security-Policy", framedByUs ? CSP_SELF_FRAMEABLE : CSP);
  c.header("X-Frame-Options", framedByUs ? "SAMEORIGIN" : "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  // Aplicația nu cere niciuna dintre aceste capabilități; le refuzăm explicit ca un script
  // injectat să nu le poată cere în numele utilizatorului.
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
  );
  // HSTS doar în producție: pe localhost ar bloca http:// pentru un an în browserul dezvoltatorului.
  if (IS_PROD) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
};
