/**
 * CRM-U06 — „Personalizează cartonașul": titlul și câmpurile pe care le vezi pe tablă.
 */
import { Button, Checkbox, Dialog } from "@/components/ds";
import {
  CARD_FIELD_LABELS,
  CARD_TITLE_LABELS,
  DEFAULT_CARD_PREFS,
  type CardPrefs,
  type CardTitleMode,
} from "@/lib/crm/cardPrefs";

export interface CardSettingsDialogProps {
  open: boolean;
  prefs: CardPrefs;
  onChange: (prefs: CardPrefs) => void;
  onClose: () => void;
}

export function CardSettingsDialog({ open, prefs, onChange, onClose }: CardSettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Personalizează cartonașul" description="Doar pentru tine, pe acest browser.">
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Titlul cartonașului</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Titlul cartonașului">
            {(Object.keys(CARD_TITLE_LABELS) as CardTitleMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={prefs.title === mode}
                onClick={() => onChange({ ...prefs, title: mode })}
                className={
                  prefs.title === mode
                    ? "h-8 rounded-lg border border-transparent bg-secondary px-3 text-sm font-medium text-secondary-foreground"
                    : "h-8 rounded-lg border border-input px-3 text-sm text-foreground hover:bg-muted"
                }
              >
                {CARD_TITLE_LABELS[mode]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Ce apare pe cartonaș</legend>
          {(Object.keys(CARD_FIELD_LABELS) as (keyof typeof CARD_FIELD_LABELS)[]).map((key) => (
            <Checkbox
              key={key}
              label={CARD_FIELD_LABELS[key]}
              checked={prefs[key]}
              onChange={(next) => onChange({ ...prefs, [key]: next })}
            />
          ))}
        </fieldset>

        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => onChange(DEFAULT_CARD_PREFS)}>
            Revino la implicit
          </Button>
          <Button onClick={onClose}>Gata</Button>
        </div>
      </div>
    </Dialog>
  );
}
