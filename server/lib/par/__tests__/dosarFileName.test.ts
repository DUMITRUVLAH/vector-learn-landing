/**
 * Numele dosarului (owner, 18.09.2026): „în denumire să avem și den. agentului economic,
 * proiectul, nr de ordinului de plată și data plății".
 *
 * Numele ăsta ajunge în trei locuri deodată — fișierul salvat de om, intrarea din pachetul zip și
 * fișierul din Google Drive — deci se testează ca atare: ce lipsește se sare, nimic nu rămâne gol,
 * iar diacriticele nu ajung caractere pe care Windows le refuză.
 */
import { describe, it, expect, vi } from "vitest";

// `dosarFileName` e pură; importul de DB există pentru restul modulului (asamblarea dosarului).
vi.mock("../../../db/client", () => ({ db: {} }));

import { dosarFileName } from "../buildDosar";

const PAR_ID = "9f1c3b2a-7d4e-4a55-9c88-1b2c3d4e5f60";

describe("dosarFileName", () => {
  it("[blocant] poartă cererea, agentul economic, proiectul, ordinul de plată și data plății", () => {
    expect(
      dosarFileName({
        requestNo: "PAR-2026-0045",
        parId: PAR_ID,
        payeeName: "Consult Prim SRL",
        projectName: "Digital Safeguard",
        paymentRef: "1247",
        paymentDate: new Date("2026-09-15T08:30:00Z"),
      }),
    ).toBe("Dosar_PAR-2026-0045_Consult-Prim-SRL_Digital-Safeguard_OP-1247_2026-09-15.pdf");
  });

  it("nu dublează prefixul când omul a scris deja „OP” în referință", () => {
    const name = dosarFileName({ requestNo: "PAR-2026-0045", parId: PAR_ID, paymentRef: "OP-2026-0047" });
    expect(name).toContain("_OP-2026-0047");
    expect(name).not.toContain("OP-OP");
  });

  it("o cerere încă neplătită n-are blocuri goale în nume", () => {
    expect(
      dosarFileName({ requestNo: "PAR-2026-0045", parId: PAR_ID, payeeName: "Consult Prim SRL" }),
    ).toBe("Dosar_PAR-2026-0045_Consult-Prim-SRL.pdf");
    expect(dosarFileName({ requestNo: "PAR-2026-0045", parId: PAR_ID })).toBe("Dosar_PAR-2026-0045.pdf");
  });

  it("diacriticele și semnele pe care Windows le refuză nu ajung în nume", () => {
    const name = dosarFileName({
      requestNo: "PAR-2026-0045",
      parId: PAR_ID,
      payeeName: 'ASOCIAȚIA "TEKWILL" / ȘTEFAN & CO',
      projectName: "Tekwill în Fiecare Școală",
    });
    expect(name).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
    expect(name).toContain("ASOCIATIA-TEKWILL-STEFAN-CO");
    expect(name).toContain("Tekwill-in-Fiecare-Scoala");
  });

  it("numele rămâne deschizibil: blocurile lungi sunt tăiate, nu lăsate să crească", () => {
    const name = dosarFileName({
      requestNo: "PAR-2026-0045",
      parId: PAR_ID,
      payeeName: "ASOCIAȚIA NAȚIONALĂ A COMPANIILOR DIN DOMENIUL TEHNOLOGIEI INFORMAȚIEI ȘI COMUNICAȚIILOR",
      projectName: "Programul național de transformare digitală a întreprinderilor mici",
      paymentRef: "1247",
      paymentDate: "2026-09-15T08:30:00Z",
    });
    expect(name.length).toBeLessThanOrEqual(140);
    expect(name).toContain("PAR-2026-0045");
    expect(name).toContain("_OP-1247_2026-09-15.pdf");
  });

  it("fără număr de cerere cade pe id, nu pe un nume anonim", () => {
    expect(dosarFileName({ requestNo: null, parId: PAR_ID })).toBe("Dosar_PAR-9f1c3b2a.pdf");
  });

  it("o dată invalidă nu ajunge «Invalid-Date» în nume", () => {
    const name = dosarFileName({ requestNo: "PAR-2026-0045", parId: PAR_ID, paymentDate: "nu-i o dată" });
    expect(name).toBe("Dosar_PAR-2026-0045.pdf");
  });
});
