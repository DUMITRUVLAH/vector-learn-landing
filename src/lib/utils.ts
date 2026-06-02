import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an amount in cents to a human-readable RON string, e.g. 150000 → "1.500,00 RON" */
export function formatCents(cents: number, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export const PASTEL_CYCLE = [
  "pastel-mint",
  "pastel-lavender",
  "pastel-peach",
  "pastel-sky",
  "pastel-rose",
  "pastel-lemon",
  "pastel-teal",
] as const;
