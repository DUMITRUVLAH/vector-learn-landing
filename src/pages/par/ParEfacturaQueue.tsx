/**
 * PAR-EFP — /business/par/efactura
 *
 * „Cine nu ne-a dat încă factura?" — lista cererilor achitate al căror prestator persoană juridică
 * ar trebui să fi emis e-Factura în SIA „e-Factura" (SFS).
 *
 * Ce face pagina:
 *   • scanează SFS (ca CUMPĂRĂTOR) și potrivește facturile primite cu plățile făcute;
 *   • arată clar când verificarea automată NU s-a putut face (SFS neconfigurat) — ca nimeni să nu
 *     citească „lipsește" acolo unde de fapt scrie „n-am putut verifica";
 *   • trimite, cu un buton, reminder solicitantului cererii: „amintește-i prestatorului X să emită
 *     e-Factura pentru serviciile Y, suma Z";
 *   • permite configurarea credențialelor SFS (par_admin), refolosind `fin_sfs_settings`.
 *
 * Design system: doar tokeni HR365, light + dark, ținte de click ≥ 44px.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ReceiptText,
  Loader2,
  RefreshCcw,
  Send,
  Search,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Check,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import { useRouter } from "@/router/HashRouter";
import {
  getParEfacturaQueue,
  scanParEfacturas,
  sendParEfacturaReminder,
  markParEfacturaReceived,
  saveParSfsSettings,
  testParSfsConnection,
  PAR_EFACTURA_STATUS_LABELS,
  type ParEfacturaQueue as Queue,
  type ParEfacturaFilter,
} from "@/lib/api/parEfactura";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const FILTERS: { value: ParEfacturaFilter; label: string }[] = [
  { value: "missing", label: "Lipsă factură" },
  { value: "found", label: "Cu factură" },
  { value: "all", label: "Toate" },
];

// ─── Configurarea SFS (par_admin) ─────────────────────────────────────────────

function SfsSettingsPanel({ sfs, onSaved }: { sfs: Queue["sfs"]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [idno, setIdno] = useState(sfs.idno ?? "");
  const [bankAccount, setBankAccount] = useState(sfs.bankAccount ?? "");
  const [environment, setEnvironment] = useState<"mock" | "test" | "prod">(sfs.environment ?? "mock");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveParSfsSettings({
        idno: idno.trim(),
        bank_account: bankAccount.trim(),
        environment,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
      });
      setUsername("");
      setPassword("");
      setFailed(false);
      setMessage("Configurare salvată.");
      onSaved();
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof ApiError && e.status === 403 ? "Doar administratorul PAR poate schimba configurarea." : "Nu am putut salva configurarea.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await testParSfsConnection();
      setFailed(!res.ok);
      setMessage(res.message);
    } catch {
      setFailed(true);
      setMessage("Testul de conexiune a eșuat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 text-sm font-semibold text-foreground"
        aria-expanded={open}
        aria-controls="par-sfs-settings"
      >
        <Settings className="h-4 w-4 text-primary" aria-hidden />
        Configurare SIA „e-Factura" (SFS)
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {sfs.configured ? `activă · mediu ${sfs.environment}` : "neconfigurată"}
        </span>
      </button>

      {open && (
        <div id="par-sfs-settings" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Credențialele sunt cele emise de SFS pentru utilizatorul API al organizației. Se
            păstrează criptate și nu se mai afișează niciodată. Aceleași setări sunt folosite de
            modulul de facturare.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sfs-idno">IDNO organizație</Label>
              <Input id="sfs-idno" value={idno} onChange={(e) => setIdno(e.target.value)} placeholder="1002600000000" />
            </div>
            <div>
              <Label htmlFor="sfs-account">Cont bancar</Label>
              <Input id="sfs-account" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="MD…" />
            </div>
            <div>
              <Label htmlFor="sfs-env">Mediu</Label>
              <Select id="sfs-env" value={environment} onChange={(e) => setEnvironment(e.target.value as "mock" | "test" | "prod")}>
                <option value="mock">Simulat (fără apeluri reale)</option>
                <option value="test">Test SFS</option>
                <option value="prod">Producție SFS</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="sfs-user">Utilizator API {sfs.hasCredentials && <span className="text-muted-foreground">(salvat)</span>}</Label>
              <Input id="sfs-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" placeholder={sfs.hasCredentials ? "•••••" : "utilizator"} />
            </div>
            <div>
              <Label htmlFor="sfs-pass">Parolă API {sfs.hasCredentials && <span className="text-muted-foreground">(salvată)</span>}</Label>
              <Input id="sfs-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={sfs.hasCredentials ? "•••••" : "parolă"} />
            </div>
          </div>
          {message && (
            <Alert variant={failed ? "destructive" : "success"} icon={failed ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}>
              {message}
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy || !idno.trim() || !bankAccount.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Salvează
            </Button>
            <Button variant="outline" onClick={test} disabled={busy}>
              <Search className="h-4 w-4" aria-hidden />
              Testează conexiunea
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Pagina ───────────────────────────────────────────────────────────────────

export default function ParEfacturaQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [filter, setFilter] = useState<ParEfacturaFilter>("missing");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async (f: ParEfacturaFilter) => {
    setLoading(true);
    try {
      setQueue(await getParEfacturaQueue(f));
      setError(null);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 403
          ? "Ai nevoie de rolul finanțe sau administrator PAR pentru această pagină."
          : "Nu am putut încărca lista."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const scanAll = async () => {
    setScanning(true);
    setNotice(null);
    try {
      const { result } = await scanParEfacturas();
      setNoticeIsError(!result.available);
      setNotice(result.message);
      await load(filter);
    } catch {
      setNoticeIsError(true);
      setNotice("Scanarea SFS a eșuat.");
    } finally {
      setScanning(false);
    }
  };

  const remind = async (parId: string) => {
    setRowBusy(parId);
    setNotice(null);
    try {
      const res = await sendParEfacturaReminder(parId);
      setNoticeIsError(false);
      setNotice(res.toAddress ? `Reminder trimis către ${res.toAddress}.` : "Reminder înregistrat.");
      await load(filter);
    } catch (e) {
      setNoticeIsError(true);
      setNotice((e instanceof ApiError ? (e.body.detail as string | undefined) : undefined) ?? "Nu am putut trimite reminderul.");
    } finally {
      setRowBusy(null);
    }
  };

  const markReceived = async (parId: string) => {
    setRowBusy(parId);
    setNotice(null);
    try {
      await markParEfacturaReceived(parId, {});
      setNoticeIsError(false);
      setNotice("Factura a fost marcată ca primită.");
      await load(filter);
    } catch {
      setNoticeIsError(true);
      setNotice("Nu am putut marca factura ca primită.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <AppShell
      pageTitle="e-Factura prestatori"
      pageDescription="Cererile achitate pentru care prestatorul trebuie să emită e-Factura în SFS"
      actions={
        <Button variant="outline" onClick={scanAll} disabled={scanning} aria-label="Scanează SFS">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCcw className="h-4 w-4" aria-hidden />}
          Scanează SFS
        </Button>
      }
    >
      <div className="space-y-6">
        {queue && !queue.sfs.configured && (
          <Alert variant="warning" icon={<AlertTriangle className="h-5 w-5" />} title="Verificarea automată în SFS nu e activă">
            Fără credențiale SFS nu putem confirma dacă prestatorii au emis facturile — lista arată
            doar ce AR TREBUI să vină. Reminderele funcționează oricum. Completează configurarea mai jos.
          </Alert>
        )}

        {queue && <SfsSettingsPanel sfs={queue.sfs} onSaved={() => void load(filter)} />}

        {notice && (
          <Alert variant={noticeIsError ? "warning" : "success"} icon={noticeIsError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}>
            {notice}
          </Alert>
        )}

        {error && <Alert variant="destructive" icon={<AlertTriangle className="h-4 w-4" />}>{error}</Alert>}

        {queue && (
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrează lista">
              {FILTERS.map((f) => (
                <Button
                  key={f.value}
                  variant={filter === f.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <p className="ml-auto text-xs text-muted-foreground">
              Lipsă: <strong className="text-warning">{queue.counts.missing}</strong> · Găsite:{" "}
              <strong className="text-success">{queue.counts.found + queue.counts.receivedManual}</strong> · Fără
              obligație: {queue.counts.notApplicable}
            </p>
          </Card>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Se încarcă…
          </div>
        )}

        {!loading && queue && queue.items.length === 0 && (
          <Card className="p-8 text-center">
            <ReceiptText className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">
              {filter === "missing"
                ? "Nicio cerere achitată nu așteaptă e-Factura."
                : "Nimic de afișat pentru filtrul ales."}
            </p>
          </Card>
        )}

        {!loading && queue && queue.items.length > 0 && (
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cerere</TableHead>
                  <TableHead>Prestator</TableHead>
                  <TableHead>Sumă</TableHead>
                  <TableHead>Plătit</TableHead>
                  <TableHead>Stare e-Factura</TableHead>
                  <TableHead>Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.items.map((item) => {
                  const state = item.state;
                  const missing = state?.status === "expected";
                  return (
                    <TableRow key={item.parId}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => router.navigate(`/business/par/${item.parId}`)}
                          className="min-h-[44px] text-sm font-medium text-primary hover:underline"
                        >
                          {item.requestNo}
                        </button>
                        {item.endUse && (
                          <p className="max-w-[22rem] truncate text-xs text-muted-foreground">{item.endUse}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{item.payeeName}</span>
                        {item.payeeIdnp && <p className="text-xs text-muted-foreground">{item.payeeIdnp}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtAmount(item.amountCents, item.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{fmtDate(item.paidAt)}</TableCell>
                      <TableCell>
                        <span className={missing ? "text-sm text-warning" : "text-sm text-success"}>
                          {state ? PAR_EFACTURA_STATUS_LABELS[state.status] : "—"}
                        </span>
                        {state?.sfsSeria && (
                          <p className="text-xs text-muted-foreground">
                            {state.sfsSeria} {state.sfsNumber}
                            {state.sfsInvoiceStatusLabel ? ` · ${state.sfsInvoiceStatusLabel}` : ""}
                          </p>
                        )}
                        {missing && state?.reminderCount ? (
                          <p className="text-xs text-muted-foreground">
                            {state.reminderCount} reminder(e) · ultimul {fmtDate(state.lastReminderAt)}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {missing && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => remind(item.parId)}
                              disabled={rowBusy === item.parId}
                              aria-label={`Trimite reminder pentru ${item.requestNo}`}
                            >
                              {rowBusy === item.parId ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Send className="h-4 w-4" aria-hidden />
                              )}
                              Reminder
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markReceived(item.parId)}
                              disabled={rowBusy === item.parId}
                              aria-label={`Marchează factura primită pentru ${item.requestNo}`}
                            >
                              <Check className="h-4 w-4" aria-hidden />
                              Primită
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
