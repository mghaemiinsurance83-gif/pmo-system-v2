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

// ─── Hand-curated aliases keyed by canonical management name ─────────────────
// Keys MUST match the management names in the "معاونت ها ومدیریت های زیرمجموعه"
// sheet exactly. These augment the synonym file (نام نظیر مدیریت ها.xlsx) for
// robust executor matching when importing task rows.
const MANAGEMENT_ALIASES: Record<string, string[]> = {
  "امور شعب و نمایندگان": ["امور شعب", "امورشعب", "شعب", "نمایندگان", "مدیریت امور شعب", "مدیریت امور شعب و نمایندگان", "مدیریت امور شعبو نمایندگان", "امور شعب-معاونت توسعه بازار"],
  "بازاریابی و مناقصات": ["بازاریابی", "مدیریت بازاریابی", "مدیریت بازریابی", "مناقصات", "منقصات", "بازاریابی-معاونت توسعه بازار"],
  "امور مشتریان": ["امورمشتریان", "مشتریان"],
  "مرکز بانک - بیمه": ["بانک بیمه", "بانک-بیمه", "بانک وبیمه", "مدیریت بانک وبیمه", "مدیریت بانک", "بانک"],
  "کسب و کارهای نوین": ["کسب و کار", "کسب وکار", "کسب", "کار", "کارنوین", "کار نوین", "کارهای نوین", "نوآوری", "مرکز نوآوری"],
  "بیمه های آتش سوزی": ["آتش سوزی", "آتش‌سوزی"],
  "بیمه های اتومبیل": ["اتومبیل", "فنی اتومبیل", "مدیریت بیمه های اتومبیل", "مدیریت بیمه‌های اتومبیل", "مدیریت های اتومبیل"],
  "بیمه های مهندسی و انرژی": ["مهندسی", "انرژی", "مدیرت مهندسی", "مدیریت مهندسی", "مدیریت مهندسی وانرژی"],
  "بیمه های باربری، هواپیما و کشتی": ["باربری", "هواپیما", "کشتی", "مدیریت باربری", "مدیریت بیمه های باربری کشتی و هواپیما"],
  "مسئولیت و طرح های خاص": ["مسئولیت", "مدیریت مسئولیت"],
  "بیمه های عمر، حوادث و درمان": ["درمان", "مدیریت درمان", "حوادث", "عمر حوادث درمان"],
  "بیمه های عمر و سرمایه گذاری": ["عمر و سرمایه گذاری", "عمر وسرمایه گذاری", "عمر", "مدیریت عمر", "مدیریت بیمه های عمر", "مدیریت  بیمه های عمر", "بیمه های عمروسرمایه گذاری", "مدیریت بیمه های عمروسرمایه گذاری"],
  "بیمه های اتکائی و بین الملل": ["اتکائی", "اتکایی", "مدیریت اتکائی", "مدیریت اتکایی", "اتکایی و امور بین الملل", "اتکایی و اموربین الملل"],
  "امور مالی": ["مالی", "مدیریت مالی", "امور مالی"],
  "مدیریت سرمایه گذاری": ["سرمایه گذاری", "مدیریت  سرمایه گذاری", "مدیریت سرمایه گذاری", "سرمایه گذاری "],
  "حسابرسی داخلی": ["حسابرسی", "حسابرسی داخلی", "تطبیق مقررات", "مدیریت حسابرسی داخلی", "مدیریت حسابرسی داخلی و تطبیق مقررات"],
  "منابع انسانی": ["سرمایه انسانی", "مدیریت منابع انسانی"],
  "آموزش": ["اموزش", "اداره آموزش", "واحد آموزش"],
  "فناوری اطلاعات": ["فاوا", "آی تی", "ای تی", "IT", "فن آوری اطلاعات", "فناروری اطلاعات", "مدیریت فناوری اطلاعات", "معاونت فناوری اطلاعات", "اطلاعات", "مالی IT", "نمایندگان IT"],
  "طرح و برنامه": ["طرح", "طرح برنامه", "مدیرت طرح و برنامه", "مدیریت طرح", "مدیریت طرح وبرنامه", "مدیریت طرح و برنامه", "برنامه"],
  "تشکیلات و روشها": ["تشکیلات", "روش ها", "روش\u200cها", "مدیریت تشکیلات", "مدیریت تشکیلات‌وروش‌ها", "مدیریت تشکیلات و روش ها", "مدیریت تشکیل روش ها", "مدیرت تشکیلات و روش ها"],
  "پشتیبانی": ["مدیریت پشتیبانی", "مدیریت پیشتیبانی", "مدیریت پشتیبانی _فن آوری"],
  "روابط عمومی و ارتباطات": ["روابط عمومی", "مدیریت روابط عمومی"],
  "حراست": [],
  "حقوقی و امور قراردادها": ["حقوقی", "امور حقوقی", "مدیریت حقوقی", "امور قراردادها", "قراردادها", "مدیریت‌های حقوقی", "حقوقی-امور حقوقی و قرارداد ها"],
  "ریسک و اکچوئری": ["ریسک", "مدیریت ریسک", "اکچوئری", "اکچوئر رسمی", "اکچووری"],
  "بازرسی و پیگیریهای ویژه": ["بازرسی", "مدیریت بازرسی", "بازرسی ویژه", "مدیریت بازرسی ویژه", "پیگیری", "پیگیری های ویژه", "پیگیری ویژه", "مدیریت بازرسی وحقوقی", "بازرسی-بازرسی ویژه و پیگیری"],
  "مبارزه با پولشویی و تامین مالی تروریسم": ["پولشویی", "مبارزه با پولشویی", "مدیریت مبارزه با پولشویی", "واحد مبارزه با پولشویی", "تأمین مالی تروریسم", "واحد مبارزه با پولشویی_ واحد آموزش", "تأمین مالی تروریسم_ مدیریت فناوری اطلاعات", "تأمین مالی تروریسم_ مدیریت\u200cتشکیلات", "واحد مبارزه با پولشویی و تاًمین مالی تروریسم", "مبارزه با پولشویی-مبارزه با پولشویی تامین مالی و تروریسم"],
};

