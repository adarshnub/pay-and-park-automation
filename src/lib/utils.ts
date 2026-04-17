import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Locale used for check-in / check-out timestamps in the product UI. */
const PARK_DATETIME_LOCALE = "en-IN";

/**
 * Human-readable stay length: under 1 hour uses minutes only; from 1 hour up uses hours + minutes.
 * Examples: `45 min`, `1 hr`, `2 hr 15 min`.
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

/** Split ISO timestamp into a readable calendar line and a prominent clock line. */
export function formatCheckInDateTimeDisplay(iso: string): {
  dateLine: string;
  timeLine: string;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { dateLine: "—", timeLine: "—" };
  }
  return {
    dateLine: d.toLocaleDateString(PARK_DATETIME_LOCALE, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    timeLine: d.toLocaleTimeString(PARK_DATETIME_LOCALE, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  };
}
