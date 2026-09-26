/**
 * CRM — un scenariu gata făcut, ca un card cu comutator (CRM-A02).
 *
 * Comutatorul e toată interacțiunea: pornit = regula există și rulează. Omul nu trebuie să treacă
 * printr-un formular ca să aibă automatizările de bază; „Personalizează" e acolo pentru cine vrea
 * alt prag de zile sau alt text de task.
 */
import { Button, Card, Switch } from "@/components/ds";

export interface ScenarioCardProps {
  title: string;
  why: string;
  on: boolean;
  busy?: boolean;
  /** Motivul pentru care scenariul nu se poate porni pe acest workspace. */
  unavailable?: string | null;
  onToggle: (next: boolean) => void;
  onCustomize?: () => void;
}

export function ScenarioCard({ title, why, on, busy, unavailable, onToggle, onCustomize }: ScenarioCardProps) {
  return (
    <Card className="flex h-full flex-col gap-2 p-4" data-scenario-on={on ? "true" : "false"}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug">{title}</h3>
        <Switch
          checked={on}
          disabled={busy || !!unavailable}
          onChange={onToggle}
          aria-label={on ? `Oprește scenariul ${title}` : `Pornește scenariul ${title}`}
        />
      </div>
      <p className="text-sm text-muted-foreground">{why}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={on ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>
          {unavailable ?? (on ? "Pornit" : "Oprit")}
        </span>
        {onCustomize && !unavailable && (
          <Button variant="link" size="sm" onClick={onCustomize}>
            Personalizează
          </Button>
        )}
      </div>
    </Card>
  );
}
