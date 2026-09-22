/**
 * PAR-ARH — dialogul de arhivare / restaurare a unei cereri.
 *
 * De ce un dialog și nu un buton direct: arhivarea scoate cererea din lista tuturor (autor,
 * aprobatori, foldere), deci merită o confirmare care spune EXACT ce se întâmplă — și, mai ales,
 * că nu se șterge nimic. Nota e opțională: arhivarea e curățenie, nu un refuz care cere motivare.
 *
 * Folosit din lista de cereri (ParDashboard) și din pagina cererii (ParDetail), ca textul și
 * comportamentul să fie identice în ambele locuri.
 *
 * Design system: doar tokeni semantici Vector 365, light + dark, WCAG AA.
 */
import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { Alert, Button, Dialog, Label, Textarea } from "@/components/ds";
import { archivePar, unarchivePar, PAR_STATUS_LABELS, type ParStatus } from "@/lib/api/par";
import { ApiError } from "@/lib/api";

export interface ParArchiveDialogProps {
  open: boolean;
  /** „archive" scoate cererea din listele de lucru, „restore" o readuce. */
  mode: "archive" | "restore";
  parId: string;
  requestNo: string;
  status: ParStatus;
  /** Rândul doi al dialogului: beneficiar · sumă, cât să recunoști cererea fără să o deschizi. */
  summary?: string | null;
  onClose: () => void;
  /** Chemat după ce serverul a confirmat; `archived` = starea nouă. */
  onDone: (archived: boolean) => void;
}

export function ParArchiveDialog({
  open,
  mode,
  parId,
  requestNo,
  status,
  summary,
  onClose,
  onDone,
}: ParArchiveDialogProps) {
  const archiving = mode === "archive";
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fiecare deschidere pornește curată: nota unei cereri nu are ce căuta pe următoarea.
  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open, parId, mode]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (archiving) await archivePar(parId, note.trim() || undefined);
      else await unarchivePar(parId);
      onDone(archiving);
      onClose();
    } catch (e: unknown) {
      // 409 = cererea e în flux. Serverul trimite ȘI ce are omul de făcut în schimb
      // (`message`) — arătăm asta, nu codul sec „conflict".
      const explained = e instanceof ApiError ? e.body?.message : null;
      setError(
        typeof explained === "string" && explained
          ? explained
          : e instanceof Error
            ? e.message
            : archiving
              ? "Nu am putut arhiva cererea."
              : "Nu am putut restaura cererea."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      size="sm"
      title={archiving ? "Arhivează cererea" : "Restaurează cererea"}
      description={[requestNo, summary].filter(Boolean).join(" · ")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Anulare
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : archiving ? (
              <Archive className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            )}
            {archiving ? "Arhivează" : "Restaurează"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <p className="text-sm text-muted-foreground">
          {archiving ? (
            <>
              Cererea ({PAR_STATUS_LABELS[status].toLocaleLowerCase("ro")}) iese din lista de cereri
              și trece în fila <strong className="font-medium text-foreground">Arhivate</strong>.
              Nu se șterge nimic: statusul rămâne neschimbat, numărul rămâne emis, iar de acolo o
              poți readuce oricând.
            </>
          ) : (
            <>
              Cererea se întoarce în lista de lucru, exact în starea în care e acum.
            </>
          )}
        </p>

        {archiving && (
          <div>
            <Label htmlFor="par-archive-note">
              Notă <span className="font-normal text-muted-foreground">(opțional)</span>
            </Label>
            <Textarea
              id="par-archive-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex. am renunțat la ea, am făcut alta"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Nota rămâne în jurnalul cererii — ca să știi peste o lună de ce ai pus-o deoparte.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
