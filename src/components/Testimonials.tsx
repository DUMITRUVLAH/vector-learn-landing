import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "Am redus 6 ore pe săptămână din munca administrativă. Părinții primesc notificările automat și plățile vin la timp — totul fără să mai sunăm pe nimeni.",
    author: "Andreea Mitran",
    role: "Director, Lingua School București",
    rating: 5,
    accent: "pastel-mint",
  },
  {
    quote:
      "Am trecut de la 3 sisteme diferite (Excel, MailChimp, soft contabil) la Vector Learn. Acum echipa mea vede tot dintr-un singur loc, în timp real.",
    author: "Mihai Constantin",
    role: "Fondator, CodeAcademy Cluj",
    rating: 5,
    accent: "pastel-lavender",
  },
  {
    quote:
      "Aplicația mobilă cu gamification a schimbat radical engagement-ul copiilor. Streak-urile lor de prezență sunt acum un punct de mândrie acasă.",
    author: "Elena Vasilescu",
    role: "Coordonator, Pianissimo Iași",
    rating: 5,
    accent: "pastel-peach",
  },
  {
    quote:
      "Multi-filială era un coșmar înainte. Acum administrez 4 locații cu rapoarte consolidate și branding diferit per oraș. ROI-ul s-a văzut în 2 luni.",
    author: "Radu Popescu",
    role: "CEO, DanceLab România (4 filiale)",
    rating: 5,
    accent: "pastel-sky",
  },
  {
    quote:
      "Conversia leadurilor a crescut cu 38% după ce am activat automatizările WhatsApp și pipeline-ul vizual. Nimic nu se mai pierde pe drum.",
    author: "Cristina Dumitrașcu",
    role: "Manager marketing, Examen Pro",
    rating: 5,
    accent: "pastel-rose",
  },
  {
    quote:
      "Suportul răspunde în sub 15 minute, mereu. Echipa Vector Learn chiar ne ascultă feedback-ul — au lansat 2 features pe care le-am cerut noi.",
    author: "Adrian Stoica",
    role: "Director, Robo Center Timișoara",
    rating: 5,
    accent: "pastel-teal",
  },
];

export function Testimonials() {
  return (
    <section className="py-24 sm:py-32 bg-muted/30 border-y border-border/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            Testimoniale
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Iubit de centre din{" "}
            <span className="text-gradient">toată Europa</span>
          </h2>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-warning text-warning" />
              ))}
            </div>
            <span className="text-sm font-semibold">4.9/5</span>
            <span className="text-sm text-muted-foreground">din 340+ recenzii</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <article
              key={t.author}
              className="rounded-2xl border border-border bg-card p-6 card-hover"
            >
              <div className="flex mb-4">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <blockquote className="text-sm text-foreground/90 leading-relaxed mb-6">
                "{t.quote}"
              </blockquote>
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full ${t.accent} flex items-center justify-center text-sm font-bold text-foreground/80`}>
                  {t.author.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.author}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
