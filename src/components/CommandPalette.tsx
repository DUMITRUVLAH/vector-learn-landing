/**
 * POLISH-001: Global command palette — Cmd+K / Ctrl+K.
 *
 * Sources (priority order):
 * 1. Students — /api/students?search=<q>&limit=5
 * 2. Leads    — /api/leads?view=list&search=<q>&pageSize=5
 * 3. Pages    — hardcoded nav pages (no API needed)
 *
 * Keyboard: ArrowUp/ArrowDown navigate, Enter selects, Escape closes.
 * Accessibility: role="combobox", aria-expanded, aria-activedescendant.
 * Dark mode: semantic tokens only — no hardcoded hex values.
 */
import { useEffect, useRef, useState, useCallback, useId } from "react";
import { Search, Users, TrendingUp, LayoutDashboard, Sun, Calendar, CreditCard, FileText, BarChart3, Settings, GraduationCap, X } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { listStudents, type Student } from "@/lib/api/students";
import { fetchLeadsList, type Lead } from "@/lib/api/leads";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultKind = "student" | "lead" | "page";

interface SearchResult {
  id: string;
  kind: ResultKind;
  label: string;
  sublabel?: string;
  href: string;
}

// ─── Default pages shown when query is empty ──────────────────────────────────

const DEFAULT_PAGES: SearchResult[] = [
  { id: "page-dashboard", kind: "page", label: "Dashboard", sublabel: "/app", href: "/app" },
  { id: "page-azi",       kind: "page", label: "Azi",       sublabel: "CRM Today", href: "/app/leads/today" },
  { id: "page-elevi",     kind: "page", label: "Elevi",     sublabel: "Listă elevi", href: "/app/students" },
  { id: "page-leads",     kind: "page", label: "Leads",     sublabel: "Pipeline CRM", href: "/app/leads" },
  { id: "page-plati",     kind: "page", label: "Plăți",     sublabel: "Gestiune plăți", href: "/app/payments" },
];

const ALL_PAGES: SearchResult[] = [
  { id: "page-dashboard", kind: "page", label: "Dashboard",     sublabel: "/app", href: "/app" },
  { id: "page-azi",       kind: "page", label: "Azi",           sublabel: "CRM Today", href: "/app/leads/today" },
  { id: "page-leads",     kind: "page", label: "Leads",         sublabel: "Pipeline CRM", href: "/app/leads" },
  { id: "page-elevi",     kind: "page", label: "Elevi",         sublabel: "Listă elevi", href: "/app/students" },
  { id: "page-orar",      kind: "page", label: "Orar",          sublabel: "Program lecții", href: "/app/schedule" },
  { id: "page-plati",     kind: "page", label: "Plăți",         sublabel: "Gestiune plăți", href: "/app/payments" },
  { id: "page-facturi",   kind: "page", label: "Facturi",       sublabel: "Facturare", href: "/app/invoices" },
  { id: "page-rapoarte",  kind: "page", label: "Rapoarte",      sublabel: "Analytics & rapoarte", href: "/app/analytics/crm" },
  { id: "page-setari",    kind: "page", label: "Setări",        sublabel: "Configurări cont", href: "/app/settings" },
  { id: "page-profesori", kind: "page", label: "Profesori",     sublabel: "Gestiune profesori", href: "/app/teachers" },
];

// ─── Icon per kind ────────────────────────────────────────────────────────────

function KindIcon({ kind, href }: { kind: ResultKind; href: string }) {
  if (kind === "student") return <Users className="h-4 w-4 text-blue-500" aria-hidden="true" />;
  if (kind === "lead")    return <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden="true" />;

  // Page icon based on href
  if (href.includes("/schedule")) return <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/payments") || href.includes("/invoices")) return <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/analytics")) return <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/settings")) return <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/teachers")) return <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/leads/today")) return <Sun className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/leads")) return <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/students")) return <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  if (href.includes("/contracts")) return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  return <LayoutDashboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

// ─── Stage label helper ───────────────────────────────────────────────────────

const STAGE_LABEL: Record<string, string> = {
  new: "Nou",
  contacted: "Contactat",
  trial: "Trial",
  paid: "Plătit",
  lost: "Pierdut",
};

