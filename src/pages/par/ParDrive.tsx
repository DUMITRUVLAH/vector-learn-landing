/**
 * PAR-DRIVE — /business/par/drive
 *
 * Ecranul prin care un administrator PAR conectează contul Google al organizației și vede starea
 * oglindirii: câte dosare plătite există, câte au ajuns în Drive, când a rulat ultima dată jobul.
 *
 * Regula de proiectare a paginii: omul trebuie să înțeleagă din prima CE se urcă și UNDE, fără să
 * deschidă documentația. De-aia arborele de mape e desenat literal în pagină, iar textul spune pe
 * ce cont Google scriem.
 *
 * Design: Vector 365 (tokens semantice, light + dark), WCAG AA.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FolderTree,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useRouter } from "@/router/HashRouter";
import {
  DRIVE_WEEKDAYS,
  disconnectDrive,
  driveCallbackMessage,
  driveConnectUrl,
  getDriveStatus,
  resyncDriveAll,
  syncDriveNow,
  updateDriveSettings,
  type ParDriveStatus,
  type ParDriveSyncSummary,
} from "@/lib/api/parDrive";
import { Alert, Badge, Button, Card, Input, KpiTile, Label, Select, Skeleton, Switch } from "@/components/ds";

function formatDateTime(iso: string | null): string {
  if (!iso) return "niciodată";
  return new Date(iso).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ParDrive() {
  const { path, navigate } = useRouter();
  const [status, setStatus] = useState<ParDriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sync" | "resync" | "disconnect" | "save" | null>(null);
  const [summary, setSummary] = useState<ParDriveSyncSummary | null>(null);
  const [folderName, setFolderName] = useState("");

  // Mesajul întoarcerii de la Google trăiește în URL (`?rezultat=…`), ca un refresh să nu-l piardă.
  const callbackResult = new URLSearchParams(path.split("?")[1] ?? "").get("rezultat");
  const callbackMessage = driveCallbackMessage(callbackResult);

  const load = useCallback(async () => {
    try {
      const data = await getDriveStatus();
      setStatus(data);
      setFolderName(data.rootFolderName);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut citi starea sincronizării.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (next: { syncEnabled?: boolean; syncDayOfWeek?: number; rootFolderName?: string }) => {
    setBusy("save");
    try {
      await updateDriveSettings(next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvarea a eșuat.");
    } finally {
      setBusy(null);
    }
  };

  const runSync = async (mode: "sync" | "resync") => {
    setBusy(mode);
    setSummary(null);
    try {
      setSummary(mode === "sync" ? await syncDriveNow() : await resyncDriveAll());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sincronizarea a eșuat.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnectDrive();
      setSummary(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deconectarea a eșuat.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <BusinessShell pageTitle="Google Drive" pageDescription="Oglinda dosarelor plătite">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </BusinessShell>
    );
  }

  return (
    <BusinessShell
      pageTitle="Google Drive"
      pageDescription="Dosarele plătite, urcate săptămânal în aceleași mape ca în aplicație"
    >
      <div className="space-y-4">
        {callbackMessage && (
          <Alert
            variant={callbackMessage.tone === "ok" ? "default" : "destructive"}
            icon={
              callbackMessage.tone === "ok" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )
            }
          >
            {callbackMessage.text}
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
            {error}
          </Alert>
        )}

        {status && !status.configured && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>
            Aplicația Google nu e configurată pe server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET),
            deci conectarea nu poate porni.
          </Alert>
        )}

        {/* ── Starea, în cifre ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiTile
            label="Cereri plătite"
            value={status?.paidCount ?? 0}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="violet"
          />
          <KpiTile
            label="Urcate în Drive"
            value={status?.syncedCount ?? 0}
            icon={<CloudUpload className="h-4 w-4" />}
            tone="emerald"
            hint={status?.pendingCount ? `${status.pendingCount} în așteptare` : "la zi"}
          />
          <KpiTile
            label="Ultima sincronizare"
            value={formatDateTime(status?.lastSyncAt ?? null)}
            icon={<RefreshCw className="h-4 w-4" />}
            tone="sky"
            hint={status?.lastSyncMessage ?? undefined}
          />
        </div>

        {/* ── Conexiunea ───────────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Contul Google</h2>
              {status?.connected ? (
                <p className="text-sm text-muted-foreground">
                  Conectat pe <span className="font-medium text-foreground">{status.googleEmail ?? "cont Google"}</span>.
                  Dosarele se urcă în Drive-ul acestui cont, în mapa{" "}
                  <span className="font-medium text-foreground">{status.rootFolderName}</span>.
                </p>
              ) : (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Conectează contul Google în al cărui Drive vrei oglinda dosarelor. Cerem doar
                  permisiunea <span className="font-medium text-foreground">drive.file</span>: aplicația
                  vede și scrie exclusiv fișierele pe care le creează ea, nu restul documentelor tale.
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {status?.connected && status.rootFolderId && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    window.open(`https://drive.google.com/drive/folders/${status.rootFolderId}`, "_blank", "noopener")
                  }
                >
                  <ExternalLink className="h-4 w-4" />
                  Deschide în Drive
                </Button>
              )}
              {status?.connected ? (
                <Button variant="destructive" onClick={disconnect} disabled={busy !== null}>
                  {busy === "disconnect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Deconectează
                </Button>
              ) : (
                <Button
                  disabled={!status?.configured}
                  onClick={() => {
                    window.location.href = driveConnectUrl;
                  }}
                >
                  <CloudUpload className="h-4 w-4" />
                  Conectează Google Drive
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Ce se urcă și unde ───────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Ce ajunge în Drive</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Doar cererile <Badge variant="secondary">plătite</Badge>, ca dosar PDF complet — fișa
            aprobărilor, documentele justificative și formularul cererii, exact fișierul pe care îl
            descarci din pagina cererii. Mapele sunt aceleași ca în ecranul de foldere:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
{`${status?.rootFolderName ?? "Dosare PAR plătite"}/
├── Erasmus 2026/
│   ├── Conferința de toamnă/
│   │   └── Plătite/
│   │       └── Dosar_PAR_0042.pdf
│   └── Plătite/
│       └── Dosar_PAR_0039.pdf
└── Fără proiect/
    └── Plătite/
        └── Dosar_PAR_0044.pdf`}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Un dosar deja urcat se actualizează în același fișier (link-ul rămâne valid), iar dacă
            nimic nu s-a schimbat de la ultima rulare nu se reurcă deloc.
          </p>
        </Card>

        {/* ── Programul ────────────────────────────────────────────────────── */}
        {status?.connected && (
          <Card className="p-5">
            <h2 className="text-base font-semibold text-foreground">Programul sincronizării</h2>

            <div className="mt-4 flex items-center justify-between gap-4 border-b border-border/60 pb-4">
              <div>
                <p className="text-sm font-medium text-foreground">Sincronizare săptămânală</p>
                <p className="text-xs text-muted-foreground">
                  Când e oprită, dosarele urcate rămân în Drive, dar nu se mai adaugă nimic nou.
                </p>
              </div>
              <Switch
                checked={status.syncEnabled}
                onChange={(next) => void patch({ syncEnabled: next })}
                disabled={busy !== null}
                aria-label="Sincronizare săptămânală activă"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="drive-day">Ziua rulării</Label>
                <Select
                  id="drive-day"
                  value={String(status.syncDayOfWeek)}
                  disabled={busy !== null}
                  onChange={(e) => void patch({ syncDayOfWeek: Number(e.target.value) })}
                >
                  {DRIVE_WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="drive-folder">Mapa-rădăcină din Drive</Label>
                <div className="flex gap-2">
                  <Input
                    id="drive-folder"
                    value={folderName}
                    maxLength={120}
                    disabled={busy !== null}
                    onChange={(e) => setFolderName(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy !== null || !folderName.trim() || folderName === status.rootFolderName}
                    onClick={() => void patch({ rootFolderName: folderName.trim() })}
                  >
                    Salvează
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Redenumirea creează o mapă nouă la următoarea rulare; cea veche rămâne în Drive,
                  cu dosarele de până acum.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <Button onClick={() => void runSync("sync")} disabled={busy !== null}>
                {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizează acum
              </Button>
              <Button variant="secondary" onClick={() => void runSync("resync")} disabled={busy !== null}>
                {busy === "resync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                Reurcă tot
              </Button>
              {status.errorCount > 0 && (
                <Badge variant="destructive">{status.errorCount} dosare cu eroare</Badge>
              )}
            </div>

            {summary && (
              <Alert
                className="mt-4"
                variant={summary.status === "error" ? "destructive" : "default"}
                icon={
                  summary.status === "error" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )
                }
              >
                {summary.message}
                {summary.remaining > 0 && " Rulează din nou pentru a continua."}
              </Alert>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              O rulare urcă un lot de dosare, ca să nu depășească timpul maxim al unei funcții.
              Restul se iau la rulările următoare, în ordinea plății — nu se pierde nimic.
            </p>
          </Card>
        )}

        <button
          type="button"
          onClick={() => navigate("/business/par/folders")}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Înapoi la folderele PAR
        </button>
      </div>
    </BusinessShell>
  );
}
