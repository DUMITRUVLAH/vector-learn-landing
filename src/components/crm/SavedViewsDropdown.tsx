import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, ChevronDown, Loader2, X } from "lucide-react";
import {
  listSavedViews,
  createSavedView,
  deleteSavedView,
  type SavedView,
  type SavedViewFilters,
} from "@/lib/api/savedViews";
import { cn } from "@/lib/utils";

interface SavedViewsDropdownProps {
  /** Currently active filters — used to populate the "save current filters" form */
  activeFilters: SavedViewFilters;
  /** Whether any filter is non-default (controls visibility of "Salvează filtrul" button) */
  hasActiveFilters: boolean;
  /** Called when user clicks a saved view to apply its filters */
  onApplyView: (filters: SavedViewFilters) => void;
  /** Error handler */
  onError: (msg: string) => void;
}

/**
 * CRM-119 — Saved views dropdown.
 * Shows a button to save the current filter set, and a dropdown to list/apply/delete saved views.
 */
export function SavedViewsDropdown({
  activeFilters,
  hasActiveFilters,
  onApplyView,
  onError,
}: SavedViewsDropdownProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const loadViews = async () => {
    setLoading(true);
    try {
      const res = await listSavedViews();
      setViews(res.views);
    } catch {
      onError("Nu pot încărca vizualizările salvate");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen((prev) => !prev);
    if (!open) void loadViews();
  };

  const handleSave = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await createSavedView({ name: newName.trim(), filters: activeFilters });
      setViews((prev) => [res.view, ...prev]);
      setNewName("");
      setShowSaveForm(false);
    } catch {
      onError("Nu pot salva vizualizarea");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSavedView(id);
      setViews((prev) => prev.filter((v) => v.id !== id));
    } catch {
      onError("Nu pot șterge vizualizarea");
    } finally {
      setDeletingId(null);
    }
  };

  const handleApply = (view: SavedView) => {
    onApplyView(view.filters);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 relative" ref={menuRef}>
      {/* Save current filter button — only shown when filters are active */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            setShowSaveForm(true);
            setOpen(true);
            if (!views.length) void loadViews();
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold hover:bg-muted"
          aria-label="Salvează filtrul curent ca vizualizare"
          title="Salvează filtrul curent"
        >
          <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Salvează filtrul
        </button>
      )}

      {/* Dropdown toggle */}
      <div className="relative">
        <button
          type="button"
          onClick={handleOpen}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-semibold hover:bg-muted"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Vizualizări salvate"
        >
          Vizualizări
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div
            className="absolute top-full right-0 z-40 mt-1 w-72 rounded-xl border border-border bg-card shadow-xl"
            role="listbox"
            aria-label="Vizualizări salvate"
          >
            {/* Save form (when triggered) */}
            {showSaveForm && (
              <div className="border-b border-border p-3">
                <p className="text-xs font-semibold mb-2">Salvează filtrul curent</p>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nume vizualizare..."
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Nume vizualizare nouă"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleSave();
                      if (e.key === "Escape") setShowSaveForm(false);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !newName.trim()}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    aria-label="Confirmă salvarea vizualizării"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvează"}
                  </button>
                </div>
              </div>
            )}

            {/* Views list */}
            <div className="max-h-64 overflow-y-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  <span className="text-xs">Se încarcă...</span>
                </div>
              ) : views.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Nicio vizualizare salvată încă.
                </p>
              ) : (
                views.map((view) => (
                  <div
                    key={view.id}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted group"
                    role="option"
                    aria-selected="false"
                  >
                    <button
                      type="button"
                      onClick={() => handleApply(view)}
                      className="flex-1 text-left text-xs font-medium truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={`Aplică vizualizarea: ${view.name}`}
                    >
                      {view.name}
                      {view.isPublic && (
                        <span className="ml-1.5 text-[9px] text-muted-foreground">(public)</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(view.id)}
                      disabled={deletingId === view.id}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 disabled:opacity-50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Șterge vizualizarea: ${view.name}`}
                    >
                      {deletingId === view.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            {!showSaveForm && hasActiveFilters && (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveForm(true);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Salvează filtrul curent ca vizualizare nouă"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  Salvează filtrul curent
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
