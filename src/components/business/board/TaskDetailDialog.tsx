/**
 * TB-005: Dialogul de detalii al cardului — echivalentul cardului deschis din Trello:
 * titlu + descriere editabile, etichete (toggle + creare), checklist cu progres,
 * comentarii (autor din sesiune), atașamente (linkuri, metadata MVP).
 *
 * Se deschide din Kanban (click pe card) și din Calendar (click pe chip).
 * Escape închide (convenția dialogurilor din repo). Modificările notifică
 * părintele prin onChanged → re-sync silent al boardului.
 */
import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  Tag,
  CheckSquare,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import type { BoardLabel } from "@/lib/api/board";
import { patchTask } from "@/lib/api/boardTasks";
import {
  getTaskDetail,
  toggleTaskLabel,
  createLabel,
  addChecklistItem,
  patchChecklistItem,
  deleteChecklistItem,
  addComment,
  deleteComment,
  addAttachment,
  deleteAttachment,
  type TaskDetail,
} from "@/lib/api/boardCardDetail";
import { formatDateRo } from "@/lib/board/dates";
import { cn } from "@/lib/utils";

interface TaskDetailDialogProps {
  taskId: string | null;
  boardLabels: BoardLabel[];
  onClose: () => void;
  /** Chemat după orice mutație — părintele re-sincronizează boardul silent. */
  onChanged: () => void;
}

