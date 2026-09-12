/**
 * VM5-09 — „Activitatea": ce a făcut o persoană, pe un interval.
 *
 * Cerința din ședință: „să se adauge opțiunea ca informația să fie păstrată la dosar (istoricul,
 * actele dosarului, **work-flow-ul per persoană** și schimbări)". Istoricul unei cereri exista
 * (ParTimeline), actele la fel (Foldere) — lipsea privirea transversală: ce a făcut un om, nu ce s-a
 * întâmplat cu o cerere. E întrebarea care apare când cineva pleacă în concediu sau când auditul
 * întreabă cine a mișcat ceva.
 *
 * Vizibilitatea nu e relaxată aici: feedul arată doar cererile pe care omul le poate oricum vedea
 * (`/api/par/activity` repetă regulile listei). Un solicitant simplu își vede activitatea proprie;
 * un aprobator, pe cea din aria lui.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Download, Loader2 } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  listParActivity,
  listParMembers,
  type ParActivityItem,
  type ParMember,
} from "@/lib/api/par";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";

/** Ce s-a întâmplat, scris pentru om. Aceleași cuvinte ca în istoricul unei cereri. */
const EVENT_LABEL: Record<string, string> = {
  created: "a creat cererea",
  submitted: "a depus cererea",
  approved: "a aprobat",
  rejected: "a respins",
  changes_requested: "a cerut modificări",
  reopened: "a reluat cererea",
  withdrawn: "a retras cererea pentru corectură",
  finance_returned: "a întors cererea de la finanțe",
  paid: "a marcat plata",
  payment_reverted: "a anulat plata",
  cancelled: "a anulat cererea",
};

function describe(item: ParActivityItem): string {
  if (item.kind === "comment") return "a comentat";
  return EVENT_LABEL[item.event ?? ""] ?? item.event ?? "a făcut o modificare";
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ro-MD", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export function ParActivity() {
  const { navigate } = useRouter();
  const { data: session } = useSession();
  const [items, setItems] = useState<ParActivityItem[]>([]);
  const [members, setMembers] = useState<ParMember[]>([]);
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listParMembers()
      .then((r) => setMembers(r.members ?? []))
      .catch(() => setMembers([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listParActivity({ limit: 200, actorUserId: actor || undefined, from: from || undefined, to: to || undefined });
      setItems(r.items ?? []);
    } catch {
      setError("Activitatea nu a putut fi încărcată.");
    } finally {
      setLoading(false);
    }
  }, [actor, from, to]);

  useEffect(() => { void load(); }, [load]);

  /** Exportul e local: datele sunt deja pe ecran, nu are rost un al doilea drum la server. */
  const exportCsv = () => {
    const head = ["Data", "Persoana", "Acțiune", "Cerere", "Proiect", "Detalii"];
    const rows = items.map((i) => [
      fmt(i.createdAt), i.actorName ?? "", describe(i), i.requestNo ?? "", i.projectName ?? "",
      (i.text ?? "").replace(/\s+/g, " ").slice(0, 200),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `activitate-par${actor ? "-filtrat" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const title = useMemo(() => {
    if (!actor) return "Toată activitatea pe care o pot vedea";
    const who = members.find((m) => m.userId === actor);
    return `Activitatea: ${who?.userName ?? "persoana selectată"}`;
  }, [actor, members]);

  return (
    <BusinessShell pageTitle="Activitate PAR">
      <div className="mx-auto max-w-5xl space-y-4 px-0 py-5 sm:px-4">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 flex-shrink-0 text-primary" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Activitate</h1>
            <p className="text-sm text-muted-foreground">
              Cine ce a făcut în cererile de plată — util când preiei de la un coleg sau când auditul
              întreabă cine a mișcat ceva.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Persoana
            <select
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              aria-label="Filtrează după persoană"
              className="min-h-[44px] min-w-[200px] rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Toată lumea</option>
              {session?.user?.id && <option value={session.user.id}>Eu</option>}
              {members
                .filter((m) => m.userId !== session?.user?.id)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>{m.userName ?? m.userId}</option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            De la
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De la data"
              className="min-h-[44px] rounded-md border border-input bg-background px-3 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Până la
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Până la data"
              className="min-h-[44px] rounded-md border border-input bg-background px-3 text-sm text-foreground" />
          </label>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!items.length}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            <Download className="h-4 w-4" aria-hidden />Export CSV
          </button>
        </div>

        <p className="text-sm font-medium text-foreground">{title}</p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Se încarcă…
          </p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nimic de arătat pentru filtrele alese.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-36 shrink-0 text-xs text-muted-foreground">{fmt(item.createdAt)}</span>
                <span className="font-medium text-foreground">{item.actorName ?? "Cineva"}</span>
                <span className="text-muted-foreground">{describe(item)}</span>
                {item.requestNo && item.parId && (
                  <button
                    type="button"
                    onClick={() => navigate(`/business/par/${item.parId}`)}
                    className={cn("font-mono text-primary hover:underline")}
                  >
                    {item.requestNo}
                  </button>
                )}
                {item.projectName && <span className="text-xs text-muted-foreground">· {item.projectName}</span>}
                {item.kind === "comment" && item.text && (
                  <span className="w-full truncate pl-36 text-xs text-muted-foreground">„{item.text}"</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BusinessShell>
  );
}

export default ParActivity;
