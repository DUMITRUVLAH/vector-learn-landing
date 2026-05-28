import { Check, X } from "lucide-react";

const rows = [
  { feature: "Orar interactiv cu drag & drop", us: true, excel: false, generic: "limitat" },
  { feature: "Plăți online integrate", us: true, excel: false, generic: true },
  { feature: "Aplicație mobilă pentru elevi", us: true, excel: false, generic: false },
  { feature: "WhatsApp Business automation", us: true, excel: false, generic: "extra" },
  { feature: "AI Assistant inclus", us: true, excel: false, generic: false },
  { feature: "Multi-filială și franciză", us: true, excel: false, generic: "extra" },
  { feature: "Integrare 1C și e-Factura", us: true, excel: false, generic: "limitat" },
  { feature: "Branding white-label complet", us: true, excel: false, generic: false },
  { feature: "API REST și webhooks", us: true, excel: false, generic: "limitat" },
  { feature: "Migrare gratuită cu echipa noastră", us: true, excel: false, generic: false },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <div className="flex items-center justify-center">
        <span className="rounded-full bg-success/10 p-1">
          <Check className="h-4 w-4 text-success" strokeWidth={2.5} />
        </span>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex items-center justify-center">
        <X className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <div className="text-center">
      <span className="inline-flex text-[10px] font-semibold rounded-full bg-warning/10 text-warning px-2 py-0.5 uppercase tracking-wide">
        {value}
      </span>
    </div>
  );
}

export function Comparison() {
  return (
    <section className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Comparație
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            De ce centrele aleg <span className="text-gradient">Vector Learn</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Singura platformă care unește tot ce-ți trebuie, fără să plătești module separate.
          </p>
        </div>

        <div className="max-w-4xl mx-auto rounded-2xl border border-border bg-card overflow-hidden shadow-md">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-6 py-4 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Funcționalitate
            </div>
            <div className="text-center">
              <p className="text-sm font-display font-bold text-primary">Vector Learn</p>
              <p className="text-[10px] text-muted-foreground">Tot inclus</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-display font-bold text-foreground/70">Excel + tools</p>
              <p className="text-[10px] text-muted-foreground">Manual</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-display font-bold text-foreground/70">CRM generic</p>
              <p className="text-[10px] text-muted-foreground">Plus addons</p>
            </div>
          </div>

          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div
                key={row.feature}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 px-6 py-3.5 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="text-sm text-foreground/85">{row.feature}</div>
                <Cell value={row.us} />
                <Cell value={row.excel} />
                <Cell value={row.generic} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
