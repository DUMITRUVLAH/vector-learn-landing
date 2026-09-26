/**
 * Ownerul: „nu se poate face scroll aici la fel" (Automatizări). Un blocaj rămas de pe pagina de
 * dinainte trebuie să dispară la schimbarea rutei — dar NU cât o fereastră e chiar deschisă.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Dialog } from "@/components/ds";
import { clearOrphanScrollLock } from "@/lib/scrollLockGuard";

afterEach(() => {
  document.body.style.overflow = "";
});

describe("garda de derulare la schimbarea rutei", () => {
  it("[blocant] blocajul rămas fără nicio fereastră deschisă se ridică", () => {
    document.body.style.overflow = "hidden";
    expect(clearOrphanScrollLock()).toBe(true);
    expect(document.body.style.overflow).toBe("");
  });

  it("[blocant] cu o fereastră deschisă, pagina rămâne blocată", () => {
    const { unmount } = render(
      <Dialog open onClose={() => {}} title="Regulă nouă">
        <p>corp</p>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");
    expect(clearOrphanScrollLock()).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
  });

  it("nu atinge o pagină care nu e blocată", () => {
    expect(clearOrphanScrollLock()).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });
});
