# FRONTEND-NEEDS-SERVER — PAR attachment upload (multipart/form-data)

**Status: NOT applied. Frontend still uploads base64 JSON, capped to 3 MB client-side.**

## Why

`POST /api/par/:id/attachments` (`server/routes/parAttachments.ts`) only accepts
`application/json` with a base64 `file_url` data URL (`uploadAttachmentSchema`, zValidator("json", …)).
The frontend (`uploadAttachment()` in `src/lib/api/par.ts`, used from `ParCreateForm.tsx` and
`ParFinanceQueue.tsx`) reads the file into a base64 data URL with `FileReader.readAsDataURL()` and
sends it as JSON.

Base64 inflates payload size by ~33%. Vercel's request body limit is ~4.5 MB, so any file between
~3.3 MB and the old client-side "10 MB" advertised cap silently 413'd — the user just saw a failed
upload with no useful explanation.

The frontend audit (2026-08-29) asked to switch the upload to `multipart/form-data` (no base64
inflation — the same pattern `prefillParFromDocument()` already uses against
`POST /api/par/ai-prefill`, see `server/routes/parAiPrefill.ts`). **That requires a server change
that is out of scope for a frontend-only PR** (per repo convention, frontend and server changes on
this endpoint are being split across two people/PRs to avoid stepping on each other's files).

Until this ships, the frontend keeps the base64 JSON path but lowered its own cap from 10 MB to
3 MB (`src/lib/par/attachmentLimits.ts`) — small enough that base64 inflation can never cross the
~4.5 MB platform limit, with an error message that explains why (not just "too big").

## What the server needs to change

`server/routes/parAttachments.ts`, `POST /:parId/attachments` — accept **both** request shapes so
the frontend can be flipped to `multipart/form-data` in a follow-up PR without a breaking window
(old clients / cached bundles keep sending JSON for a while after deploy):

1. Branch on `c.req.header("content-type")`:
   - starts with `application/json` → keep the EXISTING `zValidator("json", uploadAttachmentSchema)`
     path exactly as-is (back-compat, and it's also how `kind`/`kind_other`/`par_pdf` attachments the
     frontend itself generates client-side — e.g. the PDF form download in `ParDetail.tsx` — will
     keep working; those are never going through `<input type=file>`, so there's no File object to
     multipart).
   - starts with `multipart/form-data` → call `await c.req.formData()`, read:
     - `file` (the `File`/`Blob`) — required, reject 400 if missing or not a file (same pattern as
       `parAiPrefill.ts` lines ~161–170).
     - `kind` (string, optional, defaults `"other"`, must be one of `parAttachmentKindValues`).
     - `kind_other` (string, optional, max 200 — same as `uploadAttachmentSchema.kind_other`).
     Read the bytes with `Buffer.from(await file.arrayBuffer())`, get `mime` from `file.type` (or
     sniff extension if empty, same fallback `parAiPrefill.ts` uses), get `file_name` from
     `file.name`.

2. **Converge on the same downstream code either way.** The rest of the handler (existing-PAR
   lookup, `hasScopedDossierAccess`, `authorCanEdit`/`financeCanAttach` gate, the
   `MAX_ATTACHMENTS_PER_PAR` count check, `magicBytesMatch`, the `parAttachments` insert, the
   best-effort `analyzeAttachmentAgainstPar` call) must run IDENTICALLY for both request shapes —
   don't fork the business logic, only the "how did we get `{ fileName, mime, bytes, kind,
   kindOther }`" part. Concretely: extract the current handler body into a small helper that takes
   `{ fileName, mime, bytesOrDataUrl, kind, kindOther, sizeBytes }` and have both branches call it.

3. **`magicBytesMatch()` currently takes a base64 data URL** (`server/routes/parAttachments.ts`
   lines ~80–140) — it needs a second code path (or a refactor to take a `Buffer` directly and have
   the JSON branch decode base64 first) so multipart bytes can be validated the same way without a
   round-trip through base64.

4. **Raise the effective size ceiling for the multipart path.** The current
   `MAX_FILE_URL_LEN = 15_000_000` (chars, ~11 MB of real bytes after base64) exists BECAUSE base64
   inflates. Raw multipart bytes don't need that inflation headroom — a reasonable cap for the
   multipart branch is the real ~10 MB the UI used to advertise (`MAX_FILE_BYTES = 10_000_000`),
   enforced by checking `file.size` before reading `arrayBuffer()`. Keep `MAX_FILE_URL_LEN` as-is
   for the JSON branch (back-compat).

5. **Storage stays a `dataUrl` string either way** — `parAttachments.fileUrl` is a text column
   storing `data:<mime>;base64,<data>` (see `analyzeAttachmentAgainstPar`, the `/preview` route,
   and `openParAttachment()` on the frontend, all of which parse that exact format). So the
   multipart branch still base64-encodes the buffer BEFORE the `db.insert(parAttachments)` call —
   the win is avoiding the base64 inflation ON THE WIRE (client → server), not in storage. Do not
   change the column/format; that would need a migration + a backfill and is out of scope here.

6. Once this ships, the frontend PR that flips `uploadAttachment()` to multipart should:
   - build a `FormData` (`file`, `kind`, `kind_other`) in `src/lib/api/par.ts`, call the existing
     `apiUpload()` helper (`src/lib/api.ts`) — same pattern as `CapturesListPage.tsx`.
   - raise `MAX_ATTACHMENT_BYTES` back up in `src/lib/par/attachmentLimits.ts` (matching whatever
     `MAX_FILE_BYTES` the server settles on in step 4).
   - update the two upload sites (`ParCreateForm.tsx`, `ParFinanceQueue.tsx`) and their tests.

## Not done here (why)

Per the task split for this change, frontend-only edits stayed inside `src/` — no `server/` files
were touched. The 3 MB client cap (`src/lib/par/attachmentLimits.ts`) is the safe interim state:
it can never trigger the 413, at the cost of rejecting legitimate 3–10 MB files until the server
change above ships.
