/**
 * PAR-VENDOR360 — „Cum a prestat furnizorul?"
 *
 * Apare după ce o cerere ajunge PLĂTITĂ, pentru omul care a cerut serviciul: el a văzut dacă marfa
 * a ajuns la timp și dacă a fost ce trebuia. Nota merge în fișa furnizorului, unde o vede
 * următorul care se gândește să lucreze cu el.
 *
 * Reguli de proiectare, în ordinea importanței:
 *  1. **O singură apăsare e de ajuns.** Nota generală e singurul câmp obligatoriu; criteriile și
 *     comentariul sunt ascunse sub „Adaugă detalii". Un formular lung după fiecare plată ar fi
 *     închis de toată lumea, iar fișele ar rămâne goale.
 *  2. **„Mai târziu" chiar înseamnă mai târziu.** Popup-ul întreabă o singură dată despre o
 *     cerere, oricum ai închide dialogul (buton, X, Esc, fundal) — vezi `@/lib/par/ratingPrompt`.
 *     Cererea rămâne în „de evaluat" pe fișa furnizorului, deci nota se poate da oricând.
 *  3. **Nimic nu se pierde la eroare de rețea.** Dacă salvarea pică, dialogul rămâne deschis cu
 *     textul scris și spune ce s-a întâmplat.
 */
import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { Alert, Button, Dialog, Textarea, Label } from "@/components/ds";
import { StarPicker } from "./VendorStars";
import { rateVendor, type RateVendorPayload } from "@/lib/api/parVendorProfile";

export interface VendorRatingDialogProps {
  open: boolean;
  onClose: () => void;
  vendorId: string;
  vendorName: string;
  /** Cererea care a declanșat întrebarea (opțional — se poate evalua și direct din fișă). */
  parId?: string | null;
  requestNo?: string | null;
  /** Ce s-a salvat, ca pagina din spate să se reîmprospăteze. */
  onSaved?: () => void;
  /** Text pentru butonul secundar; „Mai târziu" în popup, „Renunță" în fișă. */
  dismissLabel?: string;
}

const CRITERIA = [
  { key: "quality_stars", label: "Calitatea serviciului" },
  { key: "timeliness_stars", label: "Respectarea termenului" },
  { key: "price_stars", label: "Raport preț / valoare" },
  { key: "communication_stars", label: "Comunicare" },
] as const;

export function VendorRatingDialog({
  open,
  onClose,
  vendorId,
  vendorName,
  parId,
  requestNo,
  onSaved,
  dismissLabel = "Mai târziu",
}: VendorRatingDialogProps) {
  const [stars, setStars] = useState<number | null>(null);
  const [criteria, setCriteria] = useState<Record<string, number | null>>({});
  const [comment, setComment] = useState("");
  const [wouldUseAgain, setWouldUseAgain] = useState<boolean | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStars(null);
    setCriteria({});
    setComment("");
    setWouldUseAgain(null);
    setShowDetails(false);
    setError(null);
  };

  const save = async () => {
    if (stars == null) return;
    setSaving(true);
    setError(null);
    try {
      const payload: RateVendorPayload = {
        stars,
        par_id: parId ?? null,
        comment: comment.trim() || null,
        would_use_again: wouldUseAgain,
        ...criteria,
      };
      await rateVendor(vendorId, payload);
      reset();
      onSaved?.();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "http_500"
          ? "Evaluarea nu s-a salvat. Verifică legătura la internet și încearcă din nou."
          : "Evaluarea nu s-a salvat. Încearcă din nou."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Cum a prestat ${vendorName}?`}
      description={
        requestNo
          ? `Cererea ${requestNo} e plătită. Nota ta ajunge în fișa furnizorului.`
          : "Nota ta ajunge în fișa furnizorului, alături de celelalte păreri."
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {dismissLabel}
          </Button>
          <Button onClick={() => void save()} disabled={stars == null || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Star className="h-4 w-4" aria-hidden="true" />}
            Salvează evaluarea
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4">
          <StarPicker value={stars} onChange={setStars} label="Nota generală" />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {stars == null
              ? "Alege de la 1 la 5 stele"
              : ["Foarte slab", "Slab", "Acceptabil", "Bun", "Excelent"][stars - 1]}
          </p>
        </div>

        {!showDetails && (
          <Button variant="ghost" size="sm" onClick={() => setShowDetails(true)} className="self-start">
            Adaugă detalii (opțional)
          </Button>
        )}

        {showDetails && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {CRITERIA.map((crit) => (
                <div key={crit.key} className="flex flex-col gap-1">
                  <Label>{crit.label}</Label>
                  <StarPicker
                    size="md"
                    allowClear
                    label={crit.label}
                    value={criteria[crit.key] ?? null}
                    onChange={(v) => setCriteria((prev) => ({ ...prev, [crit.key]: v }))}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="vendor-rating-comment">Ce s-a întâmplat, pe scurt</Label>
              <Textarea
                id="vendor-rating-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Ex: au livrat cu o zi mai devreme, dar au lipsit 2 pachete din comandă."
              />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">Ai mai lucra cu ei?</legend>
              <div className="flex gap-2">
                <Button
                  variant={wouldUseAgain === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWouldUseAgain(wouldUseAgain === true ? null : true)}
                  aria-pressed={wouldUseAgain === true}
                >
                  Da
                </Button>
                <Button
                  variant={wouldUseAgain === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWouldUseAgain(wouldUseAgain === false ? null : false)}
                  aria-pressed={wouldUseAgain === false}
                >
                  Nu
                </Button>
              </div>
            </fieldset>
          </div>
        )}
      </div>
    </Dialog>
  );
}
