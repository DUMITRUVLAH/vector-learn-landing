/**
 * Gărzile STATICE dinaintea build-ului — o singură listă, în care se uită și build-ul de
 * producție (`scripts/vercel-build.mjs`), și poarta e2e locală (`scripts/e2e-gate.mjs`).
 *
 * De ce o listă comună: poarta locală rula doar 3 din cele 6 gărzi pe care prod-ul le impune, așa
 * că „e2e verde" nu însemna „build-ul trece". Pe 22.09.2026 o sumă formatată ca lei (`formatMDL`
 * pe o cerere cu monedă proprie) a trecut de poartă și a oprit deploy-ul în `check-par-currency` —
 * cu prod-ul rămas pe versiunea veche până la reparație. Două liste care descriu aceeași regulă
 * divergează întotdeauna; aici nu mai au cum.
 *
 * Fiecare gardă e ieftină, nu atinge baza de date și oprește build-ul dacă iese cu cod ≠ 0.
 */
export const STATIC_GUARDS = [
  ["schema vercel.json", "scripts/check-vercel-config.mjs"],
  ["referințe nedefinite (TS2304)", "scripts/check-undefined-refs.mjs"],
  ["rute Hono nemontate", "scripts/check-route-mounts.mjs"],
  ["linkuri moarte în meniu", "scripts/check-nav-links.mjs"],
  ["moneda cererii pe ecrane și în PDF", "scripts/check-par-currency.mjs"],
  ["statement-breakpoints în migrări", "scripts/check-migration-breakpoints.mjs"],
];
