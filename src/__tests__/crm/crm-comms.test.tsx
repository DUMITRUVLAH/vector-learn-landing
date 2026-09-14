/**
 * CRM — interfața pentru comunicare.
 *
 * Promisiunea pe care o verificăm: agentul află ACUM dacă emailul n-a plecat.
 * Alternativa — un dialog care se închide liniștit și un mesaj care n-a ajuns
 * nicăieri — e cel mai scump fel de eșec dintr-un CRM: se descoperă peste două
 * săptămâni, când clientul a cumpărat de la altcineva.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { whatsappLink } from "@/lib/api/crmComms";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Andreea Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    members: [{ id: "user-1", fullName: "Andreea Admin", email: "a@test.local", role: "owner" }],
    loading: false,
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/comunicare", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const sendCrmEmail = vi.fn();
const listCrmFeed = vi.fn();
vi.mock("@/lib/api/crmComms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmComms")>("@/lib/api/crmComms");
  return {
    ...actual,
    sendCrmEmail: (...a: unknown[]) => sendCrmEmail(...a),
    listCrmFeed: (...a: unknown[]) => listCrmFeed(...a),
  };
});

const { SendEmailDialog } = await import("@/components/crm/SendEmailDialog");
const { CrmCommsPage } = await import("@/pages/business/crm/CrmCommsPage");

// ─── Legătura WhatsApp ────────────────────────────────────────────────────────

describe("legătura WhatsApp", () => {
  it("[blocant] numărul local primește prefixul de țară", () => {
    // Fără 373, „069391979" duce la un număr din altă țară sau la nimic —
    // linkul se deschide gol și pare pur și simplu că nu merge.
    expect(whatsappLink("069391979")).toBe("https://wa.me/37369391979");
  });

  it("curăță spațiile, plusul și parantezele", () => {
    expect(whatsappLink("+373 (69) 39-19-79")).toBe("https://wa.me/37369391979");
  });

  it("acceptă numărul scris cu 00 în loc de +", () => {
    expect(whatsappLink("0037369391979")).toBe("https://wa.me/37369391979");
  });

  it("fără număr, nu inventează o legătură", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("fără cifre")).toBeNull();
  });
});

// ─── Dialogul de email ────────────────────────────────────────────────────────

describe("trimiterea unui email", () => {
  function open(defaultTo: string | null = "ion@exemplu.md") {
    return render(
      <SendEmailDialog
        leadId="lead-1"
        leadName="Agro Nord SRL"
        defaultTo={defaultTo}
        onClose={vi.fn()}
        onSent={vi.fn()}
      />
    );
  }

  it("adresa lead-ului e completată din start", () => {
    open();
    expect((screen.getByLabelText(/^către$/i) as HTMLInputElement).value).toBe("ion@exemplu.md");
  });

  it("[blocant] când emailul e BLOCAT, omul află pe loc și cu motivul", async () => {
    sendCrmEmail.mockResolvedValue({
      status: "blocked",
      detail: "Adresa e blocată de politica de trimitere (domeniu demo sau nelivrabil).",
      interaction: { id: "i1" },
    });

    open();
    fireEvent.change(screen.getByLabelText(/subiect/i), { target: { value: "Oferta" } });
    fireEvent.change(screen.getByLabelText(/mesaj/i), { target: { value: "Bună ziua" } });
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));

    expect(await screen.findByText(/emailul nu a plecat/i)).toBeTruthy();
    expect(screen.getByText(/domeniu demo sau nelivrabil/i)).toBeTruthy();
  });

  it("[blocant] chiar și când nu pleacă, omul e asigurat că a rămas urmă", async () => {
    // Altfel ar retrimite de trei ori, crezând că nu s-a înregistrat nimic.
    sendCrmEmail.mockResolvedValue({ status: "failed", detail: "Serviciul a răspuns 422.", interaction: { id: "i1" } });

    open();
    fireEvent.change(screen.getByLabelText(/subiect/i), { target: { value: "S" } });
    fireEvent.change(screen.getByLabelText(/mesaj/i), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));

    expect(await screen.findByText(/a rămas în cronologia lead-ului/i)).toBeTruthy();
  });

  it("un email trimis cu succes o spune clar", async () => {
    sendCrmEmail.mockResolvedValue({ status: "sent", interaction: { id: "i1" } });

    open();
    fireEvent.change(screen.getByLabelText(/subiect/i), { target: { value: "S" } });
    fireEvent.change(screen.getByLabelText(/mesaj/i), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));

    expect(await screen.findByText(/^email trimis$/i)).toBeTruthy();
  });

  it("butonul stă blocat până sunt completate toate cele trei câmpuri", () => {
    open(null);
    const send = screen.getByRole("button", { name: /trimite/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/^către$/i), { target: { value: "x@y.md" } });
    fireEvent.change(screen.getByLabelText(/subiect/i), { target: { value: "S" } });
    expect((screen.getByRole("button", { name: /trimite/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/mesaj/i), { target: { value: "B" } });
    expect((screen.getByRole("button", { name: /trimite/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ─── Fluxul echipei ───────────────────────────────────────────────────────────

const FEED = [
  {
    id: "f1",
    leadId: "l1",
    leadName: "Maria Ionescu",
    leadCompany: "Agro Nord",
    type: "call" as const,
    direction: "outbound",
    body: "A răspuns · 3 min 5 s",
    metadata: {},
    occurredAt: new Date().toISOString(),
    userName: "Ana Pop",
  },
  {
    id: "f2",
    leadId: "l2",
    leadName: "Ion Popescu",
    leadCompany: null,
    type: "email" as const,
    direction: "outbound",
    body: "Oferta noastră",
    metadata: { status: "blocked" },
    occurredAt: new Date().toISOString(),
    userName: "Ana Pop",
  },
];

describe("fluxul de comunicare", () => {
  it("fiecare rând spune pe cine, ce canal și cine a făcut-o", async () => {
    listCrmFeed.mockResolvedValue({ items: FEED });
    render(<CrmCommsPage />);

    expect(await screen.findByText("Maria Ionescu")).toBeTruthy();
    expect(screen.getByText("Agro Nord")).toBeTruthy();
    expect(screen.getByText(/apel trimis/i)).toBeTruthy();
    expect(screen.getAllByText("Ana Pop").length).toBeGreaterThan(0);
  });

  it("[blocant] un email care nu a plecat se vede ca atare ÎN FLUX", async () => {
    // Într-un flux de activitate, un email eșuat care arată la fel ca unul
    // reușit face șeful să creadă că s-a lucrat de două ori mai mult.
    listCrmFeed.mockResolvedValue({ items: FEED });
    render(<CrmCommsPage />);
    expect(await screen.findByText(/nu a plecat/i)).toBeTruthy();
  });

  it("filtrele cer alt flux de la server, nu taie lista în memorie", async () => {
    listCrmFeed.mockResolvedValue({ items: FEED });
    render(<CrmCommsPage />);
    await screen.findByText("Maria Ionescu");
    listCrmFeed.mockClear();

    fireEvent.change(screen.getByLabelText(/canal/i), { target: { value: "whatsapp" } });
    await waitFor(() => expect(listCrmFeed).toHaveBeenCalledWith({ channel: "whatsapp", owner: null }));
  });

  it("fără nicio comunicare, ecranul spune de unde pornește una", async () => {
    listCrmFeed.mockResolvedValue({ items: [] });
    render(<CrmCommsPage />);
    expect(await screen.findByText(/nicio comunicare înregistrată/i)).toBeTruthy();
    expect(screen.getByText(/fișa lead-ului/i)).toBeTruthy();
  });
});
