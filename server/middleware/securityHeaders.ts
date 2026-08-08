/**
 * PERF/SEC-001 — headere de securitate pentru fiecare răspuns.
 *
 * Înainte de acest middleware aplicația nu trimitea NICIUN header de securitate: putea fi
 * încadrată într-un iframe (clickjacking pe butoanele de aprobare a plăților), browserul avea
 * voie să ghicească tipul conținutului, iar `Referer` pleca întreg către terți.
 *
 * CSP-ul e croit pe ce folosește efectiv aplicația (verificat, nu presupus):
 *   - zero `<script>` inline și zero `dangerouslySetInnerHTML` → `script-src 'self'` fără
 *     `unsafe-inline` (protecția reală anti-XSS);
 *   - React + Tailwind scriu atribute `style` → `style-src` are nevoie de `'unsafe-inline'`;
 *   - fonturile vin de la Google Fonts (vezi `index.html`);
 *   - exporturile (CSV/PDF/XLSX) folosesc `URL.createObjectURL` → `blob:` la img/media;
 *   - login-ul Google și Stripe Checkout se fac prin redirect de nivel superior, deci au nevoie
 *     doar de `form-action`, nu de `frame-src`.
 *
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` sunt intenționat duplicate: primul e
 * standardul, al doilea acoperă browserele/proxy-urile care încă nu-l citesc pe primul.
 */
import type { MiddlewareHandler } from "hono";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const IS_PROD = process.env.NODE_ENV === "production";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  c.header("Content-Security-Policy", CSP);
  c.header("X-Frame-Options", "DENY");
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
