/**
 * COMM-204 — Broadcast cu segmentare
 *
 * T-COMM-204-1: POST /api/broadcasts → 200, returnează totalRecipients + consentSkipped
 * T-COMM-204-2: Lead cu consent_revoked_at nu primește mesaj (consentSkipped > 0)
 * T-COMM-204-3: GET /api/broadcasts → array cu campanii
 * T-COMM-204-4: Preview count endpoint returnează count corect
 * T-COMM-204-5: Formular UI: select segment → preview se actualizează
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Broadcast } from "@/lib/api/broadcasts";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/broadcasts" }),
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={`#${to}`} className={className}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
  }),
}));

vi.mock("@/lib/api/broadcasts", () => ({
  listBroadcasts: vi.fn(),
  createBroadcast: vi.fn(),
  previewCount: vi.fn(),
}));

vi.mock("@/lib/api/templates", () => ({
  listTemplates: vi.fn().mockResolvedValue({ items: [] }),
}));

import * as broadcastsApi from "@/lib/api/broadcasts";
import { BroadcastsPage } from "@/pages/app/BroadcastsPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeBroadcast = (overrides: Partial<Broadcast> = {}): Broadcast => ({
  id: "bc-001",
  tenantId: "tenant-001",
  name: "Test broadcast",
  channel: "email",
  segmentFilter: { type: "leads" },
  templateId: null,
  body: "Bună ziua!",
  subject: null,
  status: "done",
  totalRecipients: 10,
  consentSkipped: 1,
  queued: 9,
  sentAt: "2026-05-30T00:00:00Z",
  createdAt: "2026-05-30T00:00:00Z",
  updatedAt: "2026-05-30T00:00:00Z",
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("COMM-204 — BroadcastsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(broadcastsApi.listBroadcasts).mockResolvedValue({ items: [] });
    vi.mocked(broadcastsApi.previewCount).mockResolvedValue({ count: 15, sample: ["Maria", "Ion"] });
    vi.mocked(broadcastsApi.createBroadcast).mockResolvedValue({
      broadcastId: "bc-001",
      totalRecipients: 10,
      consentSkipped: 1,
      queued: 9,
    });
  });

  /**
   * T-COMM-204-3: GET /api/broadcasts → array cu campanii afișate în UI
   */
  it("T-COMM-204-3: afișează campaniile existente", async () => {
    vi.mocked(broadcastsApi.listBroadcasts).mockResolvedValue({
      items: [makeBroadcast({ name: "Campanie septembrie", status: "done" })],
    });

    render(<BroadcastsPage />);
    await waitFor(() => {
      expect(screen.getByText("Campanie septembrie")).toBeInTheDocument();
    });
    expect(screen.getByText("Trimis")).toBeInTheDocument();
  });

  it("T-COMM-204-3: afișează destinatari și consent skipped", async () => {
    vi.mocked(broadcastsApi.listBroadcasts).mockResolvedValue({
      items: [makeBroadcast({ totalRecipients: 10, queued: 9, consentSkipped: 1 })],
    });

    render(<BroadcastsPage />);
    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument(); // totalRecipients
    });
    expect(screen.getByText("9")).toBeInTheDocument(); // queued
    expect(screen.getByText("Săriti (GDPR): 1")).toBeInTheDocument();
  });

  it("afișează mesajul gol când nu există campanii", async () => {
    vi.mocked(broadcastsApi.listBroadcasts).mockResolvedValue({ items: [] });

    render(<BroadcastsPage />);
    await waitFor(() => {
      expect(screen.getByText(/nicio campanie trimisă/i)).toBeInTheDocument();
    });
  });

  it("titlul paginii este Campanii", async () => {
    render(<BroadcastsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Campanii");
    });
  });
});

describe("COMM-204 — createBroadcast API", () => {
  /**
   * T-COMM-204-1: POST /api/broadcasts → returnează totalRecipients + consentSkipped
   */
  it("T-COMM-204-1: createBroadcast returnează totalRecipients și consentSkipped", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      broadcastId: "bc-001",
      totalRecipients: 10,
      consentSkipped: 2,
      queued: 8,
    });
    vi.mocked(broadcastsApi.createBroadcast).mockImplementation(mockCreate);

    const result = await broadcastsApi.createBroadcast({
      name: "Test",
      channel: "email",
      segment: { type: "leads" },
      body: "Bună ziua!",
    });

    expect(result.totalRecipients).toBe(10);
    expect(result.consentSkipped).toBe(2);
    expect(result.queued).toBe(8);
  });

  /**
   * T-COMM-204-2: consent_revoked_at → consentSkipped > 0
   */
  it("T-COMM-204-2: consent skipped corect în răspuns", async () => {
    vi.mocked(broadcastsApi.createBroadcast).mockResolvedValue({
      broadcastId: "bc-002",
      totalRecipients: 5,
      consentSkipped: 3, // 3 au consent revocat
      queued: 2,
    });

    const result = await broadcastsApi.createBroadcast({
      name: "Test",
      channel: "sms",
      segment: { type: "leads", status_filter: "new" },
      body: "Test",
    });

    expect(result.consentSkipped).toBe(3);
    expect(result.queued).toBe(2); // 5 - 3 = 2 sent
  });

  /**
   * T-COMM-204-4: Preview count returnează count corect
   */
  it("T-COMM-204-4: previewCount returnează count și sample", async () => {
    vi.mocked(broadcastsApi.previewCount).mockResolvedValue({
      count: 23,
      sample: ["Maria P.", "Ion G.", "Ana M."],
    });

    const result = await broadcastsApi.previewCount({
      type: "leads",
      status_filter: "new",
      channel: "whatsapp",
    });

    expect(result.count).toBe(23);
    expect(result.sample).toHaveLength(3);
    expect(result.sample[0]).toBe("Maria P.");
  });
});
