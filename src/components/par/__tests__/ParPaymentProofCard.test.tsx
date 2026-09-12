/**
 * VM4-05 — cardul „Confirmarea plății" din capul fișei unei cereri plătite.
 *
 * Se testează acțiunea și ce vede omul: încărcarea chiar cheamă ruta de atașamente cu tipul
 * `payment_order`, captura de ecran lipită din clipboard ajunge fișier, iar documentul atașat se
 * vede pe loc (imagine ca imagine, PDF în cadru), nu doar ca nume.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ParPaymentProofCard } from "../ParPaymentProofCard";
import * as parApi from "@/lib/api/par";
import type { ParAttachment } from "@/lib/api/par";


function proof(overrides: Partial<ParAttachment> = {}): ParAttachment {
  return {
    id: "att-1",
    fileName: "Confirmare plată — PAR-2026-0020 (OP-0047.pdf)",
    kind: "payment_order",
    uploadedBy: "user-finance",
    createdAt: "2026-09-10",
    mimeType: "application/pdf",
    ...overrides,
  };
}

const invoice = (): ParAttachment => ({
  id: "att-9",
  fileName: "EBK000758854.pdf",
  kind: "invoice",
  uploadedBy: "user-requestor",
  createdAt: "2026-09-07",
  mimeType: "application/pdf",
});

function renderCard(props: Partial<React.ComponentProps<typeof ParPaymentProofCard>> = {}) {
  return render(
    <ParPaymentProofCard
      parId="par-1"
      requestNo="PAR-2026-0020"
      attachments={[]}
      canUpload
      currentUserId="user-finance"
      onChanged={vi.fn()}
      {...props}
    />
  );
}

const pdfFile = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name, { type: "application/pdf" });

describe("ParPaymentProofCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("[blocant] fără dovadă, finanțele văd că lipsește și au unde s-o pună", () => {
    renderCard();
    expect(screen.getByText("Lipsește din dosar")).toBeInTheDocument();
    expect(screen.getByText("Adaugă confirmarea plății")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alege fișierul/i })).toBeInTheDocument();
  });

  it("[blocant] fișierul ales se atașează la dosar ca „ordin de plată”", async () => {
    const uploadSpy = vi.spyOn(parApi, "uploadAttachment").mockResolvedValue(proof());
    const onChanged = vi.fn();
    renderCard({ onChanged });

    fireEvent.change(screen.getByLabelText(/alege confirmarea plății/i), {
      target: { files: [pdfFile("OP-0047.pdf")] },
    });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    const [parId, payload] = uploadSpy.mock.calls[0];
    expect(parId).toBe("par-1");
    expect(payload.kind).toBe("payment_order");
    expect(payload.file_name).toContain("PAR-2026-0020");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("[blocant] o captură de ecran lipită cu Ctrl+V devine dovadă, fără drum prin disc", async () => {
    const uploadSpy = vi.spyOn(parApi, "uploadAttachment").mockResolvedValue(proof());
    renderCard();

    const png = new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", { type: "image/png" });
    const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { items: [{ type: "image/png", getAsFile: () => png }] },
    });
    window.dispatchEvent(event);

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledTimes(1));
    expect(uploadSpy.mock.calls[0][1].mime).toBe("image/png");
    expect(uploadSpy.mock.calls[0][1].kind).toBe("payment_order");
  });

  it("[blocant] documentul atașat se vede pe loc: PDF în cadru, imaginea ca imagine", () => {
    const { rerender } = renderCard({ attachments: [proof()] });
    expect(screen.getByText("La dosar")).toBeInTheDocument();
    expect(screen.getByTitle(/previzualizare/i)).toBeInTheDocument();

    rerender(
      <ParPaymentProofCard
        parId="par-1"
        requestNo="PAR-2026-0020"
        attachments={[proof({ fileName: "captura.png", mimeType: "image/png" })]}
        canUpload
        currentUserId="user-finance"
        onChanged={vi.fn()}
      />
    );
    const img = screen.getByAltText(/confirmarea plății pentru PAR-2026-0020/i);
    expect(img).toHaveAttribute("src", "/api/par/par-1/attachments/att-1/preview");
  });

  it("un fișier prea mare e refuzat cu un motiv, nu în tăcere", async () => {
    const uploadSpy = vi.spyOn(parApi, "uploadAttachment");
    renderCard();

    const huge = new File([new Uint8Array(10)], "extras.pdf", { type: "application/pdf" });
    Object.defineProperty(huge, "size", { value: 5 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(/alege confirmarea plății/i), { target: { files: [huge] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/depășește 3 MB/i);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("alte documente din dosar (factura) nu sunt confundate cu dovada plății", () => {
    renderCard({ attachments: [invoice()] });
    expect(screen.getByText("Lipsește din dosar")).toBeInTheDocument();
    expect(screen.queryByText("EBK000758854.pdf")).not.toBeInTheDocument();
  });

  it("cine nu are drept de încărcare vede doar documentul, iar fără dovadă nu vede nimic", () => {
    const { container, rerender } = render(
      <ParPaymentProofCard
        parId="par-1"
        requestNo="PAR-2026-0020"
        attachments={[]}
        canUpload={false}
        currentUserId="user-requestor"
        onChanged={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ParPaymentProofCard
        parId="par-1"
        requestNo="PAR-2026-0020"
        attachments={[proof()]}
        canUpload={false}
        currentUserId="user-requestor"
        onChanged={vi.fn()}
      />
    );
    expect(screen.getByText("La dosar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /alege fișierul/i })).not.toBeInTheDocument();
    // Ștergerea rămâne a celui care a încărcat (serverul o impune oricum).
    expect(screen.queryByRole("button", { name: /șterge/i })).not.toBeInTheDocument();
  });
});
