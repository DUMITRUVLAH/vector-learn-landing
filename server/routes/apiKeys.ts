/**
 * INT-901: API Key management routes.
 *
 * POST   /api/settings/api-keys          → generate new key (returns key once, in clear)
 * GET    /api/settings/api-keys          → list keys (prefix + name + dates; no key in clear)
 * DELETE /api/settings/api-keys/:id      → revoke key (set revokedAt)
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNull, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db/client";
import { apiKeys } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const BCRYPT_ROUNDS = 10;
/** Key length: prefix(8) + separator(-) + body(32) = 41 chars, easily memorable */
const KEY_BODY_BYTES = 24; // produces 32 base64url chars

function generateApiKey(): { key: string; prefix: string } {
  const body = randomBytes(KEY_BODY_BYTES).toString("base64url");
  const key = `vl_${body}`;
  const prefix = key.slice(0, 8);
  return { key, prefix };
}

const createKeySchema = z.object({
  name: z.string().min(1).max(200),
});

export const apiKeyRoutes = new Hono<{ Variables: AuthVariables }>();

// All API-key management routes require session auth (not API key auth — chicken & egg)
apiKeyRoutes.use("/*", requireAuth);

/**
 * POST /api/settings/api-keys
 * Body: { name: string }
 * Returns: { id, name, prefix, key } — key is returned ONLY here; not stored in clear.
 */
apiKeyRoutes.post("/", zValidator("json", createKeySchema), async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");

  const { key, prefix } = generateApiKey();
  const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);

  const [created] = await db
    .insert(apiKeys)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      prefix,
      keyHash,
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
    });

  return c.json(
    {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      createdAt: created.createdAt,
      /** The key is returned IN CLEAR only this one time. Store it securely. */
      key,
    },
    201
  );
});

/**
 * GET /api/settings/api-keys
 * Returns array of active keys with prefix/name/dates. No key in clear.
 */
apiKeyRoutes.get("/", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, user.tenantId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));

  return c.json(rows);
});

/**
 * DELETE /api/settings/api-keys/:id
 * Revokes the key (sets revokedAt). Only the owner tenant can revoke.
 */
apiKeyRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id");

  // Verify ownership before revoking
  const existing = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.id, keyId),
      eq(apiKeys.tenantId, user.tenantId),
      isNull(apiKeys.revokedAt)
    ),
  });

  if (!existing) {
    return c.json({ error: "not_found" }, 404);
  }

  await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, keyId));

  return c.json({ ok: true, id: keyId, revokedAt: new Date().toISOString() });
});