// ─── Main component ───────────────────────────────────────────────────────────

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>(DEFAULT_PAGES);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults(DEFAULT_PAGES);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  // Debounced search — 200ms
  useEffect(() => {
    if (!isOpen) return;

    const q = query.trim();

    if (q.length < 2) {
      // Show page suggestions only when < 2 chars
      const pageMatches = q.length === 0
        ? DEFAULT_PAGES
        : ALL_PAGES.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
      setResults(pageMatches);
      setActiveIdx(0);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [studRes, leadRes] = await Promise.allSettled([
          listStudents({ search: q, limit: 5, status: "active" }),
          fetchLeadsList({ search: q, pageSize: 5 }),
        ]);

        const studentResults: SearchResult[] = studRes.status === "fulfilled"
          ? studRes.value.items.map((s: Student) => ({
              id: `student-${s.id}`,
              kind: "student" as const,
              label: s.fullName,
              sublabel: s.phone ?? s.email ?? "Elev activ",
              href: `/app/students/${s.id}`,
            }))
          : [];

        const leadResults: SearchResult[] = leadRes.status === "fulfilled"
          ? leadRes.value.items.map((l: Lead) => ({
              id: `lead-${l.id}`,
              kind: "lead" as const,
              label: l.fullName,
              sublabel: STAGE_LABEL[l.stage] ?? l.stage,
              href: `/app/leads/${l.id}`,
            }))
          : [];

        // Page matches (no API)
        const pageMatches = ALL_PAGES.filter((p) =>
          p.label.toLowerCase().includes(q.toLowerCase()) ||
          (p.sublabel ?? "").toLowerCase().includes(q.toLowerCase())
        ).slice(0, 3);

        if (!controller.signal.aborted) {
          setResults([...studentResults, ...leadResults, ...pageMatches]);
          setActiveIdx(0);
        }
      } catch {
        // non-fatal — keep previous results
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % Math.max(results.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1));
      } else if (e.key === "Enter" && results[activeIdx]) {
        e.preventDefault();
        navigate(results[activeIdx].href);
        onClose();
      }
    },
    [results, activeIdx, navigate, onClose],
  );

  // Scroll active item into view (guard against jsdom missing scrollIntoView)
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector(`[data-active="true"]`) as HTMLElement | null;
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  const activeItemId = results[activeIdx] ? `${uid}-item-${activeIdx}` : undefined;

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Caută rapid"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-autocomplete="list"
            aria-controls={`${uid}-listbox`}
            aria-activedescendant={activeItemId}
            type="text"
            placeholder="Caută elevi, leads, pagini…"
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground outline-none text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && (
            <span className="text-xs text-muted-foreground animate-pulse">se caută…</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide paleta de comenzi"
            className="touch-target rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results list */}
        <ul
          ref={listRef}
          id={`${uid}-listbox`}
          role="listbox"
          aria-label="Rezultate căutare"
          className="max-h-72 overflow-y-auto py-1"
        >
          {results.length === 0 && !loading && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Niciun rezultat pentru „{query}"
            </li>
          )}
          {results.map((item, idx) => {
            const isActive = idx === activeIdx;
            return (
              <li
                key={item.id}
                id={`${uid}-item-${idx}`}
                role="option"
                aria-selected={isActive}
                data-active={isActive ? "true" : undefined}
                onClick={() => { navigate(item.href); onClose(); }}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <KindIcon kind={item.kind} href={item.href} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>
                  )}
                </div>
                {item.kind === "page" && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium shrink-0">
                    Pagina
                  </span>
                )}
                {item.kind === "student" && (
                  <span className="text-[10px] uppercase tracking-wider text-blue-500 font-medium shrink-0">
                    Elev
                  </span>
                )}
                {item.kind === "lead" && (
                  <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium shrink-0">
                    Lead
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navighează</span>
          <span><kbd className="font-mono">↵</kbd> selectează</span>
          <span><kbd className="font-mono">Esc</kbd> închide</span>
        </div>
      </div>
    </div>
  );
}