// Generic catch-all aliases that don't map to a single real management
// (e.g. "تمامی مدیریت‌ها", "مدیریت‌های فنی", "حوزه مدیرعامل").
const GENERIC_GROUP_ALIASES: string[] = ["تمامی مدیریت ها", "تمامی مدیریت های ستادی", "کلیه مدیریت ها", "کلیه مدیریت\u200cها", "سایر مدیریت ها", "مدیریت\u200cها", "مدیریت‌های فنی", "مدیریت های فنی", "مدیران فنی", "فنی", "مدیرت های فنی", "مدیریتهای فنی", "حوزه مدیرعامل", "حوزه مدیر عامل"];

interface OrgGroup { name: string; managements: string[] }

// Read the org structure from the "معاونت ها ومدیریت های زیرمجموعه" sheet.
// Column A = deputy/section header (blank cell = continuation of previous),
// Column B = management name. The header "مدیریت های مستقل" marks the start of
// independent managements that are NOT under any deputy (they report directly
// to the company).
function readOrgStructure(wb: ExcelJS.Workbook): { deputies: OrgGroup[]; independents: string[] } {
  const ws = wb.getWorksheet("معاونت ها ومدیریت های زیرمجموعه");
  if (!ws) throw new Error('Sheet "معاونت ها ومدیریت های زیرمجموعه" not found in workbook');
  const deputies: OrgGroup[] = [];
  const independents: string[] = [];
  let current: OrgGroup | null = null;
  let independentMode = false;
  // exceljs repeats the master value for every row inside a merged range, so we
  // deduplicate by tracking the previous value and only reacting to changes.
  let prevA = "";
  let prevB = "";
  for (let r = 2; r <= ws.rowCount; r++) {
    const a = cellText(ws.getCell(r, 1).value).trim();
    const b = cellText(ws.getCell(r, 2).value).trim();
    const aChanged = a !== "" && a !== prevA;
    const bChanged = b !== "" && b !== prevB;
    if (aChanged) {
      if (a.includes("مستقل")) {
        independentMode = true;
        current = null;
      } else {
        independentMode = false;
        current = { name: a, managements: [] };
        deputies.push(current);
      }
    }
    if (bChanged) {
      if (independentMode) {
        if (!independents.includes(b)) independents.push(b);
      } else if (current) {
        if (!current.managements.includes(b)) current.managements.push(b);
      }
    }
    prevA = a;
    prevB = b;
  }
  return { deputies, independents };
}

