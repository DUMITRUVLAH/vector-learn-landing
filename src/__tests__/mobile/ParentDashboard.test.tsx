/**
 * MOB-104: Parent Dashboard + Balance API tests
 * T-MOB-104-4 [normal] Given ParentDashboardPage rendered with mock data, When mounts, Then shows balance card and upcoming lessons.
 * T-MOB-104-5 [normal] Given parent without linked student, When /m/parent loaded, Then shows "Niciun elev asociat" empty state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ParentDashboardPage } from "@/pages/app/mobile/ParentDashboardPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: mockNavigate, path: "/m/parent" }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-parent-1", role: "parent", name: "Ana Popescu" } },
    logout: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helper to mock fetch responses
// ---------------------------------------------------------------------------

function mockFetch(balanceData: unknown, upcomingData: unknown) {
  global.fetch = vi.fn((url: RequestInfo | URL) => {
    const u = url.toString();
    if (u.includes("/api/m/parent/balance")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(balanceData),
      } as Response);
    }
    if (u.includes("/api/m/parent/upcoming-lessons")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(upcomingData),
      } as Response);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${u}`));
  });
}

// The component uses the `api` utility — we need to mock the module
vi.mock("@/lib/api", () => ({
  api: vi.fn((url: string) => {
    if (url === "/api/m/parent/balance") {
      return Promise.resolve({
        student: { id: "stu-1", fullName: "Ion Popescu", email: "ion@test.com" },
        outstandingTotal: 50000, // 500 RON
        invoices: [
          {
            id: "inv-1",
            amountCents: 50000,
            dueDate: "2026-07-01T00:00:00Z",
            status: "pending",
            pdfUrl: "/api/invoices/inv-1/pdf",
          },
        ],
      });
    }
    if (url === "/api/m/parent/upcoming-lessons") {
      return Promise.resolve({
        lessons: [
          {
            id: "les-1",
            scheduledAt: "2026-06-10T10:00:00Z",
            durationMinutes: 60,
            meetingUrl: null,
            courseName: "Engleză A1",
            teacherName: "Prof. Maria",
            roomName: "Sala 3",
          },
        ],
      });
    }
    return Promise.reject(new Error(`Unexpected api call: ${url}`));
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ParentDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-MOB-104-4 shows balance card and upcoming lessons when student is linked", async () => {
    render(<ParentDashboardPage />);

    // Initially shows loader
    expect(screen.getByLabelText(/se încarcă/i)).toBeInTheDocument();

    await waitFor(() => {
      // Student name shown
      expect(screen.getByText("Ion Popescu")).toBeInTheDocument();
    });

    // Balance section visible
    expect(screen.getByText(/balanță/i)).toBeInTheDocument();

    // Total outstanding shown (500.00 RON) — at least one match
    expect(screen.getAllByText(/500[.,]00/).length).toBeGreaterThan(0);

    // Upcoming lesson visible
    expect(screen.getByText("Engleză A1")).toBeInTheDocument();
    expect(screen.getByText(/Prof\. Maria/)).toBeInTheDocument();
  });

  it("T-MOB-104-5 shows empty state when no student is linked", async () => {
    const { api } = await import("@/lib/api");
    vi.mocked(api).mockResolvedValueOnce({
      student: null,
      outstandingTotal: 0,
      invoices: [],
    });
    vi.mocked(api).mockResolvedValueOnce({ lessons: [] });

    render(<ParentDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/niciun elev asociat/i)).toBeInTheDocument();
    });
  });
});
