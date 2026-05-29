import { Quote } from "lucide-react";

export interface CaseStudyMetric {
  label: string;
  value: string;
  delta?: string;
}

interface CaseStudyCardProps {
  centerName: string;
  centerType: string;
  scale: string;
  quote: string;
  author: string;
  authorRole: string;
  metrics: CaseStudyMetric[];
  note?: string;
}

export function CaseStudyCard({
  centerName,
  centerType,
  scale,
  quote,
  author,
  authorRole,
  metrics,
  note = "Date colectate cu acordul centrului. Numele e schimbat pentru confidențialitate.",
}: CaseStudyCardProps) {
  return (
    <section className="bg-muted/30 border-y border-border/60 py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-card overflow-hidden shadow-md">
          <div className="grid md:grid-cols-[1.3fr_1fr]">
            <div className="p-6 sm:p-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
                Case study real
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                <strong className="text-foreground">{centerName}</strong> · {centerType} · {scale}
              </p>
              <Quote className="h-6 w-6 text-primary/40 mb-2 mt-4" />
              <blockquote className="text-base sm:text-lg font-display leading-relaxed text-foreground/90">
                {quote}
              </blockquote>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {author
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{author}</p>
                  <p className="text-xs text-muted-foreground">{authorRole}</p>
                </div>
              </div>
            </div>

            <div className="bg-muted/40 p-6 sm:p-8 grid grid-cols-2 gap-4 content-start">
              {metrics.map((m) => (
                <div key={m.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </p>
                  <p className="text-2xl font-display font-bold text-gradient tabular-nums mt-1">
                    {m.value}
                  </p>
                  {m.delta && (
                    <p className="text-[11px] font-medium text-success mt-0.5">{m.delta}</p>
                  )}
                </div>
              ))}
              <p className="col-span-2 text-[10px] text-muted-foreground/80 leading-relaxed mt-4 pt-3 border-t border-border">
                {note}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
