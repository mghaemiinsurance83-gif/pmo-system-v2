"use client";
import { useState, useRef, useEffect } from "react";
import { UploadCloud, Loader2, X, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const ALLOWED = [".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".doc", ".docx"];
const MAX_MB = 10;

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

interface Props {
  taskId: string;
  defaultMonth?: number; // 1-12
  onUploaded?: () => void;
}

export function DocumentUploader({ taskId, defaultMonth, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [forMonth, setForMonth] = useState<string>(defaultMonth ? String(defaultMonth) : "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch default month from system settings if not provided
  useEffect(() => {
    if (defaultMonth) {
      setForMonth(String(defaultMonth));
      return;
    }
    fetch("/api/system/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((s) => {
        if (s.jm) setForMonth(String(s.jm));
      })
      .catch(() => {});
  }, [defaultMonth]);

  function pickFile(file: File) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) { toast.error("نوع فایل مجاز نیست"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`حجم فایل باید کمتر از ${MAX_MB}MB باشد`); return; }
    setSelectedFile(file);
    // Auto-fill title from filename if empty
    if (!title) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      setTitle(baseName);
    }
  }

  async function doUpload() {
    if (!selectedFile) return;
    if (!forMonth) {
      toast.error("ماه مربوط به مستند را انتخاب کنید");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("forMonth", forMonth);
    fd.append("title", title.trim());
    fd.append("description", description.trim());
    try {
      const res = await fetch(`/api/portal/tasks/${taskId}/documents`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (res.ok) {
        toast.success("مستند با موفقیت بارگذاری شد");
        setSelectedFile(null);
        setTitle("");
        setDescription("");
        onUploaded?.();
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error?.message || e.error || "خطا در آپلود");
      }
    } catch {
      toast.error("خطای شبکه");
    } finally {
      setUploading(false);
    }
  }

  function cancelSelection() {
    setSelectedFile(null);
    setTitle("");
    setDescription("");
  }

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) pickFile(f);
        }}
        onClick={() => !selectedFile && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
          selectedFile ? "border-primary/50 bg-muted/30 cursor-default" :
          dragOver ? "border-primary bg-primary/5 cursor-pointer" :
          "border-muted-foreground/30 hover:border-muted-foreground/50 cursor-pointer"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-1">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">در حال بارگذاری...</p>
          </div>
        ) : selectedFile ? (
          <div className="flex items-center gap-3 text-right">
            <FileText className="h-8 w-8 text-primary shrink-0" />
            <div className="min-w-0 flex-1 text-right">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB — برای تکمیل اطلاعات روی «ادامه» کلیک کنید
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={(e) => { e.stopPropagation(); }}
              className="shrink-0"
            >
              ادامه
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); cancelSelection(); }}
              className="shrink-0 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">فایل را اینجا رها کنید یا کلیک کنید</p>
            <p className="text-[10px] text-muted-foreground/70">PDF, JPG, PNG, Excel, Word — حداکثر {MAX_MB}MB</p>
          </div>
        )}
      </div>

      {/* Metadata dialog */}
      <Dialog open={!!selectedFile} onOpenChange={(open) => !open && cancelSelection()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              اطلاعات مستند
            </DialogTitle>
            <DialogDescription>
              قبل از بارگذاری، اطلاعات زیر را تکمیل کنید
            </DialogDescription>
          </DialogHeader>

          {selectedFile && (
            <div className="space-y-4">
              {/* File preview */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <FileText className="h-8 w-8 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              {/* Month selector */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  ماه گزارش <span className="text-destructive">*</span>
                </Label>
                <Select value={forMonth} onValueChange={setForMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="ماه را انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSIAN_MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  این مستند برای کدام ماه گزارش شده است؟
                </p>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="doc-title">عنوان مستند</Label>
                <Input
                  id="doc-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: گزارش پیشرفت گام X در مرداد"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="doc-desc">توضیحات (اختیاری)</Label>
                <Textarea
                  id="doc-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="توضیحات تکمیلی درباره محتوای فایل..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={cancelSelection}>انصراف</Button>
            <Button onClick={doUpload} disabled={uploading || !forMonth}>
              {uploading ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> در حال بارگذاری...</>
              ) : (
                <><UploadCloud className="h-4 w-4 ml-2" /> بارگذاری مستند</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
