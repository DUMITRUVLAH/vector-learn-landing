/**
 * POLISH-001: CommandPalette — global search + command palette triggered by Cmd+K / Ctrl+K.
 * Searches students and leads, plus provides navigation shortcuts.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Users, UserCheck, LayoutDashboard, Calendar, CreditCard, BarChart3, Settings, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { listStudents } from "@/lib/api/students";
import { fetchLeadsList } from "@/lib/api/leads";
import { useRouter } from "@/router/HashRouter";

interface NavItem {
  type: "nav";
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface StudentResult {
  type: "student";
  id: string;
  label: string;
  subtitle: string;
}

interface LeadResult {
  type: "lead";
  id: string;
  label: string;
  subtitle: string;
}

type PaletteItem = NavItem | StudentResult | LeadResult;

const NAV_ITEMS: NavItem[] = [
  { type: "nav", label: "Dashboard", href: "/app", icon: <LayoutDashboard className="h-4 w-4" /> },
  { type: "nav", label: "Elevi", href: "/app/students", icon: <Users className="h-4 w-4" /> },
  { type: "nav", label: "CRM / Leaduri", href: "/app/leads", icon: <UserCheck className="h-4 w-4" /> },
  { type: "nav", label: "Orar", href: "/app/schedule", icon: <Calendar className="h-4 w-4" /> },
  { type: "nav", label: "Facturi", href: "/app/invoices", icon: <CreditCard className="h-4 w-4" /> },
  { type: "nav", label: "Rapoarte", href: "/app/analytics", icon: <BarChart3 className="h-4 w-4" /> },
  { type: "nav", label: "Setări", href: "/app/settings/team", icon: <Settings className="h-4 w-4" /> },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debouncedQuery = useDebouncedValue(query, 200);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (!isOpen) return;

    if (debouncedQuery.length < 2) {
      setResults(NAV_ITEMS.slice(0, 5));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      listStudents({ search: debouncedQuery, limit: 5 }).catch(() => ({ items: [] })),
      fetchLeadsList({ search: debouncedQuery, pageSize: 5 }).catch(() => ({ items: [] })),
    ]).then(([studentsRes, leadsRes]) => {
      if (cancelled) return;

      const studentItems: StudentResult[] = (studentsRes.items ?? []).map((s) => ({
        type: "student" as const,
        id: s.id,
        label: s.fullName,
        subtitle: s.status === "active" ? "Elev activ" : s.status === "trial" ? "Trial" : "Arhivat",
      }));

      const leadItems: LeadResult[] = (leadsRes.items ?? []).map((l) => ({
        type: "lead" as const,
        id: l.id,
        label: l.fullName,
        subtitle: `Lead · ${l.stage}`,
      }));

      setResults([...studentItems, ...leadItems]);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, isOpen]);

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      onClose();
      if (item.type === "nav") {
        navigate(item.href);
      } else if (item.type === "student") {
        navigate(`/app/students/${item.id}`);
      } else if (item.type === "lead") {
        navigate(`/app/leads/${item.id}`);
      }
    },
    [navigate, onClose]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      handleSelect(results[activeIdx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  // Reset active idx when results change
  useEffect(() => {
    setActiveIdx(0);
  }, [results]);

  if (!isOpen) return null;

  const getItemIcon = (item: PaletteItem) => {
    if (item.type === "nav") return item.icon;
    if (item.type === "student") return <Users className="h-4 w-4 text-primary" />;
    return <UserCheck className="h-4 w-4 text-accent" />;
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Căutare rapidă"
    >
      {/* Panel */}
      <div
        className="w-full max-w-xl mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-activedescendant={results[activeIdx] ? `cp-item-${activeIdx}` : undefined}
            aria-autocomplete="list"
            placeholder="Caută elev, lead sau pagină…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && (
            <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
          )}
          <button
            type="button"
            aria-label="Închide paleta"
            onClick={onClose}
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center shrink-0"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Rezultate căutare"
            className="max-h-72 overflow-y-auto py-1"
          >
            {results.map((item, idx) => {
              const isActive = idx === activeIdx;
              return (
                <li
                  key={`${item.type}-${item.type === "nav" ? item.href : item.id}`}
                  id={`cp-item-${idx}`}
                  role="option"
                  aria-selected={isActive}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-sm ${
                    isActive ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <span className="text-muted-foreground shrink-0">{getItemIcon(item)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="font-medium truncate block">{item.label}</span>
                    {item.type !== "nav" && (
                      <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                    )}
                  </span>
                  {item.type === "nav" && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      pagină
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Empty: no results for a non-empty query */}
        {!loading && results.length === 0 && query.length >= 2 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Niciun rezultat pentru „{query}"
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/30">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono">↑↓</kbd> navighează
          </span>
          <span className="text-[10px] text-muted-foreground">
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono">Enter</kbd> selectează
          </span>
          <span className="text-[10px] text-muted-foreground">
            <kbd className="bg-muted rounded px-1 py-0.5 font-mono">Esc</kbd> închide
          </span>
        </div>
      </div>
    </div>
  );
}
