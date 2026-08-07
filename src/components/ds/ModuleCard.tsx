/**
 * HR365-002 — ModuleCard: the launcher tile.
 *
 * A flat saturated-100 pastel card, monochrome text in the matching -700 ink,
 * arrow that slides on hover. Renders as a router `<Link>` when given `href`,
 * as a `<button>` when given `onClick`.
 */
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/router/HashRouter";
import { moduleStyle, type ModuleTone } from "./tones";
import { cn } from "@/lib/utils";

export interface ModuleCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  tone?: ModuleTone;
  /** Small pill in the top-right corner ("Nou", "Beta"). */
  badge?: string;
  cta?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const SHELL = "group relative block w-full rounded-2xl p-5 text-left";
const MOTION =
  "transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ModuleCard({
  title,
  description,
  icon,
  tone = "indigo",
  badge,
  cta = "Deschide",
  href,
  onClick,
  disabled = false,
  className,
}: ModuleCardProps) {
  const inner = (
    <>
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full bg-white/60 px-2 py-0.5 text-3xs font-semibold dark:bg-white/10">
          {badge}
        </span>
      ) : null}
      <span className="mb-4 block" aria-hidden="true">
        {icon}
      </span>
      <h3 className="mb-1 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mb-5 text-sm leading-relaxed opacity-70">{description}</p>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold transition-[gap] duration-200 ease-out group-hover:gap-2.5">
        {cta}
        {!disabled && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </span>
    </>
  );

  const style = moduleStyle(tone);

  if (href && !disabled) {
    return (
      <Link
        to={href}
        aria-label={`${title} — ${cta}`}
        className={cn(SHELL, MOTION, "no-underline hover:no-underline", className)}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${title} — ${cta}`}
      className={cn(SHELL, !disabled && MOTION, disabled && "cursor-not-allowed opacity-60", className)}
      style={style}
    >
      {inner}
    </button>
  );
}
