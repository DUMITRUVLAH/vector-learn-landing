/**
 * PAR-VENDOR360 — clientul pentru fișa furnizorului.
 *
 * Separat de `par.ts` (deja peste 1.500 de linii) ca tot ce ține de relația cu furnizorul —
 * domenii, evaluări, note, oferte, documente — să se citească într-un singur loc.
 */
import { api } from "../api";

export type VendorRelationship = "preferred" | "active" | "trial" | "blocked";

export interface VendorCategory {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  vendorCount?: number;
}

export interface VendorDirectoryItem {
  id: string;
  name: string;
  kind: string;
  idnp: string | null;
  relationship: VendorRelationship;
  blockedReason: string | null;
  active: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  paymentTermsDays: number | null;
  categories: { id: string; name: string }[];
  ratingAvg: number | null;
  ratingCount: number;
  paidCents: number;
  requestCount: number;
  lastPaidAt: string | null;
}

export interface VendorKpis {
  requestCount: number;
  paidCount: number;
  paidCents: number;
  committedCents: number;
  avgRequestCents: number | null;
  firstRequestAt: string | null;
  lastPaidAt: string | null;
  avgDaysApprovalToPayment: number | null;
  avgDaysSubmitToPayment: number | null;
}

export interface VendorRatingSummary {
  count: number;
  avg: number | null;
  quality: number | null;
  timeliness: number | null;
  price: number | null;
  communication: number | null;
  wouldUseAgainPct: number | null;
  distribution: Record<string, number>;
}