// Build the flat ORG_TREE list (codes + parent links) from the parsed structure.
// Hierarchy: Company → Deputy → Management, plus independent Managements that
// report directly to the Company. A generic GROUP node is appended for catch-all
// executor references ("تمامی مدیریت‌ها", …).
function buildOrgTreeData(structure: { deputies: OrgGroup[]; independents: string[] }): OrgNode[] {
  const tree: OrgNode[] = [];
  tree.push({ code: "CO", name: COMPANY, type: "COMPANY", level: 0 });
  let depIdx = 1;
  let mIdx = 1;
  for (const dep of structure.deputies) {
    const depCode = `DEP-${String(depIdx).padStart(2, "0")}`;
    // "مرکز فناوری و نوآوری" is a center at the deputy level.
    const depType = dep.name.startsWith("مرکز") ? "CENTER" : "DEPUTY";
    tree.push({ code: depCode, name: dep.name, type: depType, level: 1, parentCode: "CO" });
    depIdx++;
    for (const m of dep.managements) {
      const mCode = `M-${String(mIdx).padStart(3, "0")}`;
      tree.push({ code: mCode, name: m, type: "MANAGEMENT", level: 2, parentCode: depCode, aliases: MANAGEMENT_ALIASES[m] || [] });
      mIdx++;
    }
  }
  // Independent managements → directly under the company (no deputy parent)
  for (const m of structure.independents) {
    const mCode = `M-${String(mIdx).padStart(3, "0")}`;
    tree.push({ code: mCode, name: m, type: "MANAGEMENT", level: 1, parentCode: "CO", aliases: MANAGEMENT_ALIASES[m] || [] });
    mIdx++;
  }
  // Generic group node for catch-all executor references
  tree.push({ code: "G-ALL", name: "تمامی مدیریت‌های ستادی", type: "GROUP", level: 1, parentCode: "CO", aliases: GENERIC_GROUP_ALIASES });
  return tree;
}

