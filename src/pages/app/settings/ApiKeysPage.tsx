/**
 * INT-901 — /app/settings/api-keys
 *
 * Manages API keys for external integrations (Zapier, Make, webhooks).
 * Lists active keys (prefix + name + last used), allows generating new ones,
 * and revoking existing ones. The full key is shown ONCE on creation.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Key,
  Plus,
  Loader2,
  AlertCircle,
  Copy,
  Trash2,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  type ApiKeyRow,
  type ApiKeyCreated,
} from "@/lib/api/apiKeys";
import { cn } from "@/lib/utils";

// ─── Date formatting helper ───────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "Niciodată";
  const d = new Date(iso);
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── New Key Banner ───────────────────────────────────────────────────────────

interface NewKeyBannerProps {
  created: ApiKeyCreated;
  onDismiss: () => void;
}

function NewKeyBanner({ created, onDismiss }: NewKeyBannerProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(created.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Cheia &ldquo;{created.name}&rdquo; a fost generata
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Copiaz-o acum. Nu o vei mai putea vedea dupa ce inchizi aceasta fereastra.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground text-xs underline flex-shrink-0"
          aria-label="Inchide banner"
        >
          Inchide
        </button>
      </div>

      <div className="flex items-center gap-2 bg-background rounded border border-border p-2">
        <code className={cn("flex-1 text-xs font-mono break-all text-foreground", !visible && "filter blur-sm select-none")}>
          {created.key}
        </code>
        <button
          onClick={() => setVisible((v) => !v)}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-target"
          aria-label={visible ? "Ascunde cheia" : "Arata cheia"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          onClick={copy}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-target"
          aria-label="Copiaza cheia in clipboard"
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Prefix public: <code className="font-mono bg-muted px-1 py-0.5 rounded">{created.prefix}</code>
      </p>
    </div>
  );
}

// ─── Create Key Dialog (inline form) ─────────────────────────────────────────

interface CreateKeyFormProps {
  onCreated: (key: ApiKeyCreated) => void;
  onCancel: () => void;
}

function CreateKeyForm({ onCreated, onCancel }: CreateKeyFormProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createApiKey(name.trim());
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare necunoscuta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-foreground">Genereaza cheie noua</p>

      <div className="space-y-1">
        <label htmlFor="api-key-name" className="text-xs text-muted-foreground font-medium">
          Nume (ex: &ldquo;Zapier&rdquo;, &ldquo;Make automation&rdquo;)
        </label>
        <input
          id="api-key-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zapier integration"
          maxLength={200}
          autoFocus
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
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
          disabled={loading || !name.trim()}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Key className="h-3.5 w-3.5" aria-hidden />
          )}
          Genereaza
        </button>
      </div>
    </form>
  );
}

// ─── Key Row ──────────────────────────────────────────────────────────────────

interface KeyRowProps {
  apiKey: ApiKeyRow;
  onRevoke: (id: string) => void;
  revoking: boolean;
}

function KeyRow({ apiKey, onRevoke, revoking }: KeyRowProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <tr className="border-t border-border hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden />
          <span className="text-sm text-foreground font-medium">{apiKey.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
          {apiKey.prefix}…
        </code>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(apiKey.createdAt)}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : <span className="italic">Niciodată</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {confirming ? (
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs text-destructive">Revocare?</span>
            <button
              onClick={() => {
                setConfirming(false);
                onRevoke(apiKey.id);
              }}
              disabled={revoking}
              className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
              aria-label={`Confirma revocare cheie ${apiKey.name}`}
            >
              {revoking ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : "Da, revoca"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
            >
              Anuleaza
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 ml-auto touch-target"
            aria-label={`Revoca cheia ${apiKey.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Revoca
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ApiKeysPage() {
  const { status } = useSession();
  const { navigate } = useRouter();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Eroare incarcare");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate("/app/login");
      return;
    }
    if (status === "authenticated") {
      load();
    }
  }, [status, load, navigate]);

  const handleCreated = (created: ApiKeyCreated) => {
    setNewKey(created);
    setShowCreateForm(false);
    setKeys((prev) => [
      {
        id: created.id,
        name: created.name,
        prefix: created.prefix,
        createdAt: created.createdAt,
        lastUsedAt: null,
        revokedAt: null,
      },
      ...prev,
    ]);
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // Reload on error to sync state
      await load();
    } finally {
      setRevokingId(null);
    }
  };

  if (status === "loading") {
    return (
      <AppShell pageTitle="API Keys">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se incarca..." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="API Keys" pageDescription="Chei de acces pentru integrari externe">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <h1 className="text-xl font-semibold text-foreground">API Keys</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Genereaza chei de acces pentru Zapier, Make sau alte integrari externe.
              Fiecare cheie ofera acces complet la datele tenantului — pastreaz-o secreta.
            </p>
          </div>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 touch-target"
              aria-label="Genereaza cheie API noua"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Genereaza
            </button>
          )}
        </div>

        {/* New Key Banner */}
        {newKey && (
          <NewKeyBanner created={newKey} onDismiss={() => setNewKey(null)} />
        )}

        {/* Create Form */}
        {showCreateForm && (
          <CreateKeyForm
            onCreated={handleCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {/* How to use */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Cum se foloseste</p>
          <p className="text-xs text-muted-foreground">
            Adauga header-ul <code className="font-mono bg-muted px-1 rounded">X-API-Key: &lt;cheia ta&gt;</code> la
            orice request catre API-ul Vector Learn. Functioneaza pe aceleasi endpoint-uri ca sesiunea de browser.
          </p>
          <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-x-auto text-foreground">
{`curl https://vector-learn.vercel.app/api/students \\
  -H "X-API-Key: vl_xxxxx..."`}
          </pre>
        </div>

        {/* Error */}
        {fetchError && (
          <div
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            {fetchError}
          </div>
        )}

        {/* Keys Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se incarca cheile..." />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Key className="h-8 w-8 text-muted-foreground mx-auto" aria-hidden />
            <p className="text-sm text-muted-foreground">Nu ai nicio cheie API activa.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-sm text-primary hover:underline"
            >
              Genereaza prima cheie
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" aria-label="Lista chei API active">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nume</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prefix</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Creat</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ultima folosire</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <KeyRow
                    key={k.id}
                    apiKey={k}
                    onRevoke={handleRevoke}
                    revoking={revokingId === k.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Security note */}
        <p className="text-xs text-muted-foreground text-center">
          Cheile API au acces complet la datele contului. Nu le imparti cu nimeni si nu le include in cod sursa public.
        </p>
      </div>
    </AppShell>
  );
}
