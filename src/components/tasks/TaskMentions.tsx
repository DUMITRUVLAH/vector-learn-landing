// @mențiuni: câmpul de scriere cu selector și randarea firului de comentarii.
//
// Stă separat de `TaskDetailPanel` (deja 1200 de linii) fiindcă e o bucată cu
// stare proprie — poziția cursorului, interogarea curentă, elementul selectat cu
// săgețile — care n-are ce căuta în starea panoului.
//
// Toată logica de text e în `src/lib/tasks/mentions.ts`, pură și testată; aici
// rămâne doar tastatura și randarea.

import { forwardRef, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";
import {
  filterMentionCandidates,
  findMentionQuery,
  insertMention,
  renderCommentParts,
  type MentionQuery,
} from "@/lib/tasks/mentions";
import type { AssignableUser } from "@/lib/tasks/types";

// ═══════════════════════════════════════════════════════════════════════════
// Randarea unui comentariu
// ═══════════════════════════════════════════════════════════════════════════

interface CommentBodyProps {
  content: string;
  names: Record<string, string>;
  /** Mențiunea PROPRIE se scoate în evidență mai tare — e cea care cere ceva. */
  meId?: string;
  className?: string;
}

/**
 * Textul unui comentariu, cu mențiunile evidențiate.
 *
 * Numele se rezolvă din `names` LA RANDARE, nu din text: comentariul stochează
 * `@[uuid]`, deci o persoană redenumită apare corect și în firele vechi.
 */
export function CommentBody({ content, names, meId, className }: CommentBodyProps) {
  const { t } = useTasksT();
  const parts = useMemo(() => renderCommentParts(content, names, t("board.detail.unknownUser")), [content, names, t]);

  return (
    <p className={cn("whitespace-pre-wrap text-sm", className)}>
      {parts.map((part, index) =>
        part.type === "mention" ? (
          <span
            key={index}
            className={cn(
              "rounded px-1 py-0.5 text-[13px] font-medium",
              part.userId === meId ? "bg-primary/15 text-primary" : "bg-muted text-foreground/80",
            )}
          >
            @{part.value}
          </span>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Câmpul de scriere
// ═══════════════════════════════════════════════════════════════════════════

interface MentionTextareaProps {
  value: string;
  onValueChange: (value: string) => void;
  people: AssignableUser[];
  onSubmit: () => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(
  { value, onValueChange, people, onSubmit, onPaste, placeholder, className, rows = 2 },
  forwardedRef,
) {
  const { t } = useTasksT();
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);

  const setRefs = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const candidates = useMemo(() => (query ? filterMentionCandidates(people, query.query) : []), [people, query]);
  const open = query !== null && candidates.length > 0;

  /** Recalculează starea selectorului din textul și cursorul CURENTE. */
  const syncQuery = (text: string, caret: number) => {
    const next = findMentionQuery(text, caret);
    setQuery(next);
    setActive(0);
  };

  const choose = (person: AssignableUser) => {
    if (!query) return;
    const out = insertMention(value, query, person.user_id);
    onValueChange(out.text);
    setQuery(null);
    // Cursorul se repune DUPĂ ce React a rescris valoarea; altfel sare la
    // capătul textului și mențiunea inserată la mijloc rupe scrisul.
    requestAnimationFrame(() => {
      const el = innerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(out.caret, out.caret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      // Cât timp lista e deschisă, săgețile și Enter îi aparțin ei — nu
      // trimit comentariul și nu mută cursorul.
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(candidates[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex-1">
      {open && (
        /*
            Lista se deschide ÎN SUS: câmpul de comentariu stă lipit de marginea
            de jos a panoului, deci în jos n-ar avea unde să încapă.
            z-80 = treapta popup-urilor din produs (suprafețe 50, panouri 70).
          */
        <div className="absolute bottom-full left-0 z-[80] mb-1 w-[min(280px,100%)] overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
          {candidates.map((person, index) => (
            <button
              key={person.user_id}
              type="button"
              // `onMouseDown` cu preventDefault, nu `onClick`: un click ar lua
              // întâi focusul din textarea, iar `setSelectionRange` de mai sus
              // ar scrie într-un câmp nefocalizat.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(person);
              }}
              onMouseEnter={() => setActive(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                index === active ? "bg-accent/10 text-primary" : "hover:bg-accent/5",
              )}
            >
              <AtSign className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{person.full_name}</span>
              {(person.job_title ?? person.email) && (
                <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                  {person.job_title ?? person.email}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Textarea
        ref={setRefs}
        rows={rows}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          syncQuery(event.target.value, event.target.selectionStart ?? 0);
        }}
        // Mutarea cursorului cu mouse-ul sau cu săgețile schimbă contextul:
        // fără asta, lista rămânea deschisă după ce omul dădea click în altă
        // parte a textului.
        onSelect={(event) => {
          const el = event.currentTarget;
          syncQuery(el.value, el.selectionStart ?? 0);
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        placeholder={placeholder ?? t("mention.hint")}
        className={cn("min-h-9 resize-none text-sm", className)}
      />
    </div>
  );
});
