/**
 * MOB-102 — T-MOB-102-4, T-MOB-102-5
 * Tests for mobile homework list page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn(() => ({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Maria", email: "maria@test.com", role: "student" },
      tenant: { id: "t1", name: "Academy", slug: "test", plan: "starter" },
    },
    logout: vi.fn(),
  })),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn(() => ({ path: "/m/homework", navigate: vi.fn() })),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
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

import { HomeworkPage } from "@/pages/app/mobile/HomeworkPage";
import { api } from "@/lib/api";

const apiMock = vi.mocked(api);

const now = new Date();
const futureDeadline = new Date(now.getTime() + 3 * 24 * 3600000).toISOString();
const pastDeadline = new Date(now.getTime() - 2 * 24 * 3600000).toISOString();

const mockHomeworkItems = [
  { id: "hw1", body: "Scrie un eseu despre toamnă", deadline: futureDeadline, status: "pending" as const, lessonId: "l1", createdAt: now.toISOString() },
  { id: "hw2", body: "Rezolvă exercițiile 1-5", deadline: pastDeadline, status: "pending" as const, lessonId: "l2", createdAt: now.toISOString() },
  { id: "hw3", body: "Citește capitolul 3", deadline: futureDeadline, status: "submitted" as const, lessonId: "l3", createdAt: now.toISOString() },
];

describe("HomeworkPage — T-MOB-102-4 [normal]", () => {
  beforeEach(() => {
    apiMock.mockResolvedValue({ homework: mockHomeworkItems });
  });

  it("renders homework items loaded from API", async () => {
    render(<HomeworkPage />);
    const item = await screen.findByText("Scrie un eseu despre toamnă");
    expect(item).toBeInTheDocument();
    expect(screen.getByText("Rezolvă exercițiile 1-5")).toBeInTheDocument();
    expect(screen.getByText("Citește capitolul 3")).toBeInTheDocument();
  });

  it("shows status labels for each homework item", async () => {
    render(<HomeworkPage />);
    await screen.findByText("Scrie un eseu despre toamnă");
    const pendingLabels = screen.getAllByText("În așteptare");
    expect(pendingLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Trimis")).toBeInTheDocument();
  });

  it("shows 'Trimite tema' button for pending homework", async () => {
    render(<HomeworkPage />);
    await screen.findByText("Scrie un eseu despre toamnă");
    const submitBtns = screen.getAllByText("Trimite tema");
    expect(submitBtns.length).toBeGreaterThanOrEqual(1);
  });
});

describe("HomeworkPage — T-MOB-102-5 [normal] — overdue filter", () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (url: string) => {
      if ((url as string).includes("filter=overdue")) {
        return { homework: [mockHomeworkItems[1]] };
      }
      return { homework: mockHomeworkItems };
    });
  });

  it("clicking 'Doar restante' filter re-fetches with filter=overdue and shows only overdue items", async () => {
    render(<HomeworkPage />);
    await screen.findByText("Scrie un eseu despre toamnă");

    const filterBtn = screen.getByText("Doar restante");
    fireEvent.click(filterBtn);

    const overdueItem = await screen.findByText("Rezolvă exercițiile 1-5");
    expect(overdueItem).toBeInTheDocument();
    expect(screen.queryByText("Scrie un eseu despre toamnă")).not.toBeInTheDocument();
  });
});
