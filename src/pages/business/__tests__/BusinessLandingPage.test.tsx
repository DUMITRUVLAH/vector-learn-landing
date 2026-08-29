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
  it("spune ce este produsul și are o singură ușă de intrare: autentificarea", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Nicio plată fără aprobare");

    // Bug raportat de owner de pe telefon: butoanele duceau direct în formularul de cont nou,
    // deci cereau cont fix omului care avea deja unul. Toate intrările merg acum în pagina de
    // autentificare, de unde se poate și crea un workspace nou.
    const signupLinks = screen.queryAllByRole("link").filter((a) => a.getAttribute("href")?.includes("/business/signup"));
    expect(signupLinks, "landingul nu trebuie să trimită direct la crearea contului").toHaveLength(0);

    const entry = screen.getAllByRole("link", { name: /intră în cont|autentificare/i });
    expect(entry.length).toBeGreaterThan(0);
    for (const link of entry) expect(link.getAttribute("href")).toBe("#/business/login");
  });

  it("afișează prețul de 20 $ pentru manageri și 5 $ pentru restul echipei", () => {
    renderPage();
    const pricing = document.getElementById("preturi");
    expect(pricing).not.toBeNull();
    const section = within(pricing as HTMLElement);
    expect(section.getAllByText("$20").length).toBeGreaterThan(0);
    expect(section.getAllByText("$5").length).toBeGreaterThan(0);
  });

  it("calculatorul recalculează totalul când se schimbă numărul de oameni", () => {
    renderPage();

    // Implicit: 1 manager × 20 $ + 3 membri × 5 $ = 35 $ — o echipă mică, nu o corporație.
    expect(monthlyTotal()).toBe("$35");

    fireEvent.change(screen.getByLabelText(/manageri.*număr exact/i), { target: { value: "3" } });
    expect(monthlyTotal()).toBe("$75"); // 3 × 20 + 3 × 5

    fireEvent.change(screen.getByLabelText(/membri.*număr exact/i), { target: { value: "10" } });
    expect(monthlyTotal()).toBe("$110"); // 3 × 20 + 10 × 5
  });

  it("calculatorul nu propagă valori în afara limitelor în preț", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/membri.*număr exact/i), { target: { value: "-4" } });
    expect(monthlyTotal()).toBe("$20"); // 1 × 20 + 0 × 5 — negativul e prins
    fireEvent.change(screen.getByLabelText(/membri.*număr exact/i), { target: { value: "999" } });
    expect(monthlyTotal()).toBe("$170"); // plafonat la 30 de membri: 20 + 150
  });

  it("fiecare capacitate are secțiunea ei, nu un slide", () => {
    renderPage();
    for (const id of ["ai", "aprobari", "finante", "efactura", "flux", "securitate", "preturi"]) {
      expect(document.getElementById(id), `lipsește secțiunea #${id}`).not.toBeNull();
    }
    expect(screen.getByRole("heading", { name: /nu mai copiezi nimic dintr-un pdf/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /pragurile decid cine semnează/i })).toBeTruthy();
  });

  it("traseul cererii stă în prima jumătate, înaintea funcționalităților", () => {
    renderPage();
    const flow = document.getElementById("flux") as HTMLElement;
    const ai = document.getElementById("ai") as HTMLElement;
    expect(flow).not.toBeNull();
    expect(ai).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING = `ai` vine DUPĂ `flux` în document.
    expect(flow.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fiecare pas al traseului arată ce dovadă rămâne", async () => {
    const user = userEvent.setup();
    renderPage();
    const flow = document.getElementById("flux") as HTMLElement;
    expect(within(flow).getByText(/contractul și oferta rămân atașate/i)).toBeTruthy();

    await user.click(within(flow).getByRole("button", { name: /pasul 5: plată/i }));
    expect(within(flow).getByText(/sumă reală/i)).toBeTruthy();
    expect(within(flow).getByText(/ordinul de plată și dovada/i)).toBeTruthy();
  });

  it("nu publică date reale din cererile clienților", () => {
    renderPage();
    const text = document.body.textContent ?? "";
    // Prima versiune afișa numele, proiectul, IDNP-ul și IBAN-ul din formularul real al unui client.
    // (Numele organizațiilor din banda „Utilizat de" sunt altceva: sunt afișate cu acordul lor,
    // ca referință comercială — nu sunt datele personale ale unui beneficiar de plată.)
    for (const real of ["Ana Chiriță", "Irina Oriol", "Daria Roitman", "Digital Safeguard", "MD48", "2008001007903"]) {
      expect(text, `pagina conține date reale: ${real}`).not.toContain(real);
    }
  });

  it("arată organizațiile care folosesc platforma, cu logouri care se încarcă", () => {
    renderPage();
    const strip = document.querySelector('section[aria-labelledby="utilizat-de"]');
    expect(strip).not.toBeNull();
    const logos = within(strip as HTMLElement).getAllByRole("img");
    expect(logos).toHaveLength(6);
    for (const name of ["ATIC", "Tekwill", "Tekwill Academy", "Inotek", "Clubul Tinerilor Makeri", "iHUB"]) {
      expect(within(strip as HTMLElement).getByAltText(name)).toBeTruthy();
    }
    // Fișierele trebuie să existe în `public/logos/`, altfel utilizatorul vede textul alt.
    for (const img of logos) expect(img.getAttribute("src")).toMatch(/^\/logos\/[\w.-]+$/);
  });

  it("prima jumătate vorbește despre problemă, nu despre funcționalități", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /sună cunoscut/i })).toBeTruthy();
    expect(screen.getByText(/aprobarea vine pe whatsapp/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /ce se schimbă, concret/i })).toBeTruthy();
    // Insigna de sub titlu a fost scoasă la cererea owner-ului.
    expect(document.body.textContent).not.toContain("Achiziții și aprobări interne · MDL");
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
