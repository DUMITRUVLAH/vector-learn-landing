/**
 * DOCMERGE-001/002: Document Merge Templates API
 *
 * Mounted at /api/docmerge (app.ts: app.route("/api/docmerge", docmergeTemplatesRoutes))
 *
 * POST   /api/docmerge/templates           — create template
 * GET    /api/docmerge/templates           — list templates
 * GET    /api/docmerge/templates/:id       — get one template
 * PUT    /api/docmerge/templates/:id       — update template
 * DELETE /api/docmerge/templates/:id       — delete template
 * POST   /api/docmerge/templates/:id/preview — render with context (or sample context)
 * POST   /api/docmerge/parse-excel         — upload .xlsx, returns {headers, sample, previewRows, rowCount}
 * POST   /api/docmerge/automap             — {headers, placeholders} → {mapping: Record<string,string>}
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { docmergeTemplates } from "../db/schema/docmergeTemplates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import {
  extractPlaceholders,
  renderWithContext,
  sampleContext,
} from "../lib/docmerge/placeholders";
import { parseWorkbook, autoMap as autoMapExcel } from "../lib/docmerge/excelImport";
import { sanitizeTemplateHtml } from "../lib/docs/sanitizeHtml";
import { docTemplateVersions } from "../db/schema/docs";
import { generateBatch } from "../lib/docmerge/generateBatch";
import { buildPdfZip } from "../lib/docmerge/zipPdfs";

export const docmergeTemplatesRoutes = new Hono<{
  Variables: AuthVariables;
}>();

// All routes require authentication
docmergeTemplatesRoutes.use("/*", requireAuth);

// ─── Validation schemas ────────────────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string().min(1, "Denumirea este obligatorie").max(200),
  bodyHtml: z.string().min(1, "Corpul template-ului este obligatoriu"),
  // DG-104: același depozit ține și șabloanele de acte (act de primire-predare, contracte).
  kind: z.string().max(50).optional(),
  category: z.string().max(100).nullish(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  bodyHtml: z.string().min(1).optional(),
  kind: z.string().max(50).optional(),
  category: z.string().max(100).nullish(),
});

const previewTemplateSchema = z.object({
  context: z.record(z.string()).optional(),
});

// ─── POST /api/docmerge/templates ─────────────────────────────────────────────

docmergeTemplatesRoutes.post(
  "/templates",
  zValidator("json", createTemplateSchema),
  async (c) => {
    const user = c.get("user");
    const { name, bodyHtml: rawBody, kind, category } = c.req.valid("json");

    // DG-104: corpul ajunge randat în aplicație ȘI în PDF, iar API-ul poate fi apelat direct,
    // ocolind editorul — deci curățarea trăiește aici, nu doar în browser.
    const bodyHtml = sanitizeTemplateHtml(rawBody);
    const detected = extractPlaceholders(bodyHtml);

    const [row] = await db
      .insert(docmergeTemplates)
      .values({
        tenantId: user.tenantId,
        name,
        bodyHtml,
        placeholders: JSON.stringify(detected),
        ...(kind ? { kind } : {}),
        ...(category !== undefined ? { category: category ?? null } : {}),
      })
      .returning();

    return c.json(
      {
        id: row.id,
        name: row.name,
        placeholders: detected,
        createdAt: row.createdAt,
      },
      201
    );
  }
);

// ─── GET /api/docmerge/templates ──────────────────────────────────────────────

docmergeTemplatesRoutes.get("/templates", async (c) => {
  const user = c.get("user");

  const rows = await db
    .select({
      id: docmergeTemplates.id,
      name: docmergeTemplates.name,
      placeholders: docmergeTemplates.placeholders,
      sourceFormat: docmergeTemplates.sourceFormat,
      updatedAt: docmergeTemplates.updatedAt,
    })
    .from(docmergeTemplates)
    .where(eq(docmergeTemplates.tenantId, user.tenantId))
    .orderBy(desc(docmergeTemplates.updatedAt));

  return c.json(
    rows.map((r) => ({
      ...r,
      placeholders: safeParseJson(r.placeholders) as string[],
    }))
  );
});

// ─── GET /api/docmerge/templates/:id ─────────────────────────────────────────

docmergeTemplatesRoutes.get("/templates/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .select()
    .from(docmergeTemplates)
    .where(
      and(
        eq(docmergeTemplates.id, id),
        eq(docmergeTemplates.tenantId, user.tenantId)
      )
    );

  if (!row) return c.json({ error: "not_found" }, 404);

  return c.json({
    ...row,
    placeholders: safeParseJson(row.placeholders) as string[],
  });
});

// ─── PUT /api/docmerge/templates/:id ─────────────────────────────────────────

docmergeTemplatesRoutes.put(
  "/templates/:id",
  zValidator("json", updateTemplateSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // Verify ownership
    const [existing] = await db
      .select({
        id: docmergeTemplates.id,
        bodyHtml: docmergeTemplates.bodyHtml,
        isSystem: docmergeTemplates.isSystem,
        version: docmergeTemplates.version,
        name: docmergeTemplates.name,
      })
      .from(docmergeTemplates)
      .where(
        and(
          eq(docmergeTemplates.id, id),
          eq(docmergeTemplates.tenantId, user.tenantId)
        )
      );

    if (!existing) return c.json({ error: "not_found" }, 404);
    // DG-106: șabloanele livrate cu produsul se clonează, nu se editează — altfel formularea pe
    // care se sprijină toate actele viitoare poate fi stricată din trei click-uri.
    if (existing.isSystem) {
      return c.json(
        {
          error: "system_template",
          message: "Șablonul standard nu se editează. Fă-i o copie și modifică copia.",
        },
        403
      );
    }

    const newBody = body.bodyHtml ? sanitizeTemplateHtml(body.bodyHtml) : existing.bodyHtml;
    const detected = extractPlaceholders(newBody);

    // DG-107: fiecare salvare care schimbă corpul e o versiune nouă. Documentele generate rămân
    // legate de versiunea lor, deci un act semnat nu se schimbă când șablonul evoluează.
    const bodyChanged = !!body.bodyHtml && newBody !== existing.bodyHtml;
    const nextVersion = bodyChanged ? (existing.version ?? 1) + 1 : existing.version ?? 1;

    const [row] = await db
      .update(docmergeTemplates)
      .set({
        ...(bodyChanged ? { version: nextVersion } : {}),
        ...(body.name ? { name: body.name } : {}),
        ...(body.bodyHtml ? { bodyHtml: newBody } : {}),
        ...(body.kind ? { kind: body.kind } : {}),
        ...(body.category !== undefined ? { category: body.category ?? null } : {}),
        placeholders: JSON.stringify(detected),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(docmergeTemplates.id, id),
          eq(docmergeTemplates.tenantId, user.tenantId)
        )
      )
      .returning();

    if (bodyChanged) {
      // Prima versiune nu are cine s-o scrie la creare (șabloanele pot veni și din seed sau din
      // clonare), așa că o coborâm în istoric ACUM, cu corpul de dinaintea acestei salvări.
      // Fără asta, „revenire la versiunea 1" ar fi un buton care nu are la ce să se întoarcă.
      const baselineVersion = existing.version ?? 1;
      const [hasBaseline] = await db
        .select({ id: docTemplateVersions.id })
        .from(docTemplateVersions)
        .where(
          and(
            eq(docTemplateVersions.templateId, id),
            eq(docTemplateVersions.version, baselineVersion)
          )
        );
      if (!hasBaseline) {
        await db.insert(docTemplateVersions).values({
          tenantId: user.tenantId,
          templateId: id,
          version: baselineVersion,
          name: existing.name ?? row.name,
          bodyHtml: existing.bodyHtml,
          createdByUserId: user.id,
        });
      }

      await db.insert(docTemplateVersions).values({
        tenantId: user.tenantId,
        templateId: id,
        version: nextVersion,
        name: row.name,
        bodyHtml: newBody,
        createdByUserId: user.id,
      });
    }

    return c.json({
      ...row,
      placeholders: detected,
    });
  }
);

// ─── DELETE /api/docmerge/templates/:id ──────────────────────────────────────

docmergeTemplatesRoutes.delete("/templates/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ isSystem: docmergeTemplates.isSystem })
    .from(docmergeTemplates)
    .where(and(eq(docmergeTemplates.id, id), eq(docmergeTemplates.tenantId, user.tenantId)));
  if (existing?.isSystem) {
    return c.json(
      { error: "system_template", message: "Șablonul standard nu se șterge." },
      403
    );
  }

  const deleted = await db
    .delete(docmergeTemplates)
    .where(
      and(
        eq(docmergeTemplates.id, id),
        eq(docmergeTemplates.tenantId, user.tenantId)
      )
    )
    .returning({ id: docmergeTemplates.id });

  if (!deleted.length) return c.json({ error: "not_found" }, 404);

  return c.json({ ok: true });
});

// ─── POST /api/docmerge/templates/:id/preview ────────────────────────────────

docmergeTemplatesRoutes.post(
  "/templates/:id/preview",
  zValidator("json", previewTemplateSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { context } = c.req.valid("json");

    const [row] = await db
      .select({ bodyHtml: docmergeTemplates.bodyHtml, placeholders: docmergeTemplates.placeholders })
      .from(docmergeTemplates)
      .where(
        and(
          eq(docmergeTemplates.id, id),
          eq(docmergeTemplates.tenantId, user.tenantId)
        )
      );

    if (!row) return c.json({ error: "not_found" }, 404);

    const detected = safeParseJson(row.placeholders) as string[];
    const ctx = context ?? sampleContext(detected);
    const html = renderWithContext(row.bodyHtml, ctx);

    return c.json({ html });
  }
);

// ─── POST /api/docmerge/parse-excel ──────────────────────────────────────────

/**
 * Accepts a multipart form with a single file field "file".
 * Returns {headers, sample, previewRows, rowCount}.
 * CRITICAL: exceljs lazy-imported inside parseWorkbook.
 */
