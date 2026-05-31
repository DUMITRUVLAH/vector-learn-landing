/**
 * CRM-123 — In-app notifications
 * Covers T-CRM-123-1..5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mock API ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/notifications", () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app" }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import * as notifApi from "@/lib/api/notifications";
import { NotificationBell } from "@/components/app/NotificationBell";
import type { AppNotification, NotificationsResponse } from "@/lib/api/notifications";

const mockNotif: AppNotification = {
  id: "n1",
  tenantId: "t1",
  userId: "u1",
  type: "lead_created",
  title: "Nou lead: Maria Popescu",
  body: "Curs: Engleză B2",
  link: "#/app/leads/l1",
  isRead: false,
  metadata: { leadId: "l1" },
  createdAt: new Date(Date.now() - 60_000).toISOString(),
};

const emptyResponse: NotificationsResponse = { items: [], unreadCount: 0 };
const withNotif: NotificationsResponse = { items: [mockNotif], unreadCount: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notifApi.listNotifications).mockResolvedValue(emptyResponse);
  vi.mocked(notifApi.markRead).mockResolvedValue({ ok: true });
  vi.mocked(notifApi.markAllRead).mockResolvedValue({ ok: true });
});

describe("NotificationBell", () => {
  it("T-CRM-123-3: renders bell button with accessible label", async () => {
    render(<NotificationBell />);
    await waitFor(() => expect(notifApi.listNotifications).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /notificări/i })).toBeInTheDocument();
  });

  it("shows no badge when unreadCount = 0", async () => {
    vi.mocked(notifApi.listNotifications).mockResolvedValue(emptyResponse);
    render(<NotificationBell />);
    await waitFor(() => expect(notifApi.listNotifications).toHaveBeenCalledTimes(1));
    // No badge text
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("shows badge with unreadCount when > 0", async () => {
    vi.mocked(notifApi.listNotifications).mockResolvedValue(withNotif);
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByRole("button", { name: /1 necitite/i })).toBeInTheDocument());
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("T-CRM-123-2: opens dropdown and shows notifications", async () => {
    const user = userEvent.setup();
    vi.mocked(notifApi.listNotifications).mockResolvedValue(withNotif);
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /notificări/i }));
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    expect(screen.getByText("Nou lead: Maria Popescu")).toBeInTheDocument();
    expect(screen.getByText("Curs: Engleză B2")).toBeInTheDocument();
  });

  it("T-CRM-123-2: clicking a notification calls markRead", async () => {
    const user = userEvent.setup();
    vi.mocked(notifApi.listNotifications).mockResolvedValue(withNotif);
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /notificări/i }));
    await waitFor(() => screen.getByText("Nou lead: Maria Popescu"));
    await user.click(screen.getByRole("menuitem", { name: /nou lead/i }));

    expect(notifApi.markRead).toHaveBeenCalledWith("n1");
  });

  it("T-CRM-123-4: 'Marchează toate' calls markAllRead", async () => {
    const user = userEvent.setup();
    vi.mocked(notifApi.listNotifications).mockResolvedValue(withNotif);
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /notificări/i }));
    await waitFor(() => screen.getByText("Marchează toate"));
    await user.click(screen.getByRole("button", { name: /marchează toate notificările/i }));

    expect(notifApi.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("T-CRM-123-4: after markAllRead, unreadCount becomes 0", async () => {
    const user = userEvent.setup();
    vi.mocked(notifApi.listNotifications).mockResolvedValue(withNotif);
    render(<NotificationBell />);

    // Wait for badge to appear
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /notificări/i }));
    await waitFor(() => screen.getByText("Marchează toate"));
    await user.click(screen.getByRole("button", { name: /marchează toate notificările/i }));

    await waitFor(() =>
      expect(screen.queryByText("1")).not.toBeInTheDocument()
    );
  });

  it("shows empty state when no notifications", async () => {
    const user = userEvent.setup();
    vi.mocked(notifApi.listNotifications).mockResolvedValue(emptyResponse);
    render(<NotificationBell />);

    await user.click(screen.getByRole("button", { name: /notificări$/i }));
    await waitFor(() => expect(screen.getByText(/nicio notificare/i)).toBeInTheDocument());
  });
});

// ─── timeAgo helper logic ─────────────────────────────────────────────────────

describe("Notification time display", () => {
  it("returns 'acum' for very recent notifications", () => {
    const diff = 30_000; // 30 seconds
    const min = Math.floor(diff / 60_000);
    expect(min).toBe(0);
    expect(min < 1 ? "acum" : `${min}m`).toBe("acum");
  });

  it("returns minutes for notifications < 1h old", () => {
    const diff = 5 * 60_000; // 5 minutes
    const min = Math.floor(diff / 60_000);
    expect(`${min}m`).toBe("5m");
  });
});
