/**
 * MOB-104: Parent-teacher 1:1 chat
 * Route: /m/chat/:teacherUserId
 * Thread-based chat. Messages sent during quiet hours (22:00–07:00 UTC) are queued
 * (shown in UI but flagged as pending delivery).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Loader2, AlertCircle, Clock } from "lucide-react";
import { useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DirectMessage {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  queued: boolean;
}

interface ThreadData {
  messages: DirectMessage[];
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatPage() {
  const { navigate, path } = useRouter();
  const { status: sessionStatus, data: sessionData } = useSession();

  // Extract teacherUserId from path: /m/chat/:teacherUserId
  const teacherUserId: string = path.startsWith("/m/chat/")
    ? path.replace("/m/chat/", "")
    : "";

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auth guard
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  // Load thread
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !teacherUserId) return;

    api<ThreadData>(`/api/m/chat/${teacherUserId}`)
      .then((data) => {
        setMessages(data.messages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Nu s-a putut încărca conversația");
        setLoading(false);
      });
  }, [sessionStatus, teacherUserId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const resp = await api<{ message: DirectMessage }>(
        `/api/m/chat/${teacherUserId}`,
        { method: "POST", body: JSON.stringify({ body: trimmed }) }
      );
      setMessages((prev) => [...prev, resp.message]);
      setInput("");
      textareaRef.current?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Trimiterea a eșuat");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const currentUserId = sessionData?.user?.id ?? "";

  // Group messages by day
  type GroupedEntry = { day: string; items: DirectMessage[] };
  const grouped: GroupedEntry[] = [];
  for (const m of messages) {
    const day = formatDay(m.sentAt);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) {
      last.items.push(m);
    } else {
      grouped.push({ day, items: [m] });
    }
  }

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Se încarcă..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3 safe-area-top">
        <button
          onClick={() => navigate("/m/parent")}
          aria-label="Înapoi"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-sm font-semibold">Chat cu profesorul</h1>
          <p className="text-xs text-muted-foreground">Mesaje directe</p>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {/* Message thread */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        aria-live="polite"
        aria-label="Conversație"
      >
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-16 text-muted-foreground">
            <p className="text-sm">Nicio conversație încă.</p>
            <p className="text-xs">Trimiteți primul mesaj!</p>
          </div>
        )}
        {grouped.map(({ day, items }) => (
          <div key={day}>
            {/* Day divider */}
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-border" aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground">{day}</span>
              <div className="flex-1 h-px bg-border" aria-hidden="true" />
            </div>

            {/* Messages */}
            <div className="space-y-2">
              {items.map((msg) => {
                const isMine = msg.fromUserId === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      isMine ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      <div
                        className={cn(
                          "flex items-center gap-1 mt-0.5",
                          isMine ? "justify-end" : "justify-start"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px]",
                            isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}
                        >
                          {formatTime(msg.sentAt)}
                        </span>
                        {msg.queued && (
                          <span
                            title="Mesaj programat — va fi livrat dimineața"
                            aria-label="Mesaj programat"
                          >
                            <Clock
                              className={cn(
                                "h-2.5 w-2.5",
                                isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                              )}
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex items-end gap-2 safe-area-bottom">
        <label htmlFor="chat-input" className="sr-only">
          Mesaj
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrieți un mesaj..."
          rows={1}
          aria-label="Scrieți un mesaj"
          className={cn(
            "flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2",
            "text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary",
            "min-h-[40px] max-h-32 overflow-y-auto"
          )}
        />
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          aria-label="Trimite mesaj"
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center transition-colors shrink-0",
            input.trim() && !sending
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
