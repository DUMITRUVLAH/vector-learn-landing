/**
 * Tabloul de bord al unui workspace care are DOAR modulul PAR.
 *
 * Dashboard-ul general vorbește despre FinDesk, facturi și ITPark — pentru o organizație care
 * folosește exclusiv cererile de plată e zgomot: niciun număr de acolo nu-i spune ce are de
 * făcut azi. Aici arătăm exact asta: ce așteaptă decizia ta, ce se mișcă în organizație
 * (cine a cerut, cine a comentat, ce s-a aprobat) și pe unde intri mai departe.
 */
import { useEffect } from "react";
import { ClipboardList, ShieldCheck, Banknote, MessageSquare, Plus, ArrowRight, Clock } from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import {
  getParInbox,
  getFinanceQueue,
  listPar,
  listParActivity,
  PAR_STATUS_LABELS,
  type ParInboxItem,
  type ParActivityItem,
  type ParListRow,
} from "@/lib/api/par";
import { useParRoles } from "@/hooks/useParRoles";
import { useKeepAliveState } from "@/hooks/useKeepAliveState";
import { formatCents } from "@/lib/utils";
import { Button, Card, KpiTile, PastelIcon } from "@/components/ds";

/** „acum 3 ore" bate un timestamp ISO pe un tablou de bord — contează cât de proaspăt e. */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "chiar acum";
  if (min < 60) return `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `acum ${h} ${h === 1 ? "oră" : "ore"}`;
  const d = Math.round(h / 24);
  if (d < 30) return `acum ${d} ${d === 1 ? "zi" : "zile"}`;
  return new Date(iso).toLocaleDateString("ro-RO");
}

/** Evenimentele de audit, spuse în limbaj de om. */
const EVENT_VERB: Record<string, string> = {
  submitted: "a trimis spre aprobare",
  approved: "a aprobat",
  rejected: "a respins",
  changes_requested: "a cerut modificări la",
  paid: "a marcat ca plătită",
  reopened: "a redeschis",
  withdrawn: "a retras",
};

function activityVerb(item: ParActivityItem): string {
  if (item.kind === "comment") return "a comentat la";
  return EVENT_VERB[item.event ?? ""] ?? "a actualizat";
}

interface SectionProps {
  title: string;
  hint?: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}

function Section({ title, hint, href, linkLabel, children }: SectionProps) {
  return (
    <Card tone="dashboard" className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold leading-tight text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Link to={href} className="shrink-0 text-xs font-medium text-primary">
          {linkLabel}
        </Link>
      </div>
      {children}
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{children}</p>;
}

interface ParFocusDashboardProps {
  /** Cereri în așteptare la nivel de workspace — vin din KPI-ul deja încărcat de pagină. */
  pendingCount: number | null;
  pendingValueCents: number | null;
  loading: boolean;
}

export function ParFocusDashboard({ pendingCount, pendingValueCents, loading }: ParFocusDashboardProps) {
  const { navigate } = useRouter();
  const { roles, status: rolesStatus } = useParRoles();
  const canApprove = roles.some((r) => ["approver", "par_admin"].includes(r));
  const canFinance = roles.some((r) => ["finance", "par_admin"].includes(r));

  // Ținute minte între navigări: la a doua vizită tabloul e deja desenat, iar cererile de
  // rețea doar confirmă. Fără asta, fiecare intrare pe dashboard redesena totul de la zero.
  const [inbox, setInbox] = useKeepAliveState<{ items: ParInboxItem[]; total: number } | null>("par.focus.inbox", null);
  const [financeTotal, setFinanceTotal] = useKeepAliveState<number | null>("par.focus.finance", null);
  const [activity, setActivity] = useKeepAliveState<ParActivityItem[] | null>("par.focus.activity", null);
  /** Pentru cine nu aprobă nimic, „ce am trimis eu" e informația utilă în locul inboxului. */
  const [mine, setMine] = useKeepAliveState<ParListRow[] | null>("par.focus.mine", null);

  useEffect(() => {
    if (rolesStatus !== "resolved") return;
    let alive = true;
    if (canApprove) {
      getParInbox()
        .then((r) => alive && setInbox({ items: r.inbox ?? [], total: r.total ?? 0 }))
        .catch(() => alive && setInbox((prev) => prev ?? { items: [], total: 0 }));
    } else {
      setInbox({ items: [], total: 0 });
      listPar()
        .then((r) => alive && setMine((r.requests ?? []).slice(0, 5)))
        .catch(() => alive && setMine((prev) => prev ?? []));
    }
    if (canFinance) {
      getFinanceQueue()
        .then((r) => alive && setFinanceTotal(r.total ?? 0))
        .catch(() => { /* păstrăm ultima valoare bună */ });
    }
    listParActivity(8)
      .then((r) => alive && setActivity(r.items ?? []))
      .catch(() => alive && setActivity((prev) => prev ?? []));
    return () => {
      alive = false;
    };
  }, [rolesStatus, canApprove, canFinance]);

  const waiting = inbox?.items.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canApprove && (
          <KpiTile
            label="Așteaptă decizia ta"
            value={inbox?.total ?? 0}
            icon={<ShieldCheck className="h-5 w-5" />}
            tone="emerald"
            href="/business/par/inbox"
            loading={inbox === null}
            hint={inbox && inbox.total === 0 ? "Nimic de aprobat acum" : "Inbox de aprobare"}
            data-testid="par-kpi-inbox"
          />
        )}
        {canFinance && (
          <KpiTile
            label="În coada de finanțe"
            value={financeTotal ?? 0}
            icon={<Banknote className="h-5 w-5" />}
            tone="amber"
            href="/business/par/finance"
            loading={financeTotal === null}
            hint="Aprobate, așteaptă plata"
            data-testid="par-kpi-finance"
          />
        )}
        <KpiTile
          label="Cereri în așteptare"
          value={pendingCount ?? 0}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="violet"
          href="/business/par"
          loading={loading}
          hint={
            pendingCount && pendingValueCents != null
              ? `Valoare totală: ${formatCents(pendingValueCents, "MDL")}`
              : "Nicio cerere în așteptare"
          }
          data-testid="par-kpi-pending"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title={canApprove ? "Așteaptă decizia ta" : "Cererile tale recente"}
          hint={canApprove ? "Cereri la care ești pe lanțul de aprobare" : "Ultimele cereri pe care le-ai trimis"}
          href={canApprove ? "/business/par/inbox" : "/business/par"}
          linkLabel={canApprove ? "Vezi inbox" : "Vezi toate"}
        >
          {!canApprove ? (
            mine === null ? (
              <EmptyRow>Se încarcă…</EmptyRow>
            ) : mine.length === 0 ? (
              <EmptyRow>N-ai trimis încă nicio cerere. „Cerere nouă" e mai jos.</EmptyRow>
            ) : (
              <ul className="flex flex-col gap-2">
                {mine.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/business/par/${row.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 no-underline hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {row.requestNo} · {row.payeeName ?? "Fără beneficiar"}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {PAR_STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-foreground">
                        {formatCents(row.totalEstimatedCents, row.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : inbox === null ? (
            <EmptyRow>Se încarcă…</EmptyRow>
          ) : waiting.length === 0 ? (
            <EmptyRow>Inbox gol — nicio cerere nu așteaptă decizia ta.</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-2">
              {waiting.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/business/par/${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 no-underline hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.requestNo} · {item.payeeName ?? "Fără beneficiar"}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        Cerut de {item.requestedByName ?? "—"}
                        {item.my_step_label ? ` · ${item.my_step_label}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCents(item.totalEstimatedCents, item.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Activitate recentă"
          hint="Cine a cerut, cine a comentat, ce s-a aprobat"
          href="/business/par"
          linkLabel="Vezi cererile"
        >
          {activity === null ? (
            <EmptyRow>Se încarcă…</EmptyRow>
          ) : activity.length === 0 ? (
            <EmptyRow>Încă nicio mișcare. Prima cerere trimisă apare aici.</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-3">
              {activity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <PastelIcon tone={item.kind === "comment" ? "sky" : "violet"} size={32}>
                    {item.kind === "comment" ? <MessageSquare className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </PastelIcon>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{item.actorName ?? "Cineva"}</span> {activityVerb(item)}{" "}
                      {item.parId ? (
                        <Link to={`/business/par/${item.parId}`} className="font-medium text-primary">
                          {item.requestNo ?? "o cerere"}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.requestNo ?? "o cerere"}</span>
                      )}
                    </p>
                    {item.kind === "comment" && item.text && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">„{item.text}"</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {relativeTime(item.createdAt)}
                      {item.projectName ? ` · ${item.projectName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate("/business/par/new")} aria-label="Cerere PAR nouă">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Cerere nouă
        </Button>
        <Button variant="outline" onClick={() => navigate("/business/par")}>
          Toate cererile
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}