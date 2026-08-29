/**
 * Logourile organizațiilor care folosesc platforma. Fișierele stau în `public/logos/`,
 * descărcate de pe site-urile lor oficiale.
 *
 * Rămân COLORATE (cerere owner). Ca să funcționeze și pe tema închisă — unde un logotip
 * bleumarin devine invizibil — fiecare stă pe o plăcuță albă. Plăcuța e albă în ambele teme,
 * intenționat: e suprafața pe care logourile astea au fost desenate.
 *
 * Sursă unică: o folosesc și landing-ul (`BusinessLandingPage`) și paginile de feature.
 */
export interface TrustedLogo {
  name: string;
  src: string;
  /** Înălțimea e per logo: la aceeași înălțime, o siglă pătrată pare de două ori mai mare
   *  decât un logotip lat. Cifrele egalizează mărimea *optică*, nu pe cea în pixeli. */
  size: string;
}

export const TRUSTED_BY: TrustedLogo[] = [
  { name: "ATIC", src: "/logos/atic.png", size: "h-9 sm:h-10" },
  { name: "Tekwill", src: "/logos/tekwill.png", size: "h-7 sm:h-8" },
  { name: "Tekwill Academy", src: "/logos/tekwill-academy.svg", size: "h-8 sm:h-9" },
  { name: "Inotek", src: "/logos/inotek.png", size: "h-6 sm:h-7" },
  { name: "Clubul Tinerilor Makeri", src: "/logos/ctm.png", size: "h-7 sm:h-8" },
  { name: "iHUB", src: "/logos/ihub.png", size: "h-7 sm:h-8" },
];
