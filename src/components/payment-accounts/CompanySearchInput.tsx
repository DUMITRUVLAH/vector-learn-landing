import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Building2 } from "lucide-react";
import {
  searchRegistry,
  getRegistryCompany,
  type RegistryCompany,
  type RegistryCompanyDetail,
} from "@/lib/api/paymentAccounts";
import { cn } from "@/lib/utils";

interface CompanySearchInputProps {
  /** Called when a company is picked (full detail fetched from the registry). */
  onSelect: (company: RegistryCompanyDetail) => void;
  placeholder?: string;
}

/**
 * CONT-PLATA: debounced autocomplete over the contafirm.md registry.
 * Searches by name or IDNO; on pick, fetches full detail for autofill.
 */
export function CompanySearchInput({ onSelect, placeholder }: CompanySearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegistryCompany[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pickingIdno, setPickingIdno] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await searchRegistry(q);
        setResults(res.data);
        setOpen(true);
      } catch {
        setError("Registrul nu a putut fi accesat. Încearcă din nou.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handlePick(company: RegistryCompany) {
    if (!company.idno) {
      setError("Această companie nu are IDNO și nu poate fi importată.");
      return;
    }
    setPickingIdno(company.idno);
    setError(null);
    try {
      const res = await getRegistryCompany(company.idno);
      onSelect(res.data);
      setOpen(false);
      setQuery(company.name);
    } catch {
      setError("Nu s-au putut prelua detaliile companiei.");
    } finally {
      setPickingIdno(null);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? "Caută după denumire sau IDNO…"}
          aria-label="Caută companie în registru"
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-border bg-popover py-1 shadow-lg">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handlePick(c)}
                disabled={pickingIdno !== null}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60",
                  pickingIdno === c.idno && "bg-muted"
                )}
              >
                <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.idno ? `IDNO ${c.idno}` : "fără IDNO"}
                    {c.city ? ` · ${c.city}` : ""}
                    {c.status ? ` · ${c.status}` : ""}
                  </span>
                </span>
                {pickingIdno === c.idno && (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-lg">
          Nicio companie găsită pentru „{query}".
        </div>
      )}
    </div>
  );
}
