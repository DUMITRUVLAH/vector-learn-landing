/**
 * INT-902 — /app/settings/webhooks
 *
 * Manages outbound webhook endpoints for external integrations.
 * Shows registered endpoints, allows adding/removing, and shows delivery history.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Webhook,
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  Copy,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  toggleWebhook,
  listDeliveries,
  ALL_WEBHOOK_EVENTS,
  type WebhookEndpointRow,
  type WebhookEndpointCreated,
  type WebhookDeliveryRow,
  type WebhookEvent,
} from "@/lib/api/webhooks";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Secret Banner ────────────────────────────────────────────────────────────

function SecretBanner({ secret, name, onDismiss }: { secret: string; name: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div role="alert" aria-live="polite" className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Webhook &ldquo;{name}&rdquo; — secretul HMAC (copiat o singura data)
        </p>
        <button onClick={onDismiss} className="text-xs text-muted-foreground underline">Inchide</button>
      </div>
      <div className="flex items-center gap-2 bg-background rounded border border-border p-2">
        <code className="flex-1 text-xs font-mono break-all text-foreground">{secret}</code>
        <button
          onClick={copy}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          aria-label="Copiaza secretul"
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Verifica signatura cu:{" "}
        <code className="font-mono bg-muted px-1 rounded">X-VL-Signature: sha256=HMAC_SHA256(secret, body)</code>
      </p>
    </div>
  );
}

// ─── Create Form ──────────────────────────────────────────────────────────────

function CreateWebhookForm({
  onCreated,
  onCancel,
}: {
  onCreated: (ep: WebhookEndpointCreated) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (ev: WebhookEvent) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const created = await createWebhook({ url, events });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare necunoscuta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      <p className="text-sm font-semibold text-foreground">Adauga endpoint webhook</p>

      <div className="space-y-1">
        <label htmlFor="wh-url" className="text-xs font-medium text-muted-foreground">
          URL endpoint (HTTPS recomandat)
        </label>
        <input
          id="wh-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/hooks/catch/..."
          required
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Evenimente (gol = toate evenimentele)
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={() => toggleEvent(ev)}
                className="rounded"
              />
              <code className="font-mono bg-muted px-1 rounded text-xs">{ev}</code>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md border border-border bg-background hover:bg-muted text-foreground"
        >
          Anuleaza
        </button>
        <button
          type="submit"
          disabled={loading || !url}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Webhook className="h-3.5 w-3.5" aria-hidden />}
          Adauga
        </button>
      </div>
    </form>
  );
}

// ─── Delivery Row ─────────────────────────────────────────────────────────────

function DeliveryRow({ d }: { d: WebhookDeliveryRow }) {
  const ok = d.statusCode !== null && d.statusCode >= 200 && d.statusCode < 300;
  return (
    <tr className="border-t border-border text-xs">
      <td className="px-3 py-2">
        <code className="font-mono bg-muted px-1 rounded">{d.eventType}</code>
      </td>
      <td className="px-3 py-2">
        {d.statusCode !== null ? (
          <span className={cn("font-mono", ok ? "text-primary" : "text-destructive")}>
            {d.statusCode}
          </span>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{formatDate(d.deliveredAt)}</td>
      <td className="px-3 py-2 text-muted-foreground max-w-xs truncate">
        {d.error ?? (ok ? "OK" : d.responseBody?.slice(0, 80) ?? "—")}
      </td>
    </tr>
  );
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────

function EndpointCard({
  ep,
  onDelete,
  onToggle,
}: {
  ep: WebhookEndpointRow;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[] | null>(null);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadDeliveries = async () => {
    if (deliveries !== null) return;
    setLoadingDeliveries(true);
    try {
      const data = await listDeliveries(ep.id);
      setDeliveries(data);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleExpand = () => {
    setExpanded((v) => !v);
    if (!expanded) loadDeliveries();
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-mono truncate">{ep.url}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ep.events.length === 0 ? "Toate evenimentele" : ep.events.join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Active toggle */}
          <button
            onClick={() => onToggle(ep.id, !ep.active)}
            className="text-muted-foreground hover:text-foreground touch-target"
            aria-label={ep.active ? "Dezactiveaza webhook" : "Activeaza webhook"}
            title={ep.active ? "Activ — click pentru dezactivare" : "Inactiv — click pentru activare"}
          >
            {ep.active ? (
              <ToggleRight className="h-5 w-5 text-primary" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
          {/* History toggle */}
          <button
            onClick={handleExpand}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 touch-target"
            aria-label={expanded ? "Ascunde history" : "Arata history"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {/* Delete */}
          {confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setConfirming(false); onDelete(ep.id); }}
                className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                aria-label="Confirma stergere"
              >
                Sterge
              </button>
              <button onClick={() => setConfirming(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Nu
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="text-muted-foreground hover:text-destructive touch-target"
              aria-label="Sterge endpoint"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-muted/30">
          {loadingDeliveries ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se incarca..." />
            </div>
          ) : deliveries && deliveries.length > 0 ? (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Eveniment</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Livrat</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Detalii</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => <DeliveryRow key={d.id} d={d} />)}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4 italic">
              Nicio livrare inregistrata inca.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function WebhooksPage() {
  const { status } = useSession();
  const { navigate } = useRouter();
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newSecret, setNewSecret] = useState<{ secret: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      setEndpoints(await listWebhooks());
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") { navigate("/app/login"); return; }
    if (status === "authenticated") load();
  }, [status, load, navigate]);

  const handleCreated = (ep: WebhookEndpointCreated) => {
    setNewSecret({ secret: ep.secret, name: ep.url });
    setShowForm(false);
    setEndpoints((prev) => [ep, ...prev]);
  };

  const handleDelete = async (id: string) => {
    try { await deleteWebhook(id); } catch { /* ignore */ }
    setEndpoints((prev) => prev.filter((e) => e.id !== id));
  };

  const handleToggle = async (id: string, active: boolean) => {
    try { await toggleWebhook(id, active); } catch { /* ignore */ }
    setEndpoints((prev) => prev.map((e) => e.id === id ? { ...e, active } : e));
  };

  if (status === "loading") {
    return (
      <AppShell pageTitle="Webhooks">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se incarca..." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Webhooks" pageDescription="Outbound webhooks pentru integrari externe">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Webhook className="h-5 w-5 text-primary" aria-hidden />
              <h1 className="text-xl font-semibold text-foreground">Webhooks</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Primeste notificari in timp real pe Zapier, Make sau orice URL extern
              cand se petrec evenimente in Vector Learn.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 touch-target"
              aria-label="Adauga endpoint webhook nou"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adauga
            </button>
          )}
        </div>

        {/* Secret Banner */}
        {newSecret && (
          <SecretBanner
            secret={newSecret.secret}
            name={newSecret.name}
            onDismiss={() => setNewSecret(null)}
          />
        )}

        {/* Create Form */}
        {showForm && (
          <CreateWebhookForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
        )}

        {/* Events reference */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Evenimente disponibile</p>
          <div className="grid grid-cols-2 gap-1">
            {ALL_WEBHOOK_EVENTS.map((ev) => (
              <code key={ev} className="text-xs font-mono bg-background border border-border rounded px-1.5 py-0.5 text-foreground">
                {ev}
              </code>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Payload-ul include <code className="font-mono bg-muted px-1 rounded">event, tenantId, data, timestamp</code>.
            Verifica signatura cu header-ul{" "}
            <code className="font-mono bg-muted px-1 rounded">X-VL-Signature</code>.
          </p>
        </div>

        {/* Error */}
        {fetchError && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {fetchError}
          </div>
        )}

        {/* Endpoints */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se incarca..." />
          </div>
        ) : endpoints.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Webhook className="h-8 w-8 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm text-muted-foreground">Niciun endpoint inregistrat.</p>
            <button onClick={() => setShowForm(true)} className="text-sm text-primary hover:underline">
              Adauga primul endpoint
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {endpoints.map((ep) => (
              <EndpointCard key={ep.id} ep={ep} onDelete={handleDelete} onToggle={handleToggle} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
