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
    document.cookie.split(";").map((p) => p.trim().split("=")).filter((p) => p.length === 2).map(([k, v]) => [decodeURIComponent(k), decodeURIComponent(v)])
  );
}

function setCookie(name: string, value: string, days: number): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
}

function getUrlParams(): URLSearchParams {
  const search = window.location.search || (window.location.hash.includes("?") ? "?" + window.location.hash.split("?")[1] : "");
  return new URLSearchParams(search);
}

export function captureAndGetUtm(): UtmParams {
  const params = getUrlParams();
  const fromUrl: UtmParams = { utmSource: params.get("utm_source"), utmMedium: params.get("utm_medium"), utmCampaign: params.get("utm_campaign"), fbclid: params.get("fbclid"), gclid: params.get("gclid") };
  if (Object.values(fromUrl).some((v) => v !== null)) { setCookie(COOKIE_NAME, JSON.stringify(fromUrl), COOKIE_DAYS); return fromUrl; }
  const cookies = parseCookies();
  const stored = cookies[COOKIE_NAME];
  if (stored) {
    try { return JSON.parse(stored) as UtmParams; }
    catch { /* ignore corrupt cookie */ }
  }
  return { utmSource: null, utmMedium: null, utmCampaign: null, fbclid: null, gclid: null };
}

export function getStoredUtm(): UtmParams {
  const cookies = parseCookies();
  const stored = cookies[COOKIE_NAME];
  if (stored) {
    try { return JSON.parse(stored) as UtmParams; }
    catch { /* ignore corrupt cookie */ }
  }
  return { utmSource: null, utmMedium: null, utmCampaign: null, fbclid: null, gclid: null };
}
