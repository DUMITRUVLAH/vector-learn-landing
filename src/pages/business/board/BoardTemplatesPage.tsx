/**
 * TB-004: TaskBoard — pagina Șabloane: listă + editor inline de rânduri (offset zile
 * față de start/end-ul produsului) + „Generează pe board".
 *
 * Feature-ul cheie al modulului: definești O DATĂ setul de taskuri al unui tip de
 * curs, apoi îl generezi pe boardul fiecărei ediții — datele scadente se calculează
 * singure din ancorele produsului (ex. -30 = cu 30 zile înainte de start).
 */
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  ListChecks,
  Loader2,
  AlertCircle,
  Trash2,
  Wand2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  archiveTemplate,
  addTemplateItem,
  patchTemplateItem,
  deleteTemplateItem,
  generateFromTemplate,
  type BoardTaskTemplate,
  type BoardTaskTemplateItem,
} from "@/lib/api/boardTemplates";
import { listBoards, type Board } from "@/lib/api/board";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring";

export function BoardTemplatesPage() {
  const [templates, setTemplates] = useState<BoardTaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTpl, setOpenTpl] = useState<BoardTaskTemplate | null>(null);
  const [items, setItems] = useState<BoardTaskTemplateItem[]>([]);
  const [newTitle, setNewTitle] = useState("");

  // Creare șablon
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Generare
  const [genOpen, setGenOpen] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [genBoardId, setGenBoardId] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTemplates();
      setTemplates(res.templates);
    } catch {
      setError("Eroare la încărcarea șabloanelor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = useCallback(async (id: string) => {
    setOpenId(id);
    setGenResult(null);
    try {
      const res = await getTemplate(id);
      setOpenTpl(res.template);
      setItems(res.items);
    } catch {
      setError("Eroare la încărcarea șablonului.");
      setOpenId(null);
    }
  }, []);

  async function refreshItems(id: string) {
    const res = await getTemplate(id);
    setItems(res.items);
    void load(); // itemCount în listă
  }

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createTemplate({ name: newName.trim(), productKind: "course" });
      setNewName("");
      await load();
      await openEditor(res.template.id);
    } catch {
      setError("Nu am putut crea șablonul.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!openId || !newTitle.trim()) return;
    try {
      await addTemplateItem(openId, { title: newTitle.trim() });
      setNewTitle("");
      await refreshItems(openId);
    } catch {
      setError("Nu am putut adăuga rândul.");
    }
  }

  async function openGenerate() {
    setGenOpen(true);
    setGenResult(null);
    try {
      const res = await listBoards();
      setBoards(res.boards);
      if (res.boards.length > 0) setGenBoardId(res.boards[0].id);
    } catch {
      setGenResult("Eroare la încărcarea boardurilor.");
    }
  }

  async function handleGenerate() {
    if (!openId || !genBoardId) return;
    setGenBusy(true);
    setGenResult(null);
    try {
      const res = await generateFromTemplate(openId, genBoardId);
      setGenResult(
        `Generate: ${res.createdCount} taskuri` +
          (res.skippedCount > 0 ? ` · ${res.skippedCount} sărite (deja generate)` : "") +
          (res.unscheduledCount > 0
            ? ` · ${res.unscheduledCount} fără termen (produsul nu are data ancoră)`
            : "")
      );
    } catch {
      setGenResult("Generarea a eșuat. Încearcă din nou.");
    } finally {
      setGenBusy(false);
    }
  }

  // ── Editor deschis ───────────────────────────────────────────────────────────
  if (openId && openTpl) {
    return (
      <BusinessShell
        pageTitle={`Șablon — ${openTpl.name}`}
        pageDescription="Rândurile devin taskuri la generare; termenul = ancora produsului + offset zile (negativ = înainte)."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOpenId(null);
                setGenOpen(false);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              Înapoi
            </button>
            <button
              type="button"
              onClick={openGenerate}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <Wand2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Generează pe board
            </button>
          </div>
        }
      >
        {genOpen && (
          <div className="mb-4 rounded-lg border border-border bg-card p-4 space-y-3">
            <label htmlFor="tb-gen-board" className="block text-sm font-medium text-foreground">
              Boardul pe care se generează taskurile
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="tb-gen-board"
                value={genBoardId}
                onChange={(e) => setGenBoardId(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={genBusy || !genBoardId}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {genBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Generează {items.length} taskuri
              </button>
            </div>
            {genResult && (
              <p className="flex items-center gap-2 text-sm text-foreground" role="status">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                {genResult}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Idempotent: rândurile deja generate pe boardul ales sunt sărite automat.
            </p>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-3 py-2.5 w-[34%] font-medium text-muted-foreground">Task</th>
                <th className="px-3 py-2.5 w-[13%] font-medium text-muted-foreground">Rol</th>
                <th className="px-3 py-2.5 w-[12%] font-medium text-muted-foreground">Ancoră</th>
                <th className="px-3 py-2.5 w-[12%] font-medium text-muted-foreground">Offset (zile)</th>
                <th className="px-3 py-2.5 w-[17%] font-medium text-muted-foreground">Coloana țintă</th>
                <th className="px-3 py-2.5 w-[8%] font-medium text-muted-foreground">Prioritate</th>
                <th className="px-3 py-2.5 w-[4%]"><span className="sr-only">Acțiuni</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      defaultValue={it.title}
                      aria-label={`Titlu rând: ${it.title}`}
                      maxLength={300}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== it.title && openId) void patchTemplateItem(openId, it.id, { title: v });
                      }}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      defaultValue={it.assigneeRole ?? ""}
                      aria-label="Rol responsabil"
                      placeholder="marketing"
                      maxLength={48}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.assigneeRole ?? "") && openId)
                          void patchTemplateItem(openId, it.id, { assigneeRole: v || null });
                      }}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      defaultValue={it.offsetAnchor}
                      aria-label="Ancora datei"
                      onChange={(e) => {
                        if (openId)
                          void patchTemplateItem(openId, it.id, {
                            offsetAnchor: e.target.value as "start" | "end",
                          });
                      }}
                      className={inputCls}
                    >
                      <option value="start">Start produs</option>
                      <option value="end">Final produs</option>
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      defaultValue={it.offsetDays}
                      aria-label="Offset în zile (negativ = înainte de ancoră)"
                      min={-3650}
                      max={3650}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isInteger(v) && v !== it.offsetDays && openId)
                          void patchTemplateItem(openId, it.id, { offsetDays: v });
                      }}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      defaultValue={it.defaultListName ?? ""}
                      aria-label="Coloana în care cade taskul la generare"
                      placeholder="Backlog"
                      maxLength={120}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (it.defaultListName ?? "") && openId)
                          void patchTemplateItem(openId, it.id, { defaultListName: v || null });
                      }}
                      className={inputCls}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      defaultValue={it.defaultPriority}
                      aria-label="Prioritate implicită"
                      onChange={(e) => {
                        if (openId)
                          void patchTemplateItem(openId, it.id, {
                            defaultPriority: e.target.value as BoardTaskTemplateItem["defaultPriority"],
                          });
                      }}
                      className={inputCls}
                    >
                      <option value="low">Scăzută</option>
                      <option value="normal">Normală</option>
                      <option value="high">Ridicată</option>
                      <option value="urgent">Urgentă</option>
                    </select>
                  </td>
                  <td className="px-1 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (openId) void deleteTemplateItem(openId, it.id).then(() => refreshItems(openId));
                      }}
                      aria-label={`Șterge rândul ${it.title}`}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors touch-target"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Niciun rând — adaugă primul task al șablonului mai jos.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={7} className="px-1 py-1">
                  <form onSubmit={handleAddItem} className="flex items-center gap-2">
                    <Plus className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Adaugă rând de șablon — Enter salvează"
                      aria-label="Adaugă rând de șablon"
                      maxLength={300}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring min-h-[44px]"
                    />
                  </form>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </BusinessShell>
    );
  }

  // ── Lista de șabloane ────────────────────────────────────────────────────────
  return (
    <BusinessShell
      pageTitle="Task Board — Șabloane"
      pageDescription="Definește o dată setul de taskuri al unui tip de curs; generează-l pe boardul fiecărei ediții cu termene calculate automat."
    >
      <form onSubmit={handleCreateTemplate} className="mb-6 flex flex-wrap items-center gap-2">
        <label htmlFor="tb-tpl-name" className="sr-only">
          Nume șablon nou
        </label>
        <input
          id="tb-tpl-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="ex. Lansare curs standard"
          maxLength={200}
          className="w-72 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          Șablon nou
        </button>
      </form>

      {error && (
        <p className="mb-4 flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">
            Niciun șablon încă. Creează unul și definește taskurile standard ale unui tip de curs.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id} className="rounded-lg border border-border bg-card p-4 card-hover flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground">{t.name}</h3>
                <button
                  type="button"
                  onClick={() => void archiveTemplate(t.id).then(() => load())}
                  aria-label={`Arhivează șablonul ${t.name}`}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors touch-target"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
              <p className="text-xs text-muted-foreground">
                {t.itemCount ?? 0} rânduri{t.productKind ? ` · ${t.productKind}` : ""}
              </p>
              <button
                type="button"
                onClick={() => void openEditor(t.id)}
                className={cn(
                  "mt-auto inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
                )}
              >
                <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                Deschide editorul
              </button>
            </li>
          ))}
        </ul>
      )}
    </BusinessShell>
  );
}