export interface VendorRiskFlag {
  code: string;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface VendorProfileRequest {
  id: string;
  requestNo: string;
  status: string;
  purpose: string;
  currency: string;
  totalEstimatedCents: number;
  totalMdlCents: number | null;
  actualAmountCents: number | null;
  dateOfRequest: string;
  paidAt: string | null;
  endUse: string | null;
}

export interface VendorProfile {
  vendor: {
    id: string;
    name: string;
    kind: string;
    idnp: string | null;
    iban: string | null;
    bank: string | null;
    bicSwift: string | null;
    vatCode: string | null;
    legalAddress: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    administratorName: string | null;
    website: string | null;
    paymentTermsDays: number | null;
    relationship: VendorRelationship;
    blockedReason: string | null;
    companyStatus: string | null;
    active: boolean;
    notes: string | null;
    categories: { id: string; name: string }[];
  };
  kpis: VendorKpis;
  ratings: VendorRatingSummary;
  flags: VendorRiskFlag[];
  requests: VendorProfileRequest[];
}

export interface VendorRating {
  id: string;
  vendorId: string;
  parId: string | null;
  authorUserId: string;
  authorName?: string;
  requestNo?: string | null;
  stars: number;
  qualityStars: number | null;
  timelinessStars: number | null;
  priceStars: number | null;
  communicationStars: number | null;
  comment: string | null;
  wouldUseAgain: boolean | null;
  createdAt: string;
}

export interface VendorNote {
  id: string;
  vendorId: string;
  authorUserId: string;
  authorName?: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export interface VendorOffer {
  id: string;
  vendorId: string;
  title: string;
  categoryId: string | null;
  amountCents: number | null;
  currency: string;
  unitLabel: string | null;
  unitPriceCents: number | null;
  offeredAt: string;
  validUntil: string | null;
  status: string;
  parId: string | null;
  fileUrl: string | null;
  fileName: string | null;
  notes: string | null;
  source?: "manual";
}

/** Ofertele colectate pe o cerere „obținere oferte" (par_quotes) — sursa a doua a aceluiași tab. */
export interface VendorQuoteOffer {
  id: string;
  source: "par_quote";
  parId: string;
  requestNo: string | null;
  title: string;
  amountCents: number;
  currency: string;
  validUntil: string | null;
  notes: string | null;
  fileUrl: string | null;
  selected: boolean;
  offeredAt: string;
}

export interface VendorDocument {
  id: string;
  vendorId: string;
  kind: string;
  title: string;
  number: string | null;
  issuedAt: string | null;
  validUntil: string | null;
  fileUrl: string | null;
  fileName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PendingRating {
  parId: string;
  requestNo: string;
  paidAt: string | null;
  vendorId: string;
  vendorName: string;
  amountCents: number;
  currency: string;
}

// ─── Domenii ──────────────────────────────────────────────────────────────────

export function listVendorCategories(): Promise<{ categories: VendorCategory[]; suggestions: string[] }> {
  return api("/api/par/vendors/categories");
}

export function createVendorCategory(name: string): Promise<VendorCategory> {
  return api("/api/par/vendors/categories", { method: "POST", body: JSON.stringify({ name }) });
}

export function seedVendorCategories(): Promise<{ added: number }> {
  return api("/api/par/vendors/categories/seed", { method: "POST" });
}

export function updateVendorCategory(
  id: string,
  payload: { name?: string; active?: boolean }
): Promise<VendorCategory> {
  return api(`/api/par/vendors/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteVendorCategory(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/categories/${id}`, { method: "DELETE" });
}

// ─── Director + fișă ──────────────────────────────────────────────────────────

export function listVendorDirectory(filters: {
  q?: string;
  category?: string;
  relationship?: string;
  minRating?: number;
  sort?: "name" | "paid" | "rating" | "recent";
  includeInactive?: boolean;
} = {}): Promise<{ vendors: VendorDirectoryItem[]; total: number }> {
  const qs = new URLSearchParams();
  if (filters.q) qs.set("q", filters.q);
  if (filters.category) qs.set("category", filters.category);
  if (filters.relationship) qs.set("relationship", filters.relationship);
  if (filters.minRating) qs.set("min_rating", String(filters.minRating));
  if (filters.sort) qs.set("sort", filters.sort);
  if (filters.includeInactive) qs.set("include_inactive", "1");
  const suffix = qs.toString() ? `?${qs}` : "";
  return api(`/api/par/vendors/directory${suffix}`);
}

export function getVendorProfile(id: string): Promise<VendorProfile> {
  return api(`/api/par/vendors/${id}/profile`);
}

export function setVendorCategories(id: string, categoryIds: string[]): Promise<{ ok: boolean; categoryIds: string[] }> {
  return api(`/api/par/vendors/${id}/categories`, {
    method: "PUT",
    body: JSON.stringify({ category_ids: categoryIds }),
  });
}

export function setVendorRelationship(
  id: string,
  payload: { relationship: VendorRelationship; blocked_reason?: string | null; website?: string | null; payment_terms_days?: number | null }
): Promise<unknown> {
  return api(`/api/par/vendors/${id}/relationship`, { method: "PATCH", body: JSON.stringify(payload) });
}

// ─── Evaluări ─────────────────────────────────────────────────────────────────

export function listVendorRatings(id: string): Promise<{ ratings: VendorRating[]; summary: VendorRatingSummary }> {
  return api(`/api/par/vendors/${id}/ratings`);
}

export interface RateVendorPayload {
  stars: number;
  par_id?: string | null;
  quality_stars?: number | null;
  timeliness_stars?: number | null;
  price_stars?: number | null;
  communication_stars?: number | null;
  comment?: string | null;
  would_use_again?: boolean | null;
}

export function rateVendor(id: string, payload: RateVendorPayload): Promise<VendorRating> {
  return api(`/api/par/vendors/${id}/ratings`, { method: "POST", body: JSON.stringify(payload) });
}

export function deleteVendorRating(ratingId: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/ratings/${ratingId}`, { method: "DELETE" });
}

export function listPendingRatings(): Promise<{ pending: PendingRating[] }> {
  return api("/api/par/vendors/pending-ratings");
}

/**
 * „Am întrebat despre cererea asta." Se apelează la DESCHIDEREA popup-ului, ca marcajul să existe
 * chiar dacă omul închide dialogul cu X sau dă refresh — vezi `@/lib/par/ratingPrompt`.
 */
export function markRatingAsked(parId: string): Promise<{ ok: boolean; marked: boolean }> {
  return api("/api/par/vendors/pending-ratings/asked", {
    method: "POST",
    body: JSON.stringify({ par_id: parId }),
  });
}

// ─── Note interne ─────────────────────────────────────────────────────────────

export function listVendorNotes(id: string): Promise<{ notes: VendorNote[] }> {
  return api(`/api/par/vendors/${id}/notes`);
}

export function addVendorNote(id: string, body: string, pinned = false): Promise<VendorNote> {
  return api(`/api/par/vendors/${id}/notes`, { method: "POST", body: JSON.stringify({ body, pinned }) });
}

export function deleteVendorNote(noteId: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/notes/${noteId}`, { method: "DELETE" });
}

// ─── Oferte ───────────────────────────────────────────────────────────────────

export function listVendorOffers(id: string): Promise<{ offers: VendorOffer[]; quotes: VendorQuoteOffer[] }> {
  return api(`/api/par/vendors/${id}/offers`);
}

export interface VendorOfferPayload {
  title: string;
  category_id?: string | null;
  amount_cents?: number | null;
  currency?: string;
  unit_label?: string | null;
  unit_price_cents?: number | null;
  offered_at?: string | null;
  valid_until?: string | null;
  status?: "received" | "accepted" | "rejected" | "expired";
  file_url?: string | null;
  file_name?: string | null;
  notes?: string | null;
}

export function addVendorOffer(id: string, payload: VendorOfferPayload): Promise<VendorOffer> {
  return api(`/api/par/vendors/${id}/offers`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateVendorOffer(offerId: string, payload: Partial<VendorOfferPayload>): Promise<VendorOffer> {
  return api(`/api/par/vendors/offers/${offerId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteVendorOffer(offerId: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/offers/${offerId}`, { method: "DELETE" });
}

// ─── Documente ────────────────────────────────────────────────────────────────

export function listVendorDocuments(id: string): Promise<{ documents: VendorDocument[] }> {
  return api(`/api/par/vendors/${id}/documents`);
}

export interface VendorDocumentPayload {
  kind?: "contract" | "certificat" | "licenta" | "polita" | "alt";
  title: string;
  number?: string | null;
  issued_at?: string | null;
  valid_until?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  notes?: string | null;
}

export function addVendorDocument(id: string, payload: VendorDocumentPayload): Promise<VendorDocument> {
  return api(`/api/par/vendors/${id}/documents`, { method: "POST", body: JSON.stringify(payload) });
}

export function deleteVendorDocument(docId: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/documents/${docId}`, { method: "DELETE" });
}
