/**
 * CRM Faza 9 — vizualizări salvate: filtrele curente, sub un nume.
 *
 * Portare din crm-vector (`SavedViewsDropdown.tsx`). Două schimbări față de referință:
 *
 * 1. Acolo salvarea cerea numele printr-un `window.prompt` — aici e un câmp în panou, ca
 *    utilizatorul să vadă ce salvează (și fiindcă `prompt` e blocat în unele browsere).
 * 2. Acolo orice vizualizare era a tuturor (baza avea un singur utilizator). Aici e personală
 *    implicit, cu o bifă „Vizibilă echipei" — iar cele ale echipei sunt marcate ca atare.
 */
import { useEffect, useRef, useState } from "react";
import { Bookmark, Loader2, Save, Trash2, Users } from "lucide-react";
import { Button, Checkbox, Input, Label } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  createCrmSavedView,
  deleteCrmSavedView,
  listCrmSavedViews,
  type CrmSavedView,
  type CrmSavedViewFilters,
} from "@/lib/api/crm";

export interface SavedViewsMenuProps {
  /** Filtrele afișate acum — ce se salvează la „Salvează filtrarea curentă". */
  currentFilters: CrmSavedViewFilters;
  onApply: (filters: CrmSavedViewFilters) => void;
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
}

export function SavedViewsMenu({ currentFilters, onApply, onToast }: SavedViewsMenuProps) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<CrmSavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Lista se cere la deschidere, nu la montarea paginii: e un meniu, nu date de care ecranul
  // depinde ca să funcționeze.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listCrmSavedViews()
      .then((res) => {
        if (!cancelled) setViews(res.items);
      })
      .catch(() => {
        if (!cancelled) setViews([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Click în afară / Escape închid panoul — altfel ar rămâne deschis peste tablă.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function saveCurrent() {
    const clean = name.trim();
    if (!clean) return;
    setSaving(true);
    try {
      const created = await createCrmSavedView({ name: clean, filters: currentFilters, isShared: shared });
      setViews((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "ro")));
      setName("");
      setShared(false);
      onToast({ kind: "success", message: `Vizualizarea „${created.name}” a fost salvată.` });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut salva vizualizarea." });
    } finally {
      setSaving(false);
    }
  }

  async function removeView(view: CrmSavedView) {
    setBusyId(view.id);
    try {
      await deleteCrmSavedView(view.id);
      setViews((prev) => prev.filter((v) => v.id !== view.id));
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge vizualizarea." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <Bookmark className="h-4 w-4" aria-hidden="true" />
        Vizualizări
      </Button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 w-80 rounded-xl border border-border bg-card p-3 shadow-lg"
          role="dialog"
          aria-label="Vizualizări salvate"
        >
          {loading ? (
            <div className="flex items-center justify-center py-6" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Se încarcă vizualizările..." />
            </div>
          ) : views.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Nicio vizualizare salvată încă. Filtrează tabla, apoi salvează filtrarea de mai jos.
            </p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {views.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(v.filters);
                      setOpen(false);
                    }}
                    className={cn(
                      "min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors",
                      "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    <span className="truncate">{v.name}</span>
                    {v.isShared && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        echipă
                      </span>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Șterge vizualizarea ${v.name}`}
                    onClick={() => void removeView(v)}
                    disabled={busyId === v.id}
                  >
                    {busyId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
            <Label htmlFor="crm-saved-view-name">Salvează filtrarea curentă</Label>
            <div className="flex items-center gap-2">
              <Input
                id="crm-saved-view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveCurrent();
                  }
                }}
                placeholder="ex: B2B restante"
                className="h-9"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" aria-label="Salvează vizualizarea" onClick={() => void saveCurrent()} disabled={!name.trim() || saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <Checkbox
              checked={shared}
              onChange={setShared}
              label={<span className="text-xs font-normal text-muted-foreground">Vizibilă echipei</span>}
            />
          </div>
        </div>
      )}
    </div>
  );
}
