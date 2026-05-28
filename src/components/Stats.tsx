export function Stats() {
  const stats = [
    { value: "1.200+", label: "Centre educaționale active" },
    { value: "180k", label: "Elevi gestionați zilnic" },
    { value: "94%", label: "Rată de retenție anuală" },
    { value: "70%", label: "Reducere muncă administrativă" },
  ];

  return (
    <section className="py-20 sm:py-24 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[300px] bg-gradient-to-r from-primary/5 via-[hsl(250,76%,52%)]/10 to-primary/5 blur-2xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-8 sm:p-12 shadow-md">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-display font-bold text-gradient">
                  {stat.value}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-tight">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
