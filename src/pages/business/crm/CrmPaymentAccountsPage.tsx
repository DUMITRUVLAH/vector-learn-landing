/**
 * CONTPLATA-faza-1 — lista conturilor de plată, în CRM (`/business/crm/conturi-plata`).
 *
 * Ce vrea să vadă omul dintr-o privire: cine îi datorează, cât, de când. Deci: căutare după client
 * sau număr, filtru pe stare, și totalul „de încasat" (emise, neplătite) sus.
 */
import { useEffect, useMemo, useState } from "react";
import { AlarmClock, FileText, Loader2, Plus, Search, Settings2, Wallet } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  KpiTile,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
} from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import {
  listPaymentAccounts,
  paymentAccountErrorMessage,
  type PaymentAccount,
  type PaymentAccountStatus,
} from "@/lib/api/paymentAccounts";
import { PAYMENT_ACCOUNTS_PATH } from "./CrmPaymentAccountEditorPage";

type Filter = "all" | PaymentAccountStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Toate" },
  { key: "issued", label: "De încasat" },
  { key: "paid", label: "Plătite" },
  { key: "draft", label: "Ciorne" },
  { key: "cancelled", label: "Anulate" },
];

const STATUS_LABEL: Record<PaymentAccountStatus, string> = {
  draft: "Ciornă",
  issued: "Emis",
  paid: "Plătit",
  cancelled: "Anulat",
};

function money(cents: number, currency: string): string {
  const v = Math.abs(Math.round(cents));
  const whole = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${whole},${String(v % 100).padStart(2, "0")} ${currency}`;
}

function overdue(a: PaymentAccount): boolean {
  return a.status === "issued" && !!a.dueDate && new Date(a.dueDate).getTime() < Date.now() - 86_400_000;
}

export function CrmPaymentAccountsPage() {
  const { navigate } = useRouter();
  const [rows, setRows] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      listPaymentAccounts(filter === "all" ? undefined : filter, q)
        .then((r) => alive && setRows(r.data))
        .catch((e) => alive && setError(paymentAccountErrorMessage(e, "Lista nu s-a putut încărca.")))
        .finally(() => alive && setLoading(false));
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [filter, q]);

  // Totalurile pe valută: a aduna lei cu euro ar da o cifră care nu înseamnă nimic.
  const kpis = useMemo(() => {
    const due = new Map<string, number>();
    let overdueCount = 0;
    for (const r of rows) {
      if (r.status !== "issued") continue;
      due.set(r.currency, (due.get(r.currency) ?? 0) + r.totalCents);
      if (overdue(r)) overdueCount += 1;
    }
    return { due: [...due.entries()], overdueCount };
  }, [rows]);

  return (
    <BusinessShell
      pageTitle="Conturi de plată"
      pageDescription="Numerotate automat, cu rechizitele și aspectul tău. Pozițiile vin din catalogul CRM."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" href={`#${PAYMENT_ACCOUNTS_PATH}/setari`}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Aspect și numerotare
          </Button>
          <Button onClick={() => navigate(`${PAYMENT_ACCOUNTS_PATH}/nou`)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Cont de plată nou
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {(filter === "all" || filter === "issued") && kpis.due.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {kpis.due.map(([cur, cents]) => (
              <KpiTile key={cur} label={`De încasat (${cur})`} value={money(cents, cur)} icon={<Wallet className="h-5 w-5" />} tone="emerald" />
            ))}
            {kpis.overdueCount > 0 && (
              <KpiTile label="Cu termenul depășit" value={String(kpis.overdueCount)} icon={<AlarmClock className="h-5 w-5" />} tone="rose" />
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs<Filter>
            tabs={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            value={filter}
            onChange={setFilter}
            aria-label="Filtrează după stare"
          />
          <div className="w-full sm:w-72">
            <label htmlFor="pa-list-q" className="sr-only">
              Caută după client, IDNO sau număr
            </label>
            <Input
              id="pa-list-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Client, IDNO sau număr…"
              icon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Se încarcă…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={q || filter !== "all" ? "Niciun cont pe acest filtru" : "Niciun cont de plată încă"}
            description="Alegi clientul, adaugi produsele din catalog, iar numărul și PDF-ul se fac singure."
            action={
              <Button onClick={() => navigate(`${PAYMENT_ACCOUNTS_PATH}/nou`)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Primul cont de plată
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Număr</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Emis</TableHead>
                  <TableHead>Termen</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Stare</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} interactive onClick={() => navigate(`${PAYMENT_ACCOUNTS_PATH}/${r.id}`)}>
                    <TableCell className="font-mono text-sm">
                      <a href={`#${PAYMENT_ACCOUNTS_PATH}/${r.id}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        {r.documentNumber ?? "ciornă"}
                      </a>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[320px] truncate text-foreground">{r.buyerName}</span>
                      {r.buyerIdno && <span className="block text-xs text-muted-foreground">IDNO {r.buyerIdno}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(r.issueDate).toLocaleDateString("ro-MD")}</TableCell>
                    <TableCell className={overdue(r) ? "whitespace-nowrap text-sm font-medium text-destructive" : "whitespace-nowrap text-sm"}>
                      {r.dueDate ? new Date(r.dueDate).toLocaleDateString("ro-MD") : "—"}
                      {overdue(r) && <span className="sr-only"> (termen depășit)</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">{money(r.totalCents, r.currency)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} label={STATUS_LABEL[r.status]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </BusinessShell>
  );
}

export default CrmPaymentAccountsPage;
