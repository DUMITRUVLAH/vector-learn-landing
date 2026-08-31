/**
 * @vitest-environment jsdom
 *
 * Regresia raportată de owner de DOUĂ ori:
 *  - 2026-08-31: „mereu mă întreabă de la ultimul PAR când fac refresh";
 *  - 2026-08-31 (seara): „iar m-am logat și mi-a apărut să dau feedback — doar o dată și gata".
 *
 * Prima oară urma stătea doar în `localStorage`, deci o autentificare nouă (alt calculator,
 * fereastră privată, stocare curățată) reîncepea aceeași conversație. De aceea testul cel mai
 * important de aici nu se uită la ecran, ci verifică apelul care lasă urma pe SERVER: fără el,
 * întrebarea revine oriunde altundeva te-ai autentifica.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PendingRatingPrompt } from "@/components/par/PendingRatingPrompt";
import * as api from "@/lib/api/parVendorProfile";

const PENDING = [
  {
    parId: "par-1",
    requestNo: "PAR-2026-0025",
    paidAt: "2026-08-30T09:00:00Z",
    vendorId: "vendor-1",
    vendorName: 'Societatea cu Răspundere Limitată "VECTOR ACADEMY"',
    amountCents: 100,
    currency: "MDL",
  },
  {
    parId: "par-2",
    requestNo: "PAR-2026-0024",
    paidAt: "2026-08-29T09:00:00Z",
    vendorId: "vendor-2",
    vendorName: "Alt furnizor",
    amountCents: 200,
    currency: "MDL",
  },
];

// Node 26 expune un `localStorage` global gol care umbrește jsdom-ul; stub-ul ține testul
// independent de cum e pornit runner-ul (vezi reportConfig.test.ts).
const local = new Map<string, string>();
const session = new Map<string, string>();
const fake = (store: Map<string, string>) => ({
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
});

beforeEach(() => {
  local.clear();
  session.clear();
  vi.stubGlobal("localStorage", fake(local));
  vi.stubGlobal("sessionStorage", fake(session));
  vi.spyOn(api, "listPendingRatings").mockResolvedValue({ pending: PENDING });
  vi.spyOn(api, "markRatingAsked").mockResolvedValue({ ok: true, marked: true });
});

describe("PendingRatingPrompt", () => {
  it("lasă urma pe server la deschidere, ca întrebarea să nu revină la altă autentificare", async () => {
    render(<PendingRatingPrompt />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(api.markRatingAsked).toHaveBeenCalledWith("par-1"));
  });

  it("întreabă o singură dată, chiar dacă dialogul e închis cu X și pagina e reîncărcată", async () => {
    const first = render(<PendingRatingPrompt />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/PAR-2026-0025/)).toBeInTheDocument();

    // Închidere cu X — nu cu „Mai târziu". Exact gestul din raport.
    fireEvent.click(screen.getAllByRole("button", { name: "Închide" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    first.unmount();

    // „Refresh": componenta se montează din nou. Garda de sesiune o oprește înainte de rețea.
    render(<PendingRatingPrompt />);
    await waitFor(() => expect(api.listPendingRatings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("nu sare la următoarea cerere neevaluată — cel mult o întrebare pe sesiune", async () => {
    const first = render(<PendingRatingPrompt />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mai târziu" }));
    first.unmount();

    render(<PendingRatingPrompt />);
    await waitFor(() => expect(api.listPendingRatings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/PAR-2026-0024/)).not.toBeInTheDocument();
  });

  it("într-o sesiune nouă nu revine la cererea deja întrebată (serverul n-o mai trimite)", async () => {
    render(<PendingRatingPrompt />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Sesiune nouă = filă nouă / autentificare nouă. Serverul, care ține minte `rating_prompted_at`,
    // nu mai întoarce cererea deja întrebată — deci nu mai are ce apărea pe ecran.
    session.clear();
    local.clear();
    vi.mocked(api.listPendingRatings).mockResolvedValue({ pending: [] });
    render(<PendingRatingPrompt />);
    await waitFor(() => expect(api.listPendingRatings).toHaveBeenCalledTimes(2));
    expect(screen.queryAllByRole("dialog")).toHaveLength(1); // doar dialogul deja deschis
  });
});
