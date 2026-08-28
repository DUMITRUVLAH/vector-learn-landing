/**
 * La remontarea shell-ului, rolurile PAR trebuie citite SINCRON din cache.
 *
 * Fiecare navigare remontează BusinessShell. `cachedOnce` evita al doilea request, dar
 * promisiunea se rezolvă abia DUPĂ primul paint — deci meniul se desena întâi fără secțiunea
 * PAR și apoi cu ea, iar sidebar-ul „sărea" la fiecare click. Testul cere exact starea de la
 * prima randare a celei de-a doua montări.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { getParMe } from "@/lib/api/par";
import { clearSessionCache } from "@/lib/sessionCache";
import { useParRoles } from "@/hooks/useParRoles";

vi.mock("@/lib/api/par", () => ({ getParMe: vi.fn() }));
const mockParMe = vi.mocked(getParMe);

/** Randează starea de la PRIMUL paint, ca să prindem exact „flash-ul" de loading. */
function Probe() {
  const { status, roles } = useParRoles();
  return <span data-testid="state">{`${status}:${roles.join(",")}`}</span>;
}

beforeEach(() => {
  clearSessionCache();
  vi.clearAllMocks();
  mockParMe.mockResolvedValue({ roles: ["approver", "par_admin"] } as never);
});

describe("useParRoles", () => {
  it("[blocant] a doua montare pornește deja rezolvat — fără pâlpâire de meniu", async () => {
    const first = render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("loading:");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("resolved:approver,par_admin"));
    first.unmount();

    // Exact ce se întâmplă la un click în meniu: shell nou, hook nou, ZERO stare păstrată.
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("resolved:approver,par_admin");
    expect(mockParMe).toHaveBeenCalledTimes(1); // și niciun request în plus
  });

  it("fără cache (logout / sesiune nouă) pornește iar de la loading — dovada că testul de mai sus chiar discriminează", async () => {
    const first = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("resolved:approver,par_admin"));
    first.unmount();

    clearSessionCache();
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("loading:");
  });

  it("prima montare a sesiunii cere rolurile o singură dată", async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("resolved:"));
    expect(mockParMe).toHaveBeenCalledTimes(1);
  });
});
