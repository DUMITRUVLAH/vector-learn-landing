import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AutomationBuilder,
  buildSummary,
  type AutomationConfig,
} from "@/components/modules/comunicare/AutomationBuilder";
import {
  MessagePreview,
  interpolate,
} from "@/components/modules/comunicare/MessagePreview";
import { ComunicarePage } from "@/pages/modules/ComunicarePage";
import { HashRouter } from "@/router/HashRouter";

describe("interpolate", () => {
  it("replaces {nume} placeholder", () => {
    expect(interpolate("Salut, {nume}!", { nume: "Maria", curs: "X", data: "Y" })).toBe("Salut, Maria!");
  });

  it("replaces multiple placeholders in one pass", () => {
    expect(
      interpolate("{nume} la {curs} pe {data}", { nume: "Ana", curs: "Pian", data: "joi" })
    ).toBe("Ana la Pian pe joi");
  });

  it("replaces same placeholder multiple times", () => {
    expect(interpolate("{nume} {nume}", { nume: "Test", curs: "X", data: "Y" })).toBe("Test Test");
  });

  it("leaves text unchanged when no placeholders match", () => {
    expect(interpolate("plain text", { nume: "X", curs: "Y", data: "Z" })).toBe("plain text");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("Hi {unknown}", { nume: "X", curs: "Y", data: "Z" })).toBe("Hi {unknown}");
  });
});

describe("buildSummary", () => {
  it("omits condition when 'any'", () => {
    const cfg: AutomationConfig = { trigger: "lead_new", condition: "any", action: "send_whatsapp" };
    const s = buildSummary(cfg);
    expect(s).toMatch(/lead nou primit/i);
    expect(s).toMatch(/trimite whatsapp/i);
    expect(s).not.toMatch(/și/);
  });

  it("includes condition when not 'any'", () => {
    const cfg: AutomationConfig = { trigger: "lesson_absent", condition: "first_offence", action: "send_sms" };
    const s = buildSummary(cfg);
    expect(s).toMatch(/elev absent/i);
    expect(s).toMatch(/prima abatere/i);
    expect(s).toMatch(/trimite sms/i);
  });
});

describe("AutomationBuilder", () => {
  it("renders 3 step nodes", () => {
    render(<AutomationBuilder />);
    expect(screen.getByText(/Pas 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Pas 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Pas 3/i)).toBeInTheDocument();
  });

  it("updates summary when trigger changes", () => {
    render(<AutomationBuilder />);
    const initial = screen.getByTestId("automation-summary").textContent;
    const trigger = screen.getByLabelText(/Dacă se întâmplă/i) as HTMLSelectElement;
    fireEvent.change(trigger, { target: { value: "payment_overdue" } });
    expect(screen.getByTestId("automation-summary").textContent).not.toBe(initial);
    expect(screen.getByTestId("automation-summary").textContent).toMatch(/plată restantă/i);
  });

  it("calls onChange callback when action changes", () => {
    let received: AutomationConfig | null = null;
    render(<AutomationBuilder onChange={(c) => (received = c)} />);
    const action = screen.getByLabelText(/Atunci execută/i) as HTMLSelectElement;
    fireEvent.change(action, { target: { value: "send_sms" } });
    expect(received).not.toBeNull();
    expect(received!.action).toBe("send_sms");
  });
});

describe("MessagePreview", () => {
  it("renders default WhatsApp tab on mount", () => {
    render(<MessagePreview />);
    const body = screen.getByTestId("message-preview-body");
    expect(body.textContent).toMatch(/Maria/);
    expect(body.textContent).toMatch(/Engleză B2/);
  });

  it("switches to SMS when tab clicked", () => {
    render(<MessagePreview />);
    const smsTab = screen.getByRole("tab", { name: /SMS/i });
    fireEvent.click(smsTab);
    expect(smsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/caractere/i)).toBeInTheDocument();
  });

  it("interpolates custom context", () => {
    render(<MessagePreview template="Hello {nume}" ctx={{ nume: "Andrei", curs: "X", data: "Y" }} />);
    const body = screen.getByTestId("message-preview-body");
    expect(body.textContent).toMatch(/Hello Andrei/);
  });
});

describe("ComunicarePage", () => {
  it("renders hero with module badge", () => {
    render(
      <HashRouter>
        <ComunicarePage />
      </HashRouter>
    );
    expect(screen.getByText(/Modulul Comunicare/i)).toBeInTheDocument();
  });

  it("renders builder + preview side by side", () => {
    render(
      <HashRouter>
        <ComunicarePage />
      </HashRouter>
    );
    expect(screen.getAllByText(/Construiește o automatizare/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cum arată mesajul/i)).toBeInTheDocument();
  });

  it("renders 4 main sections", () => {
    render(
      <HashRouter>
        <ComunicarePage />
      </HashRouter>
    );
    expect(screen.getAllByText(/WhatsApp Business API oficial/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Automatizări fără cod/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Broadcast cu segmentare/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Notificări push în app/i).length).toBeGreaterThan(0);
  });

  it("renders 4 FAQ items", () => {
    render(
      <HashRouter>
        <ComunicarePage />
      </HashRouter>
    );
    expect(screen.getByText(/Am nevoie de numărul meu/i)).toBeInTheDocument();
  });
});
