/**
 * HR365-002 — Avatar: initials on a tint derived from the name, so the same
 * person keeps the same colour everywhere without storing one.
 *
 * `shape="square"` (rounded-xl) is the sidebar/user-card variant; `circle` is
 * the default used in lists and tables.
 */
import { chipStyle, chipToneFor } from "./tones";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "default" | "lg";
  shape?: "circle" | "square";
  className?: string;
}

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  default: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

/** "Ana Maria Ionescu" → "AI"; falls back to "?" for an empty name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

export function Avatar({
  name,
  src,
  size = "default",
  shape = "circle",
  className,
}: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden font-semibold",
        shape === "square" ? "rounded-xl" : "rounded-full",
        SIZES[size],
        className,
      )}
      style={src ? undefined : chipStyle(chipToneFor(name))}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}
