import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  variant?: "default" | "light";
}

export function Logo({ className, variant = "default" }: LogoProps) {
  const textColor = variant === "light" ? "text-white" : "text-foreground";

  return (
    <a href="#" className={cn("inline-flex items-center gap-2.5 group", className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(250,76%,52%)] shadow-md transition-transform group-hover:scale-105">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-white"
          aria-hidden
        >
          <path
            d="M4 4L12 20L20 4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 12H16"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={cn("font-display text-lg font-bold tracking-tight", textColor)}>
        Vector <span className="text-gradient">Learn</span>
      </span>
    </a>
  );
}
