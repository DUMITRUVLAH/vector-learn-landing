/**
 * CONT-PLATA: server-side proxy to the contafirm.md public company registry.
 * Runs on the server to avoid browser CORS and to centralize the upstream
 * contract (https://contafirm.md/api/v1). Returns normalized shapes the UI and
 * the payment-account routes can consume directly.
 */

const REGISTRY_BASE =
  process.env.REGISTRY_API_BASE?.replace(/\/$/, "") || "https://contafirm.md/api/v1";

const UPSTREAM_TIMEOUT_MS = 12_000;

/** A registry list row (matches `PublicCompanyResource`). */
export interface RegistryCompany {
  id: number;
  idno: string | null;
  name: string;
  status: string;
  legalForm: string | null;
  registrationDate: string | null;
  liquidationDate: string | null;
  cuatmCode: string | null;
  address: string | null;
  city: string | null;
}

export interface RegistryContacts {
  websiteUrl: string | null;
  emails: string[];
  phones: string[];
  socialLinks: string[];
}

/** A registry detail row (matches `PublicCompanyDetailResource`). */
export interface RegistryCompanyDetail extends RegistryCompany {
  activities: { licensed: string[]; unlicensed: string[] };
  contacts: RegistryContacts;
}

export class RegistryError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalize(row: any): RegistryCompany {
  return {
    id: Number(row?.id),
    idno: row?.idno ?? null,
    name: String(row?.name ?? ""),
    status: String(row?.status ?? ""),
    legalForm: row?.legal_form ?? null,
    registrationDate: row?.registration_date ?? null,
    liquidationDate: row?.liquidation_date ?? null,
    cuatmCode: row?.cuatm_code ?? null,
    address: row?.address ?? null,
    city: row?.city ?? null,
  };
}

function normalizeContacts(c: any): RegistryContacts {
  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  return {
    websiteUrl: c?.website_url ?? null,
    emails: arr(c?.emails),
    phones: arr(c?.phones),
    socialLinks: arr(c?.social_links),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchUpstream(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${REGISTRY_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    throw new RegistryError(
      502,
      err instanceof Error && err.name === "AbortError"
        ? "registry_timeout"
        : "registry_unreachable"
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) throw new RegistryError(404, "company_not_found");
  if (!res.ok) throw new RegistryError(502, `registry_status_${res.status}`);
  return res.json();
}

/**
 * Search the registry. `q` matches name or IDNO. Returns up to `perPage` rows.
 */
export async function searchCompanies(
  q: string,
  perPage = 10
): Promise<RegistryCompany[]> {
  const params = new URLSearchParams({
    q,
    per_page: String(Math.min(Math.max(perPage, 1), 50)),
  });
  const body = (await fetchUpstream(`/public-companies?${params.toString()}`)) as {
    data?: unknown[];
  };
  const data = Array.isArray(body?.data) ? body.data : [];
  return data.map(normalize);
}

/** Fetch full company detail by IDNO. Throws RegistryError(404) if not found. */
export async function getCompanyByIdno(idno: string): Promise<RegistryCompanyDetail> {
  const body = (await fetchUpstream(
    `/public-companies/${encodeURIComponent(idno)}`
  )) as { data?: unknown };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = body?.data as any;
  if (!row) throw new RegistryError(404, "company_not_found");
  return {
    ...normalize(row),
    activities: {
      licensed: Array.isArray(row?.activities?.licensed) ? row.activities.licensed : [],
      unlicensed: Array.isArray(row?.activities?.unlicensed) ? row.activities.unlicensed : [],
    },
    contacts: normalizeContacts(row?.contacts),
  };
}
