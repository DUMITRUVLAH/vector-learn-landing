/**
 * Combobox — o listă lungă în care scrii ca să găsești, iar rezultatele se văd pe loc.
 *
 * De ce există (owner, 2026-08-29, pe „Cod bugetar"): tiparul de dinainte era o casetă de
 * căutare DEASUPRA unui `<select>` nativ. Filtrarea funcționa, dar se aplica opțiunilor
 * ascunse — scriai „projec" și pe ecran nu se schimba nimic („aici nu se întâmplă nimic dacă
 * caut, doar în dropdown"). O căutare ale cărei rezultate nu se văd nu e o căutare.
 *
 * Aici, un singur control: câmpul ARATĂ ce e ales, iar când scrii se deschide lista filtrată
 * sub el. Tastatura merge (↑ ↓ Enter Esc), fiecare opțiune e un buton de 44px, iar starea
 * „niciun rezultat" e scrisă, nu tăcută.
 *
 * Rămâne pentru liste lungi (coduri bugetare, evenimente). Pentru 3–5 opțiuni, `Select`-ul
 * nativ e mai bun — mai ales pe telefon, unde deschide selectorul sistemului.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Text secundar, căutabil și el (ex. denumirea din spatele unui cod). */
  hint?: string;
}

export interface ComboboxProps {
  id?: string;
  value: string;
  options: ComboboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ce se scrie când filtrul nu întoarce nimic. */
  emptyText?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

const CONTROL =
  "h-11 w-full rounded-md border border-input bg-background pl-3 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50";

export function Combobox({
  id,
  value,
  options,
  onChange,
  placeholder,
  emptyText = "Niciun rezultat",
  disabled,
  className,
  ...rest
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const listId = `${id ?? "cb"}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ro");
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLocaleLowerCase("ro").includes(q));
  }, [options, query]);

  // Dacă valoarea aleasă dispare din listă (s-a schimbat proiectul, de pildă), câmpul nu
  // trebuie să rămână cu un text care nu mai corespunde cu nimic.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open, value]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
    setCursor(-1);
  };

  return (
    <div
      className={cn("relative", className)}
      onBlur={(e) => {
        // Se închide doar când focusul chiar pleacă din combobox — un click pe o opțiune
        // trece întâi prin blur-ul inputului, iar închiderea acolo ar anula click-ul.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        className={CONTROL}
        placeholder={placeholder}
        value={open ? query : selected?.label ?? ""}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((i) => Math.min(i + 1, filtered.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((i) => Math.max(i - 1, -1));
            return;
          }
          if (e.key === "Enter" && open && cursor >= 0 && filtered[cursor]) {
            e.preventDefault();
            choose(filtered[cursor].value);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        {...rest}
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
        {selected && !disabled && (
          <button
            type="button"
            aria-label="Șterge selecția"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              choose("");
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  "block w-full border-b border-border/50 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60 min-h-[44px]",
                  i === cursor && "bg-muted/60",
                  o.value === value && "font-medium"
                )}
              >
                <span className="block text-sm text-foreground">{o.label}</span>
                {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