let ORG_TREE: OrgNode[] = [];

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

  // 3. Read main Excel & build org tree from the structure sheet
  console.log("📊 Reading main programs Excel...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/home/z/my-project/upload/(v27-1) برنامه عملیاتی های 1405.xlsx");
  console.log(`   ${wb.worksheets.length} sheets found`);

  console.log("🏢 Building organization hierarchy from structure sheet...");
  const orgStructure = readOrgStructure(wb);
  ORG_TREE = buildOrgTreeData(orgStructure);
  const depMgts = orgStructure.deputies.reduce((s, d) => s + d.managements.length, 0);
  console.log(`   ${orgStructure.deputies.length} deputies, ${depMgts} managements under deputies, ${orgStructure.independents.length} independent managements`);

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

  // 6. Import program sheets (workbook already read in step 3)
  console.log("📊 Importing program sheets...");

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

    // ── Adaptive layout detection ──────────────────────────────────────────
    // Two known layouts exist in the workbook:
    //   Variant A/B (most sheets): header row=6, month row=7, tasks start row=8,
    //     metadata in rows 3(title)/4(manager)/5(program).
    //   Variant C ("کسب و کار" sheets): rows 2-3 are a merged banner; metadata in
    //     rows 4(title)/5(manager)/6(program); header row=7, month row=8,
    //     tasks start row=9.
    // We detect the header row by scanning rows 4..9 for a row that contains both
    // "ردیف"/"رديف" and ("شرح عملیات" or "اقدامات"). Month row and first task
    // row follow from the detected header row.
    let headerRow = 6;
    for (let r = 4; r <= 9; r++) {
      let hasRowNo = false, hasTaskDesc = false;
      for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
        const v = cellText(ws.getCell(r, c).value).toString();
        if (v.includes("رديف") || v.includes("ردیف")) hasRowNo = true;
        if (v.includes("شرح عملیات") || v.includes("اقدامات")) hasTaskDesc = true;
      }
      if (hasRowNo && hasTaskDesc) { headerRow = r; break; }
    }
    const monthRow = headerRow + 1;
    const firstTaskRow = headerRow + 2;

    const colMap: Record<string, number> = {};
    const monthCols: Record<string, number> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const vh = cellText(ws.getCell(headerRow, c).value);
      if (vh) {
        const s = vh.toString();
        if (s.includes("رديف") || s.includes("ردیف")) colMap.row_no = c;
        else if (s.includes("شرح عملیات") || s.includes("اقدامات")) colMap.task_desc = c;
        else if (s.includes("وزن هر عملیات")) colMap.weight = c;
        else if (s.includes("واحدهای مجری")) colMap.executors = c;
        else if (s.includes("هدف کمی")) colMap.target = c;
        else if (s.includes("پیش‌نیازی") || s.includes("پیش نیازی")) colMap.prereq = c;
        else if (s.includes("زمان اجراي") || s.includes("زمان اجرای")) colMap.time_block_start = c;
        else if (s.includes("ملاحظات")) colMap.notes = c;
      }
      const vm = cellText(ws.getCell(monthRow, c).value);
      if (vm) {
        const s = vm.toString().trim();
        if (PERSIAN_MONTHS.includes(s)) monthCols[s] = c;
      }
    }
    if (!colMap.task_desc) continue;

    // Detect metadata rows by keyword (scan col A of rows 2..7).
    let titleRow = 0, managerRow = 0, programRow = 0;
    for (let r = 2; r <= 7; r++) {
      const v = cellText(ws.getCell(r, 1).value).toString();
      if (/عنوان\s*پروژه/.test(v) && !titleRow) titleRow = r;
      if (/مدیر\s*پروژه/.test(v) && !managerRow) managerRow = r;
      if (/عنوان\s*برنامه/.test(v) && !programRow) programRow = r;
    }
    if (!titleRow) titleRow = 3;
    if (!managerRow) managerRow = titleRow + 1;
    if (!programRow) programRow = managerRow + 1;

    // Parse project metadata from the detected rows
    const rTitle = cellText(ws.getCell(titleRow, 1).value);
    const rManager = cellText(ws.getCell(managerRow, 1).value);
    const rProgram = cellText(ws.getCell(programRow, 1).value);

    // Strip any leading "N- عنوان پروژه/برنامه :" or "N- مدیر پروژه :" prefix.
    const stripPrefix = (s: string) =>
      s.replace(/^\s*\d+\s*[-–]\s*(عنوان پروژه|عنوان برنامه|مدیر پروژه|هدف برنامه)\s*[:：]?\s*/, "").trim();

    // A line is "manager text" if it (after strip) still contains مدیر/واحد keywords typical of owner lines.
    const looksLikeManager = (s: string) =>
      /(مدیر\s*پروژه|واحد\s*مبارزه|مدیریت\s+\S)/.test(s);

    let projectTitle = stripPrefix(rTitle);
    let managerRaw = stripPrefix(rManager);
    let programTitle = stripPrefix(rProgram);

    // If programTitle looks like a manager line (row-shifted Variant B), drop it.
    if (!programTitle || looksLikeManager(rProgram) || /^\s*\d+\s*[-–]\s*مدیر/.test(rProgram)) {
      programTitle = "";
    }
    // If projectTitle looks like a manager line, it's mis-extracted — clear it.
    if (looksLikeManager(rTitle) || /^\s*\d+\s*[-–]\s*مدیر/.test(rTitle)) {
      projectTitle = "";
    }
    // Prefer programTitle for display when both exist and projectTitle is just the project (higher-level) name.
    const displayName = (programTitle || projectTitle || sheetName).trim();

    let programNum: number | null = null;
    let weight: number | null = null;
    let startRaw: string | null = null;
    let endRaw: string | null = null;
    let goal: string | null = null;
    for (let r = 2; r <= 7; r++) {
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
    for (let r = firstTaskRow; r <= ws.rowCount; r++) {
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

  // ── Seed system settings (single-source reference date) ─────────────────
  // The reference date (تاریخ مرجع) = "today" for the system. Seeded to مهر ۱۴۰۵
  // (AS_OF_MONTH=7) so the simulated progress data and the dynamic status
  // computations agree. Editable later via /api/system/settings.
  await db.systemSetting.upsert({
    where: { key: "operationalYear" },
    create: { key: "operationalYear", value: "1405", dataType: "number", description: "سال عملیاتی" },
    update: { value: "1405" },
  });
  await db.systemSetting.upsert({
    where: { key: "referenceDate" },
    create: { key: "referenceDate", value: "1405/07/15", dataType: "string", description: "تاریخ مرجع گزارش (تاریخ امروز سیستم)" },
    update: { value: "1405/07/15" },
  });
  console.log(`   System reference date: 1405/07/15 (مهر ۱۴۰۵)`);

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
