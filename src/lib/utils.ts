import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safe JSON prettifier used when reading tag contents.
 */
export function prettyJson(raw: string): { pretty: string; error: string | null } {
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), error: null };
  } catch (e) {
    return { pretty: raw, error: String(e) };
  }
}