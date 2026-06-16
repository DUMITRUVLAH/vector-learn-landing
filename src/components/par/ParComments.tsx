/**
 * VF-104: comment thread on a PAR. Append-only. Author names resolved server-side.
 * Body is rendered as plain text (React escapes by default → XSS-safe).
 */
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2, Send } from "lucide-react";
import { listParComments, addParComment, type ParComment } from "@/lib/api/par";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "acum";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}z`;
}

export function ParComments({ parId }: { parId: string }) {
  const [comments, setComments] = useState<ParComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const { comments: c } = await listParComments(parId);
      setComments(c);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [parId]); // eslint-disable-line

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      const created = await addParComment(parId, trimmed);
      setComments((prev) => [...prev, created]);
      setBody("");
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setError("Nu am putut adăuga comentariul.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">
          Comentarii{comments.length > 0 ? ` (${comments.length})` : ""}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Niciun comentariu încă. Pune o întrebare sau lasă o notă.</p>
      ) : (
        <ul className="space-y-3 mb-4">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-foreground">{c.authorName ?? "Utilizator"}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="text-foreground/90 whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
            </li>
          ))}
          <div ref={listEndRef} />
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
          }}
          rows={2}
          placeholder="Scrie un comentariu… (Ctrl+Enter pentru trimitere)"
          aria-label="Comentariu nou"
          className="vf-input resize-none"
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Trimite
          </button>
        </div>
      </form>
    </div>
  );
}
