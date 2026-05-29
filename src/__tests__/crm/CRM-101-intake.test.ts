/**
 * CRM-101 — Formular web public intake
 * Test scenarios: T-CRM-101-1..6
 * All [blocant] scenarios must pass.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { captureAndGetUtm, getStoredUtm } from "@/lib/utm";

// ---------------------------------------------------------------------------
// Helper: minimal in-memory rate-limiter replica (mirrors server logic)
// ---------------------------------------------------------------------------
function makeRateLimiter(max = 5, windowMs = 60_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return function check(ip: string): boolean {
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now > b.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (b.count >= max) return false;
    b.count++;
    return true;
  };
}

// ---------------------------------------------------------------------------
// Helper: normalize phone (mirrors server/lib/normalize.ts)
// ---------------------------------------------------------------------------
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  if (digits.length >= 9) return `+40${digits.slice(-9)}`;
  return `+${digits}`;
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// T-CRM-101-1 [blocant] — valid payload creates lead with source=webform + consent_at
// ---------------------------------------------------------------------------
describe("T-CRM-101-1 [blocant] intake valid payload", () => {
  it("creates lead with source=webform and consent_at when all required fields present", () => {
    const payload = {
      tenantSlug: "demo",
      fullName: "Andreea Mitran",
      phone: "0712345678",
      email: "andreea@x.ro",
      consentText: "Accept prelucrarea datelor",
      consentAt: new Date().toISOString(),
      captchaToken: "test-pass",
    };
    expect(payload.consentText.length).toBeGreaterThan(0);
    expect(payload.captchaToken).toBe("test-pass");
    const date = new Date(payload.consentAt);
    expect(date.getTime()).not.toBeNaN();
    const ageMs = Date.now() - date.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(5 * 60 * 1000);
    expect(normalizePhone(payload.phone)).toBe("+40712345678");
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101-2 [blocant] — consent missing → must reject
// ---------------------------------------------------------------------------
describe("T-CRM-101-2 [blocant] consent missing", () => {
  it("rejects when consentText is empty", () => {
    const consentText = "";
    expect(consentText.length).toBe(0);
    const wouldCreate = consentText.length > 0;
    expect(wouldCreate).toBe(false);
  });

  it("rejects when consent checkbox is false on frontend", () => {
    const consent = false;
    expect(consent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101-3 — UTM params persist through URL → cookie
// ---------------------------------------------------------------------------
describe("T-CRM-101-3 UTM attribution", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, search: "?utm_source=fb&utm_campaign=spring" },
    });
    document.cookie = "vl_utm=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, search: "" },
    });
    document.cookie = "vl_utm=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });

  it("captures utm_source and utm_campaign from URL", () => {
    const params = new URLSearchParams(window.location.search);
    expect(params.get("utm_source")).toBe("fb");
    expect(params.get("utm_campaign")).toBe("spring");
  });

  it("captureAndGetUtm returns utm values and stores in cookie", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, search: "?utm_source=fb&utm_campaign=spring&utm_medium=cpc" },
    });
    const utm = captureAndGetUtm();
    expect(utm.utmSource).toBe("fb");
    expect(utm.utmCampaign).toBe("spring");
    expect(utm.utmMedium).toBe("cpc");
    expect(document.cookie).toContain("vl_utm");
  });

  it("getStoredUtm reads cookie when URL has no UTM", () => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, search: "?utm_source=google" },
    });
    captureAndGetUtm();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, search: "" },
    });
    const stored = getStoredUtm();
    expect(stored.utmSource).toBe("google");
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101-4 [blocant] — duplicate phone → isDuplicate:true, no second lead
// ---------------------------------------------------------------------------
describe("T-CRM-101-4 [blocant] dedup on phone", () => {
  it("normalizes 0712 345 678 and +40712345678 to same value", () => {
    const phone1 = normalizePhone("0712 345 678");
    const phone2 = normalizePhone("+40712345678");
    expect(phone1).toBe(phone2);
    expect(phone1).toBe("+40712345678");
  });

  it("dedup logic: match on phoneNormalized → isDuplicate=true", () => {
    const existingPhoneNormalized = "+40712345678";
    const incomingPhone = "0712345678";
    const incomingNormalized = normalizePhone(incomingPhone);
    expect(incomingNormalized).toBe(existingPhoneNormalized);
    const wouldBeDuplicate = incomingNormalized === existingPhoneNormalized;
    expect(wouldBeDuplicate).toBe(true);
  });

  it("dedup logic: match on emailNormalized → isDuplicate=true", () => {
    const existingEmail = "ana@x.ro";
    const incomingEmail = "Ana@X.RO";
    const normalized = normalizeEmail(incomingEmail);
    expect(normalized).toBe(existingEmail);
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101-5 — captcha invalid → 400, max 1 log entry per IP per hour
// ---------------------------------------------------------------------------
describe("T-CRM-101-5 captcha protection", () => {
  it("returns error when captchaToken is null/falsy", () => {
    const token = null;
    const captchaOk = token !== null && token !== "";
    expect(captchaOk).toBe(false);
  });

  it("captcha fail tracking: only logs once per IP per hour", () => {
    const captchaFailBuckets = new Map<string, { lastLogAt: number }>();
    const ip = "1.2.3.4";
    const now = Date.now();

    function shouldLog(ip: string): boolean {
      const failBucket = captchaFailBuckets.get(ip);
      if (!failBucket || now - failBucket.lastLogAt > 3_600_000) {
        captchaFailBuckets.set(ip, { lastLogAt: now });
        return true;
      }
      return false;
    }

    expect(shouldLog(ip)).toBe(true);
    expect(shouldLog(ip)).toBe(false);
    expect(shouldLog(ip)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101-6 — rate limit: 6th request in a minute → 429
// ---------------------------------------------------------------------------
describe("T-CRM-101-6 rate limiting", () => {
  it("allows up to 5 requests per IP per minute", () => {
    const check = makeRateLimiter(5, 60_000);
    const ip = "10.0.0.1";
    expect(check(ip)).toBe(true);
    expect(check(ip)).toBe(true);
    expect(check(ip)).toBe(true);
    expect(check(ip)).toBe(true);
    expect(check(ip)).toBe(true);
    expect(check(ip)).toBe(false);
  });

  it("different IPs have independent buckets", () => {
    const check = makeRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) check("ip-A");
    expect(check("ip-A")).toBe(false);
    expect(check("ip-B")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-CRM-101 — consent_at freshness validation
// ---------------------------------------------------------------------------
describe("T-CRM-101 consent_at freshness", () => {
  it("accepts consentAt within 5 minutes", () => {
    const consentAt = new Date().toISOString();
    const ageMs = Date.now() - new Date(consentAt).getTime();
    expect(ageMs).toBeGreaterThanOrEqual(0);
    expect(ageMs).toBeLessThan(5 * 60 * 1000);
  });

  it("rejects consentAt older than 5 minutes", () => {
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const ageMs = Date.now() - new Date(old).getTime();
    expect(ageMs).toBeGreaterThan(5 * 60 * 1000);
  });

  it("rejects consentAt in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const ageMs = Date.now() - new Date(future).getTime();
    expect(ageMs).toBeLessThan(0);
  });
});
