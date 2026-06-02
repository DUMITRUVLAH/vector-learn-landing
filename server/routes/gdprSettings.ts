/**
 * SET-803: GDPR settings routes.
 *
 * GET  /api/settings/gdpr/dpa           — download pre-filled DPA PDF (stub)
 * GET  /api/settings/gdpr/retention     — get data retention policies
 * PATCH /api/settings/gdpr/retention    — update retention policies
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema";
import { requireAuth, getAuthUser } from "../middleware/requireAuth";
import type { AuthVariables } from "../middleware/requireAuth";

export const gdprSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

// ─── GET /api/settings/gdpr/dpa ───────────────────────────────────────────────

gdprSettingsRoutes.get("/dpa", requireAuth, async (c) => {
  const user = getAuthUser(c as never);

  // Only admin/owner can download DPA
  if (user.role !== "admin" && user.role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  // Get tenant name for pre-filling the DPA
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId));

  const tenantName = tenant?.name ?? "Organizația";
  const date = new Date().toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Stub: return HTML DPA (production would render to PDF)
  const dpaHtml = `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="UTF-8"><title>Contract DPA — ${tenantName}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}
h1{font-size:1.5rem;border-bottom:2px solid #333;padding-bottom:8px}
h2{font-size:1.1rem;margin-top:24px}
p{margin:8px 0}.sig{margin-top:60px;border-top:1px solid #333;width:300px;padding-top:8px}</style>
</head>
<body>
<h1>CONTRACT DE PRELUCRARE A DATELOR (DPA)</h1>
<p><strong>Data:</strong> ${date}</p>
<p><strong>Operatorul:</strong> ${tenantName}</p>
<p><strong>Procesatorul:</strong> Vector Learn SRL, CUI: RO XXXXXX</p>

<h2>1. Scopul prelucrării</h2>
<p>Operatorul (${tenantName}) prelucrează date cu caracter personal ale elevilor și contactelor
în scopul gestionării activităților educaționale, conform art. 6(1)(b) GDPR (contract) și
art. 6(1)(f) GDPR (interes legitim).</p>

<h2>2. Categorii de date prelucrate</h2>
<p>Nume, prenume, telefon, email, date de plată, istoricul lecțiilor, note de progres.</p>

<h2>3. Durata păstrării</h2>
<p>Datele se păstrează pe durata contractului + 3 ani conform obligațiilor fiscale.
Date de marketing: până la retragerea consimțământului.</p>

<h2>4. Drepturi GDPR</h2>
<p>Dreptul de acces, rectificare, ștergere, portabilitate și opoziție. Cereri la:
privacy@${tenantName.toLowerCase().replace(/\s+/g, "")}.ro</p>

<h2>5. Măsuri de securitate</h2>
<p>Date criptate în tranzit (TLS 1.3) și la repaus. Acces restricționat pe roluri.
Audit log complet pentru toate acțiunile sensibile.</p>

<div class="sig">Semnătură Operator</div>
<div class="sig" style="margin-top:20px">Semnătură Procesator</div>
</body>
</html>`;

  c.header("Content-Type", "text/html; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="DPA-${tenantName.replace(/\s+/g, "-")}.html"`
  );
  return c.body(dpaHtml);
});

// ─── GET /api/settings/gdpr/retention ────────────────────────────────────────

gdprSettingsRoutes.get("/retention", requireAuth, async (c) => {
  const user = getAuthUser(c as never);
  if (user.role !== "admin" && user.role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  const [tenant] = await db
    .select({ dataRetentionJson: tenants.dataRetentionJson })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId));

  const retention = tenant?.dataRetentionJson ?? {};
  return c.json({
    leadsLostDays: (retention as { leadsLostDays?: number }).leadsLostDays ?? null,
    inactiveStudentsDays:
      (retention as { inactiveStudentsDays?: number }).inactiveStudentsDays ?? null,
  });
});

// ─── PATCH /api/settings/gdpr/retention ──────────────────────────────────────

const retentionSchema = z.object({
  leadsLostDays: z.number().int().min(30).max(3650).nullable().optional(),
  inactiveStudentsDays: z.number().int().min(30).max(3650).nullable().optional(),
});

gdprSettingsRoutes.patch(
  "/retention",
  requireAuth,
  zValidator("json", retentionSchema),
  async (c) => {
    const user = getAuthUser(c as never);
    if (user.role !== "admin" && user.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }

    const body = c.req.valid("json");

    // Get current retention to merge
    const [tenant] = await db
      .select({ dataRetentionJson: tenants.dataRetentionJson })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId));

    const current = (tenant?.dataRetentionJson ?? {}) as {
      leadsLostDays?: number;
      inactiveStudentsDays?: number;
    };

    const updated = {
      ...current,
      ...(body.leadsLostDays !== undefined
        ? { leadsLostDays: body.leadsLostDays }
        : {}),
      ...(body.inactiveStudentsDays !== undefined
        ? { inactiveStudentsDays: body.inactiveStudentsDays }
        : {}),
    };

    await db
      .update(tenants)
      .set({ dataRetentionJson: updated, updatedAt: new Date() })
      .where(eq(tenants.id, user.tenantId));

    return c.json({ ok: true, ...updated });
  }
);
