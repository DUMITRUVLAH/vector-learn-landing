import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely — later classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
