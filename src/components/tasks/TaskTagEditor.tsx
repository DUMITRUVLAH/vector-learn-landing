// Editorul de etichete.
//
// Formatul stocat („label" sau „label|culoare") e cel introdus de pagina veche
// `/tasks` — îl păstrăm ca aceleași etichete să se vadă în ambele interfețe cât
// timp coexistă. Culorile sunt inline, nu clase Tailwind: clasele generate
// dinamic (`bg-${color}-100`) sunt eliminate de purge la build.

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { TAG_COLORS, normalizeTagLabel, parseTag, serializeTag } from "@/lib/tasks/tags";

interface TaskTagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  className?: string;
}

export function TaskTagEditor({ value, onChange, className }: TaskTagEditorProps) {
  const { t } = useTasksT();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("gray");

  const add = () => {
    const clean = normalizeTagLabel(label);
    if (!clean) return;
    const exists = value.some((raw) => parseTag(raw).label.toLowerCase() === clean.toLowerCase());
    if (!exists) onChange([...value, serializeTag({ label: clean, color })]);
    setLabel("");
    setColor("gray");
    setOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {value.map((raw) => {
        const tag = parseTag(raw);
        const palette = TAG_COLORS[tag.color] ?? TAG_COLORS.gray;
        return (
          <span
            key={raw}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: palette.bg, color: palette.text }}
          >
            {tag.label}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== raw))}
              className="opacity-60 transition-opacity hover:opacity-100"
              aria-label={t("board.actions.delete")}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t("board.tag.add")}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3 p-3" align="start">
          <Input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t("board.tag.placeholder")}
            aria-label={t("board.tag.placeholder")}
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(TAG_COLORS).map(([key, palette]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(key)}
                aria-label={key}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-transform",
                  color === key ? "scale-110 border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: palette.swatch }}
              />
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={add} disabled={!label.trim()}>
            {t("board.tag.confirm")}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
