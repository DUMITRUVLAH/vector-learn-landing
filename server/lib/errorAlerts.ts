/**
 * PLATFORM-002 — alerta pe email către proprietarul platformei.
 *
 * Cerința e „să vină la mine, nu să deschid eu consola". Deci: la PRIMA apariție a unui tip
 * nou de eroare pleacă un email către `platformOwnerEmails()`.
 *
 * Reguli de zgomot, fiindcă o alertă care sună prea des devine o alertă pe care o ignori:
 *   • doar la GRUPURI NOI (o eroare deja cunoscută nu mai trimite nimic)
 *   • re-alertare abia după 24h de la ultima alertă a aceluiași grup
 *   • maximum `MAX_ALERTS_PER_HOUR` emailuri pe oră în total
 *   • fără RESEND_API_KEY, EmailProvider oricum doar loghează — nimic nu se rupe local
 *
 * Best-effort din cap până în coadă: dacă alerta eșuează, eroarea rămâne oricum în consolă.
 */
import { eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { errorGroups } from "../db/schema/telemetry";
import { platformOwnerEmails } from "./platformOwner";

const MAX_ALERTS_PER_HOUR = 6;
const REALERT_AFTER_MS = 24 * 60 * 60 * 1000;

const sentTimestamps: number[] = [];

/**
 * SECURITY (audit 2026-08-29): plafonul orar trăia DOAR în memoria instanței. Pe Vercel fiecare
 * invocare poate ateriza pe altă instanță, deci plafonul se resetează singur — iar `POST
 * /api/telemetry/error` e public. Cineva putea genera tipuri noi de erori la nesfârșit și, cu
 * ele, un val de emailuri către proprietar: cutia poștală inundată, iar reputația de expeditor
 * (Resend suspendă în jurul a 5% bounce) arsă de trafic fabricat.
 *
 * Plafonul se numără acum din `error_groups.alerted_at`, care e comun tuturor instanțelor.
 * Memoria rămâne ca scurtătură ieftină pentru cazul obișnuit.
 */
async function underHourlyCap(): Promise<boolean> {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (sentTimestamps.length > 0 && sentTimestamps[0] < cutoff) sentTimestamps.shift();
  if (sentTimestamps.length >= MAX_ALERTS_PER_HOUR) return false;
  try {
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(errorGroups)
      .where(gt(errorGroups.alertedAt, new Date(cutoff)));
    return (row?.c ?? 0) < MAX_ALERTS_PER_HOUR;
  } catch {
    // Dacă interogarea eșuează, rămâne plafonul din memorie — mai bine o alertă în plus decât
    // niciuna, dar niciodată fără plafon.
    return true;
  }
}

function appUrl(): string {
  return process.env.APP_URL ?? process.env.VITE_APP_URL ?? "https://finflow1.vercel.app";
}

export interface AlertContext {
  groupId: string;
  kind: string;
  message: string;
  location?: string | null;
  tenantName?: string | null;
  userEmail?: string | null;
}

export async function alertOwnerOnNewError(ctx: AlertContext): Promise<void> {
  try {
    if (process.env.ERROR_ALERTS_DISABLED === "1") return;

    const [group] = await db
      .select({ alertedAt: errorGroups.alertedAt, occurrences: errorGroups.occurrences })
      .from(errorGroups)
      .where(eq(errorGroups.id, ctx.groupId));
    if (!group) return;
    if (group.alertedAt && Date.now() - group.alertedAt.getTime() < REALERT_AFTER_MS) return;
    if (!(await underHourlyCap())) {
      console.warn("[errorAlerts] hourly cap reached — alert suppressed (eroarea rămâne în consolă)");
      return;
    }

    // Import târziu: `providers.ts` instanțiază clientul Resend la încărcare, iar acest modul
    // e importat din calea de eroare — nu vrem efecte secundare la pornire.
    const { EmailProvider } = await import("../services/messaging/providers");
    const provider = new EmailProvider();

    const lines = [
      "A apărut un tip NOU de eroare în FinFlow.",
      "",
      `Tip:      ${ctx.kind}`,
      `Mesaj:    ${ctx.message.slice(0, 500)}`,
      ctx.location ? `Unde:     ${ctx.location}` : null,
      ctx.tenantName ? `Client:   ${ctx.tenantName}` : null,
      ctx.userEmail ? `Utilizator: ${ctx.userEmail}` : null,
      "",
      `Detalii: ${appUrl()}/#/business/platform`,
      "",
      "Primești acest email o singură dată per tip de eroare (re-alertă după 24h).",
    ].filter(Boolean);

    for (const to of platformOwnerEmails()) {
      sentTimestamps.push(Date.now());
      await provider.send({
        to,
        subject: `[FinFlow] Eroare nouă: ${ctx.message.slice(0, 90)}`,
        body: lines.join("\n"),
      });
    }

    await db.update(errorGroups).set({ alertedAt: new Date() }).where(eq(errorGroups.id, ctx.groupId));
  } catch (e) {
    console.warn("[errorAlerts] alert skipped:", e instanceof Error ? e.message : e);
  }
}
