/**
 * Comutatorul de limbă RO/EN.
 *
 * Două forme, aceeași stare:
 * - `segmented` (implicit) — două butoane lipite, limba activă evidențiată. Ambele
 *   opțiuni se văd deodată, deci nimeni nu trebuie să deschidă un meniu ca să afle
 *   că engleza există. Bun în antetul aplicației și în navbar-ul de landing.
 * - `compact` — un singur buton care comută pe cealaltă limbă. Pentru bare înguste.
 *
 * Accesibilitate: `role="group"` cu nume, `aria-pressed` pe fiecare opțiune (nu
 * `aria-current`, fiindcă sunt comenzi, nu navigare), ținte de 44 px pe telefon,
 * și `lang` pe fiecare etichetă — altfel cititorul de ecran pronunță „English"
 * cu fonetică românească.
 *
 * Tokeni semantici, fără hex; merge în light și dark.
 */
import { Globe } from "lucide-react";
import { LANGS, LANG_LABELS, LANG_SHORT, useT, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface LanguageSwitcherProps {
  variant?: "segmented" | "compact";
  /** Ascunde globul când bara e deja plină de pictograme. */
  showIcon?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  variant = "segmented",
  showIcon = true,
  className,
}: LanguageSwitcherProps) {
  const { t, lang, setLang } = useT();

  if (variant === "compact") {
    const next: Lang = lang === "ro" ? "en" : "ro";
    return (
      <button
        type="button"
        onClick={() => setLang(next)}
        title={t("common.lang.switchTo", { lang: LANG_LABELS[next] })}
        aria-label={t("common.lang.switchTo", { lang: LANG_LABELS[next] })}
        className={cn(
          "inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5",
          "text-sm font-medium text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "max-sm:h-11",
          className,
        )}
      >
        {showIcon ? <Globe className="h-4 w-4" aria-hidden="true" /> : null}
        <span lang={next}>{LANG_SHORT[next]}</span>
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t("common.lang.label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className,
      )}
    >
      {showIcon ? (
        <Globe className="mx-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : null}
      {LANGS.map((option) => {
        const active = option === lang;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={active}
            onClick={() => setLang(option)}
            title={LANG_LABELS[option]}
            className={cn(
              "inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-[calc(var(--radius)-6px)] px-2",
              "text-xs font-semibold uppercase tracking-wide transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "max-sm:h-10 max-sm:min-w-11",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {LANG_SHORT[option]}
            {/* Numele întreg pentru cititorul de ecran: „RO" singur nu spune nimic. */}
            <span className="sr-only"> — {LANG_LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
