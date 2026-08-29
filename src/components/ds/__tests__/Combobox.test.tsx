/**
 * Combobox — bug raportat de owner (2026-08-29) pe „Cod bugetar": „aici nu se întâmplă nimic
 * dacă caut, doar în dropdown". Tiparul vechi (casetă de căutare deasupra unui <select> nativ)
 * filtra opțiuni ASCUNSE: pe ecran nu se schimba nimic până nu deschideai lista.
 *
 * Testele de mai jos apasă exact pe asta: după ce scrii, lista VIZIBILĂ trebuie să conțină
 * doar potrivirile. Un test care verifică doar că inputul acceptă text ar fi trecut și pe
 * codul vechi — deci nu ar fi verificat nimic.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Combobox } from "../Combobox";

const OPTIONS = [
  { value: "1", label: "1.1", hint: "Director/Project Manager (50%)" },
  { value: "2", label: "1.2", hint: "Project Coordinator (100%)" },
  { value: "3", label: "2.1", hint: "Chirie birou" },
];

describe("Combobox", () => {
  it("[blocant] scrisul filtrează lista VIZIBILĂ, nu opțiuni ascunse", () => {
    render(<Combobox aria-label="Cod bugetar" value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText("Cod bugetar");

    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);

    fireEvent.change(input, { target: { value: "chirie" } });
    const shown = screen.getAllByRole("option");
    expect(shown).toHaveLength(1);
    expect(shown[0]).toHaveTextContent("2.1");
  });

  it("caută și în textul secundar, nu doar în cod", () => {
    render(<Combobox aria-label="Cod bugetar" value="" options={OPTIONS} onChange={() => {}} />);
    const input = screen.getByLabelText("Cod bugetar");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "coordinator" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Project Coordinator");
  });

  it("alegerea unei opțiuni întoarce valoarea și închide lista", () => {
    const onChange = vi.fn();
    render(<Combobox aria-label="Cod bugetar" value="" options={OPTIONS} onChange={onChange} />);
    fireEvent.focus(screen.getByLabelText("Cod bugetar"));
    fireEvent.click(screen.getByRole("option", { name: /Chirie birou/ }));
    expect(onChange).toHaveBeenCalledWith("3");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("valoarea aleasă se vede în câmp și poate fi ștearsă", () => {
    const onChange = vi.fn();
    render(<Combobox aria-label="Cod bugetar" value="2" options={OPTIONS} onChange={onChange} />);
    expect((screen.getByLabelText("Cod bugetar") as HTMLInputElement).value).toBe("1.2");
    fireEvent.click(screen.getByRole("button", { name: /șterge selecția/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("fără potriviri spune asta, în loc să arate o listă goală", () => {
    render(
      <Combobox aria-label="Cod bugetar" value="" options={OPTIONS} onChange={() => {}}
        emptyText="Niciun cod bugetar care să se potrivească" />
    );
    const input = screen.getByLabelText("Cod bugetar");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Niciun cod bugetar care să se potrivească")).toBeInTheDocument();
  });

  it("tastatura: ↓ apoi Enter alege prima opțiune", () => {
    const onChange = vi.fn();
    render(<Combobox aria-label="Cod bugetar" value="" options={OPTIONS} onChange={onChange} />);
    const input = screen.getByLabelText("Cod bugetar");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("1");
  });
});
