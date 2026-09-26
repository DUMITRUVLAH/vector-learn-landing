// Afișarea responsabililor: inițiale colorate stabil per persoană, suprapuse.
// Peste `max` persoane apare un „+N" — cardurile Kanban n-au loc pentru cinci
// avatare, iar lista completă e oricum în panoul de detalii.

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { avatarClass, initialsOf } from "@/lib/tasks/meta";
import type { AssignableUser } from "@/lib/tasks/types";

interface AssigneeAvatarsProps {
  userIds: string[];
  index: Record<string, AssignableUser>;
  size?: "xs" | "sm" | "md";
  max?: number;
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
} as const;

export function AssigneeAvatars({ userIds, index, size = "sm", max = 3, className }: AssigneeAvatarsProps) {
  const { t } = useTasksT();
  if (!userIds || userIds.length === 0) return null;
  const shown = userIds.slice(0, max);
  const overflow = userIds.length - shown.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex -space-x-1.5", className)}>
        {shown.map((id) => {
          const person = index[id];
          // Persoană nerezolvată: „?" gri, nu inițiale derivate dintr-un text de
          // rezervă. `initialsOf('—')` întorcea chiar liniuța, iar pe card arăta
          // ca un buton de ștergere.
          const name = person?.full_name;
          // Funcția, sau emailul când funcția nu e cunoscută.
          const secondary = person?.job_title || person?.email;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <span
                  role="img"
                  aria-label={name ?? t("board.detail.unknownUser")}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-background",
                    SIZE_CLASSES[size],
                    name ? avatarClass(id) : "bg-muted text-muted-foreground",
                  )}
                >
                  {name ? initialsOf(name) : "?"}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-medium">{name ?? t("board.detail.unknownUser")}</p>
                {secondary && <p className="text-[10px] text-muted-foreground">{secondary}</p>}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {overflow > 0 && (
          <span
            role="img"
            aria-label={t("board.overview.andMore", { count: overflow })}
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background",
              SIZE_CLASSES[size],
            )}
          >
            +{overflow}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}
