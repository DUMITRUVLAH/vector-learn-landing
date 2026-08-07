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
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
export type ButtonSize = "sm" | "default" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border-input bg-background text-foreground hover:bg-accent/10",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "text-foreground hover:bg-accent/10",
  link: "text-primary underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3",
  default: "h-10 px-4",
  lg: "h-11 px-8",
  icon: "h-10 w-10 p-0",
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
