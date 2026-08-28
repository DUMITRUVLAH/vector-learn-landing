/**
 * PLATFORM-001 — panoul de detaliu al unui workspace.
 *
 * Tot ce trebuie să știi despre un client într-un singur loc: statisticile, comutatoarele
 * de module, planul, starea (activ / probă / suspendat), membrii cu ultima lor logare,
 * ultimele logări și notele interne.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, LogIn, StickyNote, UserRound } from "lucide-react";
import {
  addWorkspaceNote,
  getPlatformWorkspace,
  setWorkspaceModule,
  setWorkspacePlan,
  setWorkspaceStatus,
  type PlatformLoginEvent,
  type PlatformMember,
  type PlatformModule,
  type PlatformNote,
  type PlatformWorkspace,
} from "@/lib/api/platform";
import { IMPERSONATION_REFUSALS, startImpersonation } from "@/lib/api/impersonation";
import { ApiError } from "@/lib/api";
import { Alert, Badge, Button, Card, Select, Sheet, Switch, Textarea } from "@/components/ds";
import { formatDateTime, formatRelative, statusLabel } from "./format";

interface WorkspaceSheetProps {
  tenantId: string | null;
  modules: PlatformModule[];
  onClose: () => void;
  /** Rechemat după orice schimbare, ca lista din spate să nu rămână în urmă. */
  onChanged: () => void;
}

const PLANS = ["starter", "growth", "pro", "enterprise"];
const STATUSES = ["active", "trial", "suspended"];

