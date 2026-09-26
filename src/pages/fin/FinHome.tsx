/**
 * NAV-05: FinDesk — ecranul de start (/business/fin/).
 *
 * Înainte: 15 carduri, dintre care 13 gri, marcate „În curând" — deși toate modulele existau și
 * mergeau. Primul lucru pe care îl vedea contabilul era că produsul pare neterminat, iar nimic de pe
 * ecran nu-i spunea ce are de făcut.
 *
 * Acum ecranul răspunde, în ordine, la trei întrebări:
 *   1. Ce e urgent? — obligații fiscale restante și termenele din următoarele 14 zile, facturi restante.
 *   2. Cum stăm? — patru cifre: restanțe, de încasat, venitul lunii, următorul termen.
 *   3. Unde merg? — toate modulele, pe aceleași grupe ca meniul (o singură sursă: `finNav.ts`).
 *
 * Fiecare bloc se încarcă separat: dacă un API pică, celelalte rămân pe ecran.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, CheckCircle2, Plus, Receipt, TrendingUp, Wallet } from "lucide-react";
import { FinLayout } from "./FinLayout";
import { Link } from "@/router/HashRouter";
import { getFinMe, type FinOrgProfile } from "@/lib/api/fin";
import { getFinAging, getFinMetrics, type FinMetricsResponse } from "@/lib/api/finInsight";
import { listCalendar } from "@/lib/api/finCalendar";
import { buildTodos, DUE_SOON_DAYS, formatDate, nextDeadline, obligationLabel, todayIso, type FinTodo } from "@/lib/fin/finTodos";
import { formatFinMoney } from "@/lib/api/finInvoices";
import { visibleFinNavGroups } from "@/lib/fin/finNav";
import { useEnabledModules } from "@/hooks/useEnabledModules";
import { Card, KpiTile, PastelIcon } from "@/components/ds";
import { cn } from "@/lib/utils";

/** Rezultatul unui bloc: încărcare, date, sau eșec — fiecare bloc își are starea lui. */
type Load<T> = { status: "loading" } | { status: "ok"; data: T } | { status: "error" };

