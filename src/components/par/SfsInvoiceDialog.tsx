/**
 * PAR-EFP — conținutul unei e-Facturi primite, așa cum scrie în document.
 *
 * De ce există: lista arăta doar seria, furnizorul și suma, iar linkul din codul QR duce la 404 în
 * afara portalului SFS — deci nu exista niciun mod de a vedea ce cuprinde factura. Aici se văd
 * părțile (cu adrese și cont bancar), datele, punctele de încărcare/descărcare, totalurile și
 * fiecare linie de marfă/serviciu; iar butonul de PDF aduce documentul oficial din SFS.
 */
import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, FileText, ShieldCheck } from "lucide-react";
import { Alert, Button, Dialog, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ds";
import {
  getBuyerInvoiceDetail,
  parEfacturaPdfUrl,
  type BuyerInvoiceDetailResponse,
  type SfsInvoiceParty,
} from "@/lib/api/parEfactura";

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `${(cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function Party({ title, party }: { title: string; party: SfsInvoiceParty }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{party.name ?? "—"}</p>
      {party.idno && <p className="text-xs text-muted-foreground">IDNO {party.idno}</p>}
      {party.address && <p className="text-xs text-muted-foreground">{party.address}</p>}
      {party.bankAccount && (
        <p className="mt-1 text-xs text-muted-foreground">
          <code>{party.bankAccount}</code>
          {party.bankName ? ` · ${party.bankName}` : ""}
          {party.bankCode ? ` · ${party.bankCode}` : ""}
        </p>
      )}
    </div>
  );
}

export function SfsInvoiceDialog({
  seria,
  number,
  onClose,
}: {
  seria: string;
  number: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<BuyerInvoiceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getBuyerInvoiceDetail(seria, number)
      .then((res) => {
        if (alive) {
          setData(res);
          setError(null);
        }
      })
      .catch(() => alive && setError("Nu am putut citi factura din SFS."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [seria, number]);

  const detail = data?.detail ?? null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`e-Factura ${seria} ${number}`}
      description={data?.invoiceStatusLabel ? `Stare în SFS: ${data.invoiceStatusLabel}` : undefined}
      footer={
        <div className="flex flex-wrap gap-2">
          {/* Ancoră, nu buton: PDF-ul e servit de server (cu sesiunea curentă) și se deschide în tab nou. */}
          <a
            href={parEfacturaPdfUrl(seria, number)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Deschide documentul PDF
          </a>
          <Button variant="ghost" onClick={onClose}>
            Închide
          </Button>
        </div>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Se citește factura din SFS…
        </div>
      )}

      {!loading && (error || (data && !data.available)) && (
        <Alert variant="warning" icon={<AlertTriangle className="h-4 w-4" />}>
          {error ?? data?.message}
        </Alert>
      )}

      {!loading && data?.available && !detail && (
        <Alert variant="warning" icon={<AlertTriangle className="h-4 w-4" />}>
          {data.message || "SFS nu a returnat conținutul acestei facturi. Documentul PDF poate fi totuși disponibil."}
        </Alert>
      )}

      {!loading && detail && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Party title="Furnizor" party={detail.supplier} />
            <Party title="Cumpărător" party={detail.buyer} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Data emiterii</dt>
              <dd className="text-foreground">{fmtDate(detail.issuedDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Data livrării</dt>
              <dd className="text-foreground">{fmtDate(detail.deliveryDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="font-medium text-foreground">{fmtMoney(detail.totalCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">din care TVA</dt>
              <dd className="text-foreground">{fmtMoney(detail.totalVatCents)}</dd>
            </div>
          </dl>

          {(detail.loadingPoint || detail.unloadingPoint) && (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Punct de încărcare</dt>
                <dd className="text-foreground">{detail.loadingPoint ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Punct de descărcare</dt>
                <dd className="text-foreground">{detail.unloadingPoint ?? "—"}</dd>
              </div>
            </dl>
          )}

          {detail.lines.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Denumire</TableHead>
                    <TableHead>U.M.</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Preț fără TVA</TableHead>
                    <TableHead>TVA</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.lines.map((line, i) => (
                    <TableRow key={`${line.name}-${i}`}>
                      <TableCell className="text-sm text-foreground">{line.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.unitOfMeasure ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.quantity ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtMoney(line.unitPriceWithoutVatCents)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {line.vatRate && line.vatRate !== "-" ? `${line.vatRate}% · ` : ""}
                        {fmtMoney(line.vatCents)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium">{fmtMoney(line.totalCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {detail.signed && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              Factura poartă semnătură electronică în SFS.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default SfsInvoiceDialog;
