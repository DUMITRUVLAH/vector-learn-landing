/**
 * Emailul de resetare purta brandingul vechi („Vector Finance") și HTML propriu, în afara
 * șablonului FinFlow — pe Outlook linkul nici nu era clicabil (nu autolinkează text).
 *
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordResetEmail } from "../accountEmails";

const ENV_KEYS = ["RESEND_API_KEY", "EMAIL_SEND_MODE", "EMAIL_FROM", "RESEND_FROM", "APP_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_SEND_MODE = "on";
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

describe("sendPasswordResetEmail", () => {
  it("e brandat FinFlow, spune contul și durata de valabilitate, cu buton clicabil", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await sendPasswordResetEmail({
      to: "ana@example.md",
      url: "https://finflow.best/#/business/reset?token=t1",
    });

    expect(ok).toBe(true);
    const payload = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(payload.subject).toBe("Resetare parolă — FinFlow");
    expect(payload.text).toContain("contul FinFlow ana@example.md");
    expect(payload.text).toContain("expiră în 1 oră");
    expect(payload.text).toContain("ignoră acest mesaj");
    expect(payload.html).toContain(">FinFlow</td>");
    expect(payload.html).not.toContain("Vector Finance");
    expect(payload.html).toContain('<a href="https://finflow.best/#/business/reset?token=t1"');
    expect(payload.html).toContain(">Setează o parolă nouă</a>");
  });
});
