/**
 * Emailul de invitație era un HTML propriu, cu brandingul vechi („Vector Finance") și fără
 * nicio informație utilă: destinatarul primea un link fără să știe în ce workspace intră, cu
 * ce rol și de la cine — imposibil de distins de un phishing.
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendInviteEmail } from "../invites";

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_SEND_MODE", "EMAIL_FROM", "RESEND_FROM", "APP_URL"] as const;
const saved: Record<string, string | undefined> = {};

/** Ce a plecat spre Resend la ultimul apel. */
function sentPayload(fetchMock: ReturnType<typeof vi.fn>): {
  from: string;
  subject: string;
  html: string;
  text: string;
} {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body);
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_SEND_MODE = "on"; // altfel garda blochează trimiterea în afara producției
  process.env.APP_URL = "https://finflow.best";
  delete process.env.EMAIL_FROM;
  delete process.env.RESEND_FROM;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("sendInviteEmail — invitația spune workspace, rol și cine invită", () => {
  it("pune rolul în subiect și contextul în corp", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendInviteEmail({
      to: "csirbu@ict.md",
      orgName: "ATIC",
      url: "https://finflow.best/#/business/invite?token=tok123",
      parRole: "finance",
      invitedByName: "Vlah Dumitru",
    });

    expect(ok).toBe(true);
    const payload = sentPayload(fetchMock);
    expect(payload.subject).toBe("Invitație în ATIC pe FinFlow — rol Finanțe");
    expect(payload.text).toContain("Vlah Dumitru te-a invitat");
    expect(payload.text).toContain("• Workspace: ATIC");
    expect(payload.text).toContain("• Rolul tău: Finanțe");
    expect(payload.text).toContain("• Cont invitat: csirbu@ict.md");
    expect(payload.text).toContain("Linkul expiră în 7 zile");
  });

  it("trece prin șablonul FinFlow, cu buton clicabil (nu HTML propriu cu brandingul vechi)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await sendInviteEmail({
      to: "csirbu@ict.md",
      orgName: "ATIC",
      url: "https://finflow.best/#/business/invite?token=tok123",
      parRole: "approver",
    });

    const payload = sentPayload(fetchMock);
    expect(payload.html).toContain(">FinFlow</td>");
    expect(payload.html).not.toContain("Vector Finance");
    expect(payload.html).toContain('<a href="https://finflow.best/#/business/invite?token=tok123"');
    expect(payload.html).toContain(">Acceptă invitația</a>");
    expect(payload.from).toContain("FinFlow");
  });

  it("fără cine invită, spune „un administrator” — nu lasă propoziția ciuntită", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await sendInviteEmail({ to: "csirbu@ict.md", orgName: "ATIC", url: "https://finflow.best/#/x" });

    const payload = sentPayload(fetchMock);
    expect(payload.text).toContain("Un administrator te-a invitat în workspace-ul ATIC");
    // fără rol cunoscut, subiectul nu inventează unul
    expect(payload.subject).toBe("Invitație în ATIC pe FinFlow");
  });
});
