/**
 * PARVERIFY-001 — codul de verificare al formularului tipărit, pe fișa cererii.
 *
 * De ce există ecranul ăsta. Codul se tipărește pe hârtie și se verifică de pe telefon, deci
 * întreaga funcție ar fi putut trăi fără nicio interfață în aplicație. Trei întrebări o cer totuși,
 * iar toate trei apar abia după ce hârtia pleacă din birou:
 *
 *   • „ce cod are PAR-ul ăsta?" — cineva sună de la contabilitate cu formularul în mână și
 *     întreabă dacă e cel bun; fără ecran, răspunsul cerea o descărcare de PDF;
 *   • „am pierdut hârtia" — linkul public circulă mai departe; retragerea lui exista doar ca apel
 *     de API, adică practic nu exista;
 *   • „a fost citit de cineva?" — numărul de scanări e singurul semnal că un document de plată
 *     circulă mai mult decât ar trebui.
 *
 * Retragerea și reemiterea cer confirmare fiindcă amândouă invalidează exemplarele deja tipărite,
 * inclusiv pe cele dintr-un dosar de audit predat. Sunt vizibile numai pentru par_admin.
 */
import { useEffect, useState } from "react";
import { QrCode, Loader2, ExternalLink, Copy, Check, Ban, RefreshCw, Eye } from "lucide-react";
import { Button } from "@/components/ds";
import { getParVerifyCode, setParVerifyCode, type ParVerifyCodeInfo } from "@/lib/api/par";

export interface ParVerifyCodeCardProps {
  parId: string;
  /** Doar par_admin poate retrage sau reemite; serverul o verifică oricum. */
  isAdmin: boolean;
}

function fmt(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ro-MD", {
    timeZone: "Europe/Chisinau",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function ParVerifyCodeCard({ parId, isAdmin }: ParVerifyCodeCardProps) {
  const [info, setInfo] = useState<ParVerifyCodeInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getParVerifyCode(parId)
      .then(setInfo)
      // Codul e informativ: dacă nu se poate citi, fișa cererii se deschide mai departe.
      .catch(() => setInfo({ issued: false }));
  };

  useEffect(load, [parId]);

  const act = async (action: "revoke" | "reissue") => {
    const question =
      action === "revoke"
        ? "Retrageți codul? Toate exemplarele tipărite până acum nu vor mai putea fi verificate."
        : "Emiteți un cod nou? Cel vechi încetează să funcționeze, iar formularul trebuie tipărit din nou.";
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      await setParVerifyCode(parId, action);
      load();
    } catch {
      setError("Operațiunea nu a reușit. Încercați din nou.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!info?.code) return;
    try {
      await navigator.clipboard.writeText(info.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-ul e blocat în unele contexte; codul rămâne selectabil cu mâna.
    }
  };

  if (!info) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <QrCode className="h-4 w-4 text-primary" aria-hidden />
        Cod de verificare
      </h3>

      {!info.issued && (
        <p className="mt-2 text-sm text-muted-foreground">
          Se creează automat la prima descărcare a formularului. Codul QR și codurile din rubricile
          <em> Signature</em> apar direct pe PDF.
        </p>
      )}

      {info.issued && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Tipărit sub codul QR de pe formular. Cine îl scanează vede aprobările înregistrate —
            fără date de plată.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm tracking-wider">
              {info.code}
            </code>
            <Button variant="ghost" size="sm" onClick={copy} aria-label="Copiază codul">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copiat" : "Copiază"}
            </Button>
            {info.url && !info.revokedAt && (
              <a
                href={info.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Deschide pagina de verificare
              </a>
            )}
          </div>

          {info.revokedAt ? (
            <p role="alert" className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <Ban className="h-4 w-4 shrink-0" aria-hidden />
              Cod retras la {fmt(info.revokedAt)}. Hârtiile tipărite nu mai pot fi verificate.
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {info.scanCount ?? 0} {info.scanCount === 1 ? "scanare" : "scanări"}
              {info.lastUsedAt ? ` · ultima ${fmt(info.lastUsedAt)}` : ""}
            </p>
          )}

          {isAdmin && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {!info.revokedAt && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("revoke")}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Ban className="h-4 w-4" aria-hidden />}
                  Retrage codul
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("reissue")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                Emite cod nou
              </Button>
            </div>
          )}

          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  );
}
