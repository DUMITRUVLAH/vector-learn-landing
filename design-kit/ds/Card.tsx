/**
 * HR365-002 — Card family.
 *
 * Two surfaces:
 *  - default    → `rounded-lg` (14px), 1px border, `shadow-sm`. Forms, panels.
 *  - dashboard  → `rounded-2xl` (16px), 60% border, NO shadow. Tiles, widgets.
 *
 * `hover` opts into the HR365 lift: shadow-lg + translate-y(-2px).
 */
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "dashboard";
  hover?: boolean;
  children: ReactNode;
}

export function Card({ tone = "default", hover = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground border",
        tone === "dashboard"
          ? "rounded-2xl border-border/60"
          : "rounded-lg border-border shadow-sm",
        hover &&
          "transition-[box-shadow,transform] duration-200 ease-out hover:shadow-lg hover:-translate-y-0.5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold leading-none tracking-tight", className)} {...rest}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6 pt-0", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...rest}>
      {children}
    </div>
  );
}
