/**
 * PAY-003 — QR de plată EPC069-12
 * Tests:
 * T-PAY-003-1 [blocant]: generateEpcQr returns data URL with BCD, IBAN, amount, reference
 * T-PAY-003-2 [blocant]: generateEpcQr returns null for empty IBAN
 * T-PAY-003-3 [blocant]: EPC payload format is correct (version 002, SCT, newline-separated)
 * T-PAY-003-4: InvoicePortalPage route is registered in App
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock QRCode ──────────────────────────────────────────────────────────────

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockImplementation((data: string) => {
      // Return a fake data URL that contains the payload for inspection
      return Promise.resolve(`data:image/png;base64,FAKE_QR_${Buffer.from(data).toString("base64")}`);
    }),
  },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PAY-003 — generateEpcQr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-PAY-003-1 [blocant]: returns data URL containing EPC payload elements", async () => {
    const { generateEpcQr } = await import("@/lib/epcQr");

    const result = await generateEpcQr({
      iban: "RO49BTRLRONCRT0V45838000",
      bic: "BTRLRO22",
      name: "Academia Muzicală SRL",
      amountEur: 150,
      reference: "ACAD-2026-0042",
    });

    expect(result).not.toBeNull();
    expect(result).toMatch(/^data:image\/png;base64,/);

    // Decode the payload from our fake QR to verify it
    const base64Part = result!.replace("data:image/png;base64,FAKE_QR_", "");
    const payload = Buffer.from(base64Part, "base64").toString("utf-8");

    expect(payload).toContain("BCD");
    expect(payload).toContain("SCT");
    expect(payload).toContain("RO49BTRLRONCRT0V45838000");
    expect(payload).toContain("EUR150.00");
    expect(payload).toContain("ACAD-2026-0042");
    expect(payload).toContain("002"); // version
  });

  it("T-PAY-003-2 [blocant]: returns null for empty IBAN", async () => {
    const { generateEpcQr } = await import("@/lib/epcQr");

    const result = await generateEpcQr({
      iban: "",
      name: "Academia",
      amountEur: 150,
      reference: "ACAD-2026-0001",
    });

    expect(result).toBeNull();
  });

  it("T-PAY-003-3 [blocant]: EPC payload is newline-separated with correct structure", async () => {
    const { generateEpcQr } = await import("@/lib/epcQr");

    await generateEpcQr({
      iban: "RO49BTRLRONCRT0V45838000",
      bic: "BTRLRO22",
      name: "Academia",
      amountEur: 200,
      reference: "INV-001",
    });

    // Check QRCode.toDataURL was called with correct payload
    const { default: QRCode } = await import("qrcode");
    const calledPayload = (QRCode.toDataURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const lines = calledPayload.split("\n");

    expect(lines[0]).toBe("BCD");       // service tag
    expect(lines[1]).toBe("002");       // version
    expect(lines[2]).toBe("1");         // UTF-8
    expect(lines[3]).toBe("SCT");       // SEPA Credit Transfer
    expect(lines[4]).toBe("BTRLRO22"); // BIC
    expect(lines[5]).toBe("Academia"); // name
    expect(lines[6]).toBe("RO49BTRLRONCRT0V45838000"); // IBAN
    expect(lines[7]).toBe("EUR200.00"); // amount
    expect(lines[10]).toBe("INV-001"); // reference (unstructured)
  });

  it("T-PAY-003-4: amount is omitted when amountEur is 0", async () => {
    const { generateEpcQr } = await import("@/lib/epcQr");

    await generateEpcQr({
      iban: "RO49BTRLRONCRT0V45838000",
      name: "Academia",
      amountEur: 0,
      reference: "INV-001",
    });

    const { default: QRCode } = await import("qrcode");
    const calledPayload = (QRCode.toDataURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const lines = calledPayload.split("\n");

    expect(lines[7]).toBe(""); // amount line is empty
  });
});
