/**
 * Regresie: încărcarea logoului organizației pleca fără boundary de multipart.
 *
 * `api()` pune ÎNTOTDEAUNA `Content-Type: application/json`. Un header de tip pus de noi îl
 * împiedică pe browser să scrie boundary-ul, deci corpul de FormData ajungea la server ca „JSON"
 * fără boundary, `c.req.formData()` nu-l putea citi, iar orice încărcare pica — inclusiv un PNG
 * de 3 KB, perfect valid. Pentru asta există `apiUpload`, care nu atinge headerele.
 *
 * Testul ține contractul cererii, nu implementarea: dacă cineva mută funcția înapoi pe `api()`,
 * pică aici, nu în mâna omului care încarcă logoul.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadParLogo } from "@/lib/api/par";

afterEach(() => vi.unstubAllGlobals());

function captureFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ logoUrl: "https://storage.exemplu/logo.png" }),
      } as unknown as Response;
    }) as unknown as typeof fetch,
  );
  return calls;
}

describe("uploadParLogo", () => {
  it("trimite fișierul ca multipart, fără Content-Type pus de noi", async () => {
    const calls = captureFetch();
    await uploadParLogo(new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" }));

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("/api/par/settings/logo");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // Orice Content-Type scris de noi ar goli boundary-ul — deci nu trebuie să existe niciunul.
    const headers = new Headers((init.headers ?? {}) as HeadersInit);
    expect(headers.get("content-type")).toBeNull();
  });

  it("trimite cookie-ul de sesiune (ruta cere rolul de par_admin)", async () => {
    const calls = captureFetch();
    await uploadParLogo(new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
    expect(calls[0].init.credentials).toBe("include");
  });

  it("întoarce URL-ul public scris de server în setări", async () => {
    captureFetch();
    const res = await uploadParLogo(new File([new Uint8Array([1])], "logo.png", { type: "image/png" }));
    expect(res.logoUrl).toBe("https://storage.exemplu/logo.png");
  });
});
