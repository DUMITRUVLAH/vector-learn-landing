/**
 * KINDER-001 — Client-side API helpers for /api/kinder
 */
import { api } from "../api";

export interface StudentCheckinStatus {
  studentId: string;
  fullName: string;
  birthDate: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  pickupPersonName: string | null;
  logId: string | null;
}

export interface TodayCheckinResponse {
  date: string;
  presentCount: number;
  total: number;
  students: StudentCheckinStatus[];
}

export interface AuthorizedPickup {
  id: string;
  name: string;
  relation: string | null;
  phone: string | null;
  isDefault: boolean;
  hasPin: boolean;
  createdAt: string;
}

export interface CheckinLogEntry {
  id: string;
  tenantId: string;
  studentId: string;
  logDate: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  pickupPersonName: string | null;
  notes: string | null;
}

export interface CheckinPayload {
  studentId: string;
  action: "in" | "out";
  pickupPersonName?: string;
  signatureDataUrl?: string;
  pin?: string;
  notes?: string;
}

export interface AddPickupPayload {
  name: string;
  relation?: string;
  phone?: string;
  pin?: string;
  isDefault?: boolean;
}

/** GET /api/kinder/checkin/today */
export function getTodayCheckin(): Promise<TodayCheckinResponse> {
  return api<TodayCheckinResponse>("/api/kinder/checkin/today");
}

