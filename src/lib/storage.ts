import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const STORAGE_ROOT =
  process.env.STORAGE_ROOT || path.join(process.cwd(), "storage", "documents");

export interface SavedFile {
  storedFileName: string;
  storagePath: string;
  sizeBytes: number;
}

/**
 * Save an uploaded file to disk with a hashed name.
 * Structure: /storage/documents/{yyyy}/{mm}/{taskId}_{timestamp}_{random}.{ext}
 */
export async function saveFile(
  file: File | Blob,
  taskId: string
): Promise<SavedFile> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = path.join(STORAGE_ROOT, String(yyyy), mm);
  await fs.mkdir(dir, { recursive: true });

  const name = file instanceof File ? file.name : "blob";
  const ext = name.split(".").pop()?.toLowerCase() || "bin";
  const random = crypto.randomBytes(8).toString("hex");
  const storedFileName = `${taskId}_${now.getTime()}_${random}.${ext}`;
  const storagePath = path.join(dir, storedFileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(storagePath, buffer);

  return {
    storedFileName,
    storagePath,
    sizeBytes: buffer.length,
  };
}

/**
 * Soft-delete a file (rename to .deleted extension).
 * Physical deletion only by admin maintenance.
 */
export async function markFileDeleted(storagePath: string): Promise<void> {
  try {
    await fs.rename(storagePath, storagePath + ".deleted");
  } catch {
    // file may already be gone
  }
}

/**
 * Read a file for download.
 */
export async function readFile(storagePath: string): Promise<Buffer> {
  return fs.readFile(storagePath);
}

/**
 * Validate file type by extension and MIME.
 */
const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "xlsx", "xls", "doc", "docx"];
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return "نوع فایل مجاز نیست (فقط PDF, JPG, PNG, Excel, Word)";
  }
  if (!ALLOWED_MIMES.includes(file.type)) {
    return "نوع فایل مجاز نیست";
  }
  if (file.size > MAX_SIZE) {
    return "حجم فایل باید کمتر از ۱۰ مگابایت باشد";
  }
  return null;
}
