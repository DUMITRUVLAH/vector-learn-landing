import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Loader2, Check, CheckCheck, UserPlus, CalendarClock, Info } from "lucide-react";
import {
  listNotifications,
  markRead,
  markAllRead,
  type AppNotification,
  type NotificationType,
} from "@/lib/api/notifications";
import { useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;

interface NotificationBellProps {
  /** Called when unread count changes (parent can react) */
  onUnreadChange?: (count: number) => void;
}

function typeIcon(type: NotificationType) {
  switch (type) {
    case "lead_created":
      return <UserPlus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
    case "lead_converted":
      return <CheckCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />;
    case "task_due":
      return <CalendarClock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" aria-hidden="true" />;
    default:
      return <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "acum";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}z`;
}

/**
 * CRM-123 — Notification Bell icon with badge + dropdown feed.
 */
export function NotificationBell({ onUnreadChange }: NotificationBellProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { navigate } = useRouter();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await listNotifications();
      setItems(res.items);
      setUnreadCount(res.unreadCount);
      onUnreadChange?.(res.unreadCount);
    } catch {
      // Silently ignore — notifications are best-effort
    } finally {
      if (!silent) setLoading(false);
    }
  }, [onUnreadChange]);

  // Initial load
  useEffect(() => {
    void load();
  }, [load]);

  // Polling every 30s
  useEffect(() => {
    const timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((p) => !p);
    if (!open) void load();
  };

  const handleMarkOne = async (notif: AppNotification) => {
    if (notif.isRead) {
      // Navigate only
      if (notif.link) navigate(notif.link.replace(/^#/, ""));
      setOpen(false);
      return;
    }
    try {
      await markRead(notif.id);
      setItems((prev) => prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
      onUnreadChange?.(Math.max(0, unreadCount - 1));
      if (notif.link) navigate(notif.link.replace(/^#/, ""));
      setOpen(false);
    } catch {
      // ignore
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      onUnreadChange?.(0);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notificări${unreadCount > 0 ? ` (${unreadCount} necitite)` : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="touch-target relative rounded-md hover:bg-muted flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-live="polite"
            aria-atomic="true"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground flex items-center justify-center px-1 leading-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-xl"
          role="menu"
          aria-label="Feed notificări"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold">Notificări</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAll()}
                disabled={markingAll}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                aria-label="Marchează toate notificările ca citite"
              >
                {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Marchează toate
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Se încarcă...</span>
              </div>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nicio notificare deocamdată.
              </p>
            ) : (
              <div>
                {items.map((notif) => (
                  <button
                    key={notif.id}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleMarkOne(notif)}
                    className={cn(
                      "w-full text-left px-4 py-3 border-b border-border last:border-0",
                      "hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted transition-colors",
                      !notif.isRead && "bg-primary/5"
                    )}
                    aria-label={notif.title + (notif.body ? `: ${notif.body}` : "")}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">{typeIcon(notif.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={cn(
                            "text-xs font-semibold truncate",
                            !notif.isRead ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {notif.title}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {timeAgo(notif.createdAt)}
                            </span>
                            {!notif.isRead && (
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-primary"
                                aria-label="Necitit"
                              />
                            )}
                          </div>
                        </div>
                        {notif.body && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {notif.body}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