/** POST /api/kinder/checkin */
export function recordCheckin(payload: CheckinPayload): Promise<{ ok: boolean; log: CheckinLogEntry }> {
  return api<{ ok: boolean; log: CheckinLogEntry }>("/api/kinder/checkin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /api/kinder/students/:id/pickups */
export function getStudentPickups(studentId: string): Promise<AuthorizedPickup[]> {
  return api<AuthorizedPickup[]>(`/api/kinder/students/${studentId}/pickups`);
}

/** POST /api/kinder/students/:id/pickups */
export function addPickup(
  studentId: string,
  payload: AddPickupPayload
): Promise<{ ok: boolean; pickup: AuthorizedPickup }> {
  return api<{ ok: boolean; pickup: AuthorizedPickup }>(
    `/api/kinder/students/${studentId}/pickups`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

/** DELETE /api/kinder/students/:id/pickups/:pickupId */
export function removePickup(studentId: string, pickupId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/kinder/students/${studentId}/pickups/${pickupId}`, {
    method: "DELETE",
  });
}

// ─── KINDER-002: Daily report / diary ─────────────────────────────────────────

export type DiaryEventType = "meal" | "nap" | "diaper" | "activity" | "photo" | "note";

export interface DiaryEvent {
  id: string;
  tenantId: string;
  studentId: string;
  eventDate: string;
  eventType: DiaryEventType;
  details: Record<string, unknown> | null;
  photoUrl: string | null;
  staffUserId: string | null;
  createdAt: string;
}

export interface DiaryResponse {
  date: string;
  studentId: string;
  events: DiaryEvent[];
}

export interface AddDiaryEventPayload {
  studentId: string;
  eventType: DiaryEventType;
  details?: Record<string, unknown>;
  photoUrl?: string;
}

/** GET /api/kinder/diary/:studentId?date=YYYY-MM-DD */
export function getDiary(studentId: string, date?: string): Promise<DiaryResponse> {
  const params = date ? `?date=${date}` : "";
  return api<DiaryResponse>(`/api/kinder/diary/${studentId}${params}`);
}

/** POST /api/kinder/diary */
export function addDiaryEvent(payload: AddDiaryEventPayload): Promise<{ ok: boolean; event: DiaryEvent }> {
  return api<{ ok: boolean; event: DiaryEvent }>("/api/kinder/diary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/kinder/diary/:eventId */
export function deleteDiaryEvent(eventId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/kinder/diary/${eventId}`, { method: "DELETE" });
}

// ─── KINDER-003: Staff-to-child ratio monitoring ──────────────────────────────

export type RatioStatus = "ok" | "warning" | "over" | "unconfigured";

export interface RoomRatioStatus {
  roomId: string;
  roomName: string;
  childrenCount: number;
  staffCount: number;
  ratioLimit: number | null;
  ageGroupLabel: string | null;
  status: RatioStatus;
}

export interface LiveRatioResponse {
  date: string;
  hasOverCapacity: boolean;
  rooms: RoomRatioStatus[];
}

export interface RatioLimit {
  id: string;
  tenantId: string;
  roomId: string;
  ageGroupLabel: string | null;
  maxChildrenPerStaff: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRatioLimitPayload {
  roomId: string;
  maxChildrenPerStaff: number;
  ageGroupLabel?: string;
}

/** GET /api/kinder/ratio/live */
export function getLiveRatio(): Promise<LiveRatioResponse> {
  return api<LiveRatioResponse>("/api/kinder/ratio/live");
}

/** GET /api/kinder/ratio/limits */
export function getRatioLimits(): Promise<RatioLimit[]> {
  return api<RatioLimit[]>("/api/kinder/ratio/limits");
}

/** POST /api/kinder/ratio/limits */
export function createRatioLimit(payload: CreateRatioLimitPayload): Promise<{ ok: boolean; limit: RatioLimit }> {
  return api<{ ok: boolean; limit: RatioLimit }>("/api/kinder/ratio/limits", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/kinder/ratio/limits/:id */
export function deleteRatioLimit(limitId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/kinder/ratio/limits/${limitId}`, { method: "DELETE" });
}

// ─── KINDER-004: Medical — allergies, immunizations, medication log ────────────

export type ReactionType = "mild" | "moderate" | "severe";

export interface ChildAllergy {
  id: string;
  studentId: string;
  allergen: string;
  reactionType: ReactionType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImmunizationRecord {
  id: string;
  studentId: string;
  vaccineName: string;
  administeredDate: string | null;
  nextDueDate: string | null;
  provider: string | null;
  notes: string | null;
  createdAt: string;
}

export interface MedicationLogEntry {
  id: string;
  studentId: string;
  logDate: string;
  medicationName: string;
  dosage: string;
  administeredAt: string;
  administeredByUserId: string | null;
  parentConsent: boolean;
  notes: string | null;
  createdAt: string;
}

export interface MedicalProfileResponse {
  allergies: ChildAllergy[];
  immunizations: ImmunizationRecord[];
  todayMedications: MedicationLogEntry[];
}

export type ImmunizationStatus = "overdue" | "due_soon" | "no_record";

export interface AtRiskStudent {
  studentId: string;
  fullName: string;
  status: ImmunizationStatus;
  vaccines: Array<{
    vaccineName: string;
    nextDueDate: string | null;
    administeredDate: string | null;
  }>;
}

export interface ImmunizationStatusResponse {
  atRisk: AtRiskStudent[];
  today: string;
  threshold: string;
}

/** GET /api/kinder/medical/:studentId */
export function getMedicalProfile(studentId: string): Promise<MedicalProfileResponse> {
  return api<MedicalProfileResponse>(`/api/kinder/medical/${studentId}`);
}

/** POST /api/kinder/medical/:studentId/allergies */
export function addAllergy(
  studentId: string,
  payload: { allergen: string; reactionType: ReactionType; notes?: string }
): Promise<ChildAllergy> {
  return api<ChildAllergy>(`/api/kinder/medical/${studentId}/allergies`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/kinder/medical/:studentId/allergies/:allergyId */
export function removeAllergy(studentId: string, allergyId: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(
    `/api/kinder/medical/${studentId}/allergies/${allergyId}`,
    { method: "DELETE" }
  );
}

/** POST /api/kinder/medical/:studentId/immunizations */
export function addImmunization(
  studentId: string,
  payload: {
    vaccineName: string;
    administeredDate?: string;
    nextDueDate?: string;
    provider?: string;
    notes?: string;
  }
): Promise<ImmunizationRecord> {
  return api<ImmunizationRecord>(`/api/kinder/medical/${studentId}/immunizations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** PUT /api/kinder/medical/:studentId/immunizations/:immId */
export function updateImmunization(
  studentId: string,
  immId: string,
  payload: Partial<{
    vaccineName: string;
    administeredDate: string;
    nextDueDate: string;
    provider: string;
    notes: string;
  }>
): Promise<ImmunizationRecord> {
  return api<ImmunizationRecord>(
    `/api/kinder/medical/${studentId}/immunizations/${immId}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
}

/** POST /api/kinder/medical/:studentId/medications */
export function logMedication(
  studentId: string,
  payload: {
    medicationName: string;
    dosage: string;
    administeredAt?: string;
    parentConsent?: boolean;
    notes?: string;
  }
): Promise<MedicationLogEntry> {
  return api<MedicationLogEntry>(`/api/kinder/medical/${studentId}/medications`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /api/kinder/immunization-status */
export function getImmunizationStatus(): Promise<ImmunizationStatusResponse> {
  return api<ImmunizationStatusResponse>("/api/kinder/immunization-status");
}

// ─── KINDER-005: Parent app feed + messaging ──────────────────────────────────

export type FeedItemType = "checkin" | "checkout" | "diary" | "message";

export interface FeedItem {
  type: FeedItemType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ParentFeedResponse {
  date: string;
  studentId: string;
  fullName: string;
  items: FeedItem[];
  totalMessages: number;
}

export type MessageDirection = "staff_to_parent" | "parent_to_staff";

export interface KinderMessage {
  id: string;
  tenantId: string;
  studentId: string;
  senderUserId: string | null;
  direction: MessageDirection;
  body: string;
  sentAt: string;
  readAt: string | null;
  createdAt: string;
}

/** GET /api/kinder/parent-feed/:studentId?date=YYYY-MM-DD */
export function getParentFeed(studentId: string, date?: string): Promise<ParentFeedResponse> {
  const params = date ? `?date=${date}` : "";
  return api<ParentFeedResponse>(`/api/kinder/parent-feed/${studentId}${params}`);
}

/** GET /api/kinder/messages/:studentId */
export function getKinderMessages(studentId: string): Promise<KinderMessage[]> {
  return api<KinderMessage[]>(`/api/kinder/messages/${studentId}`);
}

/** POST /api/kinder/messages/:studentId */
export function sendKinderMessage(
  studentId: string,
  payload: { body: string; direction: MessageDirection }
): Promise<KinderMessage> {
  return api<KinderMessage>(`/api/kinder/messages/${studentId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/kinder/messages/:studentId/:messageId/read */
export function markMessageRead(
  studentId: string,
  messageId: string
): Promise<{ ok: boolean; readAt: string }> {
  return api<{ ok: boolean; readAt: string }>(
    `/api/kinder/messages/${studentId}/${messageId}/read`,
    { method: "PATCH" }
  );
}
