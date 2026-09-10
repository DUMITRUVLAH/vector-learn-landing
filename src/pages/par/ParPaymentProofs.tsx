/**
 * VM4-04 — /business/par/dovezi
 *
 * „Extrasele bancare vin a 2-a zi cu ștampila băncii în PDF… când am 20 sau 30 de plăți trebuie
 * să mă duc jos cu split la fiecare act." (Violeta, finanțe)
 *
 * Dovada plății nu poate exista la momentul plății — documentul ștampilat apare a doua zi. Ecranul
 * ăsta e locul unde se închide bucla: adună plățile care încă așteaptă ordinul de plată, primește
 * fișierele în bloc (drag & drop, selectare multiplă sau Ctrl+V pentru un print screen), le
 * potrivește singur cu plata potrivită după numele fișierului și le atașează pe toate odată.
 *
 * Ce NU face: nu ghicește. O potrivire slabă sau ambiguă rămâne „de ales manual" — o dovadă pusă
 * pe cererea altcuiva strică dosarul mai rău decât una rămasă neatașată.
 *
 * Refolosește ruta existentă de atașamente (`POST /api/par/:id/attachments`, tip `payment_order`),
 * deci validările de tip/mărime/limită sunt cele din restul aplicației — fără un al doilea sistem
 * de încărcare.
 *
 * Design system: doar tokeni Vector 365, light + dark, ținte de click ≥ 44px.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Paperclip,
  Loader2,
  RefreshCcw,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  X,
  FileCheck2,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { Alert, Button, Card, Select, Table } from "@/components/ds";
import { useRouter } from "@/router/HashRouter";
import {
  getPaymentProofsQueue,
  uploadAttachment,
  formatMDL,
  formatCurrency,
  type ParPaymentProofItem,
} from "@/lib/api/par";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL, attachmentTooLargeMessage } from "@/lib/par/attachmentLimits";
import { matchProofFiles, type ProofConfidence } from "@/lib/par/proofMatch";
import { cn } from "@/lib/utils";

// ─── Tipuri locale ────────────────────────────────────────────────────────────

interface PendingProof {
  /** Cheie stabilă: două fișiere pot avea același nume, venite din foldere diferite. */
  key: string;
  file: File;
  /** Cererea aleasă (sugerată automat sau schimbată de om). */
  parId: string | null;
  confidence: ProofConfidence;
  reason: string | null;
  /** Rezultatul încărcării, după ce s-a apăsat „Atașează". */
  state: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
}

const CONFIDENCE_STYLE: Record<ProofConfidence, string> = {
  sigur: "bg-success/10 text-success border-success/30",
  probabil: "bg-warning/10 text-warning border-warning/30",
  incert: "bg-muted text-muted-foreground border-border",
};

function amountOf(item: ParPaymentProofItem): number {
  return item.actualAmountCents ?? item.totalEstimatedCents;
}

