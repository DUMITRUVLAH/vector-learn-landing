/**
 * Ownerul: „nu pot face scroll pe pagina act". Fișa leadului + dialogul „Act nou" blocau derularea,
 * iar la navigare React le închidea de sus în jos: ultimul care „punea la loc" punea „hidden".
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Dialog, Sheet } from "@/components/ds";
import { lockBodyScroll, _scrollLocksForTest } from "@/lib/scrollLock";

describe("blocarea derulării, cu contor", () => {
  it("[blocant] fișa se re-randează cât dialogul e deschis, apoi navigarea le închide → pagina se derulează", () => {
    // Exact scenariul real: fișa leadului primește un `onClose` nou la fiecare randare, efectul ei
    // rulează din nou CÂT „Act nou" e deschis și, în varianta veche, își salva ca „valoare
    // anterioară" chiar „hidden"-ul pus de dialog. La închidere, pagina rămânea blocată.
    const tree = (n: number) => (
      <Sheet open onClose={() => n} title="Fișa leadului">
        <Dialog open onClose={() => {}} title="Act nou">
          <p>corp</p>
        </Dialog>
      </Sheet>
    );
    const { rerender, unmount } = render(tree(1));
    rerender(tree(2));
    expect(document.body.style.overflow).toBe("hidden");
    unmount(); // navigarea spre /business/crm/documente/:id
    expect(document.body.style.overflow).toBe("");
    expect(_scrollLocksForTest()).toBe(0);
  });

  it("[blocant] eliberarea în ordine inversă nu lasă pagina blocată", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    outer();
    expect(document.body.style.overflow).toBe("hidden");
    inner();
    expect(document.body.style.overflow).toBe("");
  });

  it("o eliberare dublă nu strică numărătoarea", () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a();
    expect(document.body.style.overflow).toBe("hidden");
    b();
    expect(document.body.style.overflow).toBe("");
  });
});
