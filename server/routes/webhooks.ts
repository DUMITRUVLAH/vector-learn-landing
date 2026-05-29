/**
 * CRM-104: Webhook routes for Facebook Lead Ads and Google Ads
 *
 * Facebook Lead Ads flow:
 *   1. Meta sends GET /webhooks/meta/lead-ads for webhook verification (hub.challenge)
 *   2. Meta sends POST /webhooks/meta/lead-ads with lead_gen event
 *   3. We verify HMAC SHA256 signature, fetch full form via Graph API (stub in dev),
 *      normalize fields, dedup on leadgen_id (idempotent), create lead.
 *
 * Google Ads:
 *   gclid is already saved via the public intake form (CRM-101).
 *   Offline conversion upload happens at lead→student conversion (CRM-111).
 *   This file prepares the payload helper for CRM-111.
 */

import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, webhookEvents } from "../db/schema";
import { normalizePhone, normalizeEmail, normalizeName } from "../lib/normalize";

export const webhookRoutes = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify Facebook HMAC SHA256 signature.
 * Header: X-Hub-Signature-256: sha256=<hex>
 * Key: META_APP_SECRET env var
 */
function verifyMetaSignature(rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // In dev/test, accept all if no secret configured
    return process.env.NODE_ENV !== "production";
  }
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  // Use timing-safe comparison to prevent timing attacks
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Fetch full lead form data from Meta Graph API.
 * In dev/test: returns stub data if GRAPH_API_TOKEN is not set.
 */
