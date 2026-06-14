/**
 * CORE-004: FinDesk shell layout — wraps all /app/fin/* routes.
 * Provides: topbar (logo + company name), sidebar (FinNav), outlet (children).
 * Role-gating: fetches current user's fin role via getFinMe(); shows 403 if not a member.
 * Design system: Vector 365 semantic tokens ONLY — zero hardcoded hex.
 * WCAG AA: touch targets ≥44px, aria-labels on icon-only buttons, keyboard nav.
 * CORE: backlog/fin/FIN-CORE.md §1.3, §2
 */
import { ReactNode, useEffect, useState } from "react";
import {
  LogOut,
  Menu,
  X,
  Building2,
  ChevronLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { getFinMe, type FinRole, type FinOrgProfile } from "@/lib/api/fin";
import { FinNav } from "@/components/fin/FinNav";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinLayoutProps {
  children: ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  /** Optional action buttons rendered next to the page title */
  actions?: ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FinLayout({ children, pageTitle, pageDescription, actions }: FinLayoutProps) {
  const { data: session, logout } = useSession();
  const { navigate } = useRouter();

  const [role, setRole] = useState<FinRole | null>(null);
  const [profile, setProfile] = useState<FinOrgProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getFinMe()
      .then((res) => {
        if (!res) {
          setAccessError(
            "Nu ești înregistrat(ă) în spațiul de lucru FinDesk. Solicită acces de la administratorul workspace-ului."
          );
        } else {
          setRole(res.member.role as FinRole);
          setProfile(res.profile);
        }
      })
      .catch(() => {
        setAccessError("Eroare la încărcare. Încearcă din nou.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center"
        role="status"
        aria-label="Se încarcă FinDesk..."
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Access denied ──────────────────────────────────────────────────────────

  if (accessError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full rounded-xl border border-border bg-card p-8 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-foreground">Acces restricționat</h1>
          <p className="text-sm text-muted-foreground">{accessError}</p>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Înapoi la aplicație
          </Link>
        </div>
      </div>
    );
  }

  if (!role) return null;

  const companyName = profile?.legalName ?? session?.tenant?.name ?? "FinDesk";
  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "FD";

  // ─── Full layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Topbar ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-16 items-center gap-3 px-4">
          {/* Mobile sidebar toggle */}
          <button
            type="button"
            aria-label={sidebarOpen ? "Închide meniu" : "Deschide meniu"}
            aria-expanded={sidebarOpen}
            aria-controls="fin-sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden flex items-center justify-center rounded-md p-2 min-h-[44px] min-w-[44px] hover:bg-muted transition-colors"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Logo + company name */}
          <Link
            to="/app/fin"
            className="flex items-center gap-2 font-semibold text-sm"
            aria-label="FinDesk — pagina principală"
          >
            <Building2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline text-foreground">{companyName}</span>
            <span className="hidden sm:inline text-muted-foreground font-normal">/ FinDesk</span>
          </Link>

          <div className="flex-1" />

          {/* User info + logout */}
          {session && (
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-semibold leading-none">{session.user.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">
                  {role}
                </span>
              </span>
              <div
                aria-hidden="true"
                className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-[11px] font-bold text-primary-foreground select-none"
              >
                {userInitials}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Deconectare"
                className="flex items-center justify-center rounded-md p-2 min-h-[44px] min-w-[44px] hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
        <aside
          id="fin-sidebar"
          className="hidden md:flex w-60 flex-col border-r border-border bg-card/40 p-3 shrink-0"
          aria-label="Navigare FinDesk"
        >
          <FinNav role={role} />
        </aside>

        {/* ── Mobile sidebar (overlay) ─────────────────────────────────────── */}
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <div
              className="md:hidden fixed inset-0 z-20 bg-background/70 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <aside
              className="md:hidden fixed left-0 top-16 bottom-0 z-30 w-72 border-r border-border bg-card p-3 overflow-y-auto"
              aria-label="Navigare FinDesk"
            >
              <FinNav role={role} />
            </aside>
          </>
        )}

        {/* ── Main content area ─────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          <div className="container mx-auto px-4 py-6 sm:py-8">
            {/* Page header */}
            {pageTitle && (
              <div className={cn(
                "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3",
                (children) ? "mb-6" : ""
              )}>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-foreground">
                    {pageTitle}
                  </h1>
                  {pageDescription && (
                    <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
                  )}
                </div>
                {actions && (
                  <div className="flex items-center gap-2 shrink-0">{actions}</div>
                )}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
