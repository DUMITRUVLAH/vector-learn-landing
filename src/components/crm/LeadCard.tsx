/**
 * CRM-U06 — cartonașul din pipeline, curat, în stilul Google Calendar / Tasks.
 *
 * Ce a cerut ownerul (2026-09-26) și ce s-a schimbat:
 *  · „nu sunt sigur ca fiecare cartonaș să aibă pe stânga linia roșie și textul roșu — doar
 *    clopoțelul să fie roșu": restanța se vede DOAR prin clopoțelul roșu; textul rămâne normal.
 *  · „nu înțeleg iconițele telefon și email care se repetă pe fiecare": au dispărut. Dacă cineva
 *    vrea telefonul pe cartonaș, îl alege în „Personalizează" — ca număr, nu ca iconiță mută.
 *  · „când faci hover se duce să-i schimbi perioada": selectul de etapă care apărea la hover
 *    peste subsol a dispărut de pe desktop (acolo muți cartonașul trăgându-l sau din fișă). Pe
 *    telefon, unde nu există drag, rămâne vizibil — e singura cale acolo.
 *  · „fiecare cartonaș să poți personaliza": titlul și câmpurile vin din `CardPrefs`.
 */
import { Bell } from "lucide-react";
import type { CrmLead, CrmLeadStage, CrmStage } from "@/lib/api/crm";
import { Label, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import { crmSourceLabel } from "@/components/crm/constants";
import { formatCentsShort } from "@/components/crm/format";
import { cardLines, type CardPrefs } from "@/lib/crm/cardPrefs";
import { formatDue, isDueOverdue } from "@/lib/crm/taskDue";

export interface LeadCardProps {
  lead: CrmLead;
  prefs: CardPrefs;
  stages: readonly CrmStage[];
  isDragging: boolean;
  /** Numele responsabilului (pentru inițiale); `null` = nerepartizat. */
  ownerName: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onChangeStage: (stage: CrmLeadStage) => void;
  onOpen: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function LeadCard({ lead, prefs, stages, isDragging, ownerName, onDragStart, onDragEnd, onChangeStage, onOpen }: LeadCardProps) {
  const { title, subtitle } = cardLines(lead, prefs.title);
  const task = lead.nextTask ?? null;
  const overdue = !!task && isDueOverdue(task.dueAt, task.dueHasTime);
  const footer =
    (prefs.source && !!lead.source) || prefs.createdAt || (prefs.phone && !!lead.phone) || (prefs.owner && !!lead.assignedTo);

  return (
    <article
      draggable
      data-overdue={overdue ? "true" : undefined}
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-grab rounded-xl border border-border bg-card transition-colors active:cursor-grabbing",
        "hover:border-foreground/20",
        isDragging && "opacity-40"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Deschide lead ${title}`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground line-clamp-2">{title}</p>
          {prefs.value && lead.valueCents > 0 && (
            <span className="shrink-0 text-sm tabular-nums text-foreground">{formatCentsShort(lead.valueCents)}</span>
          )}
        </div>
        {prefs.subtitle && subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}

        {prefs.nextTask && task && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-foreground/80">
            <Bell
              className={cn("h-3.5 w-3.5 shrink-0", overdue ? "text-destructive" : "text-muted-foreground")}
              aria-label={overdue ? "Task restant" : "Următorul task"}
            />
            <span className="truncate">{task.title}</span>
            {task.dueAt && (
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                {formatDue(task.dueAt, task.dueHasTime, "short")}
              </span>
            )}
          </p>
        )}

        {footer && (
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            {prefs.source && lead.source && <span className="truncate">{crmSourceLabel(lead.source)}</span>}
            {prefs.createdAt && (
              <span className="shrink-0 tabular-nums">
                {new Date(lead.createdAt).toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
            {prefs.phone && lead.phone && <span className="truncate tabular-nums">{lead.phone}</span>}
            {prefs.owner && lead.assignedTo && (
              <span
                className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-3xs font-semibold text-secondary-foreground"
                title={ownerName ?? "Responsabil"}
                aria-label={`Responsabil: ${ownerName ?? "necunoscut"}`}
              >
                {initials(ownerName ?? "?")}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Doar pe telefon (fără drag): mutarea de etapă. Pe desktop nu mai apare nimic la hover. */}
      <div className="px-3 pb-3 lg:hidden">
        <Label htmlFor={`crm-stage-${lead.id}`} className="sr-only">
          Mutare stadiu pentru {title}
        </Label>
        <Select id={`crm-stage-${lead.id}`} value={lead.stage} onChange={(e) => onChangeStage(e.target.value)}>
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
    </article>
  );
}
