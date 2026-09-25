/**
 * CRM-G03 — Acasă, ca în Google Drive: ce ai de făcut și la ce ai lucrat, nu un meniu desenat.
 *
 * Pagina veche era o grilă de 12 carduri identice (iconiță în pătrățel colorat + titlu +
 * descriere + săgeată) — exact tiparul „AI slop" pe care l-a numit ownerul, și în plus o copie a
 * meniului din stânga. Drive deschide pe „Sugerate": fișierele la care e probabil să te întorci.
 * Echivalentul într-un CRM:
 *
 *   · De făcut — taskurile restante și leadurile noi încă nesunate (ale tale; managerul vede echipa
 *     în „Astăzi");
 *   · Afaceri recente — ultimele leaduri modificate, cu etapa, valoarea și cine le are.
 *
 * Fiecare rând deschide fișa leadului (`?lead=`), deci Acasă e un punct de plecare, nu o oprire.
 */
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, ArrowRight, CircleAlert, Loader2, UserPlus } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Alert, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import { Link, useRouter } from "@/router/HashRouter";
import { useBusinessSession } from "@/hooks/useBusinessSession";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { getCrmStages, getCrmToday, listCrmLeads, listCrmPipelines, type CrmLead, type CrmStage, type CrmTodayResponse } from "@/lib/api/crm";
import { crmStageLabel } from "@/components/crm/constants";
import { formatCentsShort, leadCardLines } from "@/components/crm/format";
import { pipelineHref } from "@/lib/crm/pipelineUrl";
import { cn } from "@/lib/utils";

/** Câte rânduri „De făcut" încap pe Acasă; restul stau în „Astăzi". */
const TODO_LIMIT = 6;
const RECENT_LIMIT = 10;

interface TodoItem {
  key: string;
  leadId: string;
  kind: "overdue" | "uncontacted" | "neglected";
  title: string;
  detail: string;
  meta: string;
}

