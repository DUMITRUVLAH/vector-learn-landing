/**
 * MOB-101 — T-MOB-101-2, T-MOB-101-4, T-MOB-101-5
 * Tests for student mobile dashboard page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock modules before imports
vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn(() => ({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Maria Ionescu", email: "maria@test.com", role: "student" },
      tenant: { id: "t1", name: "Test Academy", slug: "test", plan: "starter" },
    },
    logout: vi.fn(),
  })),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn(() => ({ path: "/m/dashboard", navigate: vi.fn() })),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

// Import after mocks are set up
import { StudentDashboardPage } from "@/pages/app/mobile/StudentDashboardPage";
import { api } from "@/lib/api";

const apiMock = vi.mocked(api);

const defaultDashboard = {
  student: { id: "s1", fullName: "Maria Ionescu", email: "maria@test.com", status: "active" },
  nextLesson: {
    id: "l1",
    scheduledAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    durationMinutes: 60,
    meetingUrl: null,
    courseName: "Engleză B2",
    teacherName: "Prof. Popescu",
    roomName: "Sala 3",
  },
};

describe("StudentDashboardPage — T-MOB-101-2 [blocant]", () => {
  beforeEach(() => {
    apiMock.mockResolvedValue(defaultDashboard);
  });

  it("renders 'Bună ziua' greeting with student first name", async () => {
    render(<StudentDashboardPage />);
    const greeting = await screen.findByText(/Bună ziua/i);
    expect(greeting).toBeInTheDocument();
    expect(greeting.textContent).toMatch(/Maria/);
  });

  it("renders next lesson card with course name", async () => {
    render(<StudentDashboardPage />);
    const courseName = await screen.findByText("Engleză B2");
    expect(courseName).toBeInTheDocument();
  });

  it("renders teacher name in next lesson card", async () => {
    render(<StudentDashboardPage />);
    const teacher = await screen.findByText("Prof. Popescu");
    expect(teacher).toBeInTheDocument();
  });

  it("renders quick-action links for Orar, Teme, Plăți", async () => {
    render(<StudentDashboardPage />);
    await screen.findByText(/Bună ziua/i);
    expect(screen.getByText("Orar")).toBeInTheDocument();
    expect(screen.getByText("Teme")).toBeInTheDocument();
    expect(screen.getByText("Plăți")).toBeInTheDocument();
  });
});

describe("StudentDashboardPage — T-MOB-101-4 [normal] — empty state", () => {
  beforeEach(() => {
    apiMock.mockResolvedValue({
      student: { id: "s1", fullName: "Maria Ionescu", email: null, status: "active" },
      nextLesson: null,
    });
  });

  it("shows 'Nicio lecție programată' when no next lesson", async () => {
    render(<StudentDashboardPage />);
    const empty = await screen.findByText(/Nicio lecție programată/i);
    expect(empty).toBeInTheDocument();
  });
});
