import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerMembers, parPayers, parPayerModules, parProjects } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { accessibleProjectIds, mayAccessPayer } from "../lib/par/projectScope";

export const parPayersRoutes = new Hono<{ Variables: AuthVariables }>();
parPayersRoutes.use("*", requireAuth);
parPayersRoutes.use("/:id", parUuidGuard("id"));

const optionalText = (max: number) => z.string().max(max).optional().nullable();

const payerSchema = z.object({
  name: z.string().min(1).max(300),
  legal_name: optionalText(300),
  idno: optionalText(32),
  vat_code: optionalText(50),
  address: optionalText(500),
  bank_name: optionalText(300),
  iban: optionalText(64),
  bank_code: optionalText(32),
  contact_email: optionalText(200),
  contact_phone: optionalText(50),
  director_name: optionalText(200),
  director_role: optionalText(200),
  logo_url: optionalText(1000),
  notes: optionalText(5000),
  active: z.boolean().optional(),
});

/** Câmpurile de identitate, în ordinea din formular — o singură listă pentru select + update. */
const PAYER_DETAIL_FIELDS = [
  ["legal_name", "legalName"],
  ["idno", "idno"],
  ["vat_code", "vatCode"],
  ["address", "address"],
  ["bank_name", "bankName"],
  ["iban", "iban"],
  ["bank_code", "bankCode"],
  ["contact_email", "contactEmail"],
  ["contact_phone", "contactPhone"],
  ["director_name", "directorName"],
  ["director_role", "directorRole"],
  ["logo_url", "logoUrl"],
  ["notes", "notes"],
] as const;

type PayerInput = z.infer<typeof payerSchema>;

/**
 * Mapează body-ul (snake_case) pe coloanele drizzle (camelCase). Doar câmpurile TRIMISE se
 * ating — un PATCH parțial nu are voie să șteargă rechizitele pe care UI-ul nu le-a trimis.
 * Un text golit din formular ajunge "" și înseamnă „nu e completat" → null, nu șir gol.
 */
function payerColumnValues(body: Partial<PayerInput>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [bodyKey, column] of PAYER_DETAIL_FIELDS) {
    const raw = body[bodyKey];
    if (raw === undefined) continue;
    const trimmed = typeof raw === "string" ? raw.trim() : raw;
    values[column] = trimmed ? trimmed : null;
  }
  return values;
}

parPayersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const includeInactive = c.req.query("include_inactive") === "1";
  const conditions = [eq(parPayers.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(parPayers.active, true));
  const projectScope = await accessibleProjectIds(user.id, tenantId, user.role);
  if (projectScope !== null) {
    const [directPayers, scopePayers] = await Promise.all([
      db.select({ payerId: parPayerMembers.payerId }).from(parPayerMembers).where(and(
        eq(parPayerMembers.tenantId, tenantId), eq(parPayerMembers.userId, user.id),
      )),
      projectScope.length
        ? db.select({ payerId: parProjects.payerId }).from(parProjects).where(and(
            eq(parProjects.tenantId, tenantId), inArray(parProjects.id, projectScope),
          ))
        : Promise.resolve([]),
    ]);
    const payerIds = [...new Set([...directPayers, ...scopePayers].map((row) => row.payerId).filter((id): id is string => !!id))];
    if (!payerIds.length) return c.json({ payers: [] });
    conditions.push(inArray(parPayers.id, payerIds));
  }
  const payers = await db.select({
    id: parPayers.id,
    tenantId: parPayers.tenantId,
    name: parPayers.name,
    legalName: parPayers.legalName,
    idno: parPayers.idno,
    vatCode: parPayers.vatCode,
    address: parPayers.address,
    bankName: parPayers.bankName,
    iban: parPayers.iban,
    bankCode: parPayers.bankCode,
    contactEmail: parPayers.contactEmail,
    contactPhone: parPayers.contactPhone,
    directorName: parPayers.directorName,
    directorRole: parPayers.directorRole,
    logoUrl: parPayers.logoUrl,
    notes: parPayers.notes,
    active: parPayers.active,
    createdAt: parPayers.createdAt,
    updatedAt: parPayers.updatedAt,
  }).from(parPayers).innerJoin(parPayerModules, and(
    eq(parPayerModules.payerId, parPayers.id),
    eq(parPayerModules.tenantId, tenantId),
    eq(parPayerModules.moduleKey, "par"),
    eq(parPayerModules.enabled, true),
  )).where(and(...conditions)).orderBy(asc(parPayers.name));
  return c.json({ payers });
});

parPayersRoutes.post("/", requirePARRole("par_admin"), zValidator("json", payerSchema), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  if (user.role !== "admin" && user.role !== "manager") return c.json({ error: "workspace_admin_required" }, 403);
  const body = c.req.valid("json");
  const [payer] = await db.insert(parPayers).values({
    tenantId, name: body.name, active: body.active ?? true, ...payerColumnValues(body),
  }).returning();
  await db.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true, updatedByUserId: c.get("user").id });
  return c.json(payer, 201);
});

parPayersRoutes.patch("/:id", requirePARRole("par_admin"), zValidator("json", payerSchema.partial()), async (c) => {
  const user = c.get("user"); const tenantId = user.tenantId;
  if (!(await mayAccessPayer(user.id, tenantId, c.req.param("id"), user.role))) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  const [payer] = await db.update(parPayers).set({
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...payerColumnValues(body),
    ...(body.active !== undefined ? { active: body.active } : {}), updatedAt: new Date(),
  }).where(and(eq(parPayers.id, c.req.param("id")), eq(parPayers.tenantId, tenantId))).returning();
  if (!payer) return c.json({ error: "not_found" }, 404);
  return c.json(payer);
});
