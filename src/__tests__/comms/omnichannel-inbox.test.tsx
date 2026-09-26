/**
 * COMMS-301 — interfața inboxului omnicanal și a conectării canalelor.
 *
 * Ce se verifică: ACȚIUNILE (trimiterea, conectarea), nu doar că ecranul se randează
 * (CLAUDE.md §3.5.1quater). Și regulile furnizorilor se văd ÎNAINTE de a scrie: în afara
 * ferestrei de 24h WhatsApp nu există câmp de text liber, ci „Alege template".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-1", name: "Ana Admin", role: "admin" }, tenant: { name: "Alfa", slug: "alfa", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

let routerPath = "/business/crm/mesaje?c=conv-1";
const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: routerPath, navigate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const api = {
  listConversations: vi.fn(),
  getInboxSummary: vi.fn(),
  getConversation: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
  syncGmail: vi.fn(),
  updateConversation: vi.fn(),
  listTemplates: vi.fn(),
  listChannels: vi.fn(),
  connectChannel: vi.fn(),
  simulateInbound: vi.fn(),
};
vi.mock("@/lib/api/comms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/comms")>("@/lib/api/comms");
  const wrapped = Object.fromEntries(Object.keys(api).map((k) => [k, (...a: unknown[]) => (api as Record<string, (...x: unknown[]) => unknown>)[k](...a)]));
  return { ...actual, ...wrapped };
});

const { CrmInboxPage } = await import("@/pages/business/crm/CrmInboxPage");
const { CrmChannelsPage } = await import("@/pages/business/crm/CrmChannelsPage");

const listItem = {
  id: "conv-1",
  status: "open",
  subject: null,
  unreadCount: 2,
  lastMessageAt: new Date().toISOString(),
  lastMessagePreview: "Aveți locuri?",
  lastMessageDirection: "inbound",
  lastInboundAt: new Date().toISOString(),
  assignedTo: null,
  assignedName: null,
  channelId: "ch-1",
  channelKind: "whatsapp",
  channelName: "WhatsApp vânzări",
  contactId: "ct-1",
  contactName: "Maria Pop",
  contactPhone: "+37360000001",
  contactEmail: null,
  contactUsername: null,
  contactAvatar: null,
  contactBlocked: null,
  leadId: "lead-1",
  leadName: "Maria Pop",
};

function detail(over: Partial<{ needsTemplate: boolean; blocked: boolean; reason: string | null }> = {}) {
  return {
    conversation: { id: "conv-1", status: "open", subject: null, assignedTo: null, unreadCount: 0, lastInboundAt: new Date().toISOString(), leadId: "lead-1" },
    channel: { id: "ch-1", kind: "whatsapp", name: "WhatsApp vânzări", status: "active", mock: false },
    contact: { id: "ct-1", externalUserId: "37360000001", displayName: "Maria Pop", phone: "+37360000001", email: null, username: null, avatarUrl: null, blockedAt: null },
    lead: { id: "lead-1", fullName: "Maria Pop", phone: "+37360000001", email: null, stage: "new" },
    messages: [
      {
        id: "m-1",
        direction: "inbound",
        kind: "text",
        body: "Aveți locuri?",
        subject: null,
        media: null,
        status: "received",
        errorCode: null,
        errorMessage: null,
        templateName: null,
        senderUserId: null,
        senderName: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
    compose: {
      canSendFreeform: !over.needsTemplate && !over.blocked,
      needsTemplate: over.needsTemplate ?? false,
      blocked: over.blocked ?? false,
      reason: over.reason ?? null,
      consentRevoked: false,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routerPath = "/business/crm/mesaje?c=conv-1";
  api.listConversations.mockResolvedValue({ items: [listItem] });
  api.getInboxSummary.mockResolvedValue({ unread: 2, byKind: { whatsapp: { unread: 2, conversations: 1 } } });
  api.getConversation.mockResolvedValue(detail());
  api.markConversationRead.mockResolvedValue({ ok: true });
  api.syncGmail.mockResolvedValue({ ok: true, messages: 0, errors: [] });
  api.sendMessage.mockResolvedValue({ message: { ...detail().messages[0], id: "m-2", direction: "outbound", status: "sent", body: "Da!" } });
  api.listTemplates.mockResolvedValue({
    templates: [{ name: "salut_revenire", language: "ro", category: "UTILITY", status: "APPROVED", body: "Bună, {{1}}! Revin despre {{2}}.", paramCount: 2 }],
  });
});

describe("inboxul omnicanal", () => {
  it("[blocant] listează conversația și TRIMITE răspunsul pe conversația deschisă", async () => {
    render(<CrmInboxPage />);
    expect(await screen.findByText("Aveți locuri?", { selector: "p" })).toBeInTheDocument();
    expect(screen.getAllByText("Maria Pop").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Mesaj"), { target: { value: "Da, avem!" } });
    fireEvent.click(screen.getByRole("button", { name: /Trimite/ }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith("conv-1", { text: "Da, avem!", subject: null }));
  });

  it("[blocant] în afara ferestrei de 24h: fără text liber, doar template cu parametri", async () => {
    api.getConversation.mockResolvedValue(detail({ needsTemplate: true, reason: "Au trecut peste 24h — doar template aprobat." }));
    render(<CrmInboxPage />);
    expect(await screen.findByText(/doar template aprobat/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Mesaj")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alege template" }));
    const pick = await screen.findByLabelText("Template");
    fireEvent.change(pick, { target: { value: "salut_revenire|ro" } });
    fireEvent.change(screen.getByLabelText("Parametrul 1"), { target: { value: "Maria" } });
    fireEvent.change(screen.getByLabelText("Parametrul 2"), { target: { value: "curs" } });
    fireEvent.click(screen.getByRole("button", { name: "Trimite template" }));
    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith("conv-1", { template: { name: "salut_revenire", language: "ro", params: ["Maria", "curs"] } })
    );
  });

  it("botul blocat: motivul e afișat și nu există compunere", async () => {
    api.getConversation.mockResolvedValue(detail({ blocked: true, reason: "Clientul a blocat botul." }));
    render(<CrmInboxPage />);
    expect(await screen.findByText("Clientul a blocat botul.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mesaj")).not.toBeInTheDocument();
  });

  it("un mesaj care nu a plecat își spune motivul", async () => {
    api.sendMessage.mockResolvedValue({ message: { ...detail().messages[0], id: "m-3", direction: "outbound", status: "failed", errorMessage: "Numărul nu are WhatsApp" } });
    render(<CrmInboxPage />);
    fireEvent.change(await screen.findByLabelText("Mesaj"), { target: { value: "Salut" } });
    fireEvent.click(screen.getByRole("button", { name: /Trimite/ }));
    expect(await screen.findByText("Numărul nu are WhatsApp")).toBeInTheDocument();
  });
});

describe("conectarea canalelor", () => {
  beforeEach(() => {
    routerPath = "/business/crm/canale";
    api.listChannels.mockResolvedValue({
      channels: [],
      platform: { gmailConfigured: false, gmailPush: false, whatsappPlatformApp: false, mockAllowed: true, encryptionKeySet: true, publicBaseUrl: "https://app" },
    });
  });

  it("[blocant] conectează un bot Telegram cu tokenul lipit (acțiunea, nu doar butonul)", async () => {
    api.connectChannel.mockResolvedValue({
      channel: { id: "ch-9", kind: "telegram", name: "Telegram", status: "active", externalId: "1", config: { botUsername: "acme_bot" }, lastError: null, lastEventAt: null, createdAt: "", mock: false, webhookUrl: "https://app/x", verifyToken: null, connectedBy: "user-1" },
      manualSteps: [],
    });
    render(<CrmChannelsPage />);
    const buttons = await screen.findAllByRole("button", { name: /^Conectează$/ });
    fireEvent.click(buttons[1]); // WhatsApp, Telegram, Viber — în ordinea cardurilor
    fireEvent.change(await screen.findByLabelText("Token bot"), { target: { value: "123456:AAAAAAAAAAAAAAAAAAAAAAAA" } });
    const dialogButtons = screen.getAllByRole("button", { name: /^Conectează$/ });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() =>
      expect(api.connectChannel).toHaveBeenCalledWith({
        kind: "telegram",
        name: "Telegram",
        credentials: { botToken: "123456:AAAAAAAAAAAAAAAAAAAAAAAA" },
        config: {},
        mock: false,
      })
    );
  });

  it("Gmail neconfigurat pe platformă: butonul e dezactivat și spune de ce", async () => {
    render(<CrmChannelsPage />);
    expect(await screen.findByText(/Integrarea Google nu e configurată/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Conectează cu Google/ })).toBeDisabled();
  });

  it("după conectarea WhatsApp arată URL-ul și verify token-ul de lipit în Meta", async () => {
    api.connectChannel.mockResolvedValue({
      channel: { id: "ch-w", kind: "whatsapp", name: "WhatsApp", status: "active", externalId: "1", config: {}, lastError: null, lastEventAt: null, createdAt: "", mock: false, webhookUrl: "https://app/api/comms/webhooks/whatsapp/abc", verifyToken: "abc", connectedBy: "u" },
      manualSteps: ["Lipește Callback URL și Verify token în Meta."],
    });
    render(<CrmChannelsPage />);
    const buttons = await screen.findAllByRole("button", { name: /^Conectează$/ });
    fireEvent.click(buttons[0]);
    fireEvent.change(await screen.findByLabelText(/Access token/), { target: { value: "EAA" } });
    fireEvent.change(screen.getByLabelText("Phone Number ID"), { target: { value: "1065" } });
    fireEvent.change(screen.getByLabelText("App Secret"), { target: { value: "sec" } });
    const dialogButtons = screen.getAllByRole("button", { name: /^Conectează$/ });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    expect(await screen.findByText("Un ultim pas în Meta")).toBeInTheDocument();
    expect(screen.getByText("https://app/api/comms/webhooks/whatsapp/abc")).toBeInTheDocument();
  });
});
