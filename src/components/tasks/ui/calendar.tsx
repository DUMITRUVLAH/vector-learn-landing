/**
 * Calendar — selectorul de zi din popover-ele de termen, cu API-ul `react-day-picker` pe care
 * îl folosesc componentele portate (`mode="single"`, `selected`, `onSelect`, `initialFocus`,
 * `locale`) și aspectul din HR365.
 *
 * Tastatura, ca într-o grilă de calendar: săgețile mută ziua (±1 / ±7), PageUp/PageDown luna,
 * Home/End începutul/sfârșitul săptămânii, Enter alege. Săptămâna începe după locale (luni în RO).
 * Reapăsarea zilei deja alese o deselectează — la fel ca `react-day-picker` în modul „single".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  type Locale,
} from "date-fns";
import { ro } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  mode?: "single";
  selected?: Date | null;
  onSelect?: (date: Date | undefined) => void;
  initialFocus?: boolean;
  locale?: Locale;
  defaultMonth?: Date;
  disabled?: (date: Date) => boolean;
  className?: string;
}

const NAV_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-transparent p-0 opacity-50 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Calendar({
  selected,
  onSelect,
  initialFocus,
  locale = ro,
  defaultMonth,
  disabled,
  className,
}: CalendarProps) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(selected ?? defaultMonth ?? new Date()));
  const [focused, setFocused] = useState<Date>(() => selected ?? new Date());
  const gridRef = useRef<HTMLDivElement>(null);
  const weekStartsOn = locale.options?.weekStartsOn ?? 1;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, weekStartsOn]);

  const weekdays = useMemo(
    () => days.slice(0, 7).map((d) => ({ short: format(d, "EEEEEE", { locale }), long: format(d, "EEEE", { locale }) })),
    [days, locale],
  );

  const focusDay = (date: Date) => {
    setFocused(date);
    if (!isSameMonth(date, month)) setMonth(startOfMonth(date));
  };

  // Focusul urmează ziua „activă" — după mutarea cu săgețile și, cu `initialFocus`, la deschidere.
  const [armed, setArmed] = useState(Boolean(initialFocus));
  useEffect(() => {
    if (!armed) return;
    const key = format(focused, "yyyy-MM-dd");
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)?.focus();
  }, [focused, month, armed]);

  const choose = (date: Date) => {
    if (disabled?.(date)) return;
    onSelect?.(selected && isSameDay(selected, date) ? undefined : date);
  };

  return (
    <div className={cn("p-3", className)}>
      <div className="relative flex items-center justify-center pt-1">
        <button
          type="button"
          className={cn(NAV_BUTTON, "absolute left-1")}
          onClick={() => setMonth((m) => addMonths(m, -1))}
          aria-label={format(addMonths(month, -1), "LLLL yyyy", { locale })}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="text-sm font-medium capitalize" aria-live="polite">
          {format(month, "LLLL yyyy", { locale })}
        </span>
        <button
          type="button"
          className={cn(NAV_BUTTON, "absolute right-1")}
          onClick={() => setMonth((m) => addMonths(m, 1))}
          aria-label={format(addMonths(month, 1), "LLLL yyyy", { locale })}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        ref={gridRef}
        role="grid"
        className="mt-4 w-full"
        onKeyDown={(event) => {
          const moves: Record<string, () => Date> = {
            ArrowLeft: () => addDays(focused, -1),
            ArrowRight: () => addDays(focused, 1),
            ArrowUp: () => addDays(focused, -7),
            ArrowDown: () => addDays(focused, 7),
            PageUp: () => addMonths(focused, -1),
            PageDown: () => addMonths(focused, 1),
            Home: () => startOfWeek(focused, { weekStartsOn }),
            End: () => endOfWeek(focused, { weekStartsOn }),
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          setArmed(true);
          focusDay(move());
        }}
      >
        <div role="row" className="flex">
          {weekdays.map((w) => (
            <span
              key={w.long}
              role="columnheader"
              aria-label={w.long}
              className="w-9 rounded-md text-center text-[0.8rem] font-normal text-muted-foreground"
            >
              {w.short}
            </span>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, week) => (
          <div role="row" key={week} className="mt-2 flex w-full">
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const isSelected = !!selected && isSameDay(day, selected);
              const outside = !isSameMonth(day, month);
              const isDisabled = disabled?.(day) ?? false;
              const tabbable = isSameDay(day, focused);
              return (
                <div role="gridcell" key={day.toISOString()} className="relative h-9 w-9 p-0 text-center text-sm">
                  <button
                    type="button"
                    data-day={format(day, "yyyy-MM-dd")}
                    tabIndex={tabbable ? 0 : -1}
                    aria-selected={isSelected}
                    aria-label={format(day, "PPPP", { locale })}
                    disabled={isDisabled}
                    onClick={() => {
                      setFocused(day);
                      choose(day);
                    }}
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-md p-0 text-sm font-normal transition-colors hover:bg-accent/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isToday(day) && !isSelected && "bg-accent/10 text-primary",
                      outside && "text-muted-foreground opacity-50",
                      isSelected &&
                        "bg-primary text-primary-foreground opacity-100 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                      isDisabled && "text-muted-foreground opacity-50",
                    )}
                  >
                    {format(day, "d")}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
