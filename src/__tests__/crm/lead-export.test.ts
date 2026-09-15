/**
 * CRM — clientul exportului de leaduri (dreptul `leads.export`).
 *
 * Partea de client are exact două responsabilități, și ambele sunt despre onestitate:
 *  1. trimite serverului FILTRELE, nu pagina afișată — altfel fișierul e o felie tăcută;
 *  2. citește antetele `x-export-*` și spune omului când a primit doar o parte din bază.
 * Plus traducerea refuzului: „HTTP 403" nu-i spune nimănui ce drept să ceară.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCrmLeadsCsv } from "@/lib/api/crm";

const originalFetch = global.fetch;

function csvResponse(body: string, headers: Record<string, string>) {
  return new Response(body, { status: 200, headers: { "content-type": "text/csv", ...headers } });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Exportul de leaduri (client)", () => {
  it("[blocant] trimite filtrele de segmentare în cerere", async () => {
    const fetchMock = vi.fn().mockResolvedValue(csvResponse("Nume\r\n", { "x-export-count": "0" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await downloadCrmLeadsCsv({ industry: "Industrie alimentară", minConsumptionKwh: 100000, pipelineId: "pipe-1" });

    const url = new URL(fetchMock.mock.calls[0][0] as string, "https://x.test");
    expect(url.pathname).toBe("/api/crm/leads/export.csv");
    expect(url.searchParams.get("industry")).toBe("Industrie alimentară");
    expect(url.searchParams.get("minConsumptionKwh")).toBe("100000");
    expect(url.searchParams.get("pipelineId")).toBe("pipe-1");
  });

  it("[blocant] citește câte rânduri s-au exportat și dacă fișierul e trunchiat", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      csvResponse("Nume\r\nX\r\n", { "x-export-count": "10000", "x-export-truncated": "true" })
    ) as unknown as typeof fetch;

    const res = await downloadCrmLeadsCsv();
    expect(res.count).toBe(10000);
    expect(res.truncated).toBe(true);
  });

  it("[blocant] refuzul pe drept spune CE drept lipsește", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(downloadCrmLeadsCsv()).rejects.toThrow(/dreptul de a exporta/i);
  });

  it("[normal] fără filtre, cererea nu poartă un query string gol", async () => {
    const fetchMock = vi.fn().mockResolvedValue(csvResponse("Nume\r\n", { "x-export-count": "0" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await downloadCrmLeadsCsv();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/crm/leads/export.csv");
  });
});
