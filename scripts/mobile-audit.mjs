// Mobile UX audit — screenshots key pages at iPhone viewport + reports layout signals.
// Usage: BASE_URL=https://vector-learn-landing.vercel.app node scripts/mobile-audit.mjs
import { chromium, devices } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "https://vector-learn-landing.vercel.app";
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@demo.vectorlearn.io";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "demo123456";
const OUT = "mobile-shots";
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);

// horizontal-overflow detector: returns elements wider than the viewport
async function findOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 && r.height > 0 && getComputedStyle(el).position !== "fixed") {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 40)} w=${Math.round(r.width)}>${vw}`);
      }
    }
    return { vw, scrollW: document.documentElement.scrollWidth, sample: bad.slice(0, 6) };
  });
}

// tiny-tap-target detector: interactive elements smaller than 44x44
async function findTinyTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("button, a, input, select, [role=button]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 44 || r.height < 44) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30);
        bad.push(`${Math.round(r.width)}x${Math.round(r.height)} "${label}"`);
      }
    }
    return bad.slice(0, 10);
  });
}

(async () => {
  const executablePath = CHROME_PATHS.find((p) => existsSync(p));
  if (!executablePath) { console.error("No Chrome. Set CHROME_PATH."); process.exit(1); }
  if (!existsSync(OUT)) mkdirSync(OUT);

  const browser = await chromium.launch({ executablePath, headless: true });
  const iPhone = devices["iPhone 13"];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();

  const report = [];
  async function audit(name, url, { afterLoad } = {}) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    if (afterLoad) await afterLoad();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const overflow = await findOverflow(page);
    const tiny = await findTinyTargets(page);
    const horizScroll = overflow.scrollW > overflow.vw + 2;
    report.push({ name, url, horizScroll, vw: overflow.vw, scrollW: overflow.scrollW, overflow: overflow.sample, tinyTargets: tiny });
    console.log(`\n## ${name}  (${url})`);
    console.log(`  horizontal scroll: ${horizScroll ? "⚠️ YES (" + overflow.scrollW + ">" + overflow.vw + ")" : "ok"}`);
    if (overflow.sample.length) console.log("  overflowing:", overflow.sample.join(" | "));
    console.log(`  tiny tap targets (<44px): ${tiny.length ? "⚠️ " + tiny.length : "ok"}`);
    if (tiny.length) console.log("   ", tiny.join("  ·  "));
  }

  // 1) Landing (mobile nav + login button visibility)
  await audit("01-landing", `${BASE}/`);
  // 1b) open the mobile hamburger to check the login button inside
  await page.locator('[aria-label="Toggle menu"]').click().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01b-landing-menu-open.png`, fullPage: false });
  const loginInMenu = await page.locator('a[href="#/app/login"]').first().isVisible().catch(() => false);
  console.log(`\n## landing mobile menu — login link visible: ${loginInMenu ? "yes" : "⚠️ NO"}`);

  // 2) Login page
  await audit("02-login", `${BASE}/#/app/login`);
  const hasEmail = await page.locator('input[type="email"]').isVisible().catch(() => false);
  const hasPwd = await page.locator('input[type="password"]').isVisible().catch(() => false);
  const submitBox = await page.locator('button[type="submit"], button:has-text("Conectare"), button:has-text("Autentific"), button:has-text("Intră")').first().boundingBox().catch(() => null);
  console.log(`## login form — email:${hasEmail} pwd:${hasPwd} submitBtn:${submitBox ? Math.round(submitBox.width) + "x" + Math.round(submitBox.height) : "⚠️ MISSING"}`);

  // 3) Log in then audit two app pages the owner changed
  await page.fill('input[type="email"]', EMAIL).catch(() => {});
  await page.fill('input[type="password"]', PASSWORD).catch(() => {});
  await page.locator('button[type="submit"]').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await audit("03-app-leads", `${BASE}/#/app/leads`);
  await audit("04-app-cx", `${BASE}/#/app/cx`);
  await audit("05-app-courses", `${BASE}/#/app/courses`);

  await browser.close();

  // Summary
  console.log("\n\n===== MOBILE AUDIT SUMMARY =====");
  for (const r of report) {
    const flags = [];
    if (r.horizScroll) flags.push("H-SCROLL");
    if (r.tinyTargets.length) flags.push(`${r.tinyTargets.length} tiny-tap`);
    console.log(`${flags.length ? "⚠️ " : "✅ "}${r.name}: ${flags.join(", ") || "clean"}`);
  }
  console.log(`\nScreenshots in ./${OUT}/`);
})();
