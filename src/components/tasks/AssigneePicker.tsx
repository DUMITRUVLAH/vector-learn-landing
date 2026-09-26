// Selectorul de responsabili — piesa care lipsea cu totul din vechiul task
// manager: până acum `assigned_to` se popula doar din seeding-ul altor module,
// deci nimeni nu putea da un task unui coleg din interfață.
//
// Lista vine de la server (`useAssignableUsers`), din aceeași logică care decide
// și accesul — nu dintr-o listă de oameni filtrată în client. Altfel cele două ar
// putea diverge și ai vedea în listă oameni cărora serverul le refuză atribuirea.

import { useMemo, useState } from "react";
import { Check, Plus, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/tasks/ui";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useAssignableUsers } from "@/hooks/useTaskBoards";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { avatarClass, initialsOf } from "@/lib/tasks/meta";
import type { AssignableUser } from "@/lib/tasks/types";

interface AssigneePickerProps {
  boardId?: string | null;
  value: string[];
  onChange: (userIds: string[]) => void;
  /** `single` ascunde bifele multiple și închide popoverul după alegere. */
  mode?: "single" | "multi";
  disabled?: boolean;
  /** Randare compactă (chip cu avatare) vs. buton cu etichetă. */
  variant?: "chip" | "button";
  /**
   * Setează-l când pickerul stă într-un `Dialog`. Popoverul primește `modal` și
   * e portalat în `body`, DEASUPRA dialogului, deci rotița funcționează în lista
   * de colegi.
   *
   * Nu randa fără portal aici: `DialogContent` are `translate-*`, deci un
   * `transform` — iar un strămoș cu transform devine containing block pentru
   * `position: fixed` ȘI îl taie cu `overflow-hidden`. Pickerul de pe rândul de
   * subtask, aflat lângă marginea din dreapta, era retezat de dialog și restul
   * cădea sub overlay: „nu intră în cartonaș" (10-09-2026).
   */
  inDialog?: boolean;
  /** Textul afișat când nu e ales nimeni. Implicit: „Nimeni alocat". */
  placeholder?: string;
  className?: string;
}

/**
 * Ordinea din selector: eu, apoi coechipierii, apoi restul organizației.
 * Structura workspace-ului sunt echipele, nu o organigramă — deci nu există
 * grupuri de „șef" sau „subordonați".
 */
const RELATION_RANK: Record<NonNullable<AssignableUser["relation"]>, number> = {
  self: 0,
  teammate: 1,
  company: 2,
};

function rankOf(person: AssignableUser): number {
  return RELATION_RANK[person.relation ?? "company"];
}

/** A doua linie a rândului: funcția, sau emailul când funcția nu e cunoscută. */
function secondaryOf(person: AssignableUser): string | null {
  return person.job_title || person.email || null;
}

export function AssigneePicker({
  boardId,
  value,
  onChange,
  mode = "multi",
  disabled = false,
  variant = "button",
  inDialog = false,
  placeholder,
  className,
}: AssigneePickerProps) {
  const { t } = useTasksT();
  const isMobile = useIsPhone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data: people = [], isLoading } = useAssignableUsers(boardId);

  /**
   * Cine poate fi ales. Un cont dezactivat nu mai primește task-uri, dar dacă e
   * deja responsabil rămâne în listă, bifat, ca să poată fi scos. Sortarea e
   * stabilă: în interiorul fiecărei relații rămâne ordinea venită de la server.
   */
  const candidates = useMemo(
    () =>
      people.filter((p) => p.is_active !== false || value.includes(p.user_id)).sort((a, b) => rankOf(a) - rankOf(b)),
    [people, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (p) => p.full_name.toLowerCase().includes(q) || (secondaryOf(p) ?? "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  /**
   * Poți atribui oricui din organizație, dar echipa ta apare prima: cu 200 de
   * angajați, o listă pur alfabetică transformă cazul obișnuit — dai ceva unui
   * coleg de echipă — într-o vânătoare. Grupurile dispar la căutare, unde
   * ordinea nu mai contează.
   */
  const groups = useMemo(() => {
    if (query.trim()) return [{ key: "search" as const, people: filtered }];
    const near = filtered.filter((p) => p.relation && p.relation !== "company");
    const rest = filtered.filter((p) => !p.relation || p.relation === "company");
    const out: { key: "team" | "company" | "search"; people: typeof filtered }[] = [];
    if (near.length > 0) out.push({ key: "team", people: near });
    if (rest.length > 0) out.push({ key: "company", people: rest });
    return out.length > 0 ? out : [{ key: "search" as const, people: filtered }];
  }, [filtered, query]);

  // Din lista întreagă, nu doar din cei care pot fi aleși: un responsabil cu
  // contul dezactivat trebuie să-și vadă în continuare numele pe task.
  const selected = useMemo(
    () => value.map((id) => people.find((p) => p.user_id === id)).filter(Boolean),
    [value, people],
  );

  const toggle = (userId: string) => {
    if (mode === "single") {
      onChange(value[0] === userId ? [] : [userId]);
      setOpen(false);
      return;
    }
    onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]);
  };

  const trigger =
    variant === "chip" ? (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50",
          className,
        )}
      >
        {selected.length === 0 ? (
          <>
            <Plus className="h-3 w-3" />
            {t("board.assignee.add")}
          </>
        ) : (
          <>
            {selected.slice(0, 3).map((p) => (
              <span
                key={p!.user_id}
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold",
                  avatarClass(p!.user_id),
                )}
              >
                {initialsOf(p!.full_name)}
              </span>
            ))}
            {selected.length > 3 && <span className="text-[10px]">+{selected.length - 3}</span>}
          </>
        )}
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className={cn("w-full justify-start gap-2 font-normal", className)}
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        {selected.length === 0 ? (
          <span className="truncate text-muted-foreground">{placeholder ?? t("board.assignee.placeholder")}</span>
        ) : (
          <span className="truncate">{selected.map((p) => p!.full_name).join(", ")}</span>
        )}
      </Button>
    );

  /* Aceleași câmpuri în amândouă suprafețele — o singură listă, două cadre. */
  const body = (
    <>
      <div className="border-b p-2">
        <Input
          autoFocus={!isMobile}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("board.assignee.search")}
          aria-label={t("board.assignee.search")}
          className="h-8 text-sm"
        />
      </div>

      {value.length > 0 && mode === "multi" && (
        <div className="flex flex-wrap gap-1 border-b p-2">
          {selected.map((p) => (
            <span
              key={p!.user_id}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
            >
              {p!.full_name}
              <button
                type="button"
                onClick={() => toggle(p!.user_id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("board.assignee.remove", {
                  name: p!.full_name,
                })}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          "overflow-y-auto overscroll-contain p-1",
          isMobile ? "min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]" : "max-h-64",
        )}
      >
        {isLoading && <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("board.loading")}</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("board.assignee.empty")}</p>
        )}
        {groups.map((group) => (
          <div key={group.key}>
            {group.key !== "search" && (
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t(`board.assignee.groups.${group.key}`)}
              </p>
            )}
            {group.people.map((person) => {
              const isSelected = value.includes(person.user_id);
              const secondary = secondaryOf(person);
              return (
                <button
                  key={person.user_id}
                  type="button"
                  onClick={() => toggle(person.user_id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/10",
                    isSelected && "bg-accent/10",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      avatarClass(person.user_id),
                    )}
                  >
                    {initialsOf(person.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{person.full_name}</span>
                    {secondary && <span className="block truncate text-[11px] text-muted-foreground">{secondary}</span>}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );

  /*
    Pe telefon lista NU e popover: nu are loc sub buton, deci popoverul se
    întorcea în sus și îi tăia capul — adică exact câmpul de căutare — iar
    tastatura deschisă de `autoFocus` acoperea restul. Într-un panou de jos,
    căutarea rămâne sus și vizibilă, iar lista are înălțime proprie. `autoFocus`
    doar pe desktop, din același motiv ca la panoul lateral din `TasksLayout`.
  */
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          className="z-[80] flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetTitle className="sr-only">{t("board.assignee.search")}</SheetTitle>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={inDialog}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" collisionPadding={8}>
        {body}
      </PopoverContent>
    </Popover>
  );
}
