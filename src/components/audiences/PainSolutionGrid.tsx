import { AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

export interface PainItem {
  pain: string;
  solution: string;
  moduleLabel: string;
  moduleHref: string;
}

interface PainSolutionGridProps {
  title?: string;
  items: PainItem[];
}

export function PainSolutionGrid({
  title = "Pain-uri pe care le rezolvăm",
  items,
}: PainSolutionGridProps) {
  return (
    <section className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
          {items.length} probleme rezolvate
        </span>
        <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
          {title}
        </h2>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">
        {items.map((item, i) => (
          <article
            key={i}
            className="rounded-2xl border border-border bg-card overflow-hidden card-hover"
            data-testid="pain-solution-item"
          >
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-5 bg-destructive/5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-destructive mb-1">
                      Pain
                    </p>
                    <p className="text-sm font-medium text-foreground leading-relaxed">
                      {item.pain}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start gap-2.5 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-success mb-1">
                      Soluție Vector Learn
                    </p>
                    <p className="text-sm text-foreground/85 leading-relaxed">
                      {item.solution}
                    </p>
                  </div>
                </div>
                <a
                  href={item.moduleHref}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline pl-7"
                >
                  Vezi modulul {item.moduleLabel}
                  <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