/** „acum 3 ore" / „ieri" / „12 sept." — cum scrie Drive în coloana „Modificat". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "acum";
  if (mins < 60) return `acum ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && d.getDate() === now.getDate()) return `acum ${hours} ${hours === 1 ? "oră" : "ore"}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "ieri";
  return d.toLocaleDateString("ro-MD", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function buildTodos(today: CrmTodayResponse): TodoItem[] {
  const title = (l: { fullName: string; dealName: string | null; company: string | null }) =>
    l.company?.trim() || l.fullName;
  const items: TodoItem[] = [];
  for (const { lead, task } of today.overdueTasks) {
    items.push({
      key: `t-${task.id}`,
      leadId: lead.id,
      kind: "overdue",
      title: task.title,
      detail: title(lead),
      meta: task.dueAt ? `scadent ${relativeTime(task.dueAt)}` : "restant",
    });
  }
  for (const lead of today.uncontacted) {
    items.push({ key: `u-${lead.id}`, leadId: lead.id, kind: "uncontacted", title: "Sună leadul nou", detail: title(lead), meta: relativeTime(lead.createdAt) });
  }
  for (const lead of today.neglected) {
    items.push({ key: `n-${lead.id}`, leadId: lead.id, kind: "neglected", title: "Revino — neatins de câteva zile", detail: title(lead), meta: formatCentsShort(lead.valueCents) });
  }
  return items;
}

const TODO_ICON = { overdue: AlarmClock, uncontacted: UserPlus, neglected: CircleAlert } as const;

export function CrmHomePage() {
  const { navigate } = useRouter();
  const { data: session } = useBusinessSession();
  const { members } = useTeamMembers();
  const me = session?.user.id;

  const [today, setToday] = useState<CrmTodayResponse | null>(null);
  const [recent, setRecent] = useState<CrmLead[] | null>(null);
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Trei cereri independente: una picată nu golește pagina — fiecare secțiune își arată
    // propria stare. `Promise.allSettled`, nu `all`.
    void Promise.allSettled([
      me ? getCrmToday(me) : Promise.resolve(null),
      listCrmLeads({ sort: "updatedAt", dir: "desc", pageSize: RECENT_LIMIT }),
      // Afacerile recente vin din TOATE pâlniile, deci etichetele trebuie să vină din toate —
      // altfel un lead din „Call-center" își arată cheia brută („rezerva") în loc de nume.
      listCrmPipelines()
        .then((p) => Promise.all(p.items.map((pl) => getCrmStages(pl.id))))
        .then((all) => ({ items: all.flatMap((x) => x.items) }))
        .catch(() => getCrmStages()),
    ]).then(([t, r, s]) => {
      if (!alive) return;
      if (t.status === "fulfilled") setToday(t.value);
      if (r.status === "fulfilled") setRecent(r.value.items);
      else setRecent([]);
      if (s.status === "fulfilled") setStages(s.value.items);
      if (t.status === "rejected" || r.status === "rejected") setError("O parte din pagină nu s-a putut încărca. Reîncearcă.");
    });
    return () => {
      alive = false;
    };
  }, [me]);

  const todos = useMemo(() => (today ? buildTodos(today) : []), [today]);
  const ownerName = (id: string | null) => (id ? members.find((m) => m.id === id)?.fullName ?? "—" : "Nerepartizat");
  const firstName = session?.user.name?.split(" ")[0];

  return (
    <BusinessShell pageTitle={firstName ? `Bună, ${firstName}` : "Acasă"}>
      <div className="space-y-8">
        {error && <Alert variant="destructive">{error}</Alert>}

        <section aria-labelledby="crm-home-todo" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="crm-home-todo" className="text-base font-medium">
              De făcut
            </h2>
            <Link to="/business/crm/astazi" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Toate în Astăzi
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {today === null && !error ? (
            <Loading label="Se încarcă lucrurile de făcut" />
          ) : todos.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-6 text-sm text-muted-foreground">
              Nimic restant. Leadurile noi și taskurile scadente apar aici.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="De făcut">
              {todos.slice(0, TODO_LIMIT).map((t) => {
                const Icon = TODO_ICON[t.kind];
                return (
                  <li key={t.key}>
                    <Link
                      to={pipelineHref(t.leadId)}
                      className="flex min-h-14 items-center gap-4 px-4 py-2 text-foreground no-underline transition-colors hover:bg-muted hover:no-underline"
                    >
                      <Icon
                        className={cn("h-5 w-5 shrink-0", t.kind === "overdue" ? "text-destructive" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="block truncate text-sm text-muted-foreground">{t.detail}</span>
                      </span>
                      <span className={cn("shrink-0 text-sm tabular-nums", t.kind === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                        {t.meta}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {todos.length > TODO_LIMIT && (
            <p className="text-sm text-muted-foreground">Încă {todos.length - TODO_LIMIT} în „Astăzi".</p>
          )}
        </section>

        <section aria-labelledby="crm-home-recent" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="crm-home-recent" className="text-base font-medium">
              Afaceri recente
            </h2>
            <Link to="/business/crm/pipeline" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Pipeline
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {recent === null ? (
            <Loading label="Se încarcă afacerile recente" />
          ) : recent.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-6 text-sm text-muted-foreground">
              Încă nu ai niciun lead. Adaugă primul cu „Lead nou" sau importă o listă.
            </p>
          ) : (
            <Table aria-label="Afaceri recente">
              <TableHeader>
                <TableRow>
                  <TableHead>Nume</TableHead>
                  <TableHead className="hidden sm:table-cell">Etapă</TableHead>
                  <TableHead className="text-right">Valoare</TableHead>
                  <TableHead className="hidden md:table-cell">Responsabil</TableHead>
                  <TableHead className="hidden sm:table-cell">Modificat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((lead) => {
                  const lines = leadCardLines(lead);
                  const href = pipelineHref(lead.id);
                  return (
                    <TableRow key={lead.id} interactive onClick={() => navigate(href)}>
                      <TableCell>
                        <Link to={href} className="block font-medium text-foreground no-underline hover:no-underline" onClick={(e) => e.stopPropagation()}>
                          {lines.title}
                        </Link>
                        {lines.subtitle && <span className="block text-sm text-muted-foreground">{lines.subtitle}</span>}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{crmStageLabel(stages, lead.stage)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCentsShort(lead.valueCents ?? 0)}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{ownerName(lead.assignedTo ?? null)}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{relativeTime(lead.updatedAt ?? lead.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </div>
    </BusinessShell>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-10" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label={label} />
    </div>
  );
}
