/**
 * HR365-002 — SidebarNavItem: one row of the 260px module sidebar.
 *
 * Pastel icon chip + 13px label. Active = solid primary fill with a coloured
 * halo (`shadow-primary`) and the chip inverted to white-on-primary; idle =
 * 65% foreground. `sub` is the tighter nested variant (24px chip, 12px label).
 *
 * Renders a router `<Link>` when given `href` — nav rows must stay real links
 * so middle-click / open-in-new-tab work.
 */
import type { ReactNode } from "react";
import { Link } from "@/router/HashRouter";
import { PastelIcon } from "./PastelIcon";
import type { ChipTone } from "./tones";
import { cn } from "@/lib/utils";

export interface SidebarNavItemProps {
  label: string;
  icon: ReactNode;
  tone?: ChipTone;
  active?: boolean;
  /** Notification count rendered as a pill on the right. */
  count?: number;
  /** Nested (second-level) row. */
  sub?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function SidebarNavItem({
  label,
  icon,
  tone = "sky",
  active = false,
  count,
  sub = false,
  href,
  onClick,
  className,
}: SidebarNavItemProps) {
  const classes = cn(
    "flex w-full items-center text-left font-medium transition-all duration-200 ease-out no-underline hover:no-underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
    sub ? "gap-2.5 rounded-sm px-2.5 py-2 text-xs" : "gap-3 rounded-xl px-3 py-2.5 text-nav",
    active
      ? "bg-primary text-primary-foreground shadow-primary"
      : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    className,
  );

  const inner = (
    <>
      <PastelIcon tone={tone} size={sub ? 24 : 28} inverted={active}>
        {icon}
      </PastelIcon>
      <span className="flex-1 truncate">{label}</span>
      {count && count > 0 ? (
        <span
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-3xs font-semibold",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={classes} aria-current={active ? "page" : undefined}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes} aria-current={active ? "page" : undefined}>
      {inner}
    </button>
  );
}
