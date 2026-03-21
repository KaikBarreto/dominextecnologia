import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a string for search: trims, lowercases, and collapses multiple spaces.
 * Use `fuzzyIncludes(haystack, needle)` instead of `haystack.toLowerCase().includes(needle.toLowerCase())`.
 */
export function normalizeSearch(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks if `haystack` contains `needle`, ignoring extra spaces and trimming.
 * Also matches when spaces are removed (e.g. "daluz" matches "da luz").
 */
export function fuzzyIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack || !needle) return false;
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  if (!n) return true;
  // Normal match with normalized spaces
  if (h.includes(n)) return true;
  // Match ignoring all spaces (e.g. "daluz" matches "da luz")
  if (h.replace(/\s/g, '').includes(n.replace(/\s/g, ''))) return true;
  return false;
}
