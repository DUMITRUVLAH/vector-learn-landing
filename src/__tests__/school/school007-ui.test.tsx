/**
 * SCHOOL-007 — T-SCHOOL-007-6: ParentPortalPage render test
 *
 * Smoke test: pagina se randează fără crash cu date mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/api/parentPortal", () => ({
  listChildren: vi.fn().mockResolvedValue({
    children: [
      {
        id: "s1",
        fullName: "Andrei Popescu",
        classId: "class-1",
        className: "a V-a A",
      },
    ],
  }),
  listChildGrades: vi.fn().mockResolvedValue({ grades: [] }),
  listChildAttendance: vi.fn().mockResolvedValue({ attendance: [] }),
  listChildTuition: vi.fn().mockResolvedValue({ plan: null, installments: [] }),
  listParentNews: vi.fn().mockResolvedValue({ news: [] }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn().mockReturnValue({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Maria Ionescu", role: "parent" },
      tenant: { id: "t1", name: "Demo School" },
    },
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn().mockReturnValue({ navigate: vi.fn(), path: "/app/parent/portal" }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

import { ParentPortalPage } from "../../pages/app/ParentPortalPage";

describe("ParentPortalPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-SCHOOL-007-6: se randează fără crash", () => {
    const { container } = render(<ParentPortalPage />);
    expect(container).toBeTruthy();
  });

  it("[normal] afișează titlul 'Portal Părinți'", () => {
    render(<ParentPortalPage />);
    expect(screen.getByText("Portal Părinți")).toBeTruthy();
  });
});
