import { db } from "@/lib/db";
import { toJalaali } from "jalaali-js";
import { parseJalaliString, type JalaliDate } from "@/lib/jalali";

// =============================================================================
// SYSTEM REFERENCE DATE (تاریخ مرجع = "امروز سیستم")
// Single source of truth for "today" as the system sees it. By default this is
// the REAL current date in Asia/Tehran — it auto-updates every day (19 مرداد
// today, 20 مرداد tomorrow, …). An admin MAY override it via /api/system/settings
// to lock a specific reporting date; otherwise the live date is used. All status
// / delay / as-of-progress computations read this.
// =============================================================================

let _cache: { ref: ReferenceDate; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30s in-process cache

export interface ReferenceDate {
  jalali: string; // "1405/05/19"
  jy: number;
  jm: number; // 1..12
  jd: number; // 1..31
  monthLabel: string; // "مرداد ۱۴۰۵"
  dayLabel: string; // "۱۹ مرداد ۱۴۰۵" — full date with day
  longLabel: string; // "۱۹ مرداد ۱۴۰۵" (alias for clarity)
  operationalYear: number; // 1405
  isOverridden: boolean; // true when an admin has locked a specific date
}

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function toFaDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** Build a ReferenceDate object from a Jalali {jy,jm,jd} + operational year. */
function buildRefFromJ(jy: number, jm: number, jd: number, operationalYear: number, isOverridden: boolean): ReferenceDate {
  const monthLabel = `${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`;
  return {
    jalali: `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`,
    jy,
    jm,
    jd,
    monthLabel,
    dayLabel: `${toFaDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`,
    longLabel: `${toFaDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`,
    operationalYear,
    isOverridden,
  };
}

/** Build a ReferenceDate from a Jalali "1405/05/19" string + operational year. */
function buildRef(jalaliStr: string, operationalYear: number, isOverridden: boolean): ReferenceDate {
  const j = parseJalaliString(jalaliStr);
  const jy = j?.jy ?? operationalYear;
  const jm = j?.jm ?? 1;
  const jd = j?.jd ?? 1;
  return buildRefFromJ(jy, jm, jd, operationalYear, isOverridden);
}

/**
 * Get the current Gregorian date parts in Asia/Tehran timezone (not UTC).
 * Uses Intl.DateTimeFormat so it respects DST and the exact wall-clock date the
 * user sees on their machine in ایران.
 */
function getTehranNowGregorian(): { gy: number; gm: number; gd: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  return { gy: get("year"), gm: get("month"), gd: get("day") };
}

/**
 * Get the system reference date (cached briefly). Defaults to the REAL current
 * Jalali date in Asia/Tehran — auto-updates every day. Falls back to an admin
 * override stored in SystemSetting if one is present.
 */
export async function getReferenceDate(): Promise<ReferenceDate> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.ref;

  const rows = await db.systemSetting.findMany({
    where: { key: { in: ["referenceDate", "operationalYear"] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const operationalYear = map.get("operationalYear") ? Number(map.get("operationalYear")) : 1405;
  const override = map.get("referenceDate");

  let ref: ReferenceDate;
  if (override) {
    // Admin has locked a specific reporting date.
    ref = buildRef(override, operationalYear, true);
  } else {
    // Default: REAL today in Asia/Tehran (auto-updates each day).
    const g = getTehranNowGregorian();
    const j = toJalaali(g.gy, g.gm, g.gd);
    ref = buildRefFromJ(j.jy, j.jm, j.jd, operationalYear, false);
  }

  _cache = { ref, ts: Date.now() };
  return ref;
}

/** Sync helper (no cache) — use after an update. */
export function invalidateReferenceDateCache() {
  _cache = null;
}

// =============================================================================
// DYNAMIC STATUS COMPUTATION
// Derives the effective status of a project/task from the reference date and its
// schedule, rather than relying on the stale stored status. This is what makes
// "the reference date updating updates all reports" actually work.
// =============================================================================

export type DynamicStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";

/**
 * Compute the effective status given the reference month and the entity's schedule.
 *  - progress >= 100         → COMPLETED
 *  - startMonth > refMonth   → NOT_STARTED (planned but not begun)
 *  - endMonth < refMonth AND progress < 100 → DELAYED (should be done, isn't)
 *  - otherwise               → IN_PROGRESS
 *
 * `refMonth` is the reference month index (1..12) within the operational year.
 */
export function computeDynamicStatus(
  progress: number,
  startMonth: number | null,
  endMonth: number | null,
  refMonth: number,
): DynamicStatus {
  if (progress >= 100) return "COMPLETED";
  if (startMonth != null && startMonth > refMonth) return "NOT_STARTED";
  if (endMonth != null && endMonth < refMonth && progress < 100) return "DELAYED";
  return "IN_PROGRESS";
}

/** Extract a month index (1..12) from a Jalali "1405/03/01" string. */
export function monthFromJalali(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/\/(\d{1,2})\//);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 1 && v <= 12 ? v : null;
}

/** Human-readable Persian label for a dynamic status. */
export function statusLabelFa(s: DynamicStatus | string): string {
  switch (s) {
    case "NOT_STARTED": return "شروع نشده";
    case "IN_PROGRESS": return "در حال اجرا";
    case "COMPLETED": return "تکمیل شده";
    case "DELAYED": return "تأخیر";
    default: return s;
  }
}

export { toFaDigits, PERSIAN_MONTHS };
