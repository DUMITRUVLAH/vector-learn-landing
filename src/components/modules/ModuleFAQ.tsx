import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  q: string;
  a: string;
}

interface ModuleFAQProps {
  title?: string;
  items: FAQItem[];
}

export function ModuleFAQ({ title = "Întrebări frecvente", items }: ModuleFAQProps) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-20 sm:py-24 border-t border-border/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight mb-8">
            {title}
          </h2>

          <div className="space-y-3">
            {items.map((faq, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border bg-card overflow-hidden transition-all",
                    isOpen ? "border-primary/40 shadow-md" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-semibold text-foreground">{faq.q}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                        isOpen && "rotate-180 text-primary"
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 -mt-1 text-sm text-muted-foreground leading-relaxed animate-fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
