/**
 * UTM / click-ID attribution helpers.
 * Captures UTM params (+ fbclid, gclid) from the current URL on first visit
 * and persists them in a cookie for 30 days.  On any subsequent page load
 * the stored values are restored so they survive session resets.
 */

export interface UtmParams {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  fbclid: string | null;
  gclid: string | null;
}

const COOKIE_NAME = "vl_utm";
const COOKIE_DAYS = 30;

function parseCookies(): Record<string, string> {
  return Object.fromEntries(
    document.cookie
      .split(";")
      .map((p) => p.trim().split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)])
  );
}

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Read UTM params from URL search string (supports both `?` and hash `#/path?utm_...`) */
function getUrlParams(): URLSearchParams {
  // Support both regular query string and hash-based routing with query
  const search = window.location.search
    || (window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : "");
  return new URLSearchParams(search);
}

/**
 * Call once on app load.  If the current URL has UTM params, save them to
 * the cookie (overwriting any stale values).  Returns the effective UTM data
 * (from URL if present, otherwise from the cookie).
 */
export function captureAndGetUtm(): UtmParams {
  const params = getUrlParams();

  const fromUrl: UtmParams = {
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    fbclid: params.get("fbclid"),
    gclid: params.get("gclid"),
  };

  const hasUrl = Object.values(fromUrl).some((v) => v !== null);

  if (hasUrl) {
    // Persist to cookie, overwriting previous attribution
    setCookie(COOKIE_NAME, JSON.stringify(fromUrl), COOKIE_DAYS);
    return fromUrl;
  }

  // Fall back to stored cookie
  const cookies = parseCookies();
  const stored = cookies[COOKIE_NAME];
  if (stored) {
    try {
      return JSON.parse(stored) as UtmParams;
    } catch {
      // Ignore corrupt cookie
    }
  }

  return { utmSource: null, utmMedium: null, utmCampaign: null, fbclid: null, gclid: null };
}

/** Read stored UTM from cookie without capturing from URL */
export function getStoredUtm(): UtmParams {
  const cookies = parseCookies();
  const stored = cookies[COOKIE_NAME];
  if (stored) {
    try {
      return JSON.parse(stored) as UtmParams;
    } catch {
      // ignore
    }
  }
  return { utmSource: null, utmMedium: null, utmCampaign: null, fbclid: null, gclid: null };
}
