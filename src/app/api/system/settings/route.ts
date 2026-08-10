import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReferenceDate, invalidateReferenceDateCache } from "@/lib/system";
import { parseJalaliString } from "@/lib/jalali";

// GET /api/system/settings — returns the reference date (تاریخ مرجع = امروز سیستم).
// By default this is the REAL current date in Asia/Tehran; an admin may override.
export async function GET() {
  const ref = await getReferenceDate();
  return NextResponse.json({
    referenceDate: ref.jalali,
    jy: ref.jy,
    jm: ref.jm,
    jd: ref.jd,
    monthLabel: ref.monthLabel, // "مرداد ۱۴۰۵"
    dayLabel: ref.dayLabel,     // "۱۹ مرداد ۱۴۰۵"
    longLabel: ref.longLabel,
    operationalYear: ref.operationalYear,
    monthIndex: ref.jm,
    isOverridden: ref.isOverridden,
  });
}

// PUT /api/system/settings — override the reference date (تاریخ مرجع).
// Body: { referenceDate: "1405/05/19" }  OR  { referenceDate: null } to clear
// the override and revert to the live current date.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = body?.referenceDate;

  // Clear override → revert to real today
  if (raw === null || raw === undefined || raw === "") {
    await db.systemSetting.deleteMany({ where: { key: "referenceDate" } });
    invalidateReferenceDateCache();
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (typeof raw !== "string") {
    return NextResponse.json({ error: "referenceDate required (string or null)" }, { status: 400 });
  }
  const j = parseJalaliString(raw);
  if (!j) {
    return NextResponse.json({ error: "invalid Jalali date (expected YYYY/MM/DD)" }, { status: 400 });
  }
  await db.systemSetting.upsert({
    where: { key: "referenceDate" },
    create: { key: "referenceDate", value: raw, dataType: "string", description: "تاریخ مرجع گزارش (لغو‌شدنی — پیش‌فرض امروز واقعی)" },
    update: { value: raw },
  });
  invalidateReferenceDateCache();
  return NextResponse.json({ ok: true, referenceDate: raw });
}
