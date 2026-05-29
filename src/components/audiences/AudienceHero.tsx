import { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/router/HashRouter";

interface AudienceHeroProps {
  badge: string;
  title: ReactNode;
  description: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary?: { label: string; href: string };
  visual?: ReactNode;
}

export function AudienceHero({
  badge,
  title,
  description,
  ctaPrimary,
  ctaSecondary,
  visual,
}: AudienceHeroProps) {
  return (
    <section className="relative pt-12 pb-16 sm:pt-20 sm:pb-24 overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-pattern radial-mask opacity-50" />
        <div className="absolute top-1/3 right-1/4 h-[400px] w-[400px] bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Înapoi acasă
        </Link>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
              {badge}
            </span>
            <h1 className="text-3xl sm:text-5xl font-display font-bold tracking-tight leading-[1.1]">
              {title}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">
              {description}
            </p>

            <div className="mt-7 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <a
                href={ctaPrimary.href}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md hover:shadow-lg hover:bg-primary/90 transition-all touch-target"
              >
                {ctaPrimary.label}
                <ArrowRight className="h-4 w-4" />
              </a>
              {ctaSecondary && (
                <a
                  href={ctaSecondary.href}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-all touch-target"
                >
                  {ctaSecondary.label}
                </a>
              )}
            </div>
          </div>

          {visual && <div className="relative">{visual}</div>}
        </div>
      </div>
    </section>
  );
}
