import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Landmark, Eye, Trash2, Building2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import {
  listPaymentAccounts,
  deletePaymentAccount,
  formatMdl,
  type PaymentAccount,
  type PaymentAccountStatus,
} from "@/lib/api/paymentAccounts";
import { cn } from "@/lib/utils";

const STATUS_META: Record<PaymentAccountStatus, { label: string; cls: string }> = {
  draft: { label: "Ciornă", cls: "bg-muted text-muted-foreground" },
  issued: { label: "Emis", cls: "bg-primary/15 text-primary" },
  paid: { label: "Plătit", cls: "bg-success/15 text-success" },
  cancelled: { label: "Anulat", cls: "bg-destructive/15 text-destructive" },
};

const FILTERS: Array<{ value: PaymentAccountStatus | "all"; label: string }> = [
  { value: "all", label: "Toate" },
  { value: "draft", label: "Ciorne" },
  { value: "issued", label: "Emise" },
  { value: "paid", label: "Plătite" },
  { value: "cancelled", label: "Anulate" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-MD", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PaymentAccountsPage() {
  const { navigate } = useRouter();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentAccountStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listPaymentAccounts(filter === "all" ? undefined : filter);
      setAccounts(res.data);
    } catch {
      setError("Nu s-au putut încărca conturile de plată.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!window.confirm("Ștergi această ciornă?")) return;
    try {
      await deletePaymentAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("Ciorna nu a putut fi ștearsă.");
    }
  }

  return (
    <AppShell
      pageTitle="Cont de plată"
      pageDescription="Generează conturi de plată standardizate cu date din registru"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/business/conturi-plata/setari")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Building2 className="size-4" /> Profil emitent
          </button>
          <button
            onClick={() => navigate("/business/conturi-plata/nou")}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Cont nou
          </button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
          <Landmark className="mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Niciun cont de plată încă</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Caută o companie după denumire sau IDNO, completează liniile și emite documentul.
          </p>
          <button
            onClick={() => navigate("/business/conturi-plata/nou")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Creează primul cont
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Număr</th>
                <th className="px-4 py-3 font-semibold">Plătitor</th>
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {a.documentNumber ?? <span className="text-muted-foreground">— ciornă —</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block max-w-xs truncate text-foreground">{a.buyerName}</span>
                    {a.buyerIdno && (
                      <span className="text-xs text-muted-foreground">IDNO {a.buyerIdno}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(a.issueDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                    {formatMdl(a.totalCents, a.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_META[a.status].cls
                      )}
                    >
                      {STATUS_META[a.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/business/conturi-plata/${a.id}`)}
                        aria-label="Vezi contul de plată"
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Eye className="size-4" />
                      </button>
                      {a.status === "draft" && (
                        <button
                          onClick={() => handleDelete(a.id)}
                          aria-label="Șterge ciorna"
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
