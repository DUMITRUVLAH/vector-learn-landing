/**
 * Memoria de ecran nu are voie să devină date învechite.
 *
 * `useKeepAliveState` face ca o pagină să revină instantaneu la ce vedeai ultima dată, în loc
 * să se nască de la zero la fiecare navigare. Riscul evident: după o aprobare, lista veche s-ar
 * putea întoarce din memorie. Contractul e că ORICE mutație golește și cache-ul de GET-uri, și
 * memoria de ecran — testele de mai jos apasă exact pe asta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useKeepAliveState, hasKeepAlive } from "@/hooks/useKeepAliveState";
import { clearViewState } from "@/lib/viewState";
import { api } from "@/lib/api";

function Counter() {
  const [n, setN] = useKeepAliveState("test.counter", 0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      n={n}
    </button>
  );
}

beforeEach(() => {
  clearViewState();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useKeepAliveState", () => {
  it("[blocant] a doua montare pornește de la ultima valoare — pagina nu se mai naște de la zero", () => {
    const first = render(<Counter />);
    fireEvent.click(screen.getByText("n=0"));
    expect(screen.getByText("n=1")).toBeInTheDocument();
    first.unmount();

    render(<Counter />); // exact ce face o navigare: componentă nouă, zero stare proprie
    expect(screen.getByText("n=1")).toBeInTheDocument();
  });

  it("hasKeepAlive spune dacă avem ce afișa — de asta depinde dacă mai arătăm „se încarcă”", () => {
    expect(hasKeepAlive("test.counter")).toBe(false);
    const view = render(<Counter />);
    fireEvent.click(screen.getByText("n=0"));
    view.unmount();
    expect(hasKeepAlive("test.counter")).toBe(true);
  });
});

describe("prospețimea după o mutație", () => {
  it("[blocant] un POST golește memoria de ecran — ecranul de după aprobare nu poate fi cel vechi", async () => {
    const view = render(<Counter />);
    fireEvent.click(screen.getByText("n=0"));
    view.unmount();
    expect(hasKeepAlive("test.counter")).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    await api("/api/par/some-id/approve", { method: "POST", body: "{}" });

    expect(hasKeepAlive("test.counter")).toBe(false);
    render(<Counter />);
    expect(screen.getByText("n=0")).toBeInTheDocument(); // se reîncarcă, nu se reînvie
  });

  it("un GET NU golește memoria — altfel n-ar mai exista niciun beneficiu", async () => {
    const view = render(<Counter />);
    fireEvent.click(screen.getByText("n=0"));
    view.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));
    await api("/api/par");

    expect(hasKeepAlive("test.counter")).toBe(true);
  });
});
