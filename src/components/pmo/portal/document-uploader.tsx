"use client";
import { useState, useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALLOWED = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".doc", ".docx"];
const MAX_MB = 10;

interface Props {
  taskId: string;
  onUploaded?: () => void;
}

export function DocumentUploader({ taskId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) { toast.error("نوع فایل مجاز نیست"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`حجم فایل باید کمتر از ${MAX_MB}MB باشد`); return; }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/portal/tasks/${taskId}/documents`, { method: "POST", body: fd, credentials: "include" });
      if (res.ok) { toast.success("مستند بارگذاری شد"); onUploaded?.(); }
      else { const e = await res.json(); toast.error(e.error?.message || "خطا در آپلود"); }
    } catch { toast.error("خطای شبکه"); }
    finally { setUploading(false); }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/50"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-1">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <UploadCloud className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">فایل را اینجا رها کنید یا کلیک کنید</p>
          <p className="text-[10px] text-muted-foreground/70">PDF, JPG, PNG, Excel, Word — حداکثر {MAX_MB}MB</p>
        </div>
      )}
    </div>
  );
}
