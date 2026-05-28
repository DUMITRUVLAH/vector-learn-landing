import { ArrowRight, Check } from "lucide-react";

export function CTA() {
  return (
    <section id="demo" className="py-24 sm:py-32 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-[hsl(228,76%,48%)] to-[hsl(250,76%,52%)]" />
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="absolute top-1/2 -translate-y-1/2 right-0 h-[400px] w-[400px] bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[300px] w-[300px] bg-[hsl(340,80%,60%)]/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-3xl sm:text-5xl font-display font-bold tracking-tight leading-tight">
            Începe astăzi. Vezi rezultate{" "}
            <span className="text-white/80">săptămâna viitoare.</span>
          </h2>
          <p className="mt-6 text-base sm:text-lg text-white/85 leading-relaxed">
            Setup în 24h. 14 zile trial gratuit. Echipa noastră îți face onboarding personal.
            Fără card de credit, fără contracte de loialitate.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#trial"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-6 py-3.5 text-sm font-semibold text-primary shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all touch-target"
            >
              Începe trial gratuit
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#sales"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 bg-white/10 backdrop-blur px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/20 transition-all touch-target"
            >
              Vorbește cu un consultant
            </a>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6 text-white/90">
            {[
              "Setup în 24h",
              "Migrare gratuită din alt CRM",
              "Suport în română 24/7",
            ].map((point) => (
              <div key={point} className="flex items-center justify-center gap-2 text-sm">
                <span className="rounded-full bg-white/20 p-1">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
