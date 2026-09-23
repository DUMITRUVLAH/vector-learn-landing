/**
 * DateField — owner (2026-09-23), captură pe „Valabilă până la": câmpul arăta 01/13/2027
 * (lună/zi/an), fiindcă `<input type="date">` urmează limba browserului, nu a paginii.
 *
 * Testele verifică ce vede omul (textul din câmp) ȘI ce primește formularul (ISO), pentru că
 * un câmp care arată bine dar trimite „13.01.2027" la API ar strica fiecare filtru și fiecare
 * cerere salvată.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateField } from "../DateField";

function Controlled({ initial = "", onIso }: { initial?: string; onIso?: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <label htmlFor="d">Valabilă până la</label>
      <DateField id="d" value={v} onChange={(e) => { setV(e.target.value); onIso?.(e.target.value); }} />
      <output data-testid="iso">{v}</output>
    </>
  );
}

describe("DateField", () => {
  it("[blocant] afișează valoarea ISO ca zi.lună.an", () => {
    render(<Controlled initial="2027-01-13" />);
    expect(screen.getByLabelText("Valabilă până la")).toHaveValue("13.01.2027");
  });

  it("[blocant] tastezi doar cifre: punctele apar singure, formularul primește ISO", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("Valabilă până la");
    await user.type(input, "13012027");
    expect(input).toHaveValue("13.01.2027");
    expect(screen.getByTestId("iso")).toHaveTextContent("2027-01-13");
  });

  it("[blocant] o dată neterminată nu ajunge în formular", async () => {
    const user = userEvent.setup();
    const onIso = vi.fn();
    render(<Controlled onIso={onIso} />);
    const input = screen.getByLabelText("Valabilă până la");
    await user.type(input, "130120");
    expect(input).toHaveValue("13.01.20");
    expect(onIso).not.toHaveBeenCalled();
    expect(screen.getByTestId("iso")).toHaveTextContent("");
  });

  it("[blocant] cât timp corectezi o dată, formularul o păstrează pe cea veche; la ieșire, cu text neterminat, devine „”", async () => {
    const user = userEvent.setup();
    const onIso = vi.fn();
    render(<Controlled initial="2027-01-13" onIso={onIso} />);
    const input = screen.getByLabelText("Valabilă până la");
    await user.type(input, "{Backspace}{Backspace}");
    expect(input).toHaveValue("13.01.20");
    expect(onIso).not.toHaveBeenCalled();
    expect(screen.getByTestId("iso")).toHaveTextContent("2027-01-13");
    await user.tab();
    expect(screen.getByTestId("iso")).toHaveTextContent("");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("o pagină care pune o valoare implicită în locul lui „” nu-ți rescrie textul cât tastezi", async () => {
    const user = userEvent.setup();
    function WithFallback() {
      const [v, setV] = useState("2027-01-13");
      return <DateField aria-label="Data" value={v} onChange={(e) => setV(e.target.value || "2026-09-23")} />;
    }
    render(<WithFallback />);
    const input = screen.getByLabelText("Data");
    await user.tripleClick(input);
    await user.keyboard("0503");
    expect(input).toHaveValue("05.03");
  });

  it("o dată care nu există (31.02) rămâne afișată, dar e marcată invalidă la ieșire", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("Valabilă până la");
    await user.type(input, "31022027");
    await user.tab();
    expect(input).toHaveValue("31.02.2027");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("iso")).toHaveTextContent("");
  });

  it("ștergerea datei trimite „”", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="2027-01-13" />);
    const input = screen.getByLabelText("Valabilă până la");
    await user.clear(input);
    expect(screen.getByTestId("iso")).toHaveTextContent("");
  });

  it("o valoare venită din afară (AI, reset de filtru) rescrie textul", () => {
    const { rerender } = render(<DateField aria-label="Data" value="2027-01-13" onChange={() => {}} />);
    rerender(<DateField aria-label="Data" value="2026-12-01" onChange={() => {}} />);
    expect(screen.getByLabelText("Data")).toHaveValue("01.12.2026");
  });

  it("alegerea din calendar ajunge în formular ca ISO și se afișează zi.lună.an", () => {
    const { container } = render(<Controlled />);
    const picker = container.querySelector('input[type="date"]');
    expect(picker).not.toBeNull();
    fireEvent.change(picker as HTMLInputElement, { target: { value: "2027-03-05" } });
    expect(screen.getByLabelText("Valabilă până la")).toHaveValue("05.03.2027");
    expect(screen.getByTestId("iso")).toHaveTextContent("2027-03-05");
  });

  it("ISO lipit sau schimbat direct (ca în testele vechi) încă merge", () => {
    render(<Controlled />);
    const input = screen.getByLabelText("Valabilă până la");
    fireEvent.change(input, { target: { value: "2024-01-15" } });
    expect(screen.getByTestId("iso")).toHaveTextContent("2024-01-15");
  });

  it("o dată în afara intervalului min/max e marcată invalidă", async () => {
    const user = userEvent.setup();
    render(<DateField aria-label="Data" value="" min="2027-01-01" onChange={() => {}} />);
    const input = screen.getByLabelText("Data");
    await user.type(input, "31122026");
    await user.tab();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("butonul de calendar are nume accesibil", () => {
    render(<DateField aria-label="Data" value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Alege din calendar" })).toBeInTheDocument();
  });
});
