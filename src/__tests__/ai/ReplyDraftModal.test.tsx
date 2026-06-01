/**
 * AI-A03 — ReplyDraftModal UI tests (T-AI-A03-5, T-AI-A03-6)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReplyDraftModal } from "../../components/app/ReplyDraftModal";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const onClose = vi.fn();
const onSend = vi.fn();

function mountModal(props = {}) {
  return render(
    <ReplyDraftModal
      messageText="Cât costă cursul de engleză?"
      onClose={onClose}
      onSend={onSend}
      {...props}
    />
  );
}

describe("ReplyDraftModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-AI-A03-5: renders original message and generate button", () => {
    mountModal();
    expect(screen.getByText("Cât costă cursul de engleză?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generează sugestie/i })).toBeInTheDocument();
  });

  it("T-AI-A03-5: shows AI draft warning banner", () => {
    mountModal();
    expect(screen.getByText(/AI draft — verifică înainte de trimitere/i)).toBeInTheDocument();
  });

  it("T-AI-A03-6: clicking Anulează calls onClose", async () => {
    // First generate a draft
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        draft: "Bună ziua! Costul este...",
        auditId: "a1",
        isStub: true,
      }),
    });

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /generează sugestie/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/draft răspuns ai/i)).toBeInTheDocument();
    });

    const cancelBtn = screen.getByRole("button", { name: /anulează/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows draft textarea after successful generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        draft: "Bună ziua! Prețul cursului este...",
        auditId: "audit-1",
        isStub: true,
      }),
    });

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /generează sugestie/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/draft răspuns ai/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Bună ziua! Prețul cursului este...")).toBeInTheDocument();
  });

  it("shows error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /generează sugestie/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("Trimite button calls onSend with draft and closes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        draft: "Bună ziua! Vă contactăm.",
        auditId: "a2",
        isStub: false,
      }),
    });

    mountModal();
    fireEvent.click(screen.getByRole("button", { name: /generează sugestie/i }));

    await waitFor(() => screen.getByLabelText(/draft răspuns ai/i));

    const sendBtn = screen.getByRole("button", { name: /trimite răspunsul/i });
    fireEvent.click(sendBtn);

    expect(onSend).toHaveBeenCalledWith("Bună ziua! Vă contactăm.");
    expect(onClose).toHaveBeenCalled();
  });
});
