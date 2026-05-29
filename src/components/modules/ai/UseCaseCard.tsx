import { cn, PASTEL_CYCLE } from "@/lib/utils";

interface UseCaseCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  benefit: string;
  index: number;
}

export function UseCaseCard({ icon: Icon, title, description, benefit, index }: UseCaseCardProps) {
  const pastel = PASTEL_CYCLE[index % PASTEL_CYCLE.length];

  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden card-hover">
      <div className={cn("relative aspect-video w-full flex items-center justify-center", pastel)}>
        <Icon className="h-12 w-12 text-foreground/30" />
        <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-card/80 backdrop-blur px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
          Use case
        </span>
      </div>
      <div className="p-5">
        <h3 className="text-base font-bold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{description}</p>
        <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-0.5">Beneficiu</p>
          <p className="text-xs text-foreground/85 leading-relaxed">{benefit}</p>
        </div>
      </div>
    </article>
  );
}
