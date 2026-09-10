/**
 * ParAttachmentViewer — documentul se deschide ÎN aplicație, nu într-o filă nouă.
 *
 * Tests:
 *   - nu randează nimic cât timp nimeni n-a cerut un document
 *   - un PDF cerut prin magistrală ajunge într-un `<iframe>` peste pagină
 *   - o imagine ajunge într-un `<img>`
 *   - un 404 devine mesaj citibil, nu cadru alb
 *   - Escape închide și revocă blob-ul
 *   - fără vizualizator montat, `viewParAttachment` cade înapoi pe fila nouă
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParAttachmentViewer } from "../ParAttachmentViewer";
import { openParAttachmentViewer } from "@/lib/par/attachmentViewerBus";
import { viewParAttachment } from "@/lib/parFiles";

const TARGET = { parId: "par-1", attachmentId: "att-1", fileName: "FF AAX42426.pdf" };

function mockPreview(body: Blob, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      headers: new Headers({ "content-type": body.type }),
      blob: async () => body,
    }) as unknown as Response),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ParAttachmentViewer", () => {
  it("nu randează nimic până nu i se cere un document", () => {
    mockPreview(new Blob(["x"], { type: "application/pdf" }));
    const { container } = render(<ParAttachmentViewer />);
    expect(container).toBeEmptyDOMElement();
  });

  // Sursa iframe-ului trebuie să rămână URL-ul rutei, nu un `blob:` — un `blob:` cere
  // `frame-src blob:` în CSP și e blocat („This content is blocked") oriunde lipsește.
  it("randează PDF-ul într-un iframe peste pagină, direct din ruta de preview", async () => {
    mockPreview(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    render(<ParAttachmentViewer />);
    let accepted = false;
    act(() => {
      accepted = openParAttachmentViewer(TARGET);
    });
    expect(accepted).toBe(true);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => {
      const frame = dialog.querySelector("iframe");
      expect(frame).not.toBeNull();
      expect(frame).toHaveAttribute("src", "/api/par/par-1/attachments/att-1/preview");
      expect(frame).toHaveAttribute("title", TARGET.fileName);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/par/par-1/attachments/att-1/preview",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("randează o imagine ca <img>", async () => {
    mockPreview(new Blob(["png"], { type: "image/png" }));
    render(<ParAttachmentViewer />);
    act(() => {
      openParAttachmentViewer({ ...TARGET, fileName: "bon.png" });
    });

    const img = await screen.findByAltText("bon.png");
    expect(img).toHaveAttribute("src", "/api/par/par-1/attachments/att-1/preview");
  });

  it("arată un mesaj citibil când documentul nu e accesibil", async () => {
    mockPreview(new Blob([]), false, 404);
    render(<ParAttachmentViewer />);
    act(() => {
      openParAttachmentViewer(TARGET);
    });

    expect(await screen.findByText(/nu mai există sau nu ai acces/i)).toBeInTheDocument();
    expect(screen.queryByTitle(TARGET.fileName)).not.toBeNull();
  });

  it("Escape închide vizualizatorul", async () => {
    const user = userEvent.setup();
    mockPreview(new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    render(<ParAttachmentViewer />);
    act(() => {
      openParAttachmentViewer(TARGET);
    });
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("fără vizualizator montat, documentul se deschide tot (filă nouă)", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    viewParAttachment("par-9", "att-9", "factura.pdf");
    expect(open).toHaveBeenCalledWith(
      "/api/par/par-9/attachments/att-9/preview",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
