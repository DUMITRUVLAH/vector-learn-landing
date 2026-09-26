/**
 * COMMS-301 — utilitare comune adaptoarelor: HMAC, comparare în timp constant, fetch cu timeout.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { FetchLike } from "./types";

/** Comparație în timp constant; lungimi diferite = fals (fără scurgere prin durată). */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/** Segment aleator pentru URL-ul de webhook / verify token: 48 caractere hex. */
export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

/** Timeout implicit pentru orice apel la furnizor — un API care atârnă nu are voie să țină o funcție Vercel. */
export const PROVIDER_TIMEOUT_MS = 15_000;

export const defaultFetch: FetchLike = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });

/** Citește JSON fără să arunce pe un corp gol sau HTML (proxy-uri, pagini de eroare). */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

export function str(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  return null;
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Previzualizare scurtă pentru lista de conversații. */
export function preview(text: string | null | undefined, fallback: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return (t || fallback).slice(0, 280);
}