function itemLabel(item: ParPaymentProofItem): string {
  const amount = item.currency && item.currency !== "MDL"
    ? formatCurrency(amountOf(item), item.currency)
    : formatMDL(amountOf(item));
  return `${item.requestNo} · ${item.payeeName ?? "beneficiar nespecificat"} · ${amount}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export default function ParPaymentProofs() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<ParPaymentProofItem[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [filter, setFilter] = useState<"missing" | "all">("missing");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proofs, setProofs] = useState<PendingProof[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPaymentProofsQueue(filter);
      setItems(data.items);
      setMissingCount(data.missingCount);
      setPaidCount(data.paidCount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea plăților");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Candidații pentru potrivire: plățile fără dovadă (pe cele care o au deja nu le propunem). */
  const candidates = useMemo(
    () =>
      items
        .filter((i) => i.proofs.length === 0)
        .map((i) => ({
          id: i.id,
          requestNo: i.requestNo,
          payeeName: i.payeeName,
          paymentRef: i.paymentRef,
          amountCents: amountOf(i),
        })),
    [items]
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const tooBig = incoming.find((f) => f.size > MAX_ATTACHMENT_BYTES);
      const accepted = incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
      setFileError(tooBig ? attachmentTooLargeMessage(tooBig.name) : null);
      if (accepted.length === 0) return;

      const matches = matchProofFiles(accepted.map((f) => f.name), candidates);
      const added: PendingProof[] = accepted.map((file, i) => ({
        key: `${file.name}-${file.size}-${Date.now()}-${i}`,
        file,
        parId: matches[i].parId,
        confidence: matches[i].confidence,
        reason: matches[i].reason,
        state: "pending",
      }));
      setProofs((prev) => [...prev, ...added]);
    },
    [candidates]
  );

  // Un singur print screen, lipit direct — aceeași cale ca în dialogul de plată.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      addFiles([new File([file], `ordin-de-plata-${stamp}.png`, { type: file.type || "image/png" })]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const setProofPar = (key: string, parId: string) => {
    setProofs((prev) =>
      prev.map((p) =>
        p.key === key
          ? { ...p, parId: parId || null, confidence: parId ? "sigur" : "incert", reason: parId ? "ales manual" : null }
          : p
      )
    );
  };

  const removeProof = (key: string) => setProofs((prev) => prev.filter((p) => p.key !== key));

  const readyCount = proofs.filter((p) => p.parId && p.state !== "done").length;

  const attachAll = async () => {
    setUploading(true);
    // Secvențial, nu în paralel: fișierele merg ca data-URL (base64), iar 30 de cereri simultane
    // de câteva MB pică pe limita de corp a serverului.
    for (const proof of proofs) {
      if (!proof.parId || proof.state === "done") continue;
      setProofs((prev) => prev.map((p) => (p.key === proof.key ? { ...p, state: "uploading" } : p)));
      try {
        const dataUrl = await fileToDataUrl(proof.file);
        const target = items.find((i) => i.id === proof.parId);
        await uploadAttachment(proof.parId, {
          file_name: `Ordin de plată — ${target?.requestNo ?? ""} (${proof.file.name})`.trim(),
          file_url: dataUrl,
          mime: proof.file.type || "application/pdf",
          kind: "payment_order",
        });
        setProofs((prev) => prev.map((p) => (p.key === proof.key ? { ...p, state: "done" } : p)));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Eroare la atașare";
        setProofs((prev) =>
          prev.map((p) => (p.key === proof.key ? { ...p, state: "error", errorMessage: message } : p))
        );
      }
    }
    setUploading(false);
    await load();
  };

  const doneCount = proofs.filter((p) => p.state === "done").length;

  return (
    <AppShell
      pageTitle="Dovezi de plată"
      pageDescription="Plățile care încă așteaptă ordinul de plată sau extrasul ștampilat"
      actions={
        <Button variant="outline" onClick={() => void load()} aria-label="Reîncarcă lista">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Reîncarcă
        </Button>
      }
    >
      <div className="space-y-6">
        {!loading && !error && (
          <p className="text-sm text-muted-foreground">
            {missingCount === 0
              ? `Toate cele ${paidCount} plăți au ordinul de plată la dosar.`
              : `${missingCount} din ${paidCount} plăți așteaptă dovada.`}
          </p>
        )}

        {/* Zona de încărcare — drag & drop, selectare multiplă sau Ctrl+V */}
        <Card
          className={cn(
            "border-2 border-dashed p-6 transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border"
          )}
          onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Trage aici toate extrasele primite de la bancă
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF sau imagini, max {MAX_ATTACHMENT_LABEL} per fișier. Se potrivesc automat cu
                plățile de mai jos după numele fișierului (nr. ordinului, beneficiar, sumă).
                Un print screen se poate lipi direct cu Ctrl+V.
              </p>
            </div>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              Alege fișiere
              <input
                type="file"
                multiple
                accept="application/pdf,image/*"
                className="sr-only"
                aria-label="Alege fișierele cu dovezile de plată"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Card>

        {fileError && (
          <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" />}>
            {fileError}
          </Alert>
        )}

        {/* Fișierele aduse + potrivirea propusă */}
        {proofs.length > 0 && (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                Fișiere de atașat ({proofs.length})
                {doneCount > 0 && <span className="ml-2 font-normal text-success">· {doneCount} atașate</span>}
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setProofs([])} disabled={uploading}>
                  Golește lista
                </Button>
                <Button size="sm" onClick={() => void attachAll()} disabled={uploading || readyCount === 0}>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Atașează {readyCount} {readyCount === 1 ? "dovadă" : "dovezi"}
                </Button>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {proofs.map((proof) => (
                <li key={proof.key} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-[200px] flex-1 truncate text-sm text-foreground" title={proof.file.name}>
                    {proof.state === "done" ? (
                      <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" aria-hidden="true" />
                    ) : proof.state === "uploading" ? (
                      <Loader2 className="mr-1 inline h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : null}
                    {proof.file.name}
                  </span>

                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-xs whitespace-nowrap",
                      CONFIDENCE_STYLE[proof.confidence]
                    )}
                  >
                    {proof.parId ? proof.confidence : "de ales manual"}
                  </span>

                  <Select
                    aria-label={`Plata pentru ${proof.file.name}`}
                    className="w-auto min-w-[280px]"
                    value={proof.parId ?? ""}
                    disabled={proof.state === "done" || uploading}
                    onChange={(e) => setProofPar(proof.key, e.target.value)}
                  >
                    <option value="">— alege plata —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {itemLabel(i)}
                      </option>
                    ))}
                  </Select>

                  {proof.reason && (
                    <span className="text-xs text-muted-foreground">{proof.reason}</span>
                  )}
                  {proof.state === "error" && (
                    <span role="alert" className="text-xs text-destructive">
                      {proof.errorMessage}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => removeProof(proof.key)}
                    disabled={uploading}
                    aria-label={`Scoate ${proof.file.name} din listă`}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Filtru */}
        {!loading && !error && paidCount > 0 && (
          <div className="flex items-center gap-2">
            <Select
              aria-label="Filtru dovezi"
              className="w-auto"
              value={filter}
              onChange={(e) => setFilter(e.target.value as "missing" | "all")}
            >
              <option value="missing">Doar plățile fără dovadă</option>
              <option value="all">Toate plățile</option>
            </Select>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Se încarcă...">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-destructive/10 px-4 py-3 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileCheck2 className="mb-4 h-12 w-12 opacity-30" aria-hidden="true" />
            <p className="text-lg font-medium">
              {filter === "missing" ? "Nicio plată fără dovadă" : "Nicio plată înregistrată"}
            </p>
            <p className="mt-1 text-sm">
              {filter === "missing"
                ? "Fiecare plată are ordinul de plată la dosar."
                : "Plățile apar aici după ce sunt marcate ca achitate."}
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <Table className="min-w-[900px]" aria-label="Plăți și dovezile lor">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Nr.</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Beneficiar</th>
                <th className="px-3 py-3 text-right font-medium text-muted-foreground">Suma plătită</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Data plății</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Nr. ordin</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground">Dovadă</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/business/par/${item.id}`)}
                      className="whitespace-nowrap font-mono text-foreground hover:text-primary hover:underline"
                      aria-label={`Deschide cererea ${item.requestNo}`}
                    >
                      {item.requestNo}
                    </button>
                  </td>
                  <td className="px-3 py-3 text-foreground">{item.payeeName ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono font-semibold whitespace-nowrap text-foreground">
                    {item.currency && item.currency !== "MDL"
                      ? formatCurrency(amountOf(item), item.currency)
                      : formatMDL(amountOf(item))}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-foreground">
                    {formatDate(item.paymentDate ?? item.paidAt)}
                  </td>
                  <td className="px-3 py-3 font-mono text-foreground">{item.paymentRef ?? "—"}</td>
                  <td className="px-3 py-3">
                    {item.proofs.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {item.proofs.length === 1 ? "atașată" : `${item.proofs.length} fișiere`}
                      </span>
                    ) : (
                      <span className="text-warning">lipsește</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