function useLoad<T>(fetcher: () => Promise<T>): Load<T> {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    fetcher()
      .then((data) => alive && setState({ status: "ok", data }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
    // fetcher-ul e o funcție stabilă, definită la nivel de modul
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

const fetchProfile = () => getFinMe().then((me) => me?.profile ?? null);
const fetchAging = () => getFinAging();
const fetchMetrics = () => getFinMetrics({ period: "last_6m" });
const fetchObligations = () => listCalendar().then((r) => r.obligations);

// ─── Blocuri ──────────────────────────────────────────────────────────────────

function SetupBanner() {
  return (
    <Card tone="dashboard" className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <PastelIcon tone="indigo" size={40}>
          <Building2 className="h-5 w-5" />
        </PastelIcon>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Configurează firma ca să emiți prima factură</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Denumirea, IDNO-ul, regimul TVA și seria de facturare apar pe fiecare act. Durează două minute.
          </p>
        </div>
      </div>
      <Link
        to="/business/fin/onboarding"
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 hover:no-underline"
      >
        Configurează firma
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}

interface TodoPanelProps {
  todos: FinTodo[];
  loading: boolean;
  failed: boolean;
}

function TodoPanel({ todos, loading, failed }: TodoPanelProps) {
  return (
    <Card tone="dashboard" className="p-5" aria-labelledby="fin-todo-title">
      <h2 id="fin-todo-title" className="mb-3 text-sm font-semibold text-foreground">
        De făcut acum
      </h2>
      {loading ? (
        <div className="animate-pulse space-y-2" aria-hidden="true">
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
        </div>
      ) : todos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {failed
            ? "Nu am putut încărca termenele și restanțele. Deschide Calendarul fiscal pentru detalii."
            : `Nimic urgent: nicio restanță și niciun termen fiscal în următoarele ${DUE_SOON_DAYS} zile.`}
        </p>
      ) : (
        <ul className="space-y-2">
          {todos.map((t) => (
            <li key={t.key}>
              <Link
                to={t.href}
                className="group flex min-h-[44px] items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 no-underline transition-colors hover:border-primary/30 hover:bg-primary/5 hover:no-underline"
              >
                <AlertTriangle
                  className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "danger" ? "text-destructive" : "text-warning")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{t.title}</span>
                  <span className="block text-xs text-muted-foreground">{t.detail}</span>
                </span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ModuleMap({ crmEnabled, itparkEnabled }: { crmEnabled: boolean; itparkEnabled: boolean }) {
  // „Acasă FinDesk" e chiar pagina asta — n-are ce căuta în harta ei.
  const groups = visibleFinNavGroups({ crmEnabled, itparkEnabled })
    .map((g) => ({ ...g, items: g.items.filter((it) => it.href !== "/business/fin/") }))
    .filter((g) => g.items.length > 0);

  return (
    <section aria-label="Module FinDesk" className="space-y-6">
      {groups.map((g) => (
        <div key={g.section ?? "_"}>
          <h2 className="mb-3 text-3xs font-semibold uppercase tracking-group text-muted-foreground">
            {g.section ?? "Firma"}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <li key={it.href}>
                  <Link
                    to={it.href}
                    className="group flex h-full min-h-[44px] items-start gap-3 rounded-xl border border-border/60 bg-card p-4 no-underline transition-colors hover:border-primary/30 hover:bg-primary/5 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PastelIcon tone={it.tone} size={36}>
                      <Icon className="h-4 w-4" />
                    </PastelIcon>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{it.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{it.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export function FinHome() {
  const profile = useLoad<FinOrgProfile | null>(fetchProfile);
  const aging = useLoad(fetchAging);
  const metrics = useLoad<FinMetricsResponse>(fetchMetrics);
  const obligations = useLoad(fetchObligations);
  const { isEnabled } = useEnabledModules();
  const today = todayIso();

  const agingData = aging.status === "ok" ? aging.data.aging : null;
  const obligationsData = obligations.status === "ok" ? obligations.data : null;
  const todos = useMemo(
    () => buildTodos({ obligations: obligationsData, aging: agingData, today }),
    [obligationsData, agingData, today],
  );
  const next = obligationsData ? nextDeadline(obligationsData, today) : null;

  const points = metrics.status === "ok" ? metrics.data.metrics : [];
  const thisMonth = points[points.length - 1];
  const receivable = points.reduce((sum, p) => sum + p.receivable, 0);
  const over30 = agingData ? agingData["31_60"] + agingData["61_90"] + agingData["90_plus"] : 0;

  const companyName = profile.status === "ok" ? profile.data?.legalName : undefined;
  const needsSetup = profile.status === "ok" && profile.data === null;

  return (
    <FinLayout
      pageTitle={companyName || "FinDesk"}
      pageDescription="Ce e urgent, cum stăm și toate modulele de finanțe."
      actions={
        <Link
          to="/business/fin/invoices?nou=1"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 hover:no-underline"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Factură nouă
        </Link>
      }
    >
      {needsSetup && <SetupBanner />}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="fin-home-kpis">
        <KpiTile
          label="Facturi restante"
          value={agingData ? formatFinMoney(agingData.total) : "—"}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
          href="/business/fin/invoices"
          loading={aging.status === "loading"}
          hint={agingData && over30 > 0 ? `${formatFinMoney(over30)} peste 30 de zile` : undefined}
        />
        <KpiTile
          label="De încasat (6 luni)"
          value={metrics.status === "ok" ? formatFinMoney(receivable) : "—"}
          icon={<Wallet className="h-5 w-5" />}
          tone="amber"
          href="/business/fin/payments"
          loading={metrics.status === "loading"}
        />
        <KpiTile
          label="Venit luna aceasta"
          value={thisMonth ? formatFinMoney(thisMonth.revenue) : "—"}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="emerald"
          href="/business/fin/insights"
          loading={metrics.status === "loading"}
          hint={thisMonth ? `Profit: ${formatFinMoney(thisMonth.profit)}` : undefined}
        />
        <KpiTile
          label="Următorul termen fiscal"
          value={next ? formatDate(next.dueDate) : "—"}
          icon={<CalendarClock className="h-5 w-5" />}
          tone="orange"
          href="/business/fin/calendar"
          loading={obligations.status === "loading"}
          hint={next ? obligationLabel(next) : obligations.status === "ok" ? "Niciun termen înregistrat" : undefined}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodoPanel
            todos={todos}
            loading={aging.status === "loading" || obligations.status === "loading"}
            failed={aging.status === "error" && obligations.status === "error"}
          />
        </div>
        <Card tone="dashboard" className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Acțiuni rapide</h2>
          <ul className="space-y-2">
            {[
              { label: "Emite o factură", href: "/business/fin/invoices?nou=1", icon: Receipt },
              { label: "Încarcă extrasul bancar", href: "/business/fin/statement/upload", icon: Wallet },
              { label: "Adaugă o cheltuială", href: "/business/fin/expenses", icon: Plus },
              { label: "Vezi termenele fiscale", href: "/business/fin/calendar", icon: CalendarClock },
            ].map((a) => (
              <li key={a.href}>
                <Link
                  to={a.href}
                  className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 text-sm text-foreground no-underline hover:bg-muted hover:no-underline"
                >
                  <a.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ModuleMap crmEnabled={isEnabled("crm")} itparkEnabled={isEnabled("itpark")} />
    </FinLayout>
  );
}
