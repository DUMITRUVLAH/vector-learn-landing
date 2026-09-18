/**
 * Toate încărcările de fișiere trebuie să plece prin `apiUpload`, nu prin `api`.
 *
 * De ce: `api()` scrie ÎNTOTDEAUNA `Content-Type: application/json`. Un header de tip scris de noi
 * îl împiedică pe browser să pună `boundary`-ul de multipart, iar corpul ajunge la server ca un
 * „JSON" pe care `c.req.formData()` nu-l poate citi. Bug-ul e tăcut la scris (codul arată corect,
 * ba chiar are un comentariu care spune că browserul pune boundary-ul singur) și apare abia în
 * mâna omului care încarcă fișierul.
 *
 * S-a întâmplat de trei ori: `parseExcel` (docmerge), cele două importuri CSV din `finMass` și
 * logoul organizației. De aceea aici nu stau doar cazurile reparate, ci și un scaner peste `src/`
 * care oprește a patra oară.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseExcel } from "@/lib/api/docmerge";
import { importPartiesFromCsv, importSpendFromCsv } from "@/lib/api/finMass";

afterEach(() => vi.unstubAllGlobals());

function captureFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => payload,
      } as unknown as Response;
    }) as unknown as typeof fetch,
  );
  return calls;
}

/** Cererea pe care serverul o poate citi: corp FormData și niciun Content-Type scris de noi. */
function expectMultipart(init: RequestInit) {
  expect(init.method).toBe("POST");
  expect(init.body).toBeInstanceOf(FormData);
  expect(new Headers((init.headers ?? {}) as HeadersInit).get("content-type")).toBeNull();
}

const xlsx = () => new File([new Uint8Array([1, 2, 3])], "date.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const csv = () => new File([new Uint8Array([1, 2, 3])], "parteneri.csv", { type: "text/csv" });

describe("încărcările de fișiere pleacă ca multipart", () => {
  it("docmerge: parseExcel", async () => {
    const calls = captureFetch({ headers: [], sample: [], previewRows: [], rowCount: 0 });
    await parseExcel(xlsx());
    expect(calls[0].url).toBe("/api/docmerge/parse-excel");
    expectMultipart(calls[0].init);
  });

  it("finMass: importul de parteneri din CSV", async () => {
    const calls = captureFetch({ jobId: "j1", totalRows: 3 });
    await importPartiesFromCsv(csv());
    expect(calls[0].url).toBe("/api/fin/mass/import/parties");
    expectMultipart(calls[0].init);
  });

  it("finMass: importul de cheltuieli din CSV", async () => {
    const calls = captureFetch({ jobId: "j2", totalRows: 5 });
    await importSpendFromCsv(csv());
    expect(calls[0].url).toBe("/api/fin/mass/import/spend");
    expectMultipart(calls[0].init);
  });
});

// ─── Scanerul care oprește a patra oară ───────────────────────────────────────

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Pentru fiecare corp de FormData, ce funcție îl trimite: `fetch` și `apiUpload` sunt corecte,
 * `api` nu. Căutăm înapoi de la linia corpului până la deschiderea apelului — destul cât să
 * prindem forma pe care o scrie omul, fără să cerem un parser de TypeScript.
 */
function formDataSenders(): Array<{ file: string; line: number; sender: string }> {
  const found: Array<{ file: string; line: number; sender: string }> = [];
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith("multipart-uploads.test.ts")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (!/\bbody:\s*(form|formData|fd)\b/.test(text)) return;
      for (let j = i; j >= Math.max(0, i - 8); j -= 1) {
        const opener = lines[j].match(/\b(apiUpload|api|fetch)\s*[<(]/);
        if (opener) {
          found.push({ file: file.slice(SRC.length + 1), line: i + 1, sender: opener[1] });
          return;
        }
      }
    });
  }
  return found;
}

describe("niciun fișier nu mai pleacă prin api()", () => {
  it("fiecare corp de FormData merge prin fetch sau apiUpload", () => {
    const wrong = formDataSenders().filter((x) => x.sender === "api");
    expect(
      wrong.map((x) => `${x.file}:${x.line}`),
      "FormData trimis prin api() — folosește apiUpload, altfel lipsește boundary-ul",
    ).toEqual([]);
  });

  it("scanerul chiar găsește apelurile (altfel testul de mai sus e gol pe degeaba)", () => {
    expect(formDataSenders().length).toBeGreaterThan(5);
  });
});
