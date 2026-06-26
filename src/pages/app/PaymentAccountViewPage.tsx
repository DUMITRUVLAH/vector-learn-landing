import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  Printer,
  CheckCircle2,
  Pencil,
  Ban,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useRouter } from "@/router/HashRouter";
import {
  getPaymentAccount,
  issuePaymentAccount,
  setPaymentAccountStatus,
  formatMdl,
  type PaymentAccountDetail,
} from "@/lib/api/paymentAccounts";
import { cn } from "@/lib/utils";

interface PaymentAccountViewPageProps {
  accountId: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ro-MD", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PaymentAccountViewPage({ accountId }: PaymentAccountViewPageProps) {
  const { navigate } = useRouter();
  const [account, setAccount] = useState<PaymentAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await getPaymentAccount(accountId);
      setAccount(data);
    } catch {
      setError("Contul de plată nu a putut fi încărcat.");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-issue when arriving with ?issue=1 from the editor "Salvează și emite".
  useEffect(() => {
    if (!account || account.status !== "draft") return;
    if (!window.location.hash.includes("issue=1")) return;
    // Strip the flag so a refresh doesn't re-trigger.
    window.history.replaceState(null, "", window.location.hash.replace(/[?&]issue=1/, ""));
    void handleIssue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  async function handleIssue() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await issuePaymentAccount(account.id);
      setAccount((prev) => (prev ? { ...prev, ...data } : prev));
    } catch {
      setError("Emiterea a eșuat.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(status: "paid" | "cancelled") {
    if (!account) return;
    setBusy(true);
    try {
      const { data } = await setPaymentAccountStatus(account.id, status);
      setAccount((prev) => (prev ? { ...prev, ...data } : prev));
    } catch {
      setError("Actualizarea statusului a eșuat.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell pageTitle="Cont de plată" pageDescription="Se încarcă…">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!account) {
    return (
      <AppShell pageTitle="Cont de plată" pageDescription="">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "Contul de plată nu a fost găsit."}
        </div>
      </AppShell>
    );
  }

  const isDraft = account.status === "draft";

  return (
    <AppShell
      pageTitle={account.documentNumber ?? "Cont de plată (ciornă)"}
      pageDescription={isDraft ? "Ciornă — emite pentru a aloca numărul" : "Document emis"}
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => navigate("/business/conturi-plata")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ArrowLeft className="size-4" /> Înapoi
          </button>
          {isDraft && (
            <>
              <button
                onClick={() => navigate(`/business/conturi-plata/${account.id}/editeaza`)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <Pencil className="size-4" /> Editează
              </button>
              <button
                onClick={handleIssue}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Emite
              </button>
            </>
          )}
          {account.status === "issued" && (
            <button
              onClick={() => handleStatus("paid")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-60"
            >
              <CheckCircle2 className="size-4" /> Marchează plătit
            </button>
          )}
          {(account.status === "issued" || account.status === "draft") && (
            <button
              onClick={() => handleStatus("cancelled")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-60"
            >
              <Ban className="size-4" /> Anulează
            </button>
          )}
          {!isDraft && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Printer className="size-4" /> Printează / PDF
            </button>
          )}
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive print:hidden">
          {error}
        </div>
      )}

      {/* The printable document */}
      <article className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-foreground print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-xl font-bold">Cont de plată</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {account.documentNumber ?? "(nealocat — ciornă)"}
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>Data: {formatDate(account.issueDate)}</p>
            {account.dueDate && <p>Scadență: {formatDate(account.dueDate)}</p>}
          </div>
        </header>

        <div className="mb-6 grid gap-6 sm:grid-cols-2">
          <Party
            title="Beneficiar"
            name={account.sellerName || "(setează profilul emitentului)"}
            idno={account.sellerIdno}
            address={account.sellerAddress}
            extra={[
              account.sellerIban ? `IBAN: ${account.sellerIban}` : null,
              account.sellerBankName,
              account.sellerVatCode ? `Cod TVA: ${account.sellerVatCode}` : null,
            ]}
          />
          <Party
            title="Plătitor"
            name={account.buyerName}
            idno={account.buyerIdno}
            address={[account.buyerAddress, account.buyerCity].filter(Boolean).join(", ") || null}
          />
        </div>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">#</th>
              <th className="py-2 pr-2 font-semibold">Descriere</th>
              <th className="py-2 pr-2 text-right font-semibold">Cant.</th>
              <th className="py-2 pr-2 font-semibold">U.M.</th>
              <th className="py-2 pr-2 text-right font-semibold">Preț</th>
              <th className="py-2 pr-2 text-right font-semibold">TVA</th>
              <th className="py-2 text-right font-semibold">Valoare</th>
            </tr>
          </thead>
          <tbody>
            {account.items.map((it, i) => (
              <tr key={it.id} className="border-b border-border/60">
                <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-2 pr-2">{it.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.quantity}</td>
                <td className="py-2 pr-2">{it.unit}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatMdl(it.unitPriceCents, account.currency)}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.vatRate}%</td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {formatMdl(it.lineTotalCents, account.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatMdl(account.subtotalCents, account.currency)} />
          <Row label="TVA" value={formatMdl(account.vatCents, account.currency)} />
          <div className="my-1 border-t border-border" />
          <Row
            label="Total de plată"
            value={formatMdl(account.totalCents, account.currency)}
            strong
          />
        </div>

        {account.notes && (
          <div className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Notițe</p>
            <p className="whitespace-pre-wrap">{account.notes}</p>
          </div>
        )}
      </article>
    </AppShell>
  );
}

function Party({
  title,
  name,
  idno,
  address,
  extra = [],
}: {
  title: string;
  name: string;
  idno?: string | null;
  address?: string | null;
  extra?: (string | null)[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="font-semibold text-foreground">{name}</p>
      {idno && <p className="text-sm text-muted-foreground">IDNO: {idno}</p>}
      {address && <p className="text-sm text-muted-foreground">{address}</p>}
      {extra.filter(Boolean).map((line, i) => (
        <p key={i} className="text-sm text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", strong && "text-base")}>
      <span className={strong ? "font-bold text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", strong ? "font-bold text-foreground" : "font-medium")}>
        {value}
      </span>
    </div>
  );
}