export function WorkspaceSheet({ tenantId, modules, onClose, onChanged }: WorkspaceSheetProps) {
  const [workspace, setWorkspace] = useState<PlatformWorkspace | null>(null);
  const [members, setMembers] = useState<PlatformMember[]>([]);
  const [logins, setLogins] = useState<PlatformLoginEvent[]>([]);
  const [notes, setNotes] = useState<PlatformNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPlatformWorkspace(tenantId);
      setWorkspace(data.workspace);
      setMembers(data.members);
      setLogins(data.recentLogins);
      setNotes(data.notes);
      setSuspendReason(data.workspace.suspendedReason ?? "");
    } catch {
      setError("Detaliile workspace-ului nu au putut fi încărcate.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * PLATFORM-403: intră în contul membrului pentru testare/suport. Nu e o „vizualizare":
   * sesiunea chiar devine a lui, deci reîncărcăm pagina complet — orice stare din memorie
   * (roluri, module, cache de cereri) aparține contului părăsit.
   */
  const enterAccount = async (member: PlatformMember) => {
    if (!confirm(`Intri în contul lui ${member.name || member.email}?\n\nVezi aplicația exact ca el. Acțiunile pe care le faci se salvează în contul lui, iar intrarea și ieșirea se scriu în audit.`)) return;
    setBusy(`impersonate:${member.id}`);
    setError(null);
    try {
      const res = await startImpersonation(member.id);
      window.location.hash = res.redirect;
      window.location.reload();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(IMPERSONATION_REFUSALS[code] ?? "Nu s-a putut intra în cont.");
      setBusy(null);
    }
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    if (!tenantId || !workspace) return;
    setBusy(`module:${moduleKey}`);
    setError(null);
    // Optimist: comutatorul răspunde imediat; la eroare revenim și spunem de ce.
    setWorkspace({ ...workspace, modules: { ...workspace.modules, [moduleKey]: enabled } });
    try {
      await setWorkspaceModule(tenantId, moduleKey, enabled);
      onChanged();
    } catch {
      setWorkspace({ ...workspace, modules: { ...workspace.modules, [moduleKey]: !enabled } });
      setError("Modulul nu a putut fi comutat.");
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (status: string) => {
    if (!tenantId || !workspace) return;
    setBusy("status");
    setError(null);
    try {
      await setWorkspaceStatus(tenantId, status, status === "suspended" ? suspendReason : undefined);
      await load();
      onChanged();
    } catch {
      setError("Starea workspace-ului nu a putut fi schimbată.");
    } finally {
      setBusy(null);
    }
  };

  const changePlan = async (plan: string) => {
    if (!tenantId) return;
    setBusy("plan");
    setError(null);
    try {
      await setWorkspacePlan(tenantId, plan);
      await load();
      onChanged();
    } catch {
      setError("Planul nu a putut fi schimbat.");
    } finally {
      setBusy(null);
    }
  };

  const submitNote = async () => {
    if (!tenantId || !noteDraft.trim()) return;
    setBusy("note");
    setError(null);
    try {
      const { note } = await addWorkspaceNote(tenantId, noteDraft.trim());
      setNotes([note, ...notes]);
      setNoteDraft("");
    } catch {
      setError("Nota nu a putut fi salvată.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open={!!tenantId}
      onClose={onClose}
      title={workspace?.name ?? "Workspace"}
      description={workspace ? `${workspace.slug} · creat ${formatDateTime(workspace.createdAt)}` : undefined}
      size="lg"
    >
      {loading && !workspace ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Se încarcă…
        </div>
      ) : !workspace ? (
        <p className="text-sm text-muted-foreground">Workspace-ul nu a fost găsit.</p>
      ) : (
        <div className="space-y-6">
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Utilizatori" value={workspace.userCount} />
            <Stat label="Logări 30 zile" value={workspace.logins30d} />
            <Stat label="Cereri PAR" value={workspace.parRequests} />
            <Stat label="Ultima logare" value={formatRelative(workspace.lastLoginAt)} />
          </div>

          {workspace.churnRisk && (
            <Alert variant="warning">
              <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden="true" />
              Fără nicio logare reușită de peste două săptămâni — merită un telefon.
            </Alert>
          )}

          <section aria-labelledby="ws-modules">
            <h3 id="ws-modules" className="mb-2 text-sm font-semibold text-foreground">
              Module vizibile pentru acest client
            </h3>
            <div className="space-y-2">
              {modules.map((m) => (
                <div
                  key={m.key}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <Switch
                    checked={workspace.modules[m.key] === true}
                    disabled={busy === `module:${m.key}`}
                    onChange={(next) => toggleModule(m.key, next)}
                    aria-label={`${m.label} pentru ${workspace.name}`}
                  />
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="ws-lifecycle" className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 id="ws-lifecycle" className="mb-2 text-sm font-semibold text-foreground">
                Stare
              </h3>
              <Select
                value={workspace.status}
                disabled={busy === "status"}
                onChange={(e) => changeStatus(e.target.value)}
                aria-label="Starea workspace-ului"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
              {workspace.status === "suspended" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Clientul nu se mai poate autentifica. Se reactivează instantaneu — nu se șterge nimic.
                </p>
              )}
              <Textarea
                className="mt-2"
                rows={2}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Motivul suspendării (intern)"
                aria-label="Motivul suspendării"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Plan</h3>
              <Select
                value={workspace.plan}
                disabled={busy === "plan"}
                onChange={(e) => changePlan(e.target.value)}
                aria-label="Planul workspace-ului"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                Aplicație: {workspace.appKind === "business" ? "Business Suite" : "CRM Educational"}
              </p>
            </div>
          </section>

          <section aria-labelledby="ws-members">
            <h3 id="ws-members" className="mb-2 text-sm font-semibold text-foreground">
              Membri ({members.length})
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-right">
                      <Badge variant={m.isActive ? "outline" : "destructive"}>{m.role}</Badge>
                      <span className="mt-1 block text-3xs text-muted-foreground">
                        {formatRelative(m.lastLoginAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void enterAccount(m)}
                      disabled={!m.isActive || busy === `impersonate:${m.id}`}
                      title={m.isActive ? "Vezi aplicația din contul lui" : "Contul este dezactivat"}
                      aria-label={`Intră în contul lui ${m.name || m.email}`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {busy === `impersonate:${m.id}`
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        : <LogIn className="h-3.5 w-3.5" aria-hidden="true" />}
                      Intră în cont
                    </button>
                  </span>
                </li>
              ))}
              {members.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Niciun utilizator în acest workspace.</li>
              )}
            </ul>
          </section>

          <section aria-labelledby="ws-logins">
            <h3 id="ws-logins" className="mb-2 text-sm font-semibold text-foreground">
              Ultimele logări
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {logins.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{l.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(l.createdAt)} · {l.ipAddress ?? "IP necunoscut"}
                    </span>
                  </span>
                  <Badge variant={l.success ? "success" : "destructive"}>
                    {l.success ? "reușit" : (l.failureReason ?? "eșuat")}
                  </Badge>
                </li>
              ))}
              {logins.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Nicio logare înregistrată încă.</li>
              )}
            </ul>
          </section>

          <section aria-labelledby="ws-notes">
            <h3 id="ws-notes" className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <StickyNote className="h-4 w-4" aria-hidden="true" />
              Note interne
            </h3>
            <Textarea
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Context comercial, promisiuni, termene…"
              aria-label="Notă internă nouă"
            />
            <Button className="mt-2" onClick={submitNote} disabled={busy === "note" || !noteDraft.trim()}>
              Adaugă nota
            </Button>
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                  <p className="mt-1 text-3xs text-muted-foreground">
                    {n.authorEmail ?? "—"} · {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3">
      <p className="text-3xs font-semibold uppercase tracking-group text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}
