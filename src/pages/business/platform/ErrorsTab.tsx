/**
 * PLATFORM-002 — fila „Erori".
 *
 * Ce răspunde: „ce s-a stricat la clienți, la câți, și de când". Lista e grupată pe tipuri
 * de eroare (nu pe apariții), altfel un singur bug lovit de 400 de ori ar arăta ca 400 de
 * probleme și n-ai ști de unde să începi.
 *
 * Sortarea implicită e după ultima apariție, nu după număr: o eroare nouă care tocmai a
 * apărut la un client contează mai mult decât una veche care nu mai supără pe nimeni.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bug, CheckCircle2, EyeOff, Loader2, RotateCcw } from "lucide-react";
import {
  getPlatformErrorDetail,
  getPlatformErrors,
  setErrorStatus,
  type PlatformErrorEvent,
  type PlatformErrorGroup,
} from "@/lib/api/platform";
import {
  Alert,
  Badge,
  Button,
  Card,
  Select,
  Sheet,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type BadgeVariant,
} from "@/components/ds";
import { formatDateTime, formatRelative } from "./format";

/** Eticheta + severitatea fiecărui tip de eroare, pe înțelesul cuiva care nu citește cod. */
const KIND_META: Record<string, { label: string; variant: BadgeVariant; hint: string }> = {
  client_crash: { label: "Pagină crăpată", variant: "destructive", hint: "Clientul a văzut un ecran de eroare în locul paginii." },
  client_unhandled: { label: "Eroare în browser", variant: "warning", hint: "Excepție necapturată în aplicația clientului." },
  client_api_error: { label: "Răspuns invalid", variant: "destructive", hint: "API-ul a răspuns cu altceva decât JSON — de obicei o rută nemontată." },
  server_exception: { label: "Excepție pe server", variant: "destructive", hint: "Cod care a aruncat o excepție într-un handler." },
  server_5xx: { label: "Eroare de server", variant: "destructive", hint: "O rută a răspuns 5xx — clientul a văzut un mesaj de eroare." },
  api_route_missing: { label: "Rută API lipsă", variant: "warning", hint: "404 pe /api/* — de obicei un router nemontat." },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { label: kind, variant: "secondary" as BadgeVariant, hint: "" };
}

export function ErrorsTab({ onOpenCount }: { onOpenCount?: (n: number) => void }) {
  const [groups, setGroups] = useState<PlatformErrorGroup[]>([]);
  const [status, setStatus] = useState("open");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPlatformErrors(status, days);
      setGroups(data.groups);
      onOpenCount?.(data.openCount);
    } catch {
      setError("Lista de erori nu a putut fi încărcată.");
    } finally {
      setLoading(false);
    }
  }, [status, days, onOpenCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (groupId: string, next: "open" | "resolved" | "ignored") => {
    try {
      await setErrorStatus(groupId, next);
      await load();
      if (selected === groupId && next !== "open") setSelected(null);
    } catch {
      setError("Starea erorii nu a putut fi schimbată.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Bug className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="flex-1 text-sm text-muted-foreground">
          Erorile din browserul clienților și de pe server ajung aici automat. La primul tip nou
          de eroare primești și un email.
        </p>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrează după stare"
          className="max-w-[190px]"
        >
          <option value="open">Deschise</option>
          <option value="resolved">Rezolvate</option>
          <option value="ignored">Ignorate</option>
          <option value="all">Toate</option>
        </Select>
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Perioada"
          className="max-w-[170px]"
        >
          <option value="1">Ultimele 24h</option>
          <option value="7">Ultimele 7 zile</option>
          <option value="30">Ultimele 30 zile</option>
          <option value="90">Ultimele 90 zile</option>
        </Select>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Se încarcă…
        </div>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">Nicio eroare în perioada selectată.</p>
          <p className="text-sm text-muted-foreground">
            Dacă un client dă peste o problemă, apare aici fără să trebuiască să te anunțe cineva.
          </p>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Eroare</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead className="text-right">Apariții</TableHead>
              <TableHead className="text-right">Clienți</TableHead>
              <TableHead>Ultima dată</TableHead>
              <TableHead>Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const meta = kindMeta(g.kind);
              return (
                <TableRow key={g.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setSelected(g.id)}
                      className="text-left text-sm font-medium text-foreground hover:underline"
                    >
                      {g.title}
                    </button>
                    {g.location && (
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{g.location}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{g.occurrences}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {g.affectedTenants > 0 ? g.affectedTenants : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatRelative(g.lastSeenAt)}
                  </TableCell>
                  <TableCell>
                    <span className="flex gap-1">
                      {g.status !== "resolved" && (
                        <Button
                          variant="outline"
                          onClick={() => mark(g.id, "resolved")}
                          aria-label={`Marchează ca rezolvată: ${g.title}`}
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {g.status !== "ignored" && (
                        <Button
                          variant="outline"
                          onClick={() => mark(g.id, "ignored")}
                          aria-label={`Ignoră: ${g.title}`}
                        >
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      {g.status !== "open" && (
                        <Button
                          variant="outline"
                          onClick={() => mark(g.id, "open")}
                          aria-label={`Redeschide: ${g.title}`}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ErrorDetailSheet groupId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ErrorDetailSheet({ groupId, onClose }: { groupId: string | null; onClose: () => void }) {
  const [group, setGroup] = useState<PlatformErrorGroup | null>(null);
  const [events, setEvents] = useState<PlatformErrorEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    getPlatformErrorDetail(groupId)
      .then((data) => {
        setGroup(data.group);
        setEvents(data.events);
      })
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [groupId]);

  const meta = group ? kindMeta(group.kind) : null;

  return (
    <Sheet open={!!groupId} onClose={onClose} title={group?.title ?? "Eroare"} size="lg">
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Se încarcă…
        </div>
      ) : !group ? (
        <p className="text-sm text-muted-foreground">Eroarea nu a fost găsită.</p>
      ) : (
        <div className="space-y-5">
          {meta?.hint && (
            <Alert variant="info">
              <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
              {meta.hint}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Apariții" value={group.occurrences} />
            <Metric label="Clienți afectați" value={group.affectedTenants || "—"} />
            <Metric label="Prima dată" value={formatRelative(group.firstSeenAt)} />
            <Metric label="Ultima dată" value={formatRelative(group.lastSeenAt)} />
          </div>
          {group.location && (
            <p className="font-mono text-xs text-muted-foreground">Unde: {group.location}</p>
          )}

          <section aria-labelledby="err-events">
            <h3 id="err-events" className="mb-2 text-sm font-semibold text-foreground">
              Ultimele apariții
            </h3>
            <ul className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-foreground">{e.tenantName ?? "workspace necunoscut"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.userEmail ?? "utilizator neautentificat"}
                    {e.method || e.statusCode ? ` · ${e.method ?? ""} ${e.statusCode ?? ""}`.trim() : ""}
                  </p>
                  {e.url && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{e.url}</p>}
                  {e.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-primary">Vezi detaliile tehnice</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-3xs text-muted-foreground">
                        {e.stack}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
              {events.length === 0 && (
                <li className="text-sm text-muted-foreground">Nicio apariție înregistrată.</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <p className="text-3xs font-semibold uppercase tracking-group text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}
