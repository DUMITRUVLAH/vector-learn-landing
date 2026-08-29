/**
 * Dialog — bug owner (2026-08-29): pe telefon, „Cum începem cererea?" apărea cu textul retezat
 * în dreapta.
 *
 * Mecanismul: panoul e o grilă, iar un element de grilă are implicit `min-width: auto`. Un rând
 * lung (numele unui beneficiar) lățea coloana peste panou; panoul fiind plafonat de `max-width`,
 * TOT conținutul se așeza pe lățimea aceea și era tăiat la margine. Măsurat în Chrome la 390px:
 * panou 358px, conținut 584px. După `grid-cols-[minmax(0,1fr)]`: 366 / 364.
 *
 * jsdom nu calculează layout, deci nu poate reproduce măsurătoarea — testul încuie mecanismul
 * (coloana plafonată), ca fix-ul să nu dispară la o rescriere de clase.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog } from "../Overlay";

describe("Dialog", () => {
  it("[blocant] coloana grilei e plafonată, ca un rând lung să nu lățească panoul", () => {
    render(
      <Dialog open onClose={() => {}} title="Cum începem cererea?">
        <p>Societatea cu Răspundere Limitată „VECTOR ACADEMY INTERNATIONAL"</p>
      </Dialog>
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("titlul e numele accesibil al dialogului, iar descrierea se vede", () => {
    render(
      <Dialog open onClose={() => {}} title="Cum începem cererea?" description="De la zero sau dintr-un șablon.">
        <span>copil</span>
      </Dialog>
    );
    expect(screen.getByRole("dialog", { name: /cum începem cererea/i })).toBeInTheDocument();
    expect(screen.getByText("De la zero sau dintr-un șablon.")).toBeInTheDocument();
  });

  it("închis, nu randează nimic", () => {
    const { container } = render(<Dialog open={false} onClose={() => {}} title="X" />);
    expect(container).toBeEmptyDOMElement();
  });
});
