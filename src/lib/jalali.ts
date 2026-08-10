import { toGregorian, toJalaali, isValidJalaaliDate, jalaaliMonthLength as jMonthLen } from "jalaali-js";

export const PERSIAN_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const PERSIAN_MONTHS_SHORT = [
  "فرو",
  "ارد",
  "خرد",
  "تیر",
  "مرد",
  "شهر",
  "مهر",
  "آبا",
  "آذر",
  "دی",
  "بهم",
  "اسف",
] as const;

export const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert any number/string to Persian digits. */
export function toFa(input: number | string | null | undefined): string {
  if (input === null || input === undefined) return "—";
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Format a percent value (0-100) in Persian with % sign. */
export function faPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const v = Math.round(value * 10) / 10;
  return `${toFa(v)}٪`;
}

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

/** Parse a Jalali date string like "1405/03/01" or "1405/3/1". Returns null if invalid. */
export function parseJalaliString(s: string | null | undefined): JalaliDate | null {
  if (!s) return null;
  const cleaned = String(s).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  const m = cleaned.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  return { jy, jm, jd };
}

/**
 * Parse a Persian month name + year from strings like "اردیبهشت 1405" or "فروردین 1405".
 */
export function parseJalaliMonthYear(s: string | null | undefined): { jy: number; jm: number } | null {
  if (!s) return null;
  const cleaned = String(s).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
  const yearMatch = cleaned.match(/(\d{4})/);
  if (!yearMatch) return null;
  const jy = Number(yearMatch[1]);
  let jm = 0;
  for (let i = 0; i < PERSIAN_MONTHS.length; i++) {
    if (cleaned.includes(PERSIAN_MONTHS[i])) {
      jm = i + 1;
      break;
    }
  }
  if (jm === 0) return null;
  return { jy, jm };
}

/** Convert Jalali to Gregorian Date (at noon to avoid tz issues). */
export function jalaliToGregorian(j: JalaliDate): Date {
  const g = toGregorian(j.jy, j.jm, j.jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0));
}

/** Convert Gregorian Date to Jalali. */
export function gregorianToJalali(d: Date): JalaliDate {
  const j = toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { jy: j.jy, jm: j.jm, jd: j.jd };
}

/** Days in a given Jalali month. */
export function jalaliMonthLength(jy: number, jm: number): number {
  return jMonthLen(jy, jm);
}

/** Format Jalali date as "1405/03/01" (Persian digits). */
export function formatJalali(j: JalaliDate | null | undefined): string {
  if (!j) return "—";
  const mm = String(j.jm).padStart(2, "0");
  const dd = String(j.jd).padStart(2, "0");
  return toFa(`${j.jy}/${mm}/${dd}`);
}

/** Format Jalali date as "اردیبهشت ۱۴۰۵". */
export function formatJalaliMonthYear(jy: number, jm: number): string {
  return `${PERSIAN_MONTHS[jm - 1]} ${toFa(jy)}`;
}

/**
 * Given a start month index (1-12) and end month index within a Jalali year,
 * return list of month indices covered (inclusive).
 */
export function monthRange(startMonth: number, endMonth: number): number[] {
  if (startMonth <= endMonth) {
    const r: number[] = [];
    for (let i = startMonth; i <= endMonth; i++) r.push(i);
    return r;
  }
  // wraps around year (e.g., start=10, end=2)
  const r: number[] = [];
  for (let i = startMonth; i <= 12; i++) r.push(i);
  for (let i = 1; i <= endMonth; i++) r.push(i);
  return r;
}

/** Status color mapping helper (Tailwind classes). */
export function statusColor(status: string | null | undefined): {
  badge: string;
  dot: string;
  bar: string;
} {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "COMPLETED":
    case "تکمیل شده":
      return {
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        dot: "bg-emerald-500",
        bar: "bg-emerald-500",
      };
    case "IN_PROGRESS":
    case "در حال اجرا":
      return {
        badge: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
        dot: "bg-teal-500",
        bar: "bg-teal-500",
      };
    case "DELAYED":
    case "تأخیر":
      return {
        badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
        dot: "bg-rose-500",
        bar: "bg-rose-500",
      };
    case "ON_HOLD":
    case "متوقف":
      return {
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
        dot: "bg-amber-500",
        bar: "bg-amber-500",
      };
    case "CANCELLED":
    case "لغو شده":
      return {
        badge: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
        dot: "bg-zinc-400",
        bar: "bg-zinc-400",
      };
    case "NOT_STARTED":
    case "شروع نشده":
    default:
      return {
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        dot: "bg-slate-400",
        bar: "bg-slate-400",
      };
  }
}
