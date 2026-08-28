/**
 * Pagina publică FinFlow — ce vede un vizitator nelogat.
 *
 * Testăm rezultatul de marketing, nu implementarea: prețul cerut de owner (20 $ manager /
 * 5 $ membru), calculatorul care chiar recalculează, CTA-urile care duc în conturi reale și
 * carusela care schimbă slide-ul la click. Un landing care randează dar are calculatorul mort
 * sau butonul „Începe gratuit" fără href arată identic într-un test naiv.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "@/router/HashRouter";
import { BusinessLandingPage } from "@/pages/business/BusinessLandingPage";

/** Totalul lunar din calculator — nodul care se anunță cititorului de ecran. */
function monthlyTotal(): string {
  const node = document.querySelector('[aria-live="polite"]');
  return node?.textContent?.trim() ?? "";
}

function renderPage() {
  return render(
    <HashRouter>
      <BusinessLandingPage />
    </HashRouter>,
  );
}

describe("BusinessLandingPage (FinFlow)", () => {
  it("spune ce este produsul și duce la creare de cont", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Nicio plată fără aprobare");
    const signupLinks = screen.getAllByRole("link", { name: /începe gratuit/i });
    expect(signupLinks.length).toBeGreaterThan(0);
    for (const link of signupLinks) {
      expect(link.getAttribute("href")).toBe("#/business/signup");
    }
    for (const link of screen.getAllByRole("link", { name: /autentificare/i })) {
      expect(link.getAttribute("href")).toBe("#/business/login");
    }
  });

  it("afișează prețul de 20 $ pentru manageri și 5 $ pentru restul echipei", () => {
    renderPage();
    const pricing = document.getElementById("preturi");
    expect(pricing).not.toBeNull();
    const section = within(pricing as HTMLElement);
    expect(section.getByText("$20")).toBeTruthy();
    expect(section.getByText("$5")).toBeTruthy();
  });

  it("calculatorul recalculează totalul când se schimbă numărul de oameni", () => {
    renderPage();

    // Implicit: 3 manageri × 20 $ + 15 membri × 5 $ = 135 $.
    expect(monthlyTotal()).toBe("$135");

    fireEvent.change(screen.getByLabelText(/manageri.*număr exact/i), { target: { value: "5" } });
    expect(monthlyTotal()).toBe("$175"); // 5 × 20 + 15 × 5

    fireEvent.change(screen.getByLabelText(/membri.*număr exact/i), { target: { value: "40" } });
    expect(monthlyTotal()).toBe("$300"); // 5 × 20 + 40 × 5
  });

  it("calculatorul nu propagă valori sub minim în preț", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/membri.*număr exact/i), { target: { value: "-4" } });
    // 3 × 20 + 0 × 5 = 60 $ — negativul e prins, nu ajunge în total.
    expect(monthlyTotal()).toBe("$60");
  });

  it("carusela schimbă slide-ul la click pe indicator", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText(/cererea se completează singură/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /arată matricea doa/i }));
    expect(screen.getByText(/pragurile decid cine semnează/i)).toBeTruthy();
  });

  it("formularul de contact deschide un email precompletat", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^nume/i), "Ion Popescu");
    await user.type(screen.getByLabelText(/^email/i), "ion@organizatie.md");
    await user.type(screen.getByLabelText(/^organizație/i), "A.O. Exemplu");
    await user.click(screen.getByRole("button", { name: /trimite cererea/i }));

    expect(screen.getByText(/gata de trimis/i)).toBeTruthy();
  });
});
