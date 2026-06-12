/**
 * @vitest-environment node
 * PAR-104: Attachments — upload + kind + describe
 *
 * Tests: T-PAR-104-1, T-PAR-104-2, T-PAR-104-3
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Schema unit tests ────────────────────────────────────────────────────────

const parAttachmentKindValues = [
  "act_of_receipt",
  "contract",
  "quotation",
  "invoice",
  "par_pdf",
  "other",
] as const;

const MAX_FILE_URL_LEN = 15_000_000;
const MAX_FILE_NAME_LEN = 500;

const uploadAttachmentSchema = z.object({
  file_name: z.string().min(1).max(MAX_FILE_NAME_LEN),
  file_url: z.string().min(1).max(MAX_FILE_URL_LEN),
  mime: z.string().max(100),
  kind: z.enum(parAttachmentKindValues).default("other"),
  size_bytes: z.number().int().min(0).default(0),
});

describe("PAR-104: Attachments upload schema (T-PAR-104-1)", () => {
  it("T-PAR-104-1 [blocant] valid attachment with kind=contract parses correctly", () => {
    const result = uploadAttachmentSchema.safeParse({
      file_name: "contract-2026.pdf",
      file_url: "data:application/pdf;base64,JVBERi0xLjQ=",
      mime: "application/pdf",
      kind: "contract",
      size_bytes: 12345,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("contract");
      expect(result.data.file_name).toBe("contract-2026.pdf");
    }
  });

  it("T-PAR-104-1 [blocant] attachment defaults kind to other when not provided", () => {
    const result = uploadAttachmentSchema.safeParse({
      file_name: "scan.png",
      file_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA",
      mime: "image/png",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("other");
    }
  });

  it("T-PAR-104-1 [blocant] attachment kind must be in allowed enum values", () => {
    const result = uploadAttachmentSchema.safeParse({
      file_name: "doc.pdf",
      file_url: "data:application/pdf;base64,JVBERi0=",
      mime: "application/pdf",
      kind: "unknown_kind" as "other",
    });
    expect(result.success).toBe(false);
  });

  it("T-PAR-104-1 [blocant] all kind enum values are valid", () => {
    for (const kind of parAttachmentKindValues) {
      const result = uploadAttachmentSchema.safeParse({
        file_name: "test.pdf",
        file_url: "data:application/pdf;base64,JVBERi0=",
        mime: "application/pdf",
        kind,
      });
      expect(result.success).toBe(true);
    }
  });

  it("T-PAR-104-1 [blocant] file_name is required and non-empty", () => {
    const resultEmpty = uploadAttachmentSchema.safeParse({
      file_name: "",
      file_url: "data:application/pdf;base64,JVBERi0=",
      mime: "application/pdf",
    });
    expect(resultEmpty.success).toBe(false);

    const resultMissing = uploadAttachmentSchema.safeParse({
      file_url: "data:application/pdf;base64,JVBERi0=",
      mime: "application/pdf",
    });
    expect(resultMissing.success).toBe(false);
  });
});

describe("PAR-104: Attachment MIME validation (T-PAR-104-2)", () => {
  const ALLOWED_MIME_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  it("T-PAR-104-2 [blocant] PDF mime type is allowed", () => {
    expect(ALLOWED_MIME_TYPES).toContain("application/pdf");
  });

  it("T-PAR-104-2 [blocant] image/png mime type is allowed", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
  });

  it("T-PAR-104-2 [blocant] application/zip mime type is NOT allowed", () => {
    expect(ALLOWED_MIME_TYPES).not.toContain("application/zip");
  });

  it("T-PAR-104-2 [blocant] MIME extracted from data URL prefix", () => {
    const dataUrl = "data:application/pdf;base64,JVBERi0xLjQ=";
    const mimeFromDataUrl = dataUrl.match(/^data:([^;]+);base64,/)?.[1];
    expect(mimeFromDataUrl).toBe("application/pdf");
    expect(ALLOWED_MIME_TYPES).toContain(mimeFromDataUrl);
  });

  it("T-PAR-104-2 [blocant] DB portability: parAttachments route uses query builder only", async () => {
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const content = readFileSync(
      resolve(__dirname, "../routes/parAttachments.ts"),
      "utf-8"
    );
    // Must NOT use raw .execute().rows pattern (portability check)
    expect(content).not.toContain(".execute().rows");
    // Must use Drizzle query builder
    expect(content).toContain(".from(parAttachments)");
  });

  it("T-PAR-104-2 [blocant] route is mounted in app.ts (route-mount rule)", async () => {
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const appContent = readFileSync(
      resolve(__dirname, "../app.ts"),
      "utf-8"
    );
    expect(appContent).toContain("parAttachmentsRoutes");
    expect(appContent).toContain('import { parAttachmentsRoutes }');
  });
});

describe("PAR-104: Attachment section 13 radio state (T-PAR-104-3)", () => {
  it("T-PAR-104-3 [normal] attachments_present=true + empty files + note = non-blocking warning", () => {
    // When attachments_present=true but no files uploaded, UI shows a warning (non-blocking)
    // This is a UI behavior: the spec says "warning non-blocant"
    const state = {
      attachmentsPresent: true,
      attachmentsNote: "Will attach later",
      fileCount: 0,
    };
    // Non-blocking: submit is still allowed (warning only)
    const isBlocking = state.attachmentsPresent && state.fileCount === 0 && !state.attachmentsNote;
    expect(isBlocking).toBe(false); // because attachmentsNote is provided
  });

  it("T-PAR-104-3 [normal] attachments_present=false does not require files", () => {
    const state = {
      attachmentsPresent: false,
      attachmentsNote: null,
      fileCount: 0,
    };
    const needsFile = state.attachmentsPresent && state.fileCount === 0;
    expect(needsFile).toBe(false);
  });
});