export function TaskDetailDialog({ taskId, boardLabels, onClose, onChanged }: TaskDetailDialogProps) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCheck, setNewCheck] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newLabelName, setNewLabelName] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await getTaskDetail(taskId));
    } catch {
      setError("Eroare la încărcarea taskului.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setDetail(null);
    void load();
  }, [load]);

  // Escape închide (convenția din repo).
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, onClose]);

  if (!taskId) return null;

  const attachedIds = new Set(detail?.labels.map((l) => l.id) ?? []);
  const checklistDone = detail?.checklist.filter((i) => i.done).length ?? 0;
  const checklistTotal = detail?.checklist.length ?? 0;

  async function mutate(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
      onChanged();
    } catch {
      setError("Nu am putut salva modificarea.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tb-task-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-8 w-full max-w-2xl rounded-lg border border-border bg-card shadow-lg">
        {loading || !detail ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            {error ? (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> {error}
              </p>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
            )}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header: titlu editabil + close */}
            <div className="flex items-start justify-between gap-3">
              <input
                id="tb-task-title"
                type="text"
                defaultValue={detail.task.title}
                aria-label="Titlul taskului"
                maxLength={300}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== detail.task.title) void mutate(() => patchTask(taskId, { title: v }));
                }}
                className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-foreground hover:border-input focus:border-input focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Închide"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Meta compact */}
            <p className="px-2 text-xs text-muted-foreground">
              Termen: {formatDateRo(detail.task.dueDate)} · Prioritate: {detail.task.priority} · Rol:{" "}
              {detail.task.assigneeRole ?? "—"} · Status: {detail.task.status}
            </p>

            {/* Descriere */}
            <div>
              <label htmlFor="tb-task-desc" className="mb-1 block px-2 text-sm font-medium text-foreground">
                Descriere
              </label>
              <textarea
                id="tb-task-desc"
                defaultValue={detail.task.description ?? ""}
                rows={3}
                placeholder="Adaugă o descriere…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (detail.task.description ?? ""))
                    void mutate(() => patchTask(taskId, { description: v || null }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Etichete */}
            <section aria-labelledby="tb-labels-h">
              <h3 id="tb-labels-h" className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Etichete
              </h3>
              <div className="flex flex-wrap items-center gap-2 px-2">
                {boardLabels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => void mutate(() => toggleTaskLabel(taskId, l.id))}
                    aria-pressed={attachedIds.has(l.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors min-h-[32px]",
                      attachedIds.has(l.id)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {l.name}
                  </button>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = newLabelName.trim();
                    if (!name) return;
                    void mutate(async () => {
                      const label = await createLabel({ boardId: detail.task.boardId, name });
                      await toggleTaskLabel(taskId, label.id);
                      setNewLabelName("");
                    });
                  }}
                  className="flex items-center gap-1"
                >
                  <label htmlFor="tb-new-label" className="sr-only">
                    Etichetă nouă
                  </label>
                  <input
                    id="tb-new-label"
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="+ etichetă nouă"
                    maxLength={80}
                    className="w-32 rounded-full border border-dashed border-border bg-transparent px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-input focus:outline-none focus:ring-1 focus:ring-ring min-h-[32px]"
                  />
                </form>
              </div>
            </section>

            {/* Checklist */}
            <section aria-labelledby="tb-check-h">
              <h3 id="tb-check-h" className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
                <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Checklist
                {checklistTotal > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {checklistDone}/{checklistTotal}
                  </span>
                )}
              </h3>
              {checklistTotal > 0 && (
                <div className="mx-2 mb-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-success transition-all"
                    style={{ width: `${checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0}%` }}
                  />
                </div>
              )}
              <ul className="space-y-1 px-2">
                {detail.checklist.map((item) => (
                  <li key={item.id} className="group flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={(e) => void mutate(() => patchChecklistItem(item.id, { done: e.target.checked }))}
                      aria-label={`Bifează: ${item.text}`}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span
                      className={cn("flex-1 text-sm text-foreground", item.done && "line-through text-muted-foreground")}
                    >
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => void mutate(() => deleteChecklistItem(item.id))}
                      aria-label={`Șterge: ${item.text}`}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = newCheck.trim();
                  if (!text) return;
                  void mutate(async () => {
                    await addChecklistItem(taskId, text);
                    setNewCheck("");
                  });
                }}
                className="mt-1 flex items-center gap-2 px-2"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="tb-new-check" className="sr-only">
                  Adaugă element în checklist
                </label>
                <input
                  id="tb-new-check"
                  type="text"
                  value={newCheck}
                  onChange={(e) => setNewCheck(e.target.value)}
                  placeholder="Adaugă element — Enter salvează"
                  maxLength={500}
                  className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </form>
            </section>

            {/* Atașamente (linkuri) */}
            <section aria-labelledby="tb-attach-h">
              <h3 id="tb-attach-h" className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Atașamente
              </h3>
              <ul className="space-y-1 px-2">
                {detail.attachments.map((a) => (
                  <li key={a.id} className="group flex items-center gap-2 text-sm">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-primary underline-offset-2 hover:underline"
                    >
                      {a.filename}
                    </a>
                    <button
                      type="button"
                      onClick={() => void mutate(() => deleteAttachment(a.id))}
                      aria-label={`Șterge atașamentul ${a.filename}`}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const filename = attachName.trim();
                  const url = attachUrl.trim();
                  if (!filename || !url) return;
                  void mutate(async () => {
                    await addAttachment({ taskId, filename, url });
                    setAttachName("");
                    setAttachUrl("");
                  });
                }}
                className="mt-1 flex flex-wrap items-center gap-2 px-2"
              >
                <label htmlFor="tb-attach-name" className="sr-only">
                  Nume atașament
                </label>
                <input
                  id="tb-attach-name"
                  type="text"
                  value={attachName}
                  onChange={(e) => setAttachName(e.target.value)}
                  placeholder="Nume (ex. Brief.pdf)"
                  maxLength={300}
                  className="w-40 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <label htmlFor="tb-attach-url" className="sr-only">
                  URL atașament
                </label>
                <input
                  id="tb-attach-url"
                  type="url"
                  value={attachUrl}
                  onChange={(e) => setAttachUrl(e.target.value)}
                  placeholder="https://…"
                  maxLength={1000}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!attachName.trim() || !attachUrl.trim()}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Adaugă
                </button>
              </form>
            </section>

            {/* Comentarii */}
            <section aria-labelledby="tb-comm-h">
              <h3 id="tb-comm-h" className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                Comentarii
              </h3>
              <ul className="space-y-2 px-2">
                {detail.comments.map((cm) => (
                  <li key={cm.id} className="group rounded-md bg-muted/50 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {cm.authorName ?? "Utilizator șters"} ·{" "}
                        {new Intl.DateTimeFormat("ro-RO", { dateStyle: "short", timeStyle: "short" }).format(
                          new Date(cm.createdAt)
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() => void mutate(() => deleteComment(cm.id))}
                        aria-label="Șterge comentariul"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{cm.body}</p>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = newComment.trim();
                  if (!body) return;
                  void mutate(async () => {
                    await addComment(taskId, body);
                    setNewComment("");
                  });
                }}
                className="mt-2 flex items-start gap-2 px-2"
              >
                <label htmlFor="tb-new-comment" className="sr-only">
                  Comentariu nou
                </label>
                <textarea
                  id="tb-new-comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  placeholder="Scrie un comentariu…"
                  maxLength={5000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  Trimite
                </button>
              </form>
            </section>

            {error && (
              <p className="flex items-center gap-2 px-2 text-sm text-destructive" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
