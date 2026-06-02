/**
 * COMM-203 — Inbox unificat /app/inbox
 * Conversații threaded per contact (lead sau student), cu reply direct.
 */
import { useEffect, useState, useCallback } from "react";
import { Mail, MessageCircle, Phone, Loader2, Send, X, AlertTriangle, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listThreads,
  getThreadMessages,
  sendMessage,
  type Thread,
  type Message,
  type MessageChannel,
} from "@/lib/api/messages";
import { cn } from "@/lib/utils";

// ─── Channel icons ────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<MessageChannel, React.ReactNode> = {
  email: <Mail className="h-4 w-4" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />,
  sms: <Phone className="h-4 w-4" aria-hidden="true" />,
};

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  sms: "SMS",
};

const STATUS_BADGE: Record<Message["status"], string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  delivered: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<Message["status"], string> = {
  queued: "În așteptare",
  sent: "Trimis",
  delivered: "Livrat",
  failed: "Eșuat",
};

type ChannelFilter = MessageChannel | "all";

// ─── Main page ────────────────────────────────────────────────────────────────

export function InboxPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadContact, setThreadContact] = useState<{ id: string; name: string; type: "lead" | "student" } | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listThreads();
      setThreads(res.threads);
    } catch {
      setError("Nu pot încărca conversațiile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchThreads(); }, [fetchThreads]);

  const handleSelectThread = async (thread: Thread) => {
    setSelected(thread);
    setLoadingThread(true);
    setSendError(null);
    setReplyBody("");
    try {
      const res = await getThreadMessages(thread.contactId, thread.channel);
      setThreadMessages(res.messages);
      setThreadContact(res.contact);
    } catch {
      setThreadMessages([]);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !replyBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const toAddr = threadMessages[0]?.toAddress ?? "";
      const res = await sendMessage({
        channel: selected.channel,
        to_address: toAddr,
        body: replyBody.trim(),
        lead_id: selected.contactType === "lead" ? selected.contactId : null,
        student_id: selected.contactType === "student" ? selected.contactId : null,
      });
      setThreadMessages((prev) => [res.message, ...prev]);
      setReplyBody("");
      setToast("Mesaj trimis!");
    } catch (err) {
      if (err instanceof Error && err.message === "consent_revoked") {
        setSendError("Consimțământul a fost retras. Trimiterea este blocată.");
      } else {
        setSendError("Eroare la trimitere.");
      }
    } finally {
      setSending(false);
    }
  };

  // Filter threads
  const filtered = threads.filter((t) => {
    if (channelFilter !== "all" && t.channel !== channelFilter) return false;
    if (search && !t.contactName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Total unread
  const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <AppShell
      pageTitle={`Inbox${totalUnread > 0 ? ` (${totalUnread})` : ""}`}
      pageDescription="Toate conversațiile cu lead-uri și elevi"
    >
      <div className="flex flex-col md:flex-row gap-0 border border-border rounded-xl overflow-hidden min-h-[60vh]">
        {/* ─── LEFT: Thread list ────────────────────────────────────────── */}
        <div className={cn(
          "w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col",
          selected && "hidden md:flex"
        )}>
          {/* Filters */}
          <div className="p-3 border-b border-border space-y-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după nume…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Caută conversație"
            />
            <div className="flex gap-1" role="group" aria-label="Filtrare canal">
              {(["all", "email", "sms", "whatsapp"] as ChannelFilter[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannelFilter(ch)}
                  aria-pressed={channelFilter === ch}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                    channelFilter === ch
                      ? "bg-primary text-primary-foreground"
                      : "border border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  {ch === "all" ? "Toate" : CHANNEL_LABEL[ch]}
                </button>
              ))}
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Se încarcă…
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive px-3 py-4 text-center">{error}</p>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center px-3 py-8">
                Nicio conversație{channelFilter !== "all" ? ` pe ${CHANNEL_LABEL[channelFilter]}` : ""}.
              </p>
            )}
            <ul role="list" aria-label="Conversații">
              {filtered.map((thread) => {
                const key = `${thread.contactId}::${thread.channel}`;
                const isSelected = selected
                  ? `${selected.contactId}::${selected.channel}` === key
                  : false;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => void handleSelectThread(thread)}
                      className={cn(
                        "w-full text-left px-3 py-3 border-b border-border hover:bg-muted/50 transition-colors",
                        isSelected && "bg-primary/5"
                      )}
                      aria-label={`Conversație cu ${thread.contactName} pe ${CHANNEL_LABEL[thread.channel]}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                          {thread.contactName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-sm font-semibold truncate">{thread.contactName}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {thread.unreadCount > 0 && (
                                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                                  {thread.unreadCount}
                                </span>
                              )}
                              {CHANNEL_ICON[thread.channel]}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {thread.lastMessagePreview}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(thread.lastMessageAt).toLocaleDateString("ro-RO")}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ─── RIGHT: Thread panel ─────────────────────────────────────── */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selected && "hidden md:flex"
        )}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
              <Mail className="h-10 w-10 opacity-30" aria-hidden="true" />
              <p className="text-sm">Selectează o conversație</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="md:hidden rounded-md p-1 hover:bg-muted"
                  aria-label="Înapoi la inbox"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
                <div>
                  <p className="font-semibold text-sm">
                    {threadContact?.name ?? selected.contactName}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {CHANNEL_ICON[selected.channel]}
                    {CHANNEL_LABEL[selected.channel]}
                    {threadContact && (
                      <button
                        type="button"
                        onClick={() => navigate(
                          threadContact.type === "lead"
                            ? `/app/leads/${threadContact.id}`
                            : `/app/students`
                        )}
                        className="text-primary hover:underline ml-1"
                      >
                        Deschide cartonaș →
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingThread && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loadingThread && threadMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Niciun mesaj în thread.</p>
                )}
                {!loadingThread && [...threadMessages].reverse().map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col max-w-[80%] rounded-xl px-3 py-2.5",
                      msg.direction === "outbound"
                        ? "ml-auto bg-primary/10 items-end"
                        : "mr-auto bg-muted items-start"
                    )}
                  >
                    {msg.subject && (
                      <p className="text-[11px] font-semibold text-muted-foreground mb-1">{msg.subject}</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold", STATUS_BADGE[msg.status])}>
                        {STATUS_LABEL[msg.status]}
                      </span>
                      <time className="text-[10px] text-muted-foreground" dateTime={msg.createdAt}>
                        {new Date(msg.createdAt).toLocaleString("ro-RO")}
                      </time>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply form */}
              <div className="border-t border-border p-3 bg-card/30">
                {sendError && (
                  <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive mb-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {sendError}
                    <button type="button" onClick={() => setSendError(null)} aria-label="Închide eroare" className="ml-auto hover:opacity-70">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <form onSubmit={(e) => void handleReply(e)} className="flex gap-2 items-end">
                  <textarea
                    rows={2}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleReply(e as unknown as React.FormEvent); }
                    }}
                    placeholder="Scrie răspunsul… (Enter trimite, Shift+Enter linie nouă)"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                    aria-label="Răspuns"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyBody.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px] shrink-0"
                    aria-label="Trimite răspuns"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Trimite
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-success/30 bg-success/10 shadow-lg px-4 py-3 text-sm font-medium text-success"
        >
          {toast}
        </div>
      )}
    </AppShell>
  );
}
