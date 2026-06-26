/**
 * SHELL-503: InvitePage component tests
 *
 * Tests: loading state, invalid/expired invite rendering,
 * Google sign-in button, password form, a11y basics.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InvitePage } from "../pages/business/InvitePage";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the router so we don't need HashRouter in tests.
vi.mock("../router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/business/invite?token=abc" }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

// Mock the PAR API helpers.
vi.mock("../lib/api/par", () => ({
  getInviteInfo: vi.fn(),
  acceptInvite: vi.fn(),
}));

// Mock AuthLayout to a simple wrapper so we test content only.
vi.mock("../components/app/AuthLayout", () => ({
  AuthLayout: ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div>{children}</div>
    </div>
  ),
}));

import { getInviteInfo, acceptInvite } from "../lib/api/par";
import { ApiError } from "../lib/api";

const mockGetInviteInfo = getInviteInfo as ReturnType<typeof vi.fn>;
const mockAcceptInvite = acceptInvite as ReturnType<typeof vi.fn>;

// Stub window.location.hash so getTokenFromHash() works.
function setHash(hash: string) {
  Object.defineProperty(window, "location", {
    value: { ...window.location, hash },
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setHash("#/business/invite?token=test-token-abc");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InvitePage", () => {
  it("shows loading state initially", () => {
    // getInviteInfo never resolves (pending promise)
    mockGetInviteInfo.mockReturnValue(new Promise(() => {}));
    render(<InvitePage />);
    // Should show the loading heading
    expect(screen.getByText("Invitație PAR")).toBeInTheDocument();
  });

  it("shows invite details when valid", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "requestor",
      orgName: "ONG Vector",
    });

    render(<InvitePage />);

    await waitFor(() => {
      expect(screen.getByText("ONG Vector")).toBeInTheDocument();
    });

    expect(screen.getByText("Solicitant")).toBeInTheDocument();
    expect(screen.getByText("ion@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuă cu Google/i })).toBeInTheDocument();
  });

  it("shows invalid state when token not found (404)", async () => {
    const apiErr = new ApiError(404, "invite_not_found", "Invite not found");
    mockGetInviteInfo.mockRejectedValueOnce(apiErr);

    render(<InvitePage />);

    await waitFor(() => {
      expect(screen.getByText("Invitație invalidă")).toBeInTheDocument();
    });
  });

  it("shows expired state when invite is expired (410)", async () => {
    const apiErr = new ApiError(410, "invite_expired", "Invite expired");
    mockGetInviteInfo.mockRejectedValueOnce(apiErr);

    render(<InvitePage />);

    await waitFor(() => {
      expect(screen.getByText("Invitație expirată")).toBeInTheDocument();
    });
  });

  it("renders password form with name + password fields and labels", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "approver",
      orgName: "Test Org",
    });

    render(<InvitePage />);

    await waitFor(() => expect(screen.getByText("Test Org")).toBeInTheDocument());

    // Both form fields must have visible labels (a11y)
    expect(screen.getByLabelText("Nume complet")).toBeInTheDocument();
    expect(screen.getByLabelText("Parolă")).toBeInTheDocument();
  });

  it("submit button is disabled when name/password are empty", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "finance",
      orgName: "Org",
    });

    render(<InvitePage />);
    await waitFor(() => expect(screen.getByText("Org")).toBeInTheDocument());

    const submitBtn = screen.getByRole("button", { name: /Creează cont/i });
    expect(submitBtn).toBeDisabled();
  });

  it("calls acceptInvite with token+name+password on form submit", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "requestor",
      orgName: "Org",
    });
    mockAcceptInvite.mockResolvedValueOnce({
      user: { id: "u1", email: "ion@example.com", name: "Ion", role: "teacher" },
    });

    render(<InvitePage />);
    await waitFor(() => expect(screen.getByText("Org")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Nume complet"), {
      target: { value: "Ion Popescu" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "securepassword123" },
    });

    const submitBtn = screen.getByRole("button", { name: /Creează cont/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAcceptInvite).toHaveBeenCalledWith({
        token: "test-token-abc",
        name: "Ion Popescu",
        password: "securepassword123",
      });
    });
  });

  it("shows wrong_password error on 401", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "requestor",
      orgName: "Org",
    });
    const apiErr = new ApiError(401, "wrong_password", "");
    mockAcceptInvite.mockRejectedValueOnce(apiErr);

    render(<InvitePage />);
    await waitFor(() => expect(screen.getByText("Org")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Nume complet"), {
      target: { value: "Ion Popescu" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "wrongpassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Creează cont/i }));

    await waitFor(() => {
      expect(screen.getByText(/Parolă greșită/i)).toBeInTheDocument();
    });
  });

  it("shows use_google_signin message on 409 use_google_signin", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "requestor",
      orgName: "Org",
    });
    const apiErr = new ApiError(409, "use_google_signin", "");
    mockAcceptInvite.mockRejectedValueOnce(apiErr);

    render(<InvitePage />);
    await waitFor(() => expect(screen.getByText("Org")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Nume complet"), {
      target: { value: "Ion Popescu" },
    });
    fireEvent.change(screen.getByLabelText("Parolă"), {
      target: { value: "anypassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Creează cont/i }));

    await waitFor(() => {
      // The error message should mention using Google sign-in
      expect(screen.getByText(/Continuă cu Google/i)).toBeInTheDocument();
    });
  });

  it("Google button points to /api/auth/google?invite=<token>", async () => {
    mockGetInviteInfo.mockResolvedValueOnce({
      email: "ion@example.com",
      parRole: "par_admin",
      orgName: "Org",
    });

    // Track window.location.href assignment
    const originalLocation = window.location;
    let navigatedTo = "";
    Object.defineProperty(window, "location", {
      value: {
        ...originalLocation,
        get href() { return ""; },
        set href(v: string) { navigatedTo = v; },
      },
      writable: true,
    });

    render(<InvitePage />);
    await waitFor(() => expect(screen.getByText("Org")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Continuă cu Google/i }));

    expect(navigatedTo).toContain("/api/auth/google?invite=");
    expect(navigatedTo).toContain("test-token-abc");

    // Restore
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  it("shows invalid state when no token in URL", async () => {
    setHash("#/business/invite");
    // No '?token=' in hash → getTokenFromHash returns null
    render(<InvitePage />);

    // With null token, page immediately moves to invalid state
    await waitFor(() => {
      expect(screen.getByText("Invitație invalidă")).toBeInTheDocument();
    });
  });
});
