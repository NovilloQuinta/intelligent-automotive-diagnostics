import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a ratio to [0, 1] for gauge percentage displays. */
export function clampPct(ratio: number): number {
  return Math.min(1, Math.max(0, ratio));
}
