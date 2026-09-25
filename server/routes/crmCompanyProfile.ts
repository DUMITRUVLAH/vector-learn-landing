/**
 * CRM-D04 — „Datele firmei tale", o singură dată.
 *
 * Lecția din VectorB2B: datele firmei se scriu O DATĂ și apar pe orice act. La noi, IBAN-ul,
 * banca și semnatarul firmei nu aveau unde fi scrise în CRM (doar denumirea și IDNO-ul, și acelea
 * în FinDesk), așa că fiecare ofertă ieșea cu linii goale chiar în blocul furnizorului.
 *
 * Rândul e același `fin_org_profile` pe care îl citește motorul de acte (`fieldResolver`) și pe
 * care îl editează FinDesk — un singur profil al firmei, nu două care diverg.
 *
 *   GET /api/crm/company-profile   → profilul + ce lipsește pentru acte (oricine face acte)
 *   PUT /api/crm/company-profile   → salvare (cine administrează pâlniile: admin / manager)
 *
 * Montat la /api/crm/company-profile.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { finOrgProfile } from "../db/schema/finCore";
import { parSettings, parPayers } from "../db/schema/par";
import { tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";

export const crmCompanyProfileRoutes = new Hono<{ Variables: AuthVariables }>();
crmCompanyProfileRoutes.use("/*", requireAuth);

/** Câmpurile pe care un act de vânzare le tipărește în blocul furnizorului, în ordinea formularului. */
export const DOCUMENT_FIELDS = [
  ["legalName", "Denumirea juridică"],
  ["idno", "IDNO"],
  ["address", "Adresa juridică"],
  ["iban", "IBAN"],
  ["bankName", "Banca"],
  ["administratorName", "Administratorul"],
] as const;

type ProfileRow = typeof finOrgProfile.$inferSelect;

function view(row: ProfileRow | undefined) {
  const p = {
    legalName: row?.legalName ?? "",
    idno: row?.idno ?? null,
    vatNumber: row?.vatNumber ?? null,
    address: row?.address ?? null,
    iban: row?.iban ?? null,
    bankName: row?.bankName ?? null,
    bic: row?.bic ?? null,
    administratorName: row?.administratorName ?? null,
    administratorTitle: row?.administratorTitle ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
  };
  // Ce iese gol pe o ofertă, spus pe nume — ecranul și avertismentul editorului arată aceeași listă.
  const missing = DOCUMENT_FIELDS.filter(([key]) => !String(p[key] ?? "").trim()).map(([, label]) => label);
  return { profile: p, missing };
}

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const putSchema = z.object({
  legalName: z.string().trim().min(2, "Denumirea juridică e obligatorie").max(200),
  // MD: 13 cifre; RO: CUI de 2–10 caractere (cu sau fără „RO").
  idno: optional(30).refine((v) => v == null || /^\d{13}$|^(RO)?\d{2,10}$/i.test(v), "IDNO: 13 cifre (MD) sau CUI (RO)"),
  vatNumber: optional(30),
  address: optional(500),
  // IBAN-ul se scrie cu spații de oameni; îl păstrăm compact și cu majuscule, cum îl cere banca.
  iban: optional(42)
    .transform((v) => (v ? v.replace(/\s+/g, "").toUpperCase() : v))
    .refine((v) => v == null || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v), "IBAN invalid (ex.: MD24AG000225100013104168)"),
  bankName: optional(200),
  bic: optional(11).transform((v) => (v ? v.toUpperCase() : v)),
  administratorName: optional(200),
  administratorTitle: optional(100),
  phone: optional(40),
  email: optional(255).refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail invalid"),
});

/**
 * Ce știe deja aplicația despre firmă, pentru un workspace fără profil: aceleași surse din care
 * actele își iau azi denumirea și IDNO-ul (setările PAR, plătitorul activ, numele workspace-ului).
 * Altfel ecranul „scrie o dată" ar cere exact ce e deja tipărit pe oferte.
 */
async function knownDefaults(tenantId: string): Promise<Partial<ProfileRow>> {
  const safe = async <T>(q: Promise<T[]>): Promise<T | undefined> => {
    try {
      return (await q)[0];
    } catch {
      return undefined; // tabelă lipsă pe un workspace vechi — nu blocăm ecranul
    }
  };
  const [settings, payer, tenant] = await Promise.all([
    safe(db.select().from(parSettings).where(eq(parSettings.tenantId, tenantId)).limit(1)),
    safe(db.select().from(parPayers).where(and(eq(parPayers.tenantId, tenantId), eq(parPayers.active, true))).limit(1)),
    safe(db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)),
  ]);
  return {
    legalName: settings?.orgLegalName || payer?.legalName || payer?.name || tenant?.name || "",
    idno: payer?.idno ?? null,
  };
}

crmCompanyProfileRoutes.get("/", requireCrmPermission("documents.create"), async (c) => {
  const user = c.get("user");
  const [row] = await db.select().from(finOrgProfile).where(eq(finOrgProfile.tenantId, user.tenantId)).limit(1);
  return c.json(view(row ?? ((await knownDefaults(user.tenantId)) as ProfileRow)));
});

crmCompanyProfileRoutes.put(
  "/",
  requireCrmPermission("pipelines.manage"),
  zValidator("json", putSchema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      return c.json({ error: "invalid", field: first?.path.join("."), message: first?.message ?? "Date invalide" }, 400);
    }
  }),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const [existing] = await db
      .select({ id: finOrgProfile.id })
      .from(finOrgProfile)
      .where(eq(finOrgProfile.tenantId, user.tenantId))
      .limit(1);
    const [row] = existing
      ? await db
          .update(finOrgProfile)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(finOrgProfile.tenantId, user.tenantId))
          .returning()
      : await db
          .insert(finOrgProfile)
          .values({ tenantId: user.tenantId, ...body })
          .returning();
    return c.json(view(row));
  }
);
