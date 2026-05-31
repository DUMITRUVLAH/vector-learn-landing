/**
 * CRM-138: StageMenu — keyboard-accessible popover for moving a lead to a
 * different pipeline stage. Used on KanbanCard as a click alternative to drag.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStage } from "@/lib/api/pipeline";

interface StageMenuProps {
  /** Current stage key of the lead — excluded from the menu. */
  currentStageKey: string;
  /** Available pipeline stages. */
  stages: PipelineStage[];
  /** Called when the user selects a non-lost stage. */
  onMove: (stageKey: string) => void;
  /** Called when the user selects an isLost stage (caller shows modal). */
  onMoveLost: (stageKey: string) => void;
}

/**
 * A small button that opens a popover listing all stages except the current
 * one. Fully keyboard-accessible: Tab/Enter/Space opens, Arrow keys navigate,
 * Escape closes and returns focus to the trigger.
 */
export function StageMenu({ currentStageKey, stages, onMove, onMoveLost }: StageMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const available = stages.filter((s) => s.key !== currentStageKey);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setOpen((prev) => !prev);
      setActiveIdx(0);
    }
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card click → opening lead
    setOpen((prev) => !prev);
    setActiveIdx(0);
  };

  const handleMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % available.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + available.length) % available.length); }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const stage = available[activeIdx];
      if (stage) selectStage(stage);
    }
  };

  const selectStage = (stage: PipelineStage) => {
    close();
    if (stage.isLost) {
      onMoveLost(stage.key);
    } else {
      onMove(stage.key);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Move focus into menu when it opens
  useEffect(() => {
    if (open) {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']");
      items?.[activeIdx]?.focus();
    }
  }, [open, activeIdx]);

  if (available.length === 0) return null;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Mută în alt stadiu"
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={handleTriggerKey}
        onClick={handleTriggerClick}
        className={cn(
          "inline-flex items-center justify-center rounded p-0.5 text-muted-foreground",
          "hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors"
        )}
      >
        <ArrowRightLeft className="h-3 w-3" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Stadii disponibile"
          onKeyDown={handleMenuKey}
          className={cn(
            "absolute right-0 top-5 z-50 min-w-[140px] rounded-md border border-border bg-popover shadow-md",
            "py-1 text-xs focus:outline-none"
          )}
        >
          {available.map((stage, idx) => (
            <button
              key={stage.key}
              type="button"
              role="menuitem"
              tabIndex={idx === activeIdx ? 0 : -1}
              onClick={(e) => { e.stopPropagation(); selectStage(stage); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs font-medium",
                "hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
                idx === activeIdx && "bg-muted",
                stage.isLost && "text-destructive"
              )}
            >
              {stage.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
