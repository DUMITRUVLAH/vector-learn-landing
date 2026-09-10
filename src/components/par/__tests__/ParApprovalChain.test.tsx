/**
 * Secțiunile 14–15 ale formularului: cine a semnat și în ce calitate.
 *
 * Reclamațiile owner-ului (2026-09-10), toate pe aceeași cauză — blocul citea caseta de semnătură
 * în loc să citească persoana:
 *   - „14. SOLICITANT → Jurist / Jurist": trimiterea scria funcția și în `signature_name`;
 *   - „15. ANA CHIRITA → Ana Chirita": eticheta pasului din matricea DOA e numele persoanei, deci
 *     capul repeta exact ce scria dedesubt;
 *   - lipsea funcția aprobatorilor.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParApprovalChain } from "../ParApprovalChain";
import type { ParApproval } from "@/lib/api/par";

const appr = (over: Partial<ParApproval>): ParApproval => ({
  id: `a-${over.step ?? 0}`,
  step: 0,
  approverUserId: "u-1",
  approverRoleLabel: null,
  decision: "approved",
  locked: false,
  decidedAt: "2026-09-07T10:00:00.000Z",
  comment: null,
  signatureName: null,
  signatureTitle: null,
  createdAt: "2026-09-07T09:00:00.000Z",
  ...over,
});

describe("ParApprovalChain — secțiunile 14–15", () => {
  it("[blocant] solicitantul apare cu numele, nu cu funcția scrisă de două ori", () => {
    render(<ParApprovalChain approvals={[appr({
      step: 0, approverRoleLabel: "Requestor",
      // Exact ce a scris trimiterea pe cererile de dinainte de fix: funcția în ambele casete.
      signatureName: "Jurist", signatureTitle: "Jurist",
      approverName: "Ana Chirita", approverTitle: "Jurist",
    })]} />);

    expect(screen.getByText("Ana Chirita")).toBeTruthy();
    expect(screen.getAllByText("Jurist")).toHaveLength(1);
  });

  it("[blocant] un pas etichetat cu numele semnatarului nu-l mai scrie de două ori", () => {
    render(<ParApprovalChain approvals={[appr({
      step: 1, approverRoleLabel: "Ana Chirita",
      signatureName: "Ana Chirita", approverName: "Ana Chirita", approverTitle: "Jurist",
    })]} />);

    expect(screen.getByText("15. Aprobator")).toBeTruthy();
    expect(screen.queryByText("15. Ana Chirita")).toBeNull();
    expect(screen.getByText("Ana Chirita")).toBeTruthy();
    expect(screen.getByText("Jurist")).toBeTruthy();
  });

  it("păstrează eticheta când ea spune altceva decât semnătura (rol, delegare)", () => {
    render(<ParApprovalChain approvals={[appr({
      step: 1, approverRoleLabel: "Executive Director",
      signatureName: "Irina Oriol", approverName: "Ana Chirita", signatureTitle: "delegat de Ana Chirita",
    })]} />);

    expect(screen.getByText("15. Executive Director")).toBeTruthy();
    // Semnătura tastată bate titularul rândului: prin delegare semnează altcineva.
    expect(screen.getByText("Irina Oriol")).toBeTruthy();
    expect(screen.getByText("delegat de Ana Chirita")).toBeTruthy();
  });

  it("un pas nesemnat spune pe cine se așteaptă, cu funcția lui", () => {
    render(<ParApprovalChain approvals={[appr({
      step: 1, decision: "pending", decidedAt: null, approverRoleLabel: "Irina Oriol",
      approverName: "Irina Oriol", approverTitle: "Finance Manager",
    })]} />);

    expect(screen.getByText("Irina Oriol")).toBeTruthy();
    expect(screen.getByText("Finance Manager")).toBeTruthy();
  });

  it("un pas pe rol, fără persoană, nu inventează un nume", () => {
    render(<ParApprovalChain approvals={[appr({
      step: 1, decision: "pending", decidedAt: null, approverUserId: null,
      approverRoleLabel: "Oricine cu rolul Aprobator", approverName: null,
    })]} />);

    expect(screen.getByText("15. Oricine cu rolul Aprobator")).toBeTruthy();
    expect(screen.getByText("În așteptarea semnăturii")).toBeTruthy();
  });
});
