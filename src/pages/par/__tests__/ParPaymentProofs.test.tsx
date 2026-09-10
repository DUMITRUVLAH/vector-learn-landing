/**
 * VM4-04 — ecranul „Dovezi de plată”.
 *
 * Testează ACȚIUNEA: fișierele aduse în bloc sunt potrivite cu plata lor și atașate cu tipul
 * `payment_order`, nu doar afișate.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ParPaymentProofs from "../ParPaymentProofs";
import * as parApi from "@/lib/api/par";
import type { ParPaymentProofItem } from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/dovezi", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: React.ReactNode; actions?: React.ReactNode }) => (
    <div data-testid="app-shell">
      {pageTitle ? <h1>{pageTitle}</h1> : null}
      {actions}
      {children}
    </div>
  ),
}));

function makeItem(overrides: Partial<ParPaymentProofItem> = {}): ParPaymentProofItem {
  return {
    id: "par-1",
    requestNo: "PAR-2026-0020",
    payeeName: "Consult Prim SRL",
    payeeIban: "MD24AG000225100013104168",
    projectName: "Digital Safeguard",
    endUse: "Servicii de consultanță",
    currency: "MDL",
    totalEstimatedCents: 700000,
    paidAt: "2026-09-07T12:00:00.000Z",
    actualAmountCents: 700000,
    paymentDate: "2026-09-07T00:00:00.000Z",
    paymentRef: "OP-2026-0047",
    proofs: [],
    ...overrides,
  };
}

const queue = (items: ParPaymentProofItem[]) => ({
  items,
  total: items.length,
  missingCount: items.filter((i) => i.proofs.length === 0).length,
  paidCount: items.length,
});

/** Aduce fișiere prin input-ul de selectare, ca utilizatorul. */
function dropFiles(files: File[]) {
  const input = screen.getByLabelText(/alege fișierele cu dovezile de plată/i);
  fireEvent.change(input, { target: { files } });
}

const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: "application/pdf" });

describe("ParPaymentProofs — dovezile în bloc", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[blocant] arată plățile care așteaptă dovada", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(queue([makeItem()]));
    render(<ParPaymentProofs />);

    expect(await screen.findByText("PAR-2026-0020")).toBeInTheDocument();
    expect(screen.getByText("lipsește")).toBeInTheDocument();
    expect(screen.getByText(/1 din 1 plăți așteaptă dovada/i)).toBeInTheDocument();
  });

  it("[blocant] un fișier numit după ordinul de plată e potrivit singur cu plata lui", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(
      queue([makeItem(), makeItem({ id: "par-2", requestNo: "PAR-2026-0021", payeeName: "Alfa Trans SRL", paymentRef: "OP-2026-0048" })])
    );
    render(<ParPaymentProofs />);
    await screen.findByText("PAR-2026-0020");

    dropFiles([pdf("OP-2026-0048 extras.pdf")]);

    const select = await screen.findByLabelText(/plata pentru OP-2026-0048 extras.pdf/i);
    expect((select as HTMLSelectElement).value).toBe("par-2");
    expect(screen.getByText("sigur")).toBeInTheDocument();
  });

  it("[blocant] atașează toate dovezile potrivite, cu tipul „ordin de plată”", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(queue([makeItem()]));
    const uploadSpy = vi.spyOn(parApi, "uploadAttachment").mockResolvedValue({} as never);
    render(<ParPaymentProofs />);
    await screen.findByText("PAR-2026-0020");

    dropFiles([pdf("OP-2026-0047.pdf")]);
    fireEvent.click(await screen.findByRole("button", { name: /atașează 1 dovadă/i }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    const [parId, payload] = uploadSpy.mock.calls[0];
    expect(parId).toBe("par-1");
    expect(payload.kind).toBe("payment_order");
    expect(payload.file_url.startsWith("data:application/pdf;base64,")).toBe(true);
  });

  it("[blocant] un fișier nepotrivit rămâne de ales manual și NU se atașează singur", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(queue([makeItem()]));
    const uploadSpy = vi.spyOn(parApi, "uploadAttachment").mockResolvedValue({} as never);
    render(<ParPaymentProofs />);
    await screen.findByText("PAR-2026-0020");

    dropFiles([pdf("scan_0001.pdf")]);

    expect(await screen.findByText(/de ales manual/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atașează 0 dovezi/i })).toBeDisabled();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("alegerea manuală a plății face fișierul gata de atașat", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(queue([makeItem()]));
    render(<ParPaymentProofs />);
    await screen.findByText("PAR-2026-0020");

    dropFiles([pdf("scan_0001.pdf")]);
    fireEvent.change(await screen.findByLabelText(/plata pentru scan_0001.pdf/i), {
      target: { value: "par-1" },
    });

    expect(await screen.findByRole("button", { name: /atașează 1 dovadă/i })).toBeEnabled();
  });

  it("o eroare la un fișier nu oprește restul lotului", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(
      queue([makeItem(), makeItem({ id: "par-2", requestNo: "PAR-2026-0021", payeeName: "Alfa Trans SRL", paymentRef: "OP-2026-0048" })])
    );
    const uploadSpy = vi
      .spyOn(parApi, "uploadAttachment")
      .mockRejectedValueOnce(new Error("fișier prea mare"))
      .mockResolvedValue({} as never);
    render(<ParPaymentProofs />);
    await screen.findByText("PAR-2026-0020");

    dropFiles([pdf("OP-2026-0047.pdf"), pdf("OP-2026-0048.pdf")]);
    fireEvent.click(await screen.findByRole("button", { name: /atașează 2 dovezi/i }));

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("fișier prea mare")).toBeInTheDocument();
  });

  it("plata care are deja dovada nu mai apare ca lipsă", async () => {
    vi.spyOn(parApi, "getPaymentProofsQueue").mockResolvedValue(
      queue([makeItem({ proofs: [{ id: "att-1", fileName: "op.pdf" }] })])
    );
    render(<ParPaymentProofs />);

    expect(await screen.findByText("atașată")).toBeInTheDocument();
    expect(screen.queryByText("lipsește")).not.toBeInTheDocument();
  });
});
