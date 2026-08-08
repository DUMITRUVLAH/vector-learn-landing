/**
 * PLATFORM-001 — Consola Platformă (`/business/platform`).
 *
 * Ecranul proprietarului platformei, nu al clientului. Cinci file:
 *   Ansamblu    — KPI-uri, adopția modulelor, distribuția pe planuri
 *   Workspace-uri — clienții cu statisticile lor, filtrare, export, detaliu
 *   Module      — ce primește un client NOU la înregistrare + aplicare la cei existenți
 *   Logări      — istoricul complet (succes + eșec), filtre, export, semnale suspecte
 *   Acces       — superadminii + auditul propriilor mele acțiuni
 *
 * Doar superadminii ajung aici; API-ul răspunde 403 tuturor celorlalți, iar ecranul
 * spune asta explicit în loc să arate un tabel gol.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  Download,
  LayoutGrid,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  addPlatformAdmin,
  applyDefaults,
  getPlatformAdmins,
  getPlatformAudit,
  getPlatformCatalog,
  getPlatformLogins,
  getPlatformOverview,
  getPlatformWorkspaces,
  loginQueryString,
  removePlatformAdmin,
  setModuleDefault,
  type LoginQuery,
  type PlatformAdmin,
  type PlatformAuditEntry,
  type PlatformLoginEvent,
  type PlatformModule,
  type PlatformOverview,
  type PlatformWorkspace,
} from "@/lib/api/platform";
import { WorkspaceSheet } from "./WorkspaceSheet";
import {
  auditActionLabel,
  failureLabel,
  formatDateTime,
  formatRelative,
  statusBadgeVariant,
  statusLabel,
} from "./format";

type TabKey = "overview" | "workspaces" | "modules" | "logins" | "access";

const TABS: { value: TabKey; label: string }[] = [
  { value: "overview", label: "Ansamblu" },
  { value: "workspaces", label: "Workspace-uri" },
  { value: "modules", label: "Module" },
  { value: "logins", label: "Logări" },
  { value: "access", label: "Acces & audit" },
];

export function PlatformConsolePage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [modules, setModules] = useState<PlatformModule[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getPlatformCatalog()
      .then((data) => setModules(data.modules))
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) setForbidden(true);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <BusinessShell pageTitle="Consola Platformă">
        <div className="flex items-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Se verifică accesul…
        </div>
      </BusinessShell>
    );
  }

  if (forbidden) {
    return (
      <BusinessShell pageTitle="Consola Platformă">
        <Alert variant="destructive">
          Această zonă e rezervată proprietarului platformei. Contul tău nu are acces de superadmin.
        </Alert>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell
      pageTitle="Consola Platformă"
      pageDescription="Clienții, modulele pe care le văd, statisticile și istoricul de logări."
    >
      <Tabs<TabKey>
        tabs={TABS}
        value={tab}
        onChange={setTab}
        className="mb-5"
        aria-label="Secțiunile Consolei Platformă"
      />
      {tab === "overview" && <OverviewTab />}
      {tab === "workspaces" && <WorkspacesTab modules={modules} />}
      {tab === "modules" && <ModulesTab modules={modules} />}
      {tab === "logins" && <LoginsTab />}
      {tab === "access" && <AccessTab />}
    </BusinessShell>
  );
}

// ─── Ansamblu ─────────────────────────────────────────────────────────────────

function OverviewTab() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getPlatformOverview()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingRow />;
  if (error || !data) return <Alert variant="destructive">Statisticile nu au putut fi încărcate.</Alert>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Workspace-uri" value={data.workspaces.total} hint={`${data.workspaces.business} business · ${data.workspaces.learn} CRM`} icon={<Building2 className="h-5 w-5" />} />
        <Kpi label="Noi în 30 zile" value={data.workspaces.new30d} hint={`${data.workspaces.suspended} suspendate`} icon={<LayoutGrid className="h-5 w-5" />} />
        <Kpi label="Active în 7 zile" value={data.workspaces.active7d} hint={`din ${data.workspaces.total}`} icon={<Users className="h-5 w-5" />} />
        <Kpi label="Logări 24h" value={data.logins.last24h} hint={`${data.logins.last7d} în 7 zile · ${data.logins.failed7d} eșecuri`} icon={<LogIn className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Adopția modulelor</h2>
          <ul className="space-y-3">
            {data.adoption.map((m) => {
              const pct = m.total > 0 ? Math.round((m.enabled / m.total) * 100) : 0;
              return (
                <li key={m.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{m.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {m.enabled}/{m.total} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Distribuția pe planuri</h2>
          <ul className="space-y-2">
            {data.plans.map((p) => (
              <li key={p.plan} className="flex items-center justify-between text-sm">
                <span className="capitalize text-foreground">{p.plan}</span>
                <span className="tabular-nums font-semibold text-foreground">{p.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Utilizatori în total pe platformă: <strong className="text-foreground">{data.users.total}</strong>
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Workspace-uri ────────────────────────────────────────────────────────────

function WorkspacesTab({ modules }: { modules: PlatformModule[] }) {
  const [rows, setRows] = useState<PlatformWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "churn">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getPlatformWorkspaces();
      setRows(data.workspaces);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
      if (filter === "active") return r.status === "active";
      if (filter === "suspended") return r.status === "suspended";
      if (filter === "churn") return r.churnRisk;
      return true;
    });
  }, [rows, query, filter]);

  if (loading) return <LoadingRow />;
  if (error) return <Alert variant="destructive">Lista workspace-urilor nu a putut fi încărcată.</Alert>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Caută după nume sau slug…"
          aria-label="Caută workspace"
          className="max-w-xs"
        />
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Filtrează workspace-urile"
          className="max-w-[220px]"
        >
          <option value="all">Toate</option>
          <option value="active">Doar active</option>
          <option value="suspended">Doar suspendate</option>
          <option value="churn">Risc de abandon</option>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={load} aria-label="Reîncarcă lista">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reîncarcă
        </Button>
        <a
          href="/api/platform/workspaces?format=csv"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </a>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workspace</TableHead>
            <TableHead>Stare</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Utilizatori</TableHead>
            <TableHead className="text-right">Logări 30z</TableHead>
            <TableHead>Ultima logare</TableHead>
            <TableHead>Module</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((w) => (
            <TableRow
              key={w.id}
              interactive
              onClick={() => setSelected(w.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(w.id);
                }
              }}
              aria-label={`Deschide ${w.name}`}
            >
              <TableCell>
                <span className="block font-medium text-foreground">{w.name}</span>
                <span className="block text-xs text-muted-foreground">{w.slug}</span>
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(w.status)}>{statusLabel(w.status)}</Badge>
                {w.churnRisk && w.status !== "suspended" && (
                  <span className="mt-1 flex items-center gap-1 text-3xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    risc de abandon
                  </span>
                )}
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{w.plan}</TableCell>
              <TableCell className="text-right tabular-nums">{w.userCount}</TableCell>
              <TableCell className="text-right tabular-nums">{w.logins30d}</TableCell>
              <TableCell className="text-muted-foreground">{formatRelative(w.lastLoginAt)}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  {modules
                    .filter((m) => w.modules[m.key] !== false)
                    .map((m) => (
                      <Badge key={m.key} variant="secondary">
                        {m.key}
                      </Badge>
                    ))}
                  {modules.every((m) => w.modules[m.key] === false) && (
                    <span className="text-xs text-muted-foreground">niciunul</span>
                  )}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                Niciun workspace pentru filtrele curente.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <WorkspaceSheet
        tenantId={selected}
        modules={modules}
        onClose={() => setSelected(null)}
        onChanged={load}
      />
    </div>
  );
}

// ─── Module (implicitele pentru clienți noi) ──────────────────────────────────

function ModulesTab({ modules }: { modules: PlatformModule[] }) {
  const [defaults, setDefaults] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlatformCatalog();
      setDefaults(data.defaults);
    } catch {
      setError("Implicitele nu au putut fi încărcate.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (key: string, enabled: boolean) => {
    setBusy(key);
    setError(null);
    setMessage(null);
    setDefaults((d) => ({ ...d, [key]: enabled }));
    try {
      await setModuleDefault(key, enabled);
    } catch {
      setDefaults((d) => ({ ...d, [key]: !enabled }));
      setError("Setarea nu a putut fi salvată.");
    } finally {
      setBusy(null);
    }
  };

  const apply = async (overwrite: boolean) => {
    setBusy("apply");
    setError(null);
    setMessage(null);
    try {
      const result = await applyDefaults(overwrite);
      setMessage(
        overwrite
          ? `Implicitele au fost aplicate la toate cele ${result.workspaces} workspace-uri (${result.updated} actualizate).`
          : `Implicitele au fost completate acolo unde lipseau (${result.inserted} setări noi, restul neatinse).`,
      );
    } catch {
      setError("Aplicarea nu a reușit.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <LoadingRow />;

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Ce vede un client NOU</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Se aplică în momentul în care cineva își creează un workspace — cu parolă sau prin Google.
          Nu schimbă nimic la clienții existenți.
        </p>
        <div className="mt-4 space-y-2">
          {modules.map((m) => (
            <div
              key={m.key}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
              <Switch
                checked={defaults[m.key] !== false}
                disabled={busy === m.key}
                onChange={(next) => toggle(m.key, next)}
                aria-label={`${m.label} implicit pentru clienți noi`}
              />
            </div>
          ))}
        </div>
      </Card>

      {message && <Alert variant="success">{message}</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Aplică la workspace-urile existente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          „Completează" atinge doar modulele fără o setare explicită. „Rescrie tot" suprascrie și
          alegerile făcute per client — inclusiv modulele pe care le-ai activat manual pentru cineva.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => apply(false)} disabled={busy === "apply"}>
            Completează lipsurile
          </Button>
          <Button variant="destructive" onClick={() => apply(true)} disabled={busy === "apply"}>
            Rescrie tot
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Logări ───────────────────────────────────────────────────────────────────

function LoginsTab() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<"" | "success" | "failed">("");
  const [days, setDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<PlatformLoginEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [suspicious, setSuspicious] = useState<{ email: string; failures: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const limit = 100;
  const filters: LoginQuery = useMemo(
    () => ({ q: query || undefined, result: result || undefined, days, limit, offset }),
    [query, result, days, offset],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    // Debounce mic: tastarea în căutare nu are voie să genereze o cerere per literă.
    const t = setTimeout(() => {
      getPlatformLogins(filters)
        .then((data) => {
          if (!alive) return;
          setEvents(data.events);
          setTotal(data.total);
          setSuspicious(data.suspicious);
        })
        .catch(() => alive && setError(true))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filters]);

  const csvHref = `/api/platform/logins?${loginQueryString({ ...filters, limit: undefined, offset: undefined })}&format=csv`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOffset(0);
          }}
          placeholder="Email sau IP…"
          aria-label="Caută în istoricul de logări"
          className="max-w-xs"
        />
        <Select
          value={result}
          onChange={(e) => {
            setResult(e.target.value as typeof result);
            setOffset(0);
          }}
          aria-label="Filtrează după rezultat"
          className="max-w-[180px]"
        >
          <option value="">Toate</option>
          <option value="success">Doar reușite</option>
          <option value="failed">Doar eșuate</option>
        </Select>
        <Select
          value={String(days)}
          onChange={(e) => {
            setDays(Number(e.target.value));
            setOffset(0);
          }}
          aria-label="Perioada"
          className="max-w-[180px]"
        >
          <option value="1">Ultimele 24h</option>
          <option value="7">Ultimele 7 zile</option>
          <option value="30">Ultimele 30 zile</option>
          <option value="90">Ultimele 90 zile</option>
          <option value="365">Ultimul an</option>
        </Select>
        <div className="flex-1" />
        <a
          href={csvHref}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </a>
      </div>

      {suspicious.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
          Încercări repetate eșuate:{" "}
          {suspicious.map((s) => `${s.email} (${s.failures})`).join(", ")}
        </Alert>
      )}

      {error && <Alert variant="destructive">Istoricul nu a putut fi încărcat.</Alert>}
      {loading ? (
        <LoadingRow />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Când</TableHead>
                <TableHead>Cine</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Aplicație</TableHead>
                <TableHead>Rezultat</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="block font-medium text-foreground">{e.email}</span>
                    {e.userName && <span className="block text-xs text-muted-foreground">{e.userName}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.tenantName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.app} · {e.method}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.success ? "success" : "destructive"}>
                      {e.success ? "reușit" : failureLabel(e.failureReason)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {e.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nicio logare în perioada selectată.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + limit, total)}`} din {total}
            </span>
            <span className="flex gap-2">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Înapoi
              </Button>
              <Button
                variant="outline"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Înainte
              </Button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Acces & audit ────────────────────────────────────────────────────────────

function AccessTab() {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [self, setSelf] = useState<string>("");
  const [entries, setEntries] = useState<PlatformAuditEntry[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [adminData, auditData] = await Promise.all([getPlatformAdmins(), getPlatformAudit()]);
      setAdmins(adminData.admins);
      setSelf(adminData.self);
      setEntries(auditData.entries);
    } catch {
      setError("Datele de acces nu au putut fi încărcate.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addPlatformAdmin(email.trim());
      setEmail("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "user_not_found"
          ? "Nu există niciun cont cu acest email. Persoana trebuie să se înregistreze mai întâi."
          : "Superadminul nu a putut fi adăugat.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      await removePlatformAdmin(userId);
      await load();
    } catch {
      setError("Superadminul nu a putut fi retras.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingRow />;

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Superadmini
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Promovează un cont care există deja. Nu te poți retrage pe tine însuți.
        </p>
        {error && (
          <Alert variant="destructive" className="mt-3">
            {error}
          </Alert>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplu.md"
            aria-label="Emailul noului superadmin"
            className="max-w-xs"
          />
          <Button onClick={add} disabled={busy || !email.trim()}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Adaugă
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {a.name ?? a.email ?? a.userId}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.email} {a.tenantName ? `· ${a.tenantName}` : ""}
                </span>
              </span>
              {a.userId === self ? (
                <Badge variant="secondary">tu</Badge>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => remove(a.userId)}
                  disabled={busy}
                  aria-label={`Retrage accesul lui ${a.email ?? a.userId}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Auditul acțiunilor mele</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Când</TableHead>
              <TableHead>Cine</TableHead>
              <TableHead>Acțiune</TableHead>
              <TableHead>Țintă</TableHead>
              <TableHead>Detalii</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(e.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">{e.actorEmail ?? "—"}</TableCell>
                <TableCell className="font-medium text-foreground">{auditActionLabel(e.action)}</TableCell>
                <TableCell className="text-muted-foreground">{e.targetLabel ?? e.targetId ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {e.meta ? JSON.stringify(e.meta) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nicio acțiune înregistrată încă.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Bucăți comune ────────────────────────────────────────────────────────────

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      Se încarcă…
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-3xs font-semibold uppercase tracking-group text-muted-foreground">{label}</p>
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default PlatformConsolePage;
