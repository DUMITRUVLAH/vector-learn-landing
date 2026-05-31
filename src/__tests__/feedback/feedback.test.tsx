/**
 * FB — Feedback forms module tests.
 * Covers: manager page type-picker + form list rendering, and the public
 * student-facing form (render, required-validation gating, submit).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/api/feedback", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/feedback")>("@/lib/api/feedback");
  return {
    ...actual,
    listForms: vi.fn(),
    createForm: vi.fn(),
    deleteForm: vi.fn(),
    getPublicForm: vi.fn(),
    submitPublicForm: vi.fn(),
  };
});

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    error: null,
    logout: vi.fn(),
    data: {
      user: { id: "u1", email: "a@b.c", name: "Andreea", role: "admin" },
      tenant: { id: "t1", name: "Demo School", slug: "demo", plan: "growth" },
    },
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/feedback" }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import * as feedbackApi from "@/lib/api/feedback";
import { FeedbackPage } from "@/pages/app/FeedbackPage";
import { FeedbackPublicPage } from "@/pages/app/FeedbackPublicPage";
import type { FeedbackFormListItem, PublicForm } from "@/lib/api/feedback";

const listForms = feedbackApi.listForms as ReturnType<typeof vi.fn>;
const getPublicForm = feedbackApi.getPublicForm as ReturnType<typeof vi.fn>;
const submitPublicForm = feedbackApi.submitPublicForm as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FB — manager FeedbackPage", () => {
  it("shows the three stage templates with the owner's labels/descriptions", async () => {
    listForms.mockResolvedValue({ items: [] });
    render(<FeedbackPage />);

    // Each label appears once in the type-picker when there are no forms yet.
    expect(await screen.findByText("Feedback Inițial")).toBeInTheDocument();
    expect(screen.getByText("Feedback Mijloc Curs")).toBeInTheDocument();
    expect(screen.getByText("Feedback Final")).toBeInTheDocument();
    expect(screen.getByText("Trimis după prima săptămână de curs")).toBeInTheDocument();
    expect(screen.getByText("Tipuri de formulare")).toBeInTheDocument();
  });

  it("shows empty state when there are no forms", async () => {
    listForms.mockResolvedValue({ items: [] });
    render(<FeedbackPage />);
    expect(await screen.findByText("Niciun formular încă")).toBeInTheDocument();
  });

  it("lists existing forms with sent/submitted counts", async () => {
    const form: FeedbackFormListItem = {
      id: "f1",
      tenantId: "t1",
      stage: "initial",
      title: "Feedback Inițial",
      description: "x",
      courseId: null,
      isActive: true,
      stageMeta: { label: "Feedback Inițial", description: "x" },
      createdAt: "",
      updatedAt: "",
      questionCount: 4,
      sentCount: 8,
      submittedCount: 6,
    };
    listForms.mockResolvedValue({ items: [form] });
    render(<FeedbackPage />);

    expect(await screen.findByText("Formularele tale")).toBeInTheDocument();
    expect(screen.getByText(/trimis la 8/)).toBeInTheDocument();
    expect(screen.getByText(/răspuns 6/)).toBeInTheDocument();
  });
});

describe("FB — public student form", () => {
  const publicForm: PublicForm = {
    alreadySubmitted: false,
    studentName: "Maria Popescu",
    form: {
      id: "f1",
      title: "Părerea ta despre primul modul",
      description: "Trimis după prima săptămână",
      stage: "initial",
      stageMeta: { label: "Feedback Inițial", description: "x" },
    },
    questions: [
      { id: "q1", type: "rating", label: "Cât de mulțumit ești?", options: [], required: true },
      { id: "q2", type: "text", label: "Comentarii?", options: [], required: false },
    ],
  };

  it("renders the form with greeting and questions", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    render(<FeedbackPublicPage token="abc" />);

    expect(await screen.findByText("Părerea ta despre primul modul")).toBeInTheDocument();
    expect(screen.getByText("Feedback Inițial")).toBeInTheDocument();
    expect(screen.getByText("Salut, Maria Popescu!")).toBeInTheDocument();
    expect(screen.getByText(/Cât de mulțumit ești/)).toBeInTheDocument();
  });

  it("disables submit until required questions are answered, then submits", async () => {
    getPublicForm.mockResolvedValue(publicForm);
    submitPublicForm.mockResolvedValue({ ok: true });
    render(<FeedbackPublicPage token="abc" />);

    const submit = (await screen.findByRole("button", { name: /Trimite răspunsurile/ })) as HTMLButtonElement;
    expect(submit).toBeDisabled();

    // Answer the required rating (click the 5th star).
    const stars = screen.getAllByRole("radio", { name: /stele|stea/ });
    fireEvent.click(stars[4]);

    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(submitPublicForm).toHaveBeenCalledOnce());
    const [, answers] = submitPublicForm.mock.calls[0];
    expect(answers).toEqual([{ questionId: "q1", valueNumber: 5, valueText: null }]);

    expect(await screen.findByText("Mulțumim pentru feedback!")).toBeInTheDocument();
  });

  it("shows the already-submitted thank-you when invitation is done", async () => {
    getPublicForm.mockResolvedValue({ ...publicForm, alreadySubmitted: true });
    render(<FeedbackPublicPage token="abc" />);
    expect(await screen.findByText("Mulțumim pentru feedback!")).toBeInTheDocument();
  });

  it("shows invalid-link state on 404", async () => {
    const { ApiError } = await import("@/lib/api");
    getPublicForm.mockRejectedValue(new ApiError(404, "not_found"));
    render(<FeedbackPublicPage token="bad" />);
    expect(await screen.findByText("Link invalid")).toBeInTheDocument();
  });
});
