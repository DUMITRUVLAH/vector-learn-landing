/**
 * COURSE-203 — Client-side API helpers for /api/promo-codes
 */
import { api } from "../api";

export type DiscountType = "percent" | "fixed";
export type PromoStatus = "active" | "expired" | "exhausted" | "disabled";

export interface PromoCode {
  id: string;
  tenantId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  status: PromoStatus;
  computedStatus: PromoStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoPayload {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxUses?: number | null;
  expiresAt?: string | null;
}

export interface ValidateResult {
  valid: true;
  id: string;
  discountType: DiscountType;
  discountValue: number;
  expiresAt: string | null;
  usesLeft: number | null;
}

export interface InvalidResult {
  valid: false;
  reason: "not_found" | "expired" | "exhausted" | "disabled";
}

export type ValidatePromoResult = ValidateResult | InvalidResult;

/** List all promo codes for the tenant. */
export async function listPromoCodes(): Promise<PromoCode[]> {
  const data = await api<{ items: PromoCode[] }>("/api/promo-codes");
  return data.items;
}

/** Create a new promo code. */
export async function createPromoCode(payload: CreatePromoPayload): Promise<PromoCode> {
  return api<PromoCode>("/api/promo-codes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Validate a promo code (by code string). */
export async function validatePromoCode(
  code: string
): Promise<ValidatePromoResult> {
  return api<ValidatePromoResult>(
    `/api/promo-codes/${encodeURIComponent(code.toUpperCase())}/validate`,
    { method: "POST" }
  );
}

/** Apply discount to an amount. Returns the discounted amount in cents. */
export function applyDiscount(
  amountCents: number,
  discountType: DiscountType,
  discountValue: number
): number {
  if (discountType === "percent") {
    const discount = Math.round(amountCents * (discountValue / 100));
    return Math.max(0, amountCents - discount);
  }
  // fixed cents
  return Math.max(0, amountCents - discountValue);
}
