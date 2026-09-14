/**
 * CRM — oferte și contracte, toate la un loc.
 *
 * Ecranul ăsta răspunde la o singură întrebare pe care o are orice șef de
 * vânzări: „ce am trimis și ce așteaptă răspuns". De aceea filtrul implicit nu
 * e „toate", ci starea — ciornele neterminate și ofertele trimise fără răspuns
 * sunt lucruri diferite, cu acțiuni diferite.
 *
 * Actul în sine se deschide în editorul de acte al FinFlow: acolo se finalizează,
 * se descarcă PDF și se trimite. CRM-ul nu rescrie ecranul acela.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Loader2, ExternalLink } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  EmptyState,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import { Link } from "@/router/HashRouter";
import { docPath } from "@/lib/docs/paths";
import {
  listCrmDocuments,
  CRM_DOC_KIND_LABELS,
  CRM_DOC_STATUS_LABELS,
  type CrmDocument,
} from "@/lib/api/crmDocuments";

function money(cents: number, currency: string): string {
  return `${new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    (cents ?? 0) / 100
  )} ${currency}`;
}

/** Ciorna și refuzul sunt stările care cer ceva de la om — se văd altfel. */
function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "rejected" || status === "cancelled") return "destructive";
  if (status === "draft") return "secondary";
  return "default";
}

export function CrmDocumentsPage() {
  const [items, setItems] = useState<CrmDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmDocuments();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Nu am putut încărca actele.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtrarea e în memorie fiindcă lista e deja plafonată la 200 pe server;
  // o cerere nouă pentru fiecare schimbare de select ar fi risipă.
  const filtered = useMemo(
    () =>
      items.filter((d) => (status === "all" || d.status === status) && (kind === "all" || d.kind === kind)),
    [items, status, kind]
  );

  const statuses = useMemo(() => [...new Set(items.map((d) => d.status))], [items]);
  const kinds = useMemo(() => [...new Set(items.map((d) => d.kind))], [items]);

  return (
    <BusinessShell
      pageTitle="Documente"
      pageDescription="Ofertele și contractele pornite din lead-uri. Se deschid în editorul de acte."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="space-y-1">
            <Label htmlFor="doc-stare">Stare</Label>
            <Select id="doc-stare" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Toate</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {CRM_DOC_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-fel">Tip</Label>
            <Select id="doc-fel" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Toate</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {CRM_DOC_KIND_LABELS[k as keyof typeof CRM_DOC_KIND_LABELS] ?? k}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading ? (
          <div className="flex justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă actele" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={items.length === 0 ? "Niciun act încă" : "Niciun act cu filtrele alese"}
            description={
              items.length === 0
                ? "Ofertele și contractele se pornesc din fișa unui lead, cu butonul „Act nou”."
                : "Schimbă starea sau tipul ca să vezi restul actelor."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table aria-label="Oferte și contracte">
              <TableHeader>
                <TableRow>
                  <TableHead>Act</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Stare</TableHead>
                  <TableHead className="text-right">Valoare</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <Link to={docPath(d.id)} className="inline-flex items-center gap-1 hover:underline">
                        {d.docNumber ? `nr. ${d.docNumber}` : d.title}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.counterpartyName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {CRM_DOC_KIND_LABELS[d.kind as keyof typeof CRM_DOC_KIND_LABELS] ?? d.kind}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(d.status)}>{CRM_DOC_STATUS_LABELS[d.status] ?? d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(d.totalCents, d.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(d.docDate).toLocaleDateString("ro-MD")}
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
