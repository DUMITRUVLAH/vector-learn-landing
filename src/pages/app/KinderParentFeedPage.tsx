/**
 * KINDER-005 — /app/kinder/students/:studentId/feed
 *
 * Parent app feed: aggregated timeline of check-ins, diary events, and messages
 * for a specific child. Includes a messaging panel at the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/router/HashRouter";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getParentFeed,
  getKinderMessages,
  sendKinderMessage,
  type FeedItem,
  type FeedItemType,
  type KinderMessage,
  type MessageDirection,
} from "@/lib/api/kinder";
import {
  LogIn,
  LogOut,
  Utensils,
  Moon,
  Camera,
  MessageCircle,
  User,
  Baby,
  Activity,
  FileText,
  Send,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Feed item icon + label ───────────────────────────────────────────────────

function feedItemIcon(item: FeedItem) {
  const cls = "w-5 h-5 shrink-0";
  if (item.type === "checkin") return <LogIn className={cn(cls, "text-emerald-500")} />;
  if (item.type === "checkout") return <LogOut className={cn(cls, "text-blue-500")} />;
  if (item.type === "message") {
    const dir = item.data["direction"] as MessageDirection;
    return dir === "staff_to_parent"
      ? <MessageCircle className={cn(cls, "text-primary")} />
      : <User className={cn(cls, "text-orange-500")} />;
  }
  // diary event
  const eventType = item.data["eventType"] as string;
  const iconMap: Record<string, JSX.Element> = {
    meal: <Utensils className={cn(cls, "text-amber-500")} />,
    nap: <Moon className={cn(cls, "text-indigo-400")} />,
    diaper: <Baby className={cn(cls, "text-pink-400")} />,
    activity: <Activity className={cn(cls, "text-violet-500")} />,
    photo: <Camera className={cn(cls, "text-sky-500")} />,
    note: <FileText className={cn(cls, "text-muted-foreground")} />,
  };
  return iconMap[eventType] ?? <Activity className={cls} />;
}

function feedItemLabel(item: FeedItem): string {
  if (item.type === "checkin") return "Check-in confirmat";
  if (item.type === "checkout") {
    const name = item.data["pickupPersonName"] as string | null;
    return name ? `Check-out — ridicat de ${name}` : "Check-out";
  }
  if (item.type === "message") {
    const dir = item.data["direction"] as MessageDirection;
    return dir === "staff_to_parent" ? "Mesaj de la educatoare" : "Mesaj de la părinți";
  }
  const eventType = item.data["eventType"] as string;
  const labelMap: Record<string, string> = {
    meal: "Masă",
    nap: "Somn",
    diaper: "Schimbare scutec",
    activity: "Activitate",
    photo: "Fotografii",
    note: "Notă",
  };
  return labelMap[eventType] ?? "Eveniment";
}

function feedItemDetail(item: FeedItem): string | null {
  if (item.type === "message") return item.data["body"] as string;
  const details = item.data["details"] as Record<string, unknown> | null;
  if (!details) return null;
  if (item.type === "diary") {
    const eventType = item.data["eventType"] as string;
    if (eventType === "meal") {
      const food = details["food"] as string | undefined;
      const amount = details["amount_ml"] as number | undefined;
      return [food, amount ? `${amount}ml` : null].filter(Boolean).join(" — ") || null;
    }
    if (eventType === "nap") {
      const start = details["start_time"] as string | undefined;
      const end = details["end_time"] as string | undefined;
      return start && end ? `${start} — ${end}` : null;
    }
    if (eventType === "diaper") {
      const type = details["type"] as string | undefined;
      const typeLabels: Record<string, string> = { wet: "umed", soiled: "murdărit", both: "ambele" };
      return type ? typeLabels[type] ?? type : null;
    }
    if (eventType === "activity") {
      return (details["description"] as string) ?? null;
    }
  }
  return null;
}

// ─── Message composer ─────────────────────────────────────────────────────────

interface MessageComposerProps {
  studentId: string;
  onSent: (msg: KinderMessage) => void;
}

function MessageComposer({ studentId, onSent }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendKinderMessage(studentId, {
        body: body.trim(),
        direction: "staff_to_parent",
      });
      onSent(msg);
      setBody("");
      textareaRef.current?.focus();
    } catch {
      setError("Eroare la trimitere. Încearcă din nou.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border border-border rounded-xl p-4 bg-card">
      <p className="text-sm font-medium text-foreground mb-2">Trimite mesaj părintelui</p>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder="Scrie un mesaj... (Ctrl+Enter pentru a trimite)"
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
        aria-label="Mesaj pentru părinți"
      />
      {error && (
        <p className="text-sm text-destructive flex items-center gap-1 mt-1">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      <div className="flex justify-end mt-2">
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Trimite
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function KinderParentFeedPage() {
  const { path } = useRouter();
  const { data: session } = useSession();

  // Extract studentId from /app/kinder/students/:studentId/feed
  const parts = path.split("/");
  const studentId = parts[4] ?? "";

  const [date, setDate] = useState(todayStr());
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [allMessages, setAllMessages] = useState<KinderMessage[]>([]);
  const [fullName, setFullName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !studentId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      getParentFeed(studentId, date),
      getKinderMessages(studentId),
    ])
      .then(([feed, messages]) => {
        setFeedItems(feed.items);
        setFullName(feed.fullName);
        setAllMessages(messages);
      })
      .catch(() => setError("Nu s-a putut încărca feedul parental."))
      .finally(() => setLoading(false));
  }, [session, studentId, date]);

  function handleNavigateDate(delta: number) {
    setDate((prev) => addDays(prev, delta));
  }

  function handleMessageSent(msg: KinderMessage) {
    setAllMessages((prev) => [msg, ...prev]);
    // Also add to feed items if msg is on current date
    if (msg.sentAt.slice(0, 10) === date) {
      const newItem: FeedItem = {
        type: "message" as FeedItemType,
        timestamp: msg.sentAt,
        data: {
          id: msg.id,
          direction: msg.direction,
          body: msg.body,
          readAt: msg.readAt,
        },
      };
      setFeedItems((prev) =>
        [...prev, newItem].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
      );
    }
  }

  const unreadCount = allMessages.filter((m) => !m.readAt && m.direction === "parent_to_staff").length;

  return (
    <AppShell
      pageTitle={fullName ? `Feed — ${fullName}` : "Feed parental"}
      pageDescription="Activitățile copilului pe parcursul zilei"
    >
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => handleNavigateDate(-1)}
          aria-label="Ziua anterioară"
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium text-foreground capitalize">{formatDate(date)}</p>
          {date === todayStr() && (
            <span className="text-xs text-primary font-medium">Astăzi</span>
          )}
        </div>
        <button
          onClick={() => handleNavigateDate(1)}
          disabled={date >= todayStr()}
          aria-label="Ziua următoare"
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Se încarcă...</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-2 text-destructive text-sm py-6">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {/* ── FEED TIMELINE ─────────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Activități {feedItems.length === 0 ? "— nimic înregistrat" : `(${feedItems.length})`}
            </h2>

            {feedItems.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                <Baby className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nicio activitate înregistrată pentru această zi.</p>
              </div>
            ) : (
              <div className="relative pl-8">
                {/* vertical line */}
                <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

                <div className="space-y-4">
                  {feedItems.map((item, idx) => (
                    <div key={`${item.type}-${idx}`} className="relative flex gap-4">
                      {/* icon bubble */}
                      <div className="absolute -left-8 flex items-center justify-center w-6 h-6 rounded-full bg-card border border-border mt-0.5">
                        {feedItemIcon(item)}
                      </div>

                      {/* content */}
                      <div className="flex-1 bg-card border border-border rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            {feedItemLabel(item)}
                          </p>
                          <time className="text-xs text-muted-foreground shrink-0">
                            {formatTime(item.timestamp)}
                          </time>
                        </div>
                        {feedItemDetail(item) !== null && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {feedItemDetail(item) as string}
                          </p>
                        )}
                        {/* photo preview */}
                        {item.type === "diary" && typeof item.data["photoUrl"] === "string" && (
                          <img
                            src={item.data["photoUrl"]}
                            alt="Fotografie din jurnal"
                            className="mt-2 rounded-lg w-32 h-24 object-cover"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── MESSAGES PANEL ────────────────────────────────────────── */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              Mesaje
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold bg-destructive text-destructive-foreground rounded-full">
                  {unreadCount} necitite
                </span>
              )}
            </h2>

            <MessageComposer studentId={studentId} onSent={handleMessageSent} />

            {allMessages.length > 0 && (
              <div className="mt-4 space-y-2">
                {allMessages.slice(0, 20).map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "p-3 rounded-xl border text-sm",
                      msg.direction === "staff_to_parent"
                        ? "bg-primary/5 border-primary/20 ml-8"
                        : "bg-muted border-border mr-8"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {msg.direction === "staff_to_parent" ? "Educatoare → Părinte" : "Părinte → Educatoare"}
                      </span>
                      <time className="text-xs text-muted-foreground">
                        {new Date(msg.sentAt).toLocaleString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p className="text-foreground">{msg.body}</p>
                    {msg.readAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Citit la{" "}
                        {new Date(msg.readAt).toLocaleTimeString("ro-RO", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {allMessages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Niciun mesaj schimbat cu familia.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
