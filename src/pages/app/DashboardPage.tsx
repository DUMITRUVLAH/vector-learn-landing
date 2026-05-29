import { Users, Calendar, CreditCard, GraduationCap, LogOut, Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { Logo } from "@/components/Logo";
import { Link, useRouter } from "@/router/HashRouter";

export function DashboardPage() {
  const { status, data, logout } = useSession();
  const { navigate } = useRouter();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  if (status === "error" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
        Eroare conectare server. <Link to="/app/login" className="ml-2 underline">Înapoi la login</Link>
      </div>
    );
  }

  const { user, tenant } = data;

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="hidden sm:inline text-xs text-muted-foreground">/</span>
            <span className="text-sm font-semibold">{tenant.name}</span>
            <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase">
              {tenant.plan}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold">{user.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{user.role}</p>
            </div>
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className="touch-target rounded-md hover:bg-muted flex items-center justify-center"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
            Salut, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conectat ca {user.role} la {tenant.name}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Users, label: "Elevi", href: "/app/students", pastel: "pastel-mint", desc: "Lista, profile, status" },
            { icon: Calendar, label: "Orar", href: "/app/schedule", pastel: "pastel-sky", desc: "Lecții programate" },
            { icon: GraduationCap, label: "Profesori", href: "/app/teachers", pastel: "pastel-lavender", desc: "Echipa academiei" },
            { icon: CreditCard, label: "Plăți", href: "/app/payments", pastel: "pastel-peach", desc: "Facturi, restanțe" },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.label}
                to={card.href}
                className="rounded-2xl border border-border bg-card p-6 card-hover block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className={`${card.pastel} rounded-xl p-2.5 w-fit mb-4`}>
                  <Icon className="h-5 w-5 text-foreground/80" />
                </div>
                <h3 className="text-base font-bold mb-1">{card.label}</h3>
                <p className="text-xs text-muted-foreground">{card.desc}</p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-bold mb-3">🎉 Bine ai venit în Vector Learn — MVP!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Aplicația rulează pe Postgres real (PGlite). Datele tale sunt persistente între restart-uri.
            Următoarea iterație adaugă CRUD complet pentru elevi.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-muted p-3">
              <p className="font-semibold mb-1">Tenant ID</p>
              <p className="font-mono text-[10px] text-muted-foreground break-all">{tenant.id}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="font-semibold mb-1">User ID</p>
              <p className="font-mono text-[10px] text-muted-foreground break-all">{user.id}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="font-semibold mb-1">Plan</p>
              <p className="font-mono text-[10px] text-muted-foreground capitalize">{tenant.plan}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
