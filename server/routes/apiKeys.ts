/**
 * Cheile de acces pentru integrări externe (cerința 64 din caietul de sarcini).
 *
 * Montat la /api/settings/api-keys.
 *
 * GET    /api/settings/api-keys      — cheile workspace-ului (fără valoarea lor, evident)
 * POST   /api/settings/api-keys      — creează o cheie; valoarea în clar apare O SINGURĂ DATĂ
 * DELETE /api/settings/api-keys/:id  — revocă o cheie (nu o șterge: jurnalul rămâne citibil)
 *
 * De ce exista tabela `api_keys` și middleware-ul `requireApiKey`, dar nicio rută: infrastructura
 * a fost pusă la INT-901 și n-a mai fost conectată niciodată. Clientul (`src/lib/api/apiKeys.ts`)
 * chema `/api/settings/api-keys`, care cădea pe fallback-ul SPA — aceeași clasă de gol tăcut ca
 * `/api/team/members`. Aici se închide.
 *
 * Trei reguli de securitate, scrise lângă cod fiindcă ele sunt tot rostul fișierului:
 *
 * 1. **Cheia în clar nu se păstrează nicăieri.** Se întoarce o dată, la creare; în bază rămâne
 *    doar hash-ul bcrypt și prefixul de 8 caractere, pentru recunoaștere. Cine o pierde face alta.
 * 2. **Revocarea nu șterge rândul.** `revoked_at` oprește cheia imediat, dar `last_used_at` și
 *    numele rămân — altfel n-ai cum să răspunzi la „ce cheie a citit baza marțea trecută".
 * 3. **Doar administratorii și managerii** pot vedea sau crea chei. O cheie citește TOATĂ baza
 *    comercială a workspace-ului; dreptul de a o fabrica nu poate fi mai slab decât dreptul de a
 *    citi manual aceleași date.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { apiKeys } from "../db/schema/apiKeys";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { writeAuditLog } from "../lib/auditLogger";

export const apiKeysRoutes = new Hono<{ Variables: AuthVariables }>();
apiKeysRoutes.use("/*", requireAuth);

/** Rolurile care pot fabrica o cheie. Vezi regula 3 din antet. */
const KEY_ADMIN_ROLES = new Set(["admin", "manager", "owner"]);

apiKeysRoutes.use("/*", async (c, next) => {
  const user = c.get("user");
  if (!KEY_ADMIN_ROLES.has(user.role)) {
    return c.json({ error: "forbidden", requires: "admin sau manager" }, 403);
  }
  await next();
});

/**
 * Formatul cheii: `fk_` + 40 de caractere din alfabet base58 (fără 0/O/l/I, ca să se poată citi
 * la telefon fără confuzii). Prefixul stocat e primele 8 caractere — `fk_` inclus, deci rămân 5
 * caractere care disting cheile între ele; coliziunile se rezolvă la verificarea hash-ului.
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function generateKey(): string {
  const bytes = randomBytes(40);
  let out = "fk_";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function publicShape(row: typeof apiKeys.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

// ─── GET / ────────────────────────────────────────────────────────────────────

apiKeysRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, user.tenantId))
      .orderBy(desc(apiKeys.createdAt));
    return c.json(rows.map(publicShape));
  } catch (e) {
    // Tabela lipsă (schemă în urma codului) înseamnă „nicio cheie", nu un ecran roșu.
    console.error("[api-keys] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json([]);
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

apiKeysRoutes.post(
  "/",
  zValidator("json", z.object({ name: z.string().trim().min(2, "Dă cheii un nume").max(200) })),
  async (c) => {
    const user = c.get("user");
    const { name } = c.req.valid("json");

    const key = generateKey();
    const [row] = await db
      .insert(apiKeys)
      .values({
        tenantId: user.tenantId,
        name,
        prefix: key.slice(0, 8),
        // 10 runde: aceeași cost ca la parole. O cheie se verifică la fiecare cerere de API, dar
        // apelurile de integrare sunt rare comparativ cu traficul de interfață.
        keyHash: await bcrypt.hash(key, 10),
      })
      .returning();

    // Cine a fabricat cheia și când — fără asta, o scurgere n-are de unde fi reconstituită.
    await writeAuditLog({
      tenantId: user.tenantId,
      actorId: user.id,
      actionType: "settings.api_key_created",
      targetType: "api_key",
      targetId: row.id,
      newValue: { name, prefix: row.prefix },
    });

    // Singurul moment în care cheia există în clar în afara memoriei procesului.
    return c.json({ ...publicShape(row), key }, 201);
  }
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

apiKeysRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, user.tenantId)))
    .returning();

  // Cheia altui workspace → 404, nu 403: un 403 ar confirma că ea există.
  if (!row) return c.json({ error: "not_found" }, 404);

  await writeAuditLog({
    tenantId: user.tenantId,
    actorId: user.id,
    actionType: "settings.api_key_revoked",
    targetType: "api_key",
    targetId: row.id,
    oldValue: { name: row.name, prefix: row.prefix },
  });

  return c.json({ ok: true });
});