docmergeTemplatesRoutes.post("/parse-excel", requireAuth, async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!file || typeof file === "string") {
    return c.json({ error: "Câmpul 'file' lipsește sau nu este un fișier." }, 400);
  }

  const fileName = (file as File).name ?? "";
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    return c.json({ error: "Doar fișiere .xlsx sunt acceptate." }, 400);
  }

  const arrayBuffer = await (file as File).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    const result = await parseWorkbook(buffer);
    return c.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Eroare la parsarea fișierului Excel.";
    return c.json({ error: message }, 422);
  }
});

// ─── POST /api/docmerge/generate ─────────────────────────────────────────────

const generateSchema = z.object({
  templateId: z.string().uuid("templateId trebuie să fie un UUID valid"),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1, "Cel puțin un rând este necesar").max(5000, "Maxim 5000 rânduri"),
  fileNameColumn: z.string().optional(),
  delivery: z.enum(["zip", "single"]).default("zip"),
});

docmergeTemplatesRoutes.post(
  "/generate",
  requireAuth,
  zValidator("json", generateSchema),
  async (c) => {
    const user = c.get("user");
    const { templateId, mapping, rows, fileNameColumn, delivery } = c.req.valid("json");

    // Validate mapping is non-empty
    if (Object.keys(mapping).length === 0) {
      return c.json({ error: "Maparea placeholderelor este goală." }, 400);
    }

    // Validate single delivery only for one row
    if (delivery === "single" && rows.length !== 1) {
      return c.json({ error: "delivery:single necesită exact un rând." }, 400);
    }

    // Fetch template and verify tenant ownership
    const [template] = await db
      .select({ bodyHtml: docmergeTemplates.bodyHtml, name: docmergeTemplates.name })
      .from(docmergeTemplates)
      .where(
        and(
          eq(docmergeTemplates.id, templateId),
          eq(docmergeTemplates.tenantId, user.tenantId)
        )
      );

    if (!template) {
      return c.json({ error: "Template negăsit sau acces interzis." }, 403);
    }

    // Generate PDFs (one per row)
    const files = await generateBatch({
      bodyHtml: template.bodyHtml,
      mapping,
      rows,
      fileNameColumn,
    });

    // Single delivery → return the first (and only) PDF directly
    if (delivery === "single") {
      const file = files[0];
      const pdf = file?.pdf;
      if (!pdf || pdf.length === 0) {
        return c.json({ error: "Nu s-a putut genera PDF-ul. Playwright indisponibil." }, 503);
      }
      return new Response(pdf, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${file.name}"`,
        },
      });
    }

    // ZIP delivery → pack all PDFs
    const allHavePdf = files.every((f) => f.pdf.length > 0);
    if (!allHavePdf) {
      return c.json({ error: "Nu s-au putut genera PDF-urile. Playwright indisponibil." }, 503);
    }

    const zipBuffer = await buildPdfZip(
      files.map((f) => ({ name: f.name, pdf: Buffer.from(f.pdf) }))
    );

    const safeTemplateName = template.name
      .replace(/[/:*?"<>|\\]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 60);
    const today = new Date().toISOString().slice(0, 10);
    const zipFileName = `documente-${safeTemplateName}-${today}.zip`;

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
      },
    });
  }
);

// ─── POST /api/docmerge/automap ───────────────────────────────────────────────

const automapSchema = z.object({
  headers: z.array(z.string()),
  placeholders: z.array(z.string()),
});

docmergeTemplatesRoutes.post(
  "/automap",
  requireAuth,
  zValidator("json", automapSchema),
  async (c) => {
    const { headers, placeholders } = c.req.valid("json");
    const mapping = autoMapExcel(headers, placeholders);
    return c.json({ mapping });
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
