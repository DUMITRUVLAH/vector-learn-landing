import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
