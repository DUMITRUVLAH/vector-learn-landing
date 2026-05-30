/**
 * CRM-134: MentionTextarea — textarea with @mention autocomplete popover.
 *
 * When the user types "@" followed by at least one character, a popover appears
 * with matching tenant members. Selecting one inserts "@Prenume Nume" and closes the popover.
 */
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TenantMember } from "@/lib/api/notifications";

export interface MentionTextareaProps {
  /** Current textarea value */
  value: string;
  onChange: (value: string) => void;
  /** List of tenant members for autocomplete */
  members: TenantMember[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  id?: string;
  /** Additional className for the textarea */
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Returns the start index of the current @<query> token at the cursor position,
 * or -1 if the cursor is not inside a mention token.
 */
function getMentionQuery(
  text: string,
  cursorPos: number
): { query: string; tokenStart: number } | null {
  // Walk backwards from cursor to find the nearest @
  let i = cursorPos - 1;
  while (i >= 0 && text[i] !== "@" && text[i] !== "\n" && text[i] !== " ") {
    i--;
  }
  if (i < 0 || text[i] !== "@") return null;
  const tokenStart = i;
  const query = text.slice(tokenStart + 1, cursorPos);
  // Require at least 1 char after @
  if (query.length === 0) return null;
  return { query, tokenStart };
}

export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  disabled,
  rows = 3,
  id,
  className,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [tokenStart, setTokenStart] = useState<number>(-1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const filtered = mentionQuery
    ? members.filter((m) =>
        m.name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart ?? newValue.length;
    onChange(newValue);

    const result = getMentionQuery(newValue, cursorPos);
    if (result) {
      setMentionQuery(result.query);
      setTokenStart(result.tokenStart);
      setPopoverOpen(true);
      setActiveIndex(0);
    } else {
      setPopoverOpen(false);
      setMentionQuery(null);
      setTokenStart(-1);
    }
  };

  const insertMention = (member: TenantMember) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? value.length;
    // Replace from tokenStart to cursorPos with "@Prenume Nume "
    const before = value.slice(0, tokenStart);
    const after = value.slice(cursorPos);
    const newValue = `${before}@${member.name} ${after}`;
    onChange(newValue);
    setPopoverOpen(false);
    setMentionQuery(null);
    setTokenStart(-1);
    // Restore focus with cursor after inserted mention
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const newCursor = before.length + member.name.length + 2; // "@" + name + " "
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popoverOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const selected = filtered[activeIndex];
        if (selected) {
          e.preventDefault();
          insertMention(selected);
          return;
        }
      }
      if (e.key === "Escape") {
        setPopoverOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        aria-label={placeholder ?? "Notă"}
        aria-autocomplete="list"
        aria-expanded={popoverOpen && filtered.length > 0}
        aria-haspopup="listbox"
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "resize-none placeholder:text-muted-foreground",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
      />

      {popoverOpen && filtered.length > 0 && (
        <ul
          role="listbox"
          aria-label="Membrii echipei"
          className="absolute z-50 mt-1 w-64 rounded-md border border-border bg-popover shadow-md py-1 text-sm"
        >
          {filtered.map((member, idx) => (
            <li
              key={member.id}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                insertMention(member);
              }}
              className={cn(
                "px-3 py-2 cursor-pointer select-none",
                idx === activeIndex
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span className="font-semibold">{member.name}</span>
              <span className="ml-2 text-xs text-muted-foreground capitalize">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
