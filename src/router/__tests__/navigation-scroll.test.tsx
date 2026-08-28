/**
 * Navigarea sare sus INSTANT, nu cu animație.
 *
 * Bug raportat de owner: „mereu când apăs pe sidebar, sare toată pagina în sus, în jos".
 * Cauza: `window.scrollTo({ behavior: "auto" })` NU înseamnă „fără animație" — conform
 * specificației, „auto" delegă CSS-ului, iar `html` are `scroll-behavior: smooth`. Deci
 * fiecare click pornea o derulare animată de ~600ms peste conținutul care tocmai se schimba
 * (măsurat în Chrome: la 30ms după apel pagina era încă la 543px din 530).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HashRouter, Link, useRouter } from "@/router/HashRouter";

const scrollTo = vi.fn();

beforeEach(() => {
  vi.stubGlobal("scrollTo", scrollTo);
  window.location.hash = "#/business/dashboard";
  scrollTo.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function NavigateButton({ to }: { to: string }) {
  const { navigate, path } = useRouter();
  return (
    <>
      <button type="button" onClick={() => navigate(to)}>go</button>
      <span data-testid="path">{path}</span>
    </>
  );
}

/** jsdom nu declanșează `hashchange` sincron — îl emitem noi, ca browserul. */
function flushHashChange() {
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("derularea la schimbarea paginii", () => {
  it("[blocant] sare sus cu behavior:\"instant\", nu cu \"auto\" (care ar anima)", () => {
    render(
      <HashRouter>
        <NavigateButton to="/business/par/inbox" />
      </HashRouter>,
    );

    fireEvent.click(screen.getByText("go"));
    flushHashChange();

    expect(scrollTo).toHaveBeenCalled();
    const arg = scrollTo.mock.calls.at(-1)?.[0] as { top: number; behavior: string };
    expect(arg.top).toBe(0);
    expect(arg.behavior).toBe("instant");
    expect(screen.getByTestId("path")).toHaveTextContent("/business/par/inbox");
  });

  it("un <Link> se poartă identic cu `navigate()` — aceeași derulare, o singură dată", () => {
    render(
      <HashRouter>
        <Link to="/business/par/finance">Coadă finanțe</Link>
      </HashRouter>,
    );

    fireEvent.click(screen.getByText("Coadă finanțe"));
    flushHashChange();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect((scrollTo.mock.calls[0][0] as { behavior: string }).behavior).toBe("instant");
  });
});
