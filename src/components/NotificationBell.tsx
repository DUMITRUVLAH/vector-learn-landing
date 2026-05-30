/**
 * CRM-134: NotificationBell — in-app notification icon with unread badge + dropdown.
 *
 * Polls unread count on mount and after mark-read. Clicking the bell opens a dropdown
 * with the last 20 notifications. Clicking a notification navigates to the lead.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  type InAppNotification,
} from "@/lib/api/notifications";
import { useRouter } from "@/router/HashRouter";

interface NotificationBellProps {
  /** Optional additional className */
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const { navigate } = useRouter();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await getUnreadCount();
      setCount(res.count);
    } catch {
      // silently ignore — bell unavailable
    }
  }, []);

  useEffect(() => {
    void fetchCount();
    // Poll every 30 seconds for new notifications
    const interval = setInterval(() => { void fetchCount(); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const handleOpen = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoadingItems(true);
    try {
      const res = await listNotifications();
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleMarkRead = async () => {
    try {
      await markAllRead();
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {
      // silently ignore
    }
  };

  const handleItemClick = (item: InAppNotification) => {
    const leadId = item.payload.lead_id;
    if (leadId) {
      navigate(`/app/leads/${leadId}`);
    }
    setOpen(false);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={count > 0 ? `${count} notificări necitite` : "Notificări"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => { void handleOpen(); }}
        className="relative touch-target rounded-md hover:bg-muted flex items-center justify-center"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            aria-label={`${count} notificări necitite`}
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-0.5"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificări"
          className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-border bg-popover shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-semibold">Notificări</span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => { void handleMarkRead(); }}
                className="text-xs text-primary hover:underline"
              >
                Marchează toate ca citite
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loadingItems ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Se încarcă...
              </div>
            ) : items.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nicio notificare
              </div>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors",
                        !item.readAt && "bg-primary/5 font-medium"
                      )}
                    >
                      <p className="line-clamp-2">{item.payload.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(item.createdAt).toLocaleString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
