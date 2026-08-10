// ETL Seed Script — سامانه مدیریت برنامه‌های سازمانی
// Reads both Excel files, builds the org hierarchy + dictionary, imports 165 programs & 1148 tasks.
// Run: bun run prisma/seed.ts
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { toGregorian, isValidJalaaliDate, jalaaliMonthLength } from "jalaali-js";

const db = new PrismaClient();

const PERSIAN_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

// ─── Normalization ───────────────────────────────────────────────────────────
function normalize(s: string): string {
  if (!s) return "";
  let r = String(s);
  r = r.replace(/\u200c/g, " "); // ZWNJ → space
  r = r.replace(/[\u064B-\u0652\u0670]/g, ""); // diacritics
  r = r.replace(/\u064A/g, "\u06CC"); // ي → ی
  r = r.replace(/\u0643/g, "\u06A9"); // ك → ک
  r = r.replace(/\u0623|\u0625/g, "\u0627"); // أإ → ا
  r = r.replace(/\u060C/g, "،"); // ensure Persian comma
  r = r.replace(/[\,\.\-\/_؛]/g, " "); // separators → space
  r = r.replace(/\s+/g, " ").trim();
  return r;
}

function isSep(ch: string): boolean {
  return !ch || ch === " " || ch === "،" || ch === "\n" || ch === "\t";
}

// Robust text extraction from any exceljs cell value.
// Handles: string, number, {richText:[{text}]}, {hyperlink,text}, {result,formula}, Date, boolean, null.
function cellText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text || "").join("");
    if (typeof v.text === "string") return v.text;
    if (typeof v.result !== "undefined") return cellText(v.result);
    if (typeof v.hyperlink === "string" && typeof v.text === "undefined") return v.hyperlink;
    if (v.error) return "";
    try { return JSON.stringify(v); } catch { return ""; }
  }
  return String(v);
}

// ─── Org Hierarchy Definition ────────────────────────────────────────────────
interface OrgNode {
  code: string;
  name: string;
  type: string;
  level: number;
  parentCode?: string;
  aliases?: string[];
}

const COMPANY = "بیمه تجارت‌نو";

