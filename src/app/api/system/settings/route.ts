import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getReferenceDate, invalidateReferenceDateCache } from "@/lib/system";
import { parseJalaliString } from "@/lib/jalali";

// GET /api/system/settings — returns the reference date + operational year.
export async function GET() {
  const ref = await getReferenceDate();
  return NextResponse.json({
    referenceDate: ref.jalali,
    jy: ref.jy,
    jm: ref.jm,
    jd: ref.jd,
    monthLabel: ref.monthLabel,
    operationalYear: ref.operationalYear,
    monthIndex: ref.jm,
  });
}

// PUT /api/system/settings — update the reference date (تاریخ مرجع).
// Body: { referenceDate: "1405/07/15" }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = body?.referenceDate;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "referenceDate required" }, { status: 400 });
  }
  const j = parseJalaliString(raw);
  if (!j) {
    return NextResponse.json({ error: "invalid Jalali date (expected YYYY/MM/DD)" }, { status: 400 });
  }
  await db.systemSetting.upsert({
    where: { key: "referenceDate" },
    create: { key: "referenceDate", value: raw, dataType: "string", description: "تاریخ مرجع گزارش (تاریخ امروز سیستم)" },
    update: { value: raw },
  });
  invalidateReferenceDateCache();
  return NextResponse.json({ ok: true, referenceDate: raw });
}
