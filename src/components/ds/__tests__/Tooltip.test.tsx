/**
 * Tooltip — owner, 26.09.2026, pe coada de finanțe: „când faci hover pe butoane să poți vedea la
 * ce acțiune se referă".
 *
 * Mecanismul bugului: butoanele-pictogramă aveau `title`, iar `title` chiar E tooltipul nativ —
 * doar că apare după 1–2 secunde, în caseta sistemului de operare. Un ajutor care ajunge după ce
 * omul a dat deja click nu e un ajutor. Testele de aici încuie comportamentul care lipsea:
 * textul apare la survolare, dispare la ieșire și vine și de la tastatură.
 *
 * jsdom nu randează nimic vizual, deci nu poate „vedea" bula; ce poate verifica — și ce s-a
 * stricat de fapt — e dacă textul acțiunii ajunge sau nu în DOM la survolare.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("[blocant] la survolare arată ce face butonul", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Înregistrează plata">
        <button aria-label="Înregistrează plata pentru PAR-2026-0042">icon</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button");

    // Înainte de survolare, eticheta NU e în pagină: într-un tabel, cinci etichete invizibile pe
    // rând ar ajunge în căutarea din browser și în textul citit de asistivă.
    expect(screen.queryByText("Înregistrează plata")).not.toBeInTheDocument();

    fireEvent.pointerEnter(trigger.parentElement!);
    tick(200);
    expect(screen.getByText("Înregistrează plata")).toBeInTheDocument();
  });

  it("[blocant] la ieșirea cursorului dispare", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Arhivează">
        <button aria-label="Arhivează cererea PAR-2026-0042">icon</button>
      </Tooltip>,
    );
    const wrap = screen.getByRole("button").parentElement!;

    fireEvent.pointerEnter(wrap);
    tick(200);
    expect(screen.getByText("Arhivează")).toBeInTheDocument();

    fireEvent.pointerLeave(wrap);
    expect(screen.queryByText("Arhivează")).not.toBeInTheDocument();
  });

  it("[blocant] o trecere scurtă peste bară nu aprinde bula", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Dosarul complet (PDF)">
        <button aria-label="Descarcă dosarul">icon</button>
      </Tooltip>,
    );
    const wrap = screen.getByRole("button").parentElement!;

    fireEvent.pointerEnter(wrap);
    tick(60); // sub pragul de 120ms
    fireEvent.pointerLeave(wrap);
    tick(500);
    expect(screen.queryByText("Dosarul complet (PDF)")).not.toBeInTheDocument();
  });

  it("[blocant] tastatura vede aceeași explicație ca mouse-ul", () => {
    render(
      <Tooltip label="Solicită modificări">
        <button aria-label="Solicită modificări la PAR-2026-0042">icon</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByText("Solicită modificări")).toBeInTheDocument();

    fireEvent.blur(screen.getByRole("button"));
    expect(screen.queryByText("Solicită modificări")).not.toBeInTheDocument();
  });

  it("[normal] bula nu se citește de două ori: numele accesibil rămâne al butonului", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Plata">
        <button aria-label="Înregistrează plata pentru PAR-2026-0042">icon</button>
      </Tooltip>,
    );
    fireEvent.pointerEnter(screen.getByRole("button").parentElement!);
    tick(200);

    // `role="tooltip"` există în DOM, dar e `aria-hidden` — asistiva aude eticheta lungă a
    // butonului, nu de două ori cuvântul scurt.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByText("Plata")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Înregistrează plata pentru PAR-2026-0042" })).toBeInTheDocument();
  });

  it("[normal] click-ul închide bula — modala se deschide fără o etichetă rămasă deasupra", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Secțiunea 16">
        <button aria-label="Completează secțiunea 16">icon</button>
      </Tooltip>,
    );
    const wrap = screen.getByRole("button").parentElement!;
    fireEvent.pointerEnter(wrap);
    tick(200);
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(screen.queryByText("Secțiunea 16")).not.toBeInTheDocument();
  });

  it("[normal] Escape o închide", () => {
    render(
      <Tooltip label="Readu cererea în coada de lucru">
        <button aria-label="Readu cererea">icon</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByText("Readu cererea în coada de lucru")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Readu cererea în coada de lucru")).not.toBeInTheDocument();
  });

  it("[normal] pe telefon, o atingere nu lasă bula agățată pe ecran", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Arhivează">
        <button aria-label="Arhivează cererea PAR-2026-0042">icon</button>
      </Tooltip>,
    );
    const wrap = screen.getByRole("button").parentElement!;
    // React nu ascultă `pointerenter` direct: îl deduce din `pointerover`. Iar `fireEvent`
    // nu duce mai departe `pointerType` (ajunge `null`), deci evenimentul se construiește cu
    // mâna — exact cum îl trimite un telefon după atingere. Fără filtrul din componentă,
    // verificarea asta pică.
    const touch = new MouseEvent("pointerover", { bubbles: true });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    act(() => {
      wrap.dispatchEvent(touch);
    });
    tick(500);
    expect(screen.queryByText("Arhivează")).not.toBeInTheDocument();
  });
});
