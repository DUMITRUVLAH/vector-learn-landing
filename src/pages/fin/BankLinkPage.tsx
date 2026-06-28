/**
 * BANKLINK-002: /app/fin/banklink — gestiune conexiuni bancare
 *
 * Lista conexiunilor active, buton adaugă, link import, link tranzacții.
 * Badge unmatched (BANKLINK-003): afișat dacă există tranzacții nereconciliate.
 * Design: Vector 365, light+dark, WCAG AA, fără hex.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Upload,
  List,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Power,
  GitMerge,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link, useRouter } from "@/router/HashRouter";
import { BankLinkAddDialog } from "@/components/fin/BankLinkAddDialog";
import {
  listConnections,
  deleteConnection,
  listTransactions,
  type BankConnection,
} from "@/lib/api/finBankLink";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskIban(iban: string | null): string {
  if (!iban) return "—";
  const raw = iban.replace(/\s/g, "");
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)} •••• ${raw.slice(-4)}`;
}

function relativeDate(iso: string | null): string {
  if (!iso) return "Niciodată";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Azi";
  if (days === 1) return "Ieri";
  if (days < 30) return `Acum ${days} zile`;
  const months = Math.floor(days / 30);
  return `Acum ${months} lun${months === 1 ? "ă" : "i"}`;
}

function formatCode(code: string | null): string {
  if (!code) return "—";
  const labels: Record<string, string> = {
    MAIB: "MAIB",
    MOLDINDCONBANK: "Moldindconbank",
    VICBANK: "Victoriabank",
    FINCOMBANK: "FinComBank",
    MOBIASBANCA: "MobiasBancă",
    OTHER: "Altă bancă",
  };
  return labels[code] ?? code;
}

// ─── Confirmation dialog (dezactivare) ───────────────────────────────────────

interface ConfirmDeactivateProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function ConfirmDeactivate({ name, onConfirm, onCancel, loading }: ConfirmDeactivateProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
        <h3 className="mb-2 font-semibold text-foreground">Dezactivare conexiune</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Ești sigur că vrei să dezactivezi <strong>{name}</strong>? Tranzacțiile importate
          anterior nu vor fi șterse.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="h-9 flex-1 rounded-lg border border-input text-sm text-foreground hover:bg-muted"
            disabled={loading}
          >
            Anulează
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Dezactivează
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankLinkPage() {
  const { navigate } = useRouter();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deactivating, setDeactivating] = useState<BankConnection | null>(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);
  // BANKLINK-003: unmatched counts per connection (lazy-loaded)
  const [unmatchedCount, setUnmatchedCount] = useState<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { connections: data } = await listConnections();
      setConnections(data);
      // Fetch unmatched count for badge
      if (data.length > 0) {
        const { total } = await listTransactions({ status: "unmatched", limit: 1 });
        setUnmatchedCount(total);
      }
    } catch {
      setError("Nu s-au putut încărca conexiunile. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDeactivate() {
    if (!deactivating) return;
    setDeactivateLoading(true);
    try {
      await deleteConnection(deactivating.id);
      setDeactivating(null);
      await load();
    } catch {
      setDeactivateLoading(false);
    }
  }

  return (
    <BusinessShell
      pageTitle="Conexiuni bancare"
      pageDescription="Import automat extrase bancare OFX/MT940 — GAP G2"
    >
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Conexiuni bancare</h1>
          <p className="text-sm text-muted-foreground">
            Import automat extrase bancare și reconciliere plăți
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unmatchedCount > 0 && (
            <Link
              to="/business/fin/banklink/queue"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-3 text-sm font-medium text-warning hover:bg-warning/20"
            >
              <GitMerge className="h-4 w-4" />
              {unmatchedCount} nereconciliate
            </Link>
          )}
          <Link
            to="/business/fin/banklink/transactions"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            <List className="h-4 w-4" />
            Toate tranzacțiile
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Adaugă conexiune
          </button>
        </div>
      </div>

      {/* ─── Loading ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ─── Error ───────────────────────────────────────────────────── */}
      {!loading && error && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={load}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Reîncarcă
          </button>
        </div>
      )}

      {/* ─── Empty state ─────────────────────────────────────────────── */}
      {!loading && !error && connections.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Landmark className="h-12 w-12 text-muted-foreground/50" />
          <div>
            <p className="font-medium text-foreground">Nu ai conexiuni bancare</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adaugă prima conexiune pentru a importa extrase bancare automat.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Adaugă conexiune
          </button>
        </div>
      )}

      {/* ─── Connections grid ────────────────────────────────────────── */}
      {!loading && !error && connections.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{conn.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCode(conn.bankCode)}</p>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Activ
                </span>
              </div>

              {/* Meta */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">IBAN</dt>
                <dd className="font-mono text-foreground">{maskIban(conn.accountIban)}</dd>
                <dt className="text-muted-foreground">Format</dt>
                <dd className="text-foreground">{conn.importFormat}</dd>
                <dt className="text-muted-foreground">Monedă</dt>
                <dd className="text-foreground">{conn.currency}</dd>
                <dt className="text-muted-foreground">Ultima import.</dt>
                <dd className="text-foreground">{relativeDate(conn.lastImportAt)}</dd>
              </dl>

              {/* Actions */}
              <div className="mt-auto flex gap-2">
                <Link
                  to={`/app/fin/banklink/import?connectionId=${conn.id}`}
                  className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-input text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </Link>
                <Link
                  to={`/app/fin/banklink/transactions?connectionId=${conn.id}`}
                  className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-input text-xs font-medium text-foreground hover:bg-muted"
                >
                  <List className="h-3.5 w-3.5" />
                  Tranzacții
                </Link>
                <button
                  onClick={() => setDeactivating(conn)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Dezactivează ${conn.name}`}
                  title="Dezactivează"
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Dialogs ─────────────────────────────────────────────────── */}
      {showAdd && (
        <BankLinkAddDialog
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {deactivating && (
        <ConfirmDeactivate
          name={deactivating.name}
          loading={deactivateLoading}
          onConfirm={handleDeactivate}
          onCancel={() => {
            setDeactivating(null);
            setDeactivateLoading(false);
          }}
        />
      )}
    </BusinessShell>
  );
}
