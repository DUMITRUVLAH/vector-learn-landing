export function TrustBar() {
  const logos = [
    "Lingua School",
    "CodeAcademy RO",
    "Pianissimo",
    "DanceLab",
    "Smart Kids",
    "Examen Pro",
    "Robo Center",
  ];

  return (
    <section className="border-y border-border/60 bg-muted/30 py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-6">
          Folosit zilnic de peste 1.200 de centre educaționale din 14 țări
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
          {logos.map((logo) => (
            <span
              key={logo}
              className="text-base font-display font-bold tracking-tight text-foreground/70 whitespace-nowrap"
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
