/**
 * PLATFORM-001 — istoricul de logări.
 *
 * `sessions` se șterge la logout și la expirare, deci nu poate răspunde la „cine s-a logat
 * săptămâna trecută". `login_events` e append-only și păstrează ȘI eșecurile — fără ele nu
 * se vede un atac prin încercări repetate, care e jumătate din valoarea unui asemenea istoric.
 *
 * Scrierea e strict best-effort: dacă tabela lipsește sau baza e lentă, login-ul trebuie să
 * reușească oricum. Un audit care poate bloca autentificarea e mai periculos decât lipsa lui.
 */
import type { Context } from "hono";
import { db } from "../db/client";
import { loginEvents } from "../db/schema/platform";
import { clientIp } from "./clientIp";

export type LoginApp = "business" | "learn" | "parent";
export type LoginMethod = "password" | "google" | "invite" | "signup" | "reset";

export interface LoginEventInput {
  email: string;
  success: boolean;
  app?: LoginApp;
  method?: LoginMethod;
  userId?: string | null;
  tenantId?: string | null;
  /** Codul returnat clientului la eșec: invalid_credentials, wrong_app, workspace_suspended… */
  failureReason?: string | null;
}

/**
 * IP-ul real din spatele proxy-ului Vercel/Cloudflare.
 *
 * Implementarea trăiește în `lib/clientIp` (audit 2026-08-29: se lua PRIMUL element din
 * X-Forwarded-For, adică valoarea trimisă de client). Re-exportat de aici pentru apelanții
 * care îl importau din acest modul.
 */
export { clientIp };

export async function recordLoginEvent(c: Context, input: LoginEventInput): Promise<void> {
  try {
    await db.insert(loginEvents).values({
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      email: input.email.trim().toLowerCase().slice(0, 255),
      app: input.app ?? "business",
      method: input.method ?? "password",
      success: input.success,
      failureReason: input.failureReason ? input.failureReason.slice(0, 60) : null,
      ipAddress: clientIp(c)?.slice(0, 64) ?? null,
      userAgent: c.req.header("user-agent")?.slice(0, 512) ?? null,
    });
  } catch (e) {
    console.warn("[loginEvents] insert skipped:", e instanceof Error ? e.message : e);
  }
}
