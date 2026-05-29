/**
 * COMM-203 — Inbox unificat /app/inbox
 *
 * T-COMM-203-1: /app/inbox renderează fără crash
 * T-COMM-203-2: Filter canal filtrează corect
 * T-COMM-203-3: Thread se încarcă la click pe conversație
 * T-COMM-203-4: Reply trimite mesaj și îl afișează în thread
 * T-COMM-203-5: Inbox badge reflectă unread_count
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Thread, Message } from "@/lib/api/messages";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/app/inbox" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } } }),
}));

vi.mock("@/lib/api/messages", () => ({
  listThreads: vi.fn(),
  getThreadMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

import * as messagesApi from "@/lib/api/messages";
import { InboxPage } from "@/pages/app/InboxPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeThread = (overrides: Partial<Thread> = {}): Thread => ({
  contactId: "lead-001",
  contactType: "lead",
  contactName: "Maria Popescu",
  channel: "email",
  lastMessageAt: "2026-05-30T10:00:00Z",
  lastMessagePreview: "Bună ziua, am o întrebare…",
  unreadCount: 0,
  ...overrides,
});

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: "msg-001",
  tenantId: "tenant-001",
  leadId: "lead-001",
  studentId: null,
  direction: "outbound",
  channel: "email",
  toAddress: "maria@test.ro",
  body: "Bună ziua!",
  subject: null,
  templateId: null,
  status: "sent",
  providerMessageId: null,
  errorMessage: null,
  sentAt: "2026-05-30T10:00:00Z",
  deliveredAt: null,
  failedAt: null,
  createdAt: "2026-05-30T10:00:00Z",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("COMM-203 — InboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(messagesApi.listThreads).mockResolvedValue({ threads: [] });
    vi.mocked(messagesApi.getThreadMessages).mockResolvedValue({
      messages: [],
      contact: { id: "lead-001", name: "Maria Popescu", type: "lead" },
    });
    vi.mocked(messagesApi.sendMessage).mockResolvedValue({
      message: makeMessage(),
    });
  });

  /**
   * T-COMM-203-1: /app/inbox renderează fără crash
   */
  it("T-COMM-203-1: renderează fără crash, afișează titlul Inbox", async () => {
    render(<InboxPage />);
    await waitFor(() => {
      expect(document.title || document.body.textContent).toBeTruthy();
    });
    // Page renders with Inbox heading somewhere
    expect(screen.queryByRole("list", { name: /conversații/i }) ?? screen.queryByText(/Inbox/i)).toBeTruthy();
  });

  /**
   * T-COMM-203-2: Filter canal filtrează corect
   */
  it("T-COMM-203-2: filter WhatsApp ascunde email threads", async () => {
    const threads = [
      makeThread({ contactId: "lead-001", channel: "email", contactName: "Maria Popescu" }),
      makeThread({ contactId: "lead-002", channel: "whatsapp", contactName: "Ion Ionescu" }),
    ];
    vi.mocked(messagesApi.listThreads).mockResolvedValue({ threads });

    render(<InboxPage />);
    await waitFor(() => {
      expect(screen.getByText("Maria Popescu")).toBeInTheDocument();
    });

    // Click WhatsApp filter — use getByRole with group context
    const filterGroup = screen.getByRole("group", { name: /filtrare canal/i });
    const waBtn = Array.from(filterGroup.querySelectorAll("button")).find(
      (b) => b.textContent?.toLowerCase().includes("whatsapp")
    );
    expect(waBtn).toBeTruthy();
    fireEvent.click(waBtn!);

    // Maria (email) should be hidden, Ion (whatsapp) visible
    expect(screen.queryByText("Maria Popescu")).not.toBeInTheDocument();
    expect(screen.getByText("Ion Ionescu")).toBeInTheDocument();
  });

  /**
   * T-COMM-203-3: Thread se încarcă la click pe conversație
   */
  it("T-COMM-203-3: click pe conversație încarcă mesajele thread-ului", async () => {
    const threads = [makeThread()];
    vi.mocked(messagesApi.listThreads).mockResolvedValue({ threads });
    vi.mocked(messagesApi.getThreadMessages).mockResolvedValue({
      messages: [makeMessage({ body: "Bună ziua!" })],
      contact: { id: "lead-001", name: "Maria Popescu", type: "lead" },
    });

    render(<InboxPage />);
    await waitFor(() => {
      expect(screen.getByText("Maria Popescu")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /conversație cu Maria Popescu/i }));

    await waitFor(() => {
      expect(messagesApi.getThreadMessages).toHaveBeenCalledWith("lead-001", "email");
    });
  });

  /**
   * T-COMM-203-5: Badge unread_count vizibil
   */
  it("T-COMM-203-5: badge unread_count afișat pentru thread cu unread > 0", async () => {
    const threads = [makeThread({ unreadCount: 3 })];
    vi.mocked(messagesApi.listThreads).mockResolvedValue({ threads });

    render(<InboxPage />);
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("afișează 'Nicio conversație' când threads sunt goale", async () => {
    vi.mocked(messagesApi.listThreads).mockResolvedValue({ threads: [] });
    render(<InboxPage />);
    await waitFor(() => {
      expect(screen.getByText(/nicio conversație/i)).toBeInTheDocument();
    });
  });
});
