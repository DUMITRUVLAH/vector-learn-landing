/**
 * HR365-002 — Button.
 *
 * Heights 36/40/44px (the `lg` size doubles as the WCAG 44px touch target),
 * `rounded-md` (12px), medium weight, 8px gap to a leading icon.
 * Renders a router `<Link>` when given `href` so nav buttons stay real links.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "@/router/HashRouter";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "destructive"
  /** Approve / confirm. Paired with `warning` and `destructive` wherever a
   *  decision has three distinguishable outcomes (PAR approvals are the reason
   *  these exist — mapping them onto ad-hoc `bg-green-600 text-white` was how
   *  eight different greens ended up in the module). */
  | "success"
  | "warning"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  outline: "border-input bg-background text-foreground hover:bg-accent/10",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-foreground hover:bg-accent/10",
  link: "text-primary underline-offset-4 hover:underline",
};

/**
 * MOB-002 — pe telefon, fiecare buton este cel puțin 44×44.
 *
 * Auditul mobil a numărat 246 de ținte sub 44×44 pe 17 rute (CLAUDE.md §3.3 / WCAG 2.1 AA).
 * Cauza nu era o pagină anume, ci chiar valorile de aici: `sm` = 36 px, `default` și `icon` = 40 px.
 * Reparate în acest fișier, se repară peste tot deodată.
 *
 * `max-sm:` (sub 640 px = telefoane) ridică înălțimea la 44 px doar acolo unde ținta e degetul.
 * Pe desktop, unde ținta e cursorul, densitatea proiectată de design system rămâne neschimbată —
 * de asta nu am mărit pur și simplu valorile de bază.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 max-sm:h-11",
  default: "h-10 px-4 max-sm:h-11",
  lg: "h-11 px-8",
  icon: "h-10 w-10 p-0 max-sm:h-11 max-sm:w-11",
};

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium leading-none transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a router link styled as this button. */
  href?: string;
  children: ReactNode;
}

export function Button({
  variant = "default",
  size = "default",
  href,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(
    BASE,
    VARIANTS[variant],
    variant === "link" ? "h-auto p-0" : SIZES[size],
    className,
  );

  if (href) {
    return (
      <Link to={href} className={cn(classes, "no-underline")} aria-label={rest["aria-label"]}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
