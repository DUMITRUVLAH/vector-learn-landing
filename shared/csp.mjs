/**
 * Content-Security-Policy — O SINGURĂ definiție, pentru toate răspunsurile.
 *
 * De ce trăiește aici și nu în middleware: pe Vercel, Hono servește doar `/api/*`; PAGINA o
 * servește CDN-ul, din regulile scrise de `scripts/build-vercel.mjs`. Politica trebuie deci
 * scrisă în două locuri — iar când era copiată în ambele, singurul lucru care le ținea egale era
 * un comentariu („valorile sunt identice cu cele din middleware"). CSP-ul care contează pentru
 * ce poate face aplicația în browser e cel de pe DOCUMENT, adică exact copia mai ușor de uitat.
 * Acum e o funcție importată de amândouă: nu mai pot diverge.
 *
 * Politica e croită pe ce folosește efectiv aplicația (verificat, nu presupus):
 *   - zero `<script>` inline și zero `dangerouslySetInnerHTML` → `script-src 'self'` fără
 *     `unsafe-inline` (protecția reală anti-XSS);
 *   - React + Tailwind scriu atribute `style` → `style-src` are nevoie de `'unsafe-inline'`;
 *   - fonturile vin de la Google Fonts (vezi `index.html`);
 *   - exporturile (CSV/PDF/XLSX) folosesc `URL.createObjectURL` → `blob:` la img/media;
 *   - login-ul Google și Stripe Checkout se fac prin redirect de nivel superior, deci au nevoie
 *     doar de `form-action`, nu de `frame-src`;
 *   - vizualizatorul de documente PAR randează atașamentul într-un `<iframe>` care arată chiar
 *     ruta noastră de preview → `frame-src 'self'`;
 *   - fișierele mari urcă DIRECT în Supabase Storage, printr-un URL semnat → `connect-src` are
 *     nevoie de originea Storage-ului (vezi `storageOriginFromEnv`).
 */

/** Când nu știm proiectul concret (env lipsă la build), acceptăm orice proiect Supabase. */
export const SUPABASE_HOST_WILDCARD = "https://*.supabase.co";

/**
 * Originea către care browserul urcă fișierele, dedusă din mediu.
 *
 * Numele variabilei diferă între medii: integrarea Vercel↔Supabase o prefixează cu numele
 * store-ului (`learningvectortop_SUPABASE_URL`), la fel ca `bySuffix` din `server/db/env.ts`.
 * Dacă nu găsim nimic, întoarcem wildcard-ul: o politică puțin mai largă e neplăcută, o politică
 * strâmtă care blochează orice upload e o pană.
 */
export function storageOriginFromEnv(env = process.env) {
  const key = Object.keys(env).find((k) => k.endsWith("SUPABASE_URL") && env[k]);
  if (!key) return SUPABASE_HOST_WILDCARD;
  try {
    return new URL(String(env[key])).origin;
  } catch {
    return SUPABASE_HOST_WILDCARD;
  }
}

/**
 * Directivele CSP.
 *
 * @param {object} [opts]
 * @param {string} [opts.storageOrigin] originea Supabase Storage (implicit: dedusă din mediu)
 * @param {"'none'" | "'self'"} [opts.frameAncestors] cine are voie să ne încadreze în iframe
 * @returns {string[]}
 */
export function cspDirectives(opts = {}) {
  const storageOrigin = opts.storageOrigin ?? storageOriginFromEnv();
  const frameAncestors = opts.frameAncestors ?? "'none'";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "frame-src 'self'",
    // Storage: doar PUT-ul fișierului pleacă la altă origine; restul cererilor rămân la noi.
    `connect-src 'self' ${storageOrigin}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
    `frame-ancestors ${frameAncestors}`,
    "upgrade-insecure-requests",
  ];
}

/** Aceleași directive, ca antet gata de trimis. */
export function csp(opts = {}) {
  return cspDirectives(opts).join("; ");
}
