import { db } from "@/lib/db";
import { toJalaali } from "jalaali-js";
import { parseJalaliString, type JalaliDate } from "@/lib/jalali";

// =============================================================================
// SYSTEM REFERENCE DATE (تاریخ مرجع)
// Single source of truth for "today" as the system sees it. All status / delay /
// as-of-progress computations read this. Seeded to مهر ۱۴۰۵ (the reporting as-of
// month the simulated progress data caps at). Editable via /api/system/settings.
// =============================================================================

let _cache: { ref: ReferenceDate; ts: number } | null = null;
const CACHE_TTL = 30_000; // 30s in-process cache

export interface ReferenceDate {
  jalali: string; // "1405/07/15"
  jy: number;
  jm: number; // 1..12
  jd: number;
  monthLabel: string; // "مهر ۱۴۰۵"
  operationalYear: number; // 1405
}

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function toFaDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** Build a ReferenceDate object from a Jalali "1405/07/15" string + operational year. */
function buildRef(jalaliStr: string, operationalYear: number): ReferenceDate {
  const j = parseJalaliString(jalaliStr);
  const jy = j?.jy ?? operationalYear;
  const jm = j?.jm ?? 7;
  const jd = j?.jd ?? 15;
  return {
    jalali: `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`,
    jy,
    jm,
    jd,
    monthLabel: `${PERSIAN_MONTHS[jm - 1]} ${toFaDigits(jy)}`,
    operationalYear,
  };
}

/**
 * Get the system reference date (cached briefly). Falls back to the real current
 * Jalali date if no setting is present, clamped into the operational year so the
 * 1405 demo always shows meaningful in-progress / delayed states.
 */
export async function getReferenceDate(): Promise<ReferenceDate> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.ref;

  const rows = await db.systemSetting.findMany({
    where: { key: { in: ["referenceDate", "operationalYear"] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const operationalYear = map.get("operationalYear") ? Number(map.get("operationalYear")) : 1405;
  let jalaliStr = map.get("referenceDate");

  if (!jalaliStr) {
    // Default: real today in Jalali, clamped to the operational year window.
    const now = new Date();
    const j = toJalaali(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
    // If real-today is outside the operational year, use mid-year (مهر) as the
    // reporting as-of date so the 1405 plan shows a realistic mix of states.
    if (j.jy !== operationalYear) {
      jalaliStr = `${operationalYear}/07/15`;
    } else {
      jalaliStr = `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
    }
  }

  const ref = buildRef(jalaliStr, operationalYear);
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
// "changing the reference date updates all reports" actually work.
// =============================================================================

export type DynamicStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";

/**
 * Compute the effective status given the reference month and the entity's schedule.
 *  - startMonth > refMonth  → NOT_STARTED (planned but not begun)
 *  - progress >= 100         → COMPLETED
 *  - endMonth < refMonth AND progress < 100 → DELAYED (should be done, isn't)
 *  - otherwise               → IN_PROGRESS
 *
 * `refMonth` is the reference month index (1..12) within the operational year.
 * Pass 0 (before year) → everything NOT_STARTED; pass 13 (after year) → DELAYED
 * for any incomplete item.
 */
export function computeDynamicStatus(
  progress: number,
  startMonth: number | null,
  endMonth: number | null,
  refMonth: number,
): DynamicStatus {
  if (progress >= 100) return "COMPLETED";
  if (refMonth <= 0) return "NOT_STARTED"; // before the operational year
  if (startMonth != null && startMonth > refMonth) return "NOT_STARTED";
  if (endMonth != null && endMonth < refMonth && progress < 100) return "DELAYED";
  if (refMonth >= 13 && progress < 100) return "DELAYED"; // year is over
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
