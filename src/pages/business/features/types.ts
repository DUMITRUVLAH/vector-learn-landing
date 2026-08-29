/**
 * Tipurile paginilor de feature (`/business/features/<slug>`).
 *
 * Structura e copiată deliberat după paginile de produs ApprovalMax — owner-ului îi place
 * schema lor: erou → dovadă socială → 4 beneficii → 4 blocuri „cum funcționează" cu vizual
 * alternat → module conexe → întrebări frecvente → CTA. Conținutul e al FinFlow, în română.
 *
 * O pagină nouă = o intrare nouă în `features.tsx`. Shell-ul (`FeatureLandingPage`) nu se
 * atinge — asta e tot rostul separării.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Una dintre cele 4 promisiuni de sub erou. */
export interface FeatureBenefit {
  icon: LucideIcon;
  title: string;
  desc: string;
}

/** Un bloc „cum funcționează": text pe o coloană, reconstrucția ecranului pe cealaltă. */
export interface FeatureBlock {
  id: string;
  badge: string;
  title: string;
  body: string;
  bullets: string[];
  visual: ReactNode;
}

export interface FeatureFaq {
  q: string;
  a: string;
}

/** Trimitere către o pagină conexă. `href` intern (hash-router) sau ancoră pe landing. */
export interface FeatureLink {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
}

export interface FeatureDef {
  /** Ultimul segment din URL: `/business/features/<slug>`. */
  slug: string;
  /** Eticheta din bara de sus și din listele de pagini conexe. */
  navLabel: string;
  /** `<title>` și meta description — rutele sunt pe hash, deci le setăm din JS. */
  seoTitle: string;
  seoDescription: string;

  eyebrow: string;
  h1: string;
  /** Partea din `h1` care primește gradientul + sublinierea. Trebuie să fie sufixul lui `h1`. */
  h1Accent: string;
  heroSub: string;
  heroVisual: ReactNode;

  benefits: FeatureBenefit[];
  blocksTitle: string;
  blocks: FeatureBlock[];
  related: FeatureLink[];
  faq: FeatureFaq[];

  ctaTitle: string;
  ctaSub: string;
}