const ORG_TREE: OrgNode[] = [
  { code: "CO", name: COMPANY, type: "COMPANY", level: 0 },

  // Deputies
  { code: "DEP-MARKET", name: "معاونت توسعه بازار و شبکه فروش", type: "DEPUTY", level: 1, parentCode: "CO",
    aliases: ["معاونت توسعه بازار", "توسعه بازار", "معاونت توسعه بازار و شبکه فروش"] },
  { code: "DEP-TECH", name: "معاونت فنی اموال و اشخاص", type: "DEPUTY", level: 1, parentCode: "CO" },
  { code: "DEP-FIN", name: "معاونت مالی و سرمایه‌گذاری", type: "DEPUTY", level: 1, parentCode: "CO" },
  { code: "DEP-HR", name: "معاونت منابع انسانی", type: "DEPUTY", level: 1, parentCode: "CO" },
  { code: "DEP-IT", name: "معاونت فناوری", type: "DEPUTY", level: 1, parentCode: "CO" },
  { code: "DEP-ORG", name: "معاونت سازمان و پشتیبانی", type: "DEPUTY", level: 1, parentCode: "CO" },

  // Market deputy children
  { code: "M-SHOBA", name: "امور شعب و نمایندگان", type: "MANAGEMENT", level: 2, parentCode: "DEP-MARKET",
    aliases: ["امور شعب", "امورشعب", "شعب", "نمایندگان", "مدیریت امور شعب", "مدیریت امور شعب و نمایندگان", "مدیریت امور شعبو نمایندگان", "امور شعب-معاونت توسعه بازار"] },
  { code: "M-MKT", name: "بازاریابی و مناقصات", type: "MANAGEMENT", level: 2, parentCode: "DEP-MARKET",
    aliases: ["بازاریابی", "مدیریت بازاریابی", "مدیریت بازریابی", "مناقصات", "منقصات", "بازاریابی-معاونت توسعه بازار"] },
  { code: "M-CUST", name: "امور مشتریان", type: "MANAGEMENT", level: 2, parentCode: "DEP-MARKET",
    aliases: ["امورمشتریان", "مشتریان"] },
  { code: "M-BANKINS", name: "مرکز بانک-بیمه", type: "MANAGEMENT", level: 2, parentCode: "DEP-MARKET",
    aliases: ["بانک بیمه", "بانک-بیمه", "بانک وبیمه", "مدیریت بانک وبیمه", "مدیریت بانک", "بانک"] },
  { code: "M-NEWBIZ", name: "کسب و کارهای نوین", type: "MANAGEMENT", level: 2, parentCode: "DEP-MARKET",
    aliases: ["کسب و کار", "کسب وکار", "کسب", "کار", "کارنوین", "کار نوین", "کارهای نوین", "نوآوری", "مرکز نوآوری"] },

  // Technical deputy children
  { code: "M-FIRE", name: "بیمه های آتش سوزی", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["آتش سوزی", "آتش‌سوزی"] },
  { code: "M-AUTO", name: "بیمه های اتومبیل", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["اتومبیل", "فنی اتومبیل", "مدیریت بیمه های اتومبیل", "مدیریت بیمه‌های اتومبیل", "مدیریت های اتومبیل"] },
  { code: "M-ENG", name: "بیمه های مهندسی و انرژی", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["مهندسی", "انرژی", "مدیرت مهندسی", "مدیریت مهندسی", "مدیریت مهندسی وانرژی"] },
  { code: "M-CARGO", name: "بیمه های باربری، هواپیما و کشتی", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["باربری", "هواپیما", "کشتی", "مدیریت باربری", "مدیریت بیمه های باربری کشتی و هواپیما"] },
  { code: "M-LIAB", name: "مسئولیت و طرح های خاص", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["مسئولیت", "مدیریت مسئولیت"] },
  { code: "M-HEALTH", name: "بیمه های عمر، حوادث و درمان", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["درمان", "مدیریت درمان", "حوادث", "عمر حوادث درمان"] },
  { code: "M-LIFE", name: "بیمه های عمر و سرمایه گذاری", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["عمر و سرمایه گذاری", "عمر وسرمایه گذاری", "عمر", "مدیریت عمر", "مدیریت بیمه های عمر", "مدیریت  بیمه های عمر", "بیمه های عمروسرمایه گذاری", "مدیریت بیمه های عمروسرمایه گذاری"] },
  { code: "M-REINS", name: "بیمه های اتکائی و بین الملل", type: "MANAGEMENT", level: 2, parentCode: "DEP-TECH",
    aliases: ["اتکائی", "اتکایی", "مدیریت اتکائی", "مدیریت اتکایی", "اتکایی و امور بین الملل", "اتکایی و اموربین الملل"] },

  // Finance deputy children
  { code: "M-FIN", name: "امور مالی", type: "MANAGEMENT", level: 2, parentCode: "DEP-FIN",
    aliases: ["مالی", "مدیریت مالی", "امور مالی"] },
  { code: "M-INVEST", name: "مدیریت سرمایه گذاری", type: "MANAGEMENT", level: 2, parentCode: "DEP-FIN",
    aliases: ["سرمایه گذاری", "مدیریت  سرمایه گذاری", "مدیریت سرمایه گذاری", "سرمایه گذاری "] },
  { code: "M-AUDIT", name: "حسابرسی داخلی", type: "MANAGEMENT", level: 2, parentCode: "DEP-FIN",
    aliases: ["حسابرسی", "حسابرسی داخلی", "تطبیق مقررات", "مدیریت حسابرسی داخلی", "مدیریت حسابرسی داخلی و تطبیق مقررات"] },

  // HR deputy children
  { code: "M-HR", name: "منابع انسانی", type: "MANAGEMENT", level: 2, parentCode: "DEP-HR",
    aliases: ["سرمایه انسانی", "مدیریت منابع انسانی"] },
  { code: "M-TRAIN", name: "آموزش", type: "MANAGEMENT", level: 2, parentCode: "DEP-HR",
    aliases: ["اموزش", "اداره آموزش", "واحد آموزش"] },

  // IT deputy
  { code: "M-IT", name: "فناوری اطلاعات", type: "MANAGEMENT", level: 2, parentCode: "DEP-IT",
    aliases: ["فاوا", "آی تی", "ای تی", "IT", "فن آوری اطلاعات", "فناروری اطلاعات", "مدیریت فناوری اطلاعات", "معاونت فناوری اطلاعات", "اطلاعات", "مالی IT", "نمایندگان IT"] },

  // Org & support deputy children
  { code: "M-PLAN", name: "طرح و برنامه", type: "MANAGEMENT", level: 2, parentCode: "DEP-ORG",
    aliases: ["طرح", "طرح برنامه", "مدیرت طرح و برنامه", "مدیریت طرح", "مدیریت طرح وبرنامه", "مدیریت طرح و برنامه", "برنامه"] },
  { code: "M-ORG", name: "تشکیلات و روشها", type: "MANAGEMENT", level: 2, parentCode: "DEP-ORG",
    aliases: ["تشکیلات", "روش ها", "روش\u200cها", "مدیریت تشکیلات", "مدیریت تشکیلات‌وروش‌ها", "مدیریت تشکیلات و روش ها", "مدیریت تشکیل روش ها", "مدیرت تشکیلات و روش ها"] },
  { code: "M-SUPP", name: "پشتیبانی", type: "MANAGEMENT", level: 2, parentCode: "DEP-ORG",
    aliases: ["مدیریت پشتیبانی", "مدیریت پیشتیبانی", "مدیریت پشتیبانی _فن آوری"] },
  { code: "M-PR", name: "روابط عمومی و ارتباطات", type: "MANAGEMENT", level: 2, parentCode: "DEP-ORG",
    aliases: ["روابط عمومی", "مدیریت روابط عمومی"] },
  { code: "M-SEC", name: "حراست", type: "MANAGEMENT", level: 2, parentCode: "DEP-ORG",
    aliases: [] },

  // Standalone (report to company)
  { code: "M-LEGAL", name: "حقوقی و امور قراردادها", type: "MANAGEMENT", level: 2, parentCode: "CO",
    aliases: ["حقوقی", "امور حقوقی", "مدیریت حقوقی", "امور قراردادها", "قراردادها", "مدیریت‌های حقوقی", "حقوقی-امور حقوقی و قرارداد ها"] },
  { code: "M-RISK", name: "ریسک و اکچوئری", type: "MANAGEMENT", level: 2, parentCode: "CO",
    aliases: ["ریسک", "مدیریت ریسک", "اکچوئری", "اکچوئر رسمی", "اکچووری"] },
  { code: "M-INSP", name: "بازرسی و پیگیریهای ویژه", type: "MANAGEMENT", level: 2, parentCode: "CO",
    aliases: ["بازرسی", "مدیریت بازرسی", "بازرسی ویژه", "مدیریت بازرسی ویژه", "پیگیری", "پیگیری های ویژه", "پیگیری ویژه", "مدیریت بازرسی وحقوقی", "بازرسی-بازرسی ویژه و پیگیری"] },
  { code: "M-AML", name: "مبارزه با پولشویی و تامین مالی تروریسم", type: "MANAGEMENT", level: 2, parentCode: "CO",
    aliases: ["پولشویی", "مبارزه با پولشویی", "مدیریت مبارزه با پولشویی", "واحد مبارزه با پولشویی", "تأمین مالی تروریسم", "واحد مبارزه با پولشویی_ واحد آموزش", "تأمین مالی تروریسم_ مدیریت فناوری اطلاعات", "تأمین مالی تروریسم_ مدیریت\u200cتشکیلات", "واحد مبارزه با پولشویی و تاًمین مالی تروریسم", "مبارزه با پولشویی-مبارزه با پولشویی تامین مالی و تروریسم"] },

  // Special: "all managements" / generic references
  { code: "G-ALL", name: "تمامی مدیریت‌های ستادی", type: "GROUP", level: 3, parentCode: "CO",
    aliases: ["تمامی مدیریت ها", "تمامی مدیریت های ستادی", "کلیه مدیریت ها", "کلیه مدیریت\u200cها", "سایر مدیریت ها", "مدیریت\u200cها", "مدیریت‌های فنی", "مدیریت های فنی", "مدیران فنی", "فنی", "مدیرت های فنی", "مدیریتهای فنی", "حوزه مدیرعامل", "حوزه مدیر عامل"] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function j2g(jy: number, jm: number, jd: number): Date {
  const g = toGregorian(jy, jm, jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, 12, 0, 0));
}

function parseJalaliDate(s: string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!s) return null;
  const cleaned = String(s).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const m = cleaned.match(/(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    const jy = +m[1], jm = +m[2], jd = +m[3];
    if (isValidJalaaliDate(jy, jm, jd)) return { jy, jm, jd };
  }
  // "اردیبهشت 1405" style → first day of that month
  const yearMatch = cleaned.match(/(\d{4})/);
  const jy = yearMatch ? +yearMatch[1] : 1405;
  for (let i = 0; i < PERSIAN_MONTHS.length; i++) {
    if (cleaned.includes(PERSIAN_MONTHS[i])) {
      return { jy, jm: i + 1, jd: 1 };
    }
  }
  return null;
}

function endOfJalaliMonth(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

// ─── Dictionary-driven greedy matcher ────────────────────────────────────────
let aliasIndex: { aliasNorm: string; orgCode: string }[] = [];

function buildAliasIndex(orgMap: Map<string, string>) {
  aliasIndex = [];
  for (const node of ORG_TREE) {
    const orgId = orgMap.get(node.code)!;
    // canonical name + displayName as alias
    const names = new Set<string>([node.name, ...node.aliases || []]);
    for (const n of names) {
      const norm = normalize(n);
      if (norm) aliasIndex.push({ aliasNorm: norm, orgCode: node.code });
    }
  }
  // Add canonical names from the synonym file (merged with our aliases)
  // sort longest first for greedy matching
  aliasIndex.sort((a, b) => b.aliasNorm.length - a.aliasNorm.length);
}

function matchOrgs(raw: string): { orgCode: string; alias: string }[] {
  if (!raw) return [];
  const norm = normalize(raw);
  let remaining = norm;
  const found: { orgCode: string; alias: string }[] = [];
  const matchedRanges: [number, number][] = [];

  for (const { aliasNorm, orgCode } of aliasIndex) {
    let idx = remaining.indexOf(aliasNorm);
    while (idx !== -1) {
      const before = idx === 0 ? " " : remaining[idx - 1];
      const afterIdx = idx + aliasNorm.length;
      const after = afterIdx >= remaining.length ? " " : remaining[afterIdx];
      if (isSep(before) && isSep(after)) {
        // check no overlap
        const overlaps = matchedRanges.some(([s, e]) => idx < e && afterIdx > s);
        if (!overlaps) {
          found.push({ orgCode, alias: aliasNorm });
          matchedRanges.push([idx, afterIdx]);
        }
      }
      idx = remaining.indexOf(aliasNorm, idx + 1);
    }
  }
  // dedupe by orgCode (keep first)
  const seen = new Set<string>();
  return found.filter((f) => {
    if (seen.has(f.orgCode)) return false;
    seen.add(f.orgCode);
    return true;
  });
}

// ─── Main ETL ────────────────────────────────────────────────────────────────
async function main() {
  console.log("🧹 Cleaning database...");
  await db.taskProgressHistory.deleteMany();
  await db.projectProgressHistory.deleteMany();
  await db.taskDependency.deleteMany();
  await db.taskUnit.deleteMany();
  await db.task.deleteMany();
  await db.projectUnit.deleteMany();
  await db.project.deleteMany();
  await db.rawProgramRow.deleteMany();
  await db.rawSheetImport.deleteMany();
  await db.importBatch.deleteMany();
  await db.unitDictionary.deleteMany();
  await db.dictionaryTerm.deleteMany();
  await db.statusDictionary.deleteMany();
  await db.auditLog.deleteMany();
  await db.organization.deleteMany();
  await db.user.deleteMany();

  // 1. Default admin user
  const admin = await db.user.create({
    data: { email: "admin@pmo.local", name: "مدیر سیستم", role: "ADMIN" },
  });

  // 2. Status dictionary
  const statuses = [
    { code: "NOT_STARTED", name: "شروع نشده", color: "slate", entity: "TASK" },
    { code: "IN_PROGRESS", name: "در حال اجرا", color: "teal", entity: "TASK" },
    { code: "COMPLETED", name: "تکمیل شده", color: "emerald", entity: "TASK" },
    { code: "DELAYED", name: "تأخیر در اجرا", color: "rose", entity: "TASK" },
    { code: "ON_HOLD", name: "متوقف", color: "amber", entity: "TASK" },
    { code: "CANCELLED", name: "لغو شده", color: "zinc", entity: "TASK" },
  ];
  for (const s of statuses) {
    await db.statusDictionary.create({ data: { statusCode: s.code, statusName: s.name, entityType: s.entity, color: s.color } });
  }

  // 3. Build org tree
  console.log("🏢 Building organization hierarchy...");
  const orgIdByCode = new Map<string, string>();
  // create root first
  for (const node of ORG_TREE) {
    const parentOrgId = node.parentCode ? orgIdByCode.get(node.parentCode) : null;
    const org = await db.organization.create({
      data: {
        code: node.code,
        name: node.name,
        displayName: node.name,
        orgType: node.type,
        level: node.level,
        parentOrgId: parentOrgId || null,
        responsibleId: admin.id,
        isActive: true,
        createdBy: admin.id,
      },
    });
    orgIdByCode.set(node.code, org.id);
  }
  console.log(`   Created ${ORG_TREE.length} org nodes`);

  // 4. Build UnitDictionary
  console.log("📖 Building unit dictionary...");
  let dictCount = 0;
  for (const node of ORG_TREE) {
    const orgId = orgIdByCode.get(node.code)!;
    const names = new Set<string>([node.name, ...node.aliases || []]);
    for (const n of names) {
      const norm = normalize(n);
      try {
        await db.unitDictionary.create({
          data: {
            canonicalOrgId: orgId,
            originalName: n,
            normalizedName: norm,
            aliasType: n === node.name ? "CANONICAL" : "ALIAS",
            source: "EXCEL",
            confidence: 1.0,
            isActive: true,
          },
        });
        dictCount++;
      } catch { /* unique constraint skip */ }
    }
  }
  console.log(`   Created ${dictCount} dictionary entries`);

  buildAliasIndex(orgIdByCode);

  // 5. Read synonym file → augment dictionary
  console.log("📚 Reading synonym file...");
  const synWb = new ExcelJS.Workbook();
  await synWb.xlsx.readFile("/home/z/my-project/upload/نام نظیر مدیریت ها.xlsx");
  const synWs = synWb.getWorksheet("Sheet1")!;
  let synCount = 0;
  synWs.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const canonicalRaw = cellText(row.getCell(1).value).trim();
    const aliasesRaw = cellText(row.getCell(2).value).trim();
    if (!canonicalRaw) return;
    // find canonical org by matching canonical name
    const matched = matchOrgs(canonicalRaw);
    if (matched.length === 0) return;
    const orgId = orgIdByCode.get(matched[0].orgCode)!;
    // add canonical
    const aliases = aliasesRaw ? aliasesRaw.split("-").map((s) => s.trim()).filter(Boolean) : [];
    for (const a of [canonicalRaw, ...aliases]) {
      const norm = normalize(a);
      db.unitDictionary.upsert({
        where: { canonicalOrgId_originalName: { canonicalOrgId: orgId, originalName: a } },
        create: { canonicalOrgId: orgId, originalName: a, normalizedName: norm, aliasType: "SYNONYM", source: "EXCEL", confidence: 1.0 },
        update: {},
      }).then(() => { synCount++; }).catch(() => {});
    }
  });
  await new Promise((r) => setTimeout(r, 500));
  console.log(`   Augmented with synonym file entries`);

  // 6. Read main Excel
  console.log("📊 Reading main programs Excel...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/home/z/my-project/upload/(v27-1) برنامه عملیاتی های 1405.xlsx");
  console.log(`   ${wb.worksheets.length} sheets found`);

  // Create import batch
  const batch = await db.importBatch.create({
    data: { fileName: "(v27-1) برنامه عملیاتی های 1405.xlsx", batchLabel: "برنامه‌های عملیاتی ۱۴۰۵", status: "RUNNING" },
  });

  const AS_OF_MONTH = 7; // مهر 1405 = "today" for progress simulation
  const AS_OF_JY = 1405;
  let projectCount = 0;
  let taskCount = 0;
  let progressCount = 0;
  const unmappedExecutors = new Set<string>();

  for (const ws of wb.worksheets) {
    const sheetName = ws.name;
    // Skip the summary/index sheets
    if (sheetName.includes("معاونت ها") || sheetName.includes("اکسل")) continue;

    // Determine layout by scanning row 6
    const colMap: Record<string, number> = {};
    const monthCols: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const v6 = cellText(ws.getCell(6, c).value);
      if (v6) {
        const s = v6.toString();
        if (s.includes("رديف") || s.includes("ردیف")) colMap.row_no = c;
        else if (s.includes("شرح عملیات") || s.includes("اقدامات")) colMap.task_desc = c;
        else if (s.includes("وزن هر عملیات")) colMap.weight = c;
        else if (s.includes("واحدهای مجری")) colMap.executors = c;
        else if (s.includes("هدف کمی")) colMap.target = c;
        else if (s.includes("پیش‌نیازی") || s.includes("پیش نیازی")) colMap.prereq = c;
        else if (s.includes("زمان اجراي") || s.includes("زمان اجرای")) colMap.time_block_start = c;
        else if (s.includes("ملاحظات")) colMap.notes = c;
      }
      const v7 = cellText(ws.getCell(7, c).value);
      if (v7) {
        const s = v7.toString().trim();
        if (PERSIAN_MONTHS.includes(s)) monthCols[s] = c;
      }
    }
    if (!colMap.task_desc) continue;

    // Parse project metadata
    const r3 = cellText(ws.getCell(3, 1).value);
    const r4 = cellText(ws.getCell(4, 1).value);
    const r5 = cellText(ws.getCell(5, 1).value);

    // Strip any leading "N- عنوان پروژه/برنامه :" or "N- مدیر پروژه :" prefix.
    const stripPrefix = (s: string) =>
      s.replace(/^\s*\d+\s*[-–]\s*(عنوان پروژه|عنوان برنامه|مدیر پروژه|هدف برنامه)\s*[:：]?\s*/, "").trim();

    // A line is "manager text" if it (after strip) still contains مدیر/واحد keywords typical of owner lines.
    const looksLikeManager = (s: string) =>
      /(مدیر\s*پروژه|واحد\s*مبارزه|مدیریت\s+\S)/.test(s);

    let projectTitle = stripPrefix(r3);
    let managerRaw = stripPrefix(r4);
    let programTitle = stripPrefix(r5);

    // If programTitle looks like a manager line (row-shifted Variant B), drop it.
    if (!programTitle || looksLikeManager(r5) || /^\s*\d+\s*[-–]\s*مدیر/.test(r5)) {
      programTitle = "";
    }
    // If projectTitle looks like a manager line, it's mis-extracted — clear it.
    if (looksLikeManager(r3) || /^\s*\d+\s*[-–]\s*مدیر/.test(r3)) {
      projectTitle = "";
    }
    // Prefer programTitle for display when both exist and projectTitle is just the project (higher-level) name.
    const displayName = (programTitle || projectTitle || sheetName).trim();

    let programNum: number | null = null;
    let weight: number | null = null;
    let startRaw: string | null = null;
    let endRaw: string | null = null;
    let goal: string | null = null;
    for (let r = 3; r <= 5; r++) {
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = cellText(ws.getCell(r, c).value);
        if (!v) continue;
        let m;
        if ((m = v.match(/شماره برنامه[:\s]*([0-9]+)/)) && programNum === null) programNum = +m[1];
        if (v.includes("وزن") && v.includes("برنامه")) {
          m = v.match(/وزن\s*برنامه[:\s]*([0-9]+)/);
          if (m) weight = +m[1];
        }
        if (v.includes("شروع")) {
          m = v.match(/شروع[:\s]*([^|]+)/);
          if (m) startRaw = m[1].trim();
        }
        if (v.includes("خاتمه")) {
          m = v.match(/خاتمه[:\s]*([^|]+)/);
          if (m) endRaw = m[1].trim();
        }
        if (v.includes("هدف برنامه")) {
          m = v.match(/هدف برنامه[:\s]*([^|]+)/);
          if (m) goal = m[1].trim();
        }
      }
    }

    const startJ = parseJalaliDate(startRaw) || { jy: 1405, jm: 1, jd: 1 };
    const endJ = parseJalaliDate(endRaw) || { jy: 1405, jm: 12, jd: 29 };
    // if start parsed only month-day=1 but end parsed month → set end to last day
    const endJd = endJ.jd === 1 && endRaw && !endRaw.includes("/") ? endOfJalaliMonth(endJ.jy, endJ.jm) : endJ.jd;
    const startDate = j2g(startJ.jy, startJ.jm, startJ.jd);
    const endDate = j2g(endJ.jy, endJ.jm, endJd);
    const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));

    // Map owner management (from managerRaw, fallback to sheet name)
    let ownerOrgId: string | null = null;
    const ownerMatch = matchOrgs(managerRaw);
    if (ownerMatch.length > 0) {
      ownerOrgId = orgIdByCode.get(ownerMatch[0].orgCode)!;
    } else {
      // fallback: match sheet name (strip trailing digits)
      const sheetBase = sheetName.replace(/\d+\s*$/, "").trim();
      const sm = matchOrgs(sheetBase);
      if (sm.length > 0) ownerOrgId = orgIdByCode.get(sm[0].orgCode)!;
    }

    // Sheet sequence number
    const sheetSeqMatch = sheetName.match(/(\d+)\s*$/);
    const sheetSeq = sheetSeqMatch ? +sheetSeqMatch[1] : (programNum || 1);

    const ownerCode = ownerMatch[0]?.orgCode || "UNK";
    const projectCode = `PRG-1405-${ownerCode}-${sheetSeq}-${sheetName.replace(/\s+/g, "")}`;

    // Create raw sheet import
    const rawSheet = await db.rawSheetImport.create({
      data: {
        batchId: batch.id,
        sheetName,
        rowCount: 0,
        projectTitle,
        managerRaw,
        programTitle,
        programNum,
        weight: weight || 100,
        startDateRaw: startRaw,
        endDateRaw: endRaw,
        goalRaw: goal,
        status: "IMPORTED",
      },
    });

    // Create project
    const project = await db.project.create({
      data: {
        projectCode,
        projectName: displayName,
        programTitle,
        projectType: "PROGRAM",
        ownerOrgId,
        goal,
        year: 1405,
        programNumber: programNum || sheetSeq,
        startDate,
        endDate,
        startJalali: `${startJ.jy}/${String(startJ.jm).padStart(2,"0")}/${String(startJ.jd).padStart(2,"0")}`,
        endJalali: `${endJ.jy}/${String(endJ.jm).padStart(2,"0")}/${String(endJd).padStart(2,"0")}`,
        plannedDuration: durationDays,
        status: "IN_PROGRESS",
        priority: "NORMAL",
        overallWeight: weight || 100,
        progressPercent: 0,
        createdBy: admin.id,
      },
    });
    await db.rawSheetImport.update({ where: { id: rawSheet.id }, data: { mappedProjectId: project.id } });

    // Link owner as primary project unit
    if (ownerOrgId) {
      await db.projectUnit.create({
        data: { projectId: project.id, orgId: ownerOrgId, roleType: "OWNER", isPrimary: true, participationPercent: 100, responsibilityWeight: weight || 100 },
      });
    }

    // Iterate task rows
    const tasks: { id: string; weight: number; activeMonths: number[]; startJm: number; endJm: number; actualByNow: number; delayFactor: number }[] = [];
    let rawRowCount = 0;
    for (let r = 8; r <= ws.rowCount; r++) {
      const rowNoVal = colMap.row_no ? cellText(ws.getCell(r, colMap.row_no).value) : null;
      const taskDesc = colMap.task_desc ? cellText(ws.getCell(r, colMap.task_desc).value) : null;
      if (!taskDesc && !rowNoVal) continue;
      const taskName = (taskDesc?.toString() || "").trim();
      if (!taskName) continue;

      const weightVal = colMap.weight ? Number(cellText(ws.getCell(r, colMap.weight).value)) || 0 : 0;
      const executorsRaw = colMap.executors ? cellText(ws.getCell(r, colMap.executors).value).trim() : "";
      const target = colMap.target ? cellText(ws.getCell(r, colMap.target).value).trim() : "";
      const prereq = colMap.prereq ? cellText(ws.getCell(r, colMap.prereq).value).trim() : "";
      const notes = colMap.notes ? cellText(ws.getCell(r, colMap.notes).value).trim() : "";

      // active months
      const activeMonths: number[] = [];
      for (let mi = 0; mi < PERSIAN_MONTHS.length; mi++) {
        const mc = monthCols[PERSIAN_MONTHS[mi]];
        if (mc) {
          const v = cellText(ws.getCell(r, mc).value);
          if (v.trim() !== "") activeMonths.push(mi + 1);
        }
      }
      const activeMonthsJson = JSON.stringify(activeMonths);

      // task date range: from active months (or project dates)
      let tStartJm = activeMonths.length ? Math.min(...activeMonths) : startJ.jm;
      let tEndJm = activeMonths.length ? Math.max(...activeMonths) : endJ.jm;
      const tStart = j2g(1405, tStartJm, 1);
      const tEnd = j2g(1405, tEndJm, endOfJalaliMonth(1405, tEndJm));
      const tDuration = Math.max(1, Math.round((tEnd.getTime() - tStart.getTime()) / 86400000));

      // Map executor orgs
      const execMatches = matchOrgs(executorsRaw);
      if (executorsRaw && execMatches.length === 0) unmappedExecutors.add(executorsRaw);

      // Simulate progress
      const plannedByNow = computePlannedProgress(activeMonths, tStartJm, tEndJm, AS_OF_MONTH);
      const delayFactor = 0.78 + (taskName.length % 20) / 100; // deterministic pseudo-random 0.78..0.98
      const actualByNow = activeMonths.length ? Math.round(plannedByNow * delayFactor) : Math.round((weightVal > 0 ? 50 : 30) * delayFactor);
      const taskStatus = actualByNow >= 100 ? "COMPLETED" : actualByNow > 0 ? "IN_PROGRESS" : "NOT_STARTED";

      // Save raw row
      const rawRowData: Record<string, any> = {};
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = cellText(ws.getCell(r, c).value);
        if (v) rawRowData[`col_${c}`] = v;
      }
      const rawRow = await db.rawProgramRow.create({
        data: {
          sheetImportId: rawSheet.id,
          rowNumber: r,
          rawJson: JSON.stringify(rawRowData),
          rowNoRaw: rowNoVal?.toString() || "",
          taskDesc: taskName,
          weight: weightVal || null,
          executorsRaw,
          target,
          prereq,
          notes,
          activeMonthsRaw: activeMonthsJson,
          mappingStatus: execMatches.length > 0 || !executorsRaw ? "MAPPED" : "UNMAPPED",
        },
      });

      const task = await db.task.create({
        data: {
          projectId: project.id,
          taskCode: `T-${String(tasks.length + 1).padStart(3, "0")}`,
          taskName,
          taskType: "ACTIVITY",
          sequenceNo: tasks.length + 1,
          weight: weightVal || 0,
          progressPercent: actualByNow,
          status: taskStatus,
          startDate: tStart,
          endDate: tEnd,
          startJalali: `1405/${String(tStartJm).padStart(2,"0")}/01`,
          endJalali: `1405/${String(tEndJm).padStart(2,"0")}/${String(endOfJalaliMonth(1405, tEndJm)).padStart(2,"0")}`,
          duration: tDuration,
          isMilestone: false,
          target,
          prereq,
          notes,
          activeMonths: activeMonthsJson,
          createdBy: admin.id,
        },
      });
      await db.rawProgramRow.update({ where: { id: rawRow.id }, data: { mappedTaskId: task.id } });
      tasks.push({ id: task.id, weight: weightVal || 0, activeMonths, startJm: tStartJm, endJm: tEndJm, actualByNow, delayFactor });
      taskCount++;

      // Link executor orgs
      for (const em of execMatches) {
        const orgId = orgIdByCode.get(em.orgCode)!;
        await db.taskUnit.create({
          data: { taskId: task.id, orgId, roleType: "EXECUTOR", isPrimary: em.orgCode === (ownerMatch[0]?.orgCode) },
        });
      }
      // Also link owner if no executor matched
      if (execMatches.length === 0 && ownerOrgId) {
        await db.taskUnit.create({ data: { taskId: task.id, orgId: ownerOrgId, roleType: "OWNER", isPrimary: true } });
      }
      // Link owner as collaborator if not already in exec list
      if (ownerOrgId && !execMatches.some((e) => e.orgCode === ownerMatch[0]?.orgCode)) {
        await db.projectUnit.upsert({
          where: { projectId_orgId_roleType: { projectId: project.id, orgId: ownerOrgId, roleType: "OWNER" } },
          create: { projectId: project.id, orgId: ownerOrgId, roleType: "OWNER", isPrimary: true, participationPercent: 100 },
          update: {},
        });
      }

      // Generate monthly progress history
      const histRecords = [];
      for (let mo = 1; mo <= 12; mo++) {
        const planned = computePlannedProgress(activeMonths, tStartJm, tEndJm, mo);
        const actual = mo <= AS_OF_MONTH ? Math.round(planned * delayFactor) : 0;
        const reportDate = j2g(1405, mo, endOfJalaliMonth(1405, mo));
        histRecords.push({
          taskId: task.id,
          orgId: ownerOrgId,
          reportDate,
          reportJalali: `1405/${String(mo).padStart(2,"0")}/${String(endOfJalaliMonth(1405, mo)).padStart(2,"0")}`,
          progressPercent: actual,
          plannedProgressPercent: planned,
          actualProgressPercent: actual,
          comment: mo <= AS_OF_MONTH ? "ثبت پیشرفت ماهانه" : "پیش‌بینی",
          recordedById: admin.id,
        });
      }
      await db.taskProgressHistory.createMany({ data: histRecords });
      progressCount += histRecords.length;

      rawRowCount++;
    }
    await db.rawSheetImport.update({ where: { id: rawSheet.id }, data: { rowCount: rawRowCount } });
    projectCount++;

    // Compute project weighted progress
    const totalW = tasks.reduce((s, t) => s + t.weight, 0);
    const progSum = tasks.reduce((s, t) => s + t.weight * t.actualByNow, 0);
    const projectProgress = totalW > 0 ? progSum / totalW : 0;
    await db.project.update({ where: { id: project.id }, data: { progressPercent: Math.round(projectProgress * 10) / 10 } });

    // project progress history (monthly rollup)
    const projHist = [];
    for (let mo = 1; mo <= 12; mo++) {
      const planned = tasks.length ? tasks.reduce((s, t) => {
        const tw = t.weight;
        const tp = computePlannedProgress(t.activeMonths, t.startJm, t.endJm, mo);
        return s + tw * tp;
      }, 0) / (totalW || 1) : 0;
      const actual = mo <= AS_OF_MONTH ? tasks.reduce((s, t) => {
        const tw = t.weight;
        const tp = computePlannedProgress(t.activeMonths, t.startJm, t.endJm, mo);
        return s + tw * tp * t.delayFactor;
      }, 0) / (totalW || 1) : 0;
      const reportDate = j2g(1405, mo, endOfJalaliMonth(1405, mo));
      projHist.push({
        projectId: project.id,
        reportDate,
        reportJalali: `1405/${String(mo).padStart(2,"0")}/${String(endOfJalaliMonth(1405, mo)).padStart(2,"0")}`,
        progressPercent: Math.round(actual * 10) / 10,
        plannedProgressPercent: Math.round(planned * 10) / 10,
      });
    }
    await db.projectProgressHistory.createMany({ data: projHist });
  }

  await db.importBatch.update({ where: { id: batch.id }, data: { finishedAt: new Date(), sheetsProcessed: projectCount, rowsProcessed: taskCount, status: "DONE" } });

  console.log("\n" + "=".repeat(70));
  console.log("✅ ETL COMPLETE");
  console.log(`   Projects: ${projectCount}`);
  console.log(`   Tasks: ${taskCount}`);
  console.log(`   Progress records: ${progressCount}`);
  console.log(`   Unmapped executor strings: ${unmappedExecutors.size}`);
  if (unmappedExecutors.size > 0 && unmappedExecutors.size < 30) {
    console.log("   Sample unmapped:");
    [...unmappedExecutors].slice(0, 20).forEach((u) => console.log(`     • ${u}`));
  }
  console.log("=".repeat(70));
}

function computePlannedProgress(activeMonths: number[], startJm: number, endJm: number, asOfMonth: number): number {
  if (activeMonths.length === 0) {
    if (asOfMonth < startJm) return 0;
    if (asOfMonth >= endJm) return 100;
    const span = endJm - startJm + 1;
    const done = asOfMonth - startJm + 1;
    return Math.round((done / span) * 100);
  }
  const span = activeMonths.length;
  const done = activeMonths.filter((m) => m <= asOfMonth).length;
  return Math.round((done / span) * 100);
}


main()
  .then(() => db.$disconnect())
  .catch((e) => { console.error(e); db.$disconnect(); process.exit(1); });