async function fetchMetaLeadForm(leadgenId: string, accessToken: string | undefined): Promise<Record<string, string>> {
  if (!accessToken || process.env.NODE_ENV !== "production") {
    // Stub response for development
    return {
      full_name: "Meta Lead Test",
      phone_number: "+40712000001",
      email: "meta-lead@test.com",
    };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data&access_token=${accessToken}`
    );
    const data = (await res.json()) as { field_data?: Array<{ name: string; values: string[] }> };
    const fields: Record<string, string> = {};
    for (const item of data.field_data ?? []) {
      fields[item.name] = item.values[0] ?? "";
    }
    return fields;
  } catch {
    return {};
  }
}

/**
 * Map Meta field names to our schema.
 * Meta field names vary by form creator; we handle common variants.
 */
function mapMetaFields(fields: Record<string, string>): {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  interestCourse: string | null;
} {
  const name = fields["full_name"] || fields["name"] || fields["first_name"]
    ? [fields["first_name"], fields["last_name"]].filter(Boolean).join(" ") || fields["full_name"] || fields["name"]
    : null;

  return {
    fullName: name?.trim() || null,
    phone: fields["phone_number"] || fields["phone"] || null,
    email: fields["email"] || null,
    interestCourse: fields["course"] || fields["interest"] || fields["curs"] || null,
  };
}

// ---------------------------------------------------------------------------
// GET /webhooks/meta/lead-ads — Meta webhook verification (hub challenge)
// ---------------------------------------------------------------------------
webhookRoutes.get("/meta/lead-ads", async (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const verifyToken = process.env.META_VERIFY_TOKEN ?? "vectorlearn_dev_token";

  if (mode === "subscribe" && token === verifyToken) {
    return c.text(challenge ?? "", 200);
  }
  return c.text("Forbidden", 403);
});

// ---------------------------------------------------------------------------
// POST /webhooks/meta/lead-ads — Meta webhook event (lead_gen)
// ---------------------------------------------------------------------------
webhookRoutes.post("/meta/lead-ads", async (c) => {
  // 1. Read raw body for HMAC verification
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  // 2. Verify HMAC
  if (!verifyMetaSignature(rawBody, signature)) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  // 3. Parse payload
  let payload: {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: {
          leadgen_id?: string;
          page_id?: string;
          form_id?: string;
          ad_id?: string;
          ad_group_id?: string;
        };
      }>;
    }>;
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (payload.object !== "page") {
    return c.json({ status: "ignored", reason: "not_page_object" }, 200);
  }

  const results: Array<{ leadgenId: string; status: string }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;

      const value = change.value;
      if (!value?.leadgen_id) continue;

      const leadgenId = value.leadgen_id;
      const pageId = value.page_id ?? entry.id ?? null;

      // 4. Find tenant by page_id (or use a default for dev)
      let tenantId: string | null = null;

      if (pageId) {
        // In production, look up tenant by their Meta page_id stored in settings
        // For now: find any active tenant (dev mode) or lookup by pageId in tenant config
        const anyTenant = await db.query.tenants.findFirst();
        tenantId = anyTenant?.id ?? null;
      }

      if (!tenantId) {
        results.push({ leadgenId, status: "no_tenant_found" });
        continue;
      }

      // 5. Idempotency: check if leadgen_id already processed
      const alreadyProcessed = await db.query.leads.findFirst({
        where: and(eq(leads.tenantId, tenantId), eq(leads.leadgenId, leadgenId)),
      });

      if (alreadyProcessed) {
        // Log the duplicate event
        await db.insert(webhookEvents).values({
          tenantId,
          provider: "facebook_lead_ads",
          externalId: leadgenId,
          payload: rawBody.slice(0, 8000),
          leadId: alreadyProcessed.id,
          isDuplicate: "true",
        });
        results.push({ leadgenId, status: "duplicate" });
        continue;
      }

      // 6. Fetch full form data from Graph API
      const accessToken = process.env.META_PAGE_ACCESS_TOKEN;
      const formFields = await fetchMetaLeadForm(leadgenId, accessToken);
      const mapped = mapMetaFields(formFields);

      if (!mapped.fullName || mapped.fullName.length < 2) {
        results.push({ leadgenId, status: "invalid_name" });
        continue;
      }

      const phoneNormalized = normalizePhone(mapped.phone);
      const emailNormalized = normalizeEmail(mapped.email);
      const fullNameNormalized = normalizeName(mapped.fullName);

      // 7. Dedup on phone/email as well
      if (phoneNormalized || emailNormalized) {
        const contactConditions = [];
        if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
        if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));
        if (contactConditions.length > 0) {
          const { or } = await import("drizzle-orm");
          const existing = await db.query.leads.findFirst({
            where: and(eq(leads.tenantId, tenantId), or(...contactConditions)),
          });
          if (existing) {
            await db.insert(leadInteractions).values({
              tenantId,
              leadId: existing.id,
              type: "system",
              direction: "inbound",
              body: `Facebook Lead Ads re-submit (leadgen_id: ${leadgenId})`,
            });
            await db.insert(webhookEvents).values({
              tenantId,
              provider: "facebook_lead_ads",
              externalId: leadgenId,
              payload: rawBody.slice(0, 8000),
              leadId: existing.id,
              isDuplicate: "true",
            });
            results.push({ leadgenId, status: "duplicate_contact" });
            continue;
          }
        }
      }

      // 8. Create lead
      const [created] = await db
        .insert(leads)
        .values({
          tenantId,
          fullName: mapped.fullName,
          fullNameNormalized,
          phone: mapped.phone || null,
          phoneNormalized,
          email: mapped.email || null,
          emailNormalized,
          interestCourse: mapped.interestCourse || null,
          source: "facebook_ad",
          leadgenId,
          metaFormId: value.form_id || null,
          metaAdId: value.ad_id || null,
          utmCampaign: value.ad_group_id || null,
          // Meta consent is managed by Meta — mark as Meta-managed
          consentText: "Meta-managed consent (Facebook Lead Ads form)",
          consentAt: new Date(),
        })
        .returning();

      // 9. Log webhook event
      await db.insert(webhookEvents).values({
        tenantId,
        provider: "facebook_lead_ads",
        externalId: leadgenId,
        payload: rawBody.slice(0, 8000),
        leadId: created.id,
        isDuplicate: "false",
      });

      // 10. System interaction
      await db.insert(leadInteractions).values({
        tenantId,
        leadId: created.id,
        type: "system",
        direction: "inbound",
        body: `Lead created via Facebook Lead Ads (leadgen_id: ${leadgenId})`,
      });

      results.push({ leadgenId, status: "created" });
    }
  }

  return c.json({ status: "ok", results });
});

// ---------------------------------------------------------------------------
// Google Ads helpers (CRM-104 + CRM-111)
// ---------------------------------------------------------------------------

/**
 * Build Google Offline Conversion payload for a converted lead.
 * Called by CRM-111 (convert lead → student) when gclid is present.
 */
export function buildGoogleOfflineConversionPayload(params: {
  gclid: string;
  conversionName: string;
  conversionValue?: number;
  conversionDateTime: Date;
  currencyCode?: string;
}): Record<string, unknown> {
  return {
    conversions: [
      {
        gclid: params.gclid,
        conversion_name: params.conversionName,
        conversion_date_time: params.conversionDateTime.toISOString(),
        conversion_value: params.conversionValue ?? 0,
        currency_code: params.currencyCode ?? "RON",
      },
    ],
  };
}
