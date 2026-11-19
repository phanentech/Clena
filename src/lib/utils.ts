import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Tenant-aware money formatting — currency comes from the tenant, never hard-coded. */
export function formatMoney(amount: number | string | null | undefined, currency: string, opts: { decimals?: number; locale?: string } = {}) {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  const locale = opts.locale ?? "en-NG";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency", currency,
      maximumFractionDigits: opts.decimals ?? 2,
      minimumFractionDigits: opts.decimals === 0 ? 0 : undefined,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(locale)}`;
  }
}

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NG", opts).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Safe in-app redirect target (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/app/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Current time in ms. Server components render per request, so reading the clock here is intended. */
export function nowMs() {
  return Date.now();
}
