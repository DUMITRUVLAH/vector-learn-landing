/**
 * Lanțul complet, prin React: apeși pe EN → textul unei componente care folosește
 * `useT()` se schimbă, iar `<html lang>` o urmează.
 *
 * Testul unitar pe `t()` nu acoperă asta: acolo limba se dă ca parametru. Aici trece
 * prin `useSyncExternalStore`, deci prinde exact ce s-ar rupe la o refactorizare a
 * abonării — o componentă care rămâne pe limba veche până la următoarea navigare.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { setLang, useT } from "@/lib/i18n";

/** jsdom-ul din `vitest.config.ts` nu are `localStorage`; comutatorul trebuie să meargă și așa. */
function installStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    },
  });
}

function Consumer() {
  const { t } = useT();
  return <p>{t("common.action.save")}</p>;
}

function Harness({ variant }: { variant?: "segmented" | "compact" }) {
  return (
    <>
      <LanguageSwitcher variant={variant} />
      <Consumer />
    </>
  );
}

beforeEach(() => {
  installStorage();
  Object.defineProperty(window.navigator, "languages", { configurable: true, value: ["ro-MD"] });
  window.location.hash = "";
  localStorage.clear();
  // Limba trăiește la nivel de modul, deci supraviețuiește între teste: fără resetare,
  // al doilea test pornește în engleza lăsată de primul.
  setLang("ro");
});

describe("LanguageSwitcher", () => {
  it("schimbă textul componentelor care ascultă și <html lang>", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("Salvează")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /English/ }));

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it("marchează limba activă cu aria-pressed, ca cititorul de ecran s-o anunțe", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const english = screen.getByRole("button", { name: /English/ });
    expect(english).toHaveAttribute("aria-pressed", "false");

    await user.click(english);

    expect(screen.getByRole("button", { name: /English/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Română/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("varianta compactă anunță limba spre care comută, nu cea curentă", async () => {
    const user = userEvent.setup();
    render(<Harness variant="compact" />);

    const toggle = screen.getByRole("button", { name: "Schimbă limba în English" });
    await user.click(toggle);

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch language to Română" })).toBeInTheDocument();
  });

  it("ține minte alegerea", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /English/ }));
    expect(localStorage.getItem("vf.lang")).toBe("en");
  });
});
