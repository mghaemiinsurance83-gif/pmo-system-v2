"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Search, CheckCircle2, XCircle, Clock, Download, ChevronRight, ChevronLeft,
  Loader2, Filter, FileCheck, FileX, FileClock, AlertCircle, Building2, User as UserIcon,
} from "lucide-react";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

interface DocItem {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  forMonth: number | null;
  forJalali: string | null;
  title: string | null;
  description: string | null;
  approvalStatus: string;
  rejectionReason: string | null;
  uploadedAt: string;
  approvedAt: string | null;
  reviewedAt: string | null;
  task: {
    id: string; taskName: string; taskCode: string | null;
    progressPercent: number; status: string;
  };
  project: { id: string; projectName: string; projectCode: string };
  org: { id: string; name: string; displayName: string } | null;
  uploadedBy: { id: string; name: string; username: string } | null;
  approvedBy: { id: string; name: string; username: string } | null;
}

interface Summary {
  PENDING: number; APPROVED: number; REJECTED: number; ALL: number;
}

const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fa-IR", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  PENDING: { label: "در انتظار", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50", icon: FileClock },
  APPROVED: { label: "تأیید شده", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50", icon: FileCheck },
  REJECTED: { label: "رد شده", color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50", icon: FileX },
};

export function AdminDocuments() {
  const { toast } = useToast();
  const [items, setItems] = useState<DocItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ PENDING: 0, APPROVED: 0, REJECTED: 0, ALL: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewDoc, setReviewDoc] = useState<DocItem | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject">("approve");
  const [approvedPct, setApprovedPct] = useState(0);
  const [comment, setComment] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/documents?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setSummary(data.summary);
    } catch (e) {
      toast({ title: "خطا", description: "بارگذاری مستندات ناموفق بود", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [status, page, pageSize, search, toast]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { if (page !== 1) setPage(1); else fetchDocs(); }, 400);
    return () => clearTimeout(t);
  }, [search, page, fetchDocs]);

  const openApprove = (doc: DocItem) => {
    setReviewDoc(doc);
    setReviewMode("approve");
    setApprovedPct(doc.task.progressPercent || 0);
    setComment("");
    setRejectionReason("");
  };

  const openReject = (doc: DocItem) => {
    setReviewDoc(doc);
    setReviewMode("reject");
    setRejectionReason("");
    setComment("");
  };

  const submitReview = async () => {
    if (!reviewDoc) return;
    if (reviewMode === "reject" && !rejectionReason.trim()) {
      toast({ title: "خطا", description: "دلیل رد مستند الزامی است", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const body = reviewMode === "approve"
        ? { approvedProgressPercent: approvedPct, comment }
        : { rejectionReason };
      const res = await fetch(`/api/admin/documents/${reviewDoc.id}/${reviewMode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      toast({
        title: reviewMode === "approve" ? "تأیید شد" : "رد شد",
        description: reviewMode === "approve"
          ? `مستند «${reviewDoc.originalFileName}» تأیید شد`
          : `مستند «${reviewDoc.originalFileName}» رد شد`,
        variant: "default",
      });
      setReviewDoc(null);
      fetchDocs();
    } catch (e: any) {
      toast({
        title: "خطا",
        description: e.message || "عملیات ناموفق بود",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: { id: ApprovalStatus; label: string; count: number; icon: React.ElementType }[] = [
    { id: "PENDING", label: "در انتظار تأیید", count: summary.PENDING, icon: FileClock },
    { id: "APPROVED", label: "تأیید شده", count: summary.APPROVED, icon: FileCheck },
    { id: "REJECTED", label: "رد شده", count: summary.REJECTED, icon: FileX },
    { id: "ALL", label: "همه", count: summary.ALL, icon: FileText },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = status === tab.id;
          const colorClass = tab.id === "PENDING" ? "text-amber-600" : tab.id === "APPROVED" ? "text-emerald-600" : tab.id === "REJECTED" ? "text-rose-600" : "text-sky-600";
          return (
            <button
              key={tab.id}
              onClick={() => { setStatus(tab.id); setPage(1); }}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-right transition-all hover:shadow-sm",
                isActive ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card hover:bg-accent/50"
              )}
            >
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-md bg-muted/50", colorClass)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground truncate">{tab.label}</div>
                <div className="text-xl font-bold text-foreground">{tab.count.toLocaleString("fa-IR")}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="جستجو در نام فایل، عنوان، شرح، گام یا پروژه..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Badge variant="outline" className="h-10 px-3 flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          {tabs.find(t => t.id === status)?.label}
          <span className="text-muted-foreground">·</span>
          {total.toLocaleString("fa-IR")} مستند
        </Badge>
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>مستندی برای نمایش وجود ندارد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((doc) => {
            const cfg = STATUS_CONFIG[doc.approvalStatus] || STATUS_CONFIG.PENDING;
            const StatusIcon = cfg.icon;
            return (
              <Card key={doc.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    {/* File icon + name */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground truncate" title={doc.originalFileName}>
                            {doc.originalFileName}
                          </p>
                          <Badge variant="outline" className={cn("gap-1", cfg.color, cfg.bg, "border")} >
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                          {doc.forMonth && (
                            <Badge variant="secondary" className="text-[10px]">
                              {PERSIAN_MONTHS[doc.forMonth - 1] || doc.forMonth}
                            </Badge>
                          )}
                        </div>
                        {doc.title && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.title}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {formatBytes(doc.sizeBytes)}
                          </span>
                          <span className="flex items-center gap-1" title="گام">
                            <ListTodoIcon />
                            {doc.task.taskName.length > 40 ? doc.task.taskName.substring(0, 40) + "..." : doc.task.taskName}
                          </span>
                          <span className="flex items-center gap-1" title="پروژه">
                            <FolderIcon />
                            {doc.project.projectName.length > 30 ? doc.project.projectName.substring(0, 30) + "..." : doc.project.projectName}
                          </span>
                          {doc.org && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {doc.org.displayName}
                            </span>
                          )}
                          {doc.uploadedBy && (
                            <span className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {doc.uploadedBy.name}
                            </span>
                          )}
                        </div>
                        {doc.approvalStatus === "REJECTED" && doc.rejectionReason && (
                          <div className="mt-2 rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
                            <span className="font-medium">دلیل رد: </span>
                            {doc.rejectionReason}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                      >
                        <a
                          href={`/api/portal/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="h-4 w-4" />
                          <span className="hidden sm:inline mr-1">دانلود</span>
                        </a>
                      </Button>
                      {doc.approvalStatus === "PENDING" && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => openApprove(doc)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="hidden sm:inline mr-1">تأیید</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/30"
                            onClick={() => openReject(doc)}
                          >
                            <XCircle className="h-4 w-4" />
                            <span className="hidden sm:inline mr-1">رد</span>
                          </Button>
                        </>
                      )}
                      {doc.approvalStatus === "APPROVED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApprove(doc)}
                        >
                          <Clock className="h-4 w-4" />
                          <span className="hidden sm:inline mr-1">بازبینی</span>
                        </Button>
                      )}
                      {doc.approvalStatus === "REJECTED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApprove(doc)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="hidden sm:inline mr-1">تأیید مجدد</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")} — مجموع {total.toLocaleString("fa-IR")} مستند
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronRight className="h-4 w-4" />
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              بعدی
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewDoc} onOpenChange={(open) => !open && setReviewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewMode === "approve" ? (
                <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> تأیید مستند</>
              ) : (
                <><XCircle className="h-5 w-5 text-rose-600" /> رد مستند</>
              )}
            </DialogTitle>
            <DialogDescription>
              {reviewDoc?.originalFileName}
            </DialogDescription>
          </DialogHeader>

          {reviewDoc && (
            <div className="space-y-4">
              {/* Document info */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground text-xs">گام:</span>
                    <p className="font-medium">{reviewDoc.task.taskName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">پروژه:</span>
                    <p className="font-medium">{reviewDoc.project.projectName}</p>
                  </div>
                  {reviewDoc.org && (
                    <div>
                      <span className="text-muted-foreground text-xs">مدیریت:</span>
                      <p className="font-medium">{reviewDoc.org.displayName}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground text-xs">بارگذارنده:</span>
                    <p className="font-medium">{reviewDoc.uploadedBy?.name || "-"}</p>
                  </div>
                </div>
                {reviewDoc.description && (
                  <div>
                    <span className="text-muted-foreground text-xs">توضیحات:</span>
                    <p className="text-sm">{reviewDoc.description}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`/api/portal/documents/${reviewDoc.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4 ml-1" /> مشاهده / دانلود فایل
                    </a>
                  </Button>
                </div>
              </div>

              {reviewMode === "approve" ? (
                <>
                  {/* Approved progress slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>درصد پیشرفت تأییدشده گام</Label>
                      <Badge variant="secondary" className="text-base font-bold">
                        {approvedPct.toLocaleString("fa-IR")}٪
                      </Badge>
                    </div>
                    <Slider
                      value={[approvedPct]}
                      onValueChange={(v) => setApprovedPct(v[0])}
                      max={100}
                      step={5}
                      className="w-full"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      پیشرفت فعلی گزارش‌شده: {reviewDoc.task.progressPercent.toLocaleString("fa-IR")}٪ —
                      این مقدار به‌عنوان پیشرفت رسمی تأییدشده گام ثبت می‌شود.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="comment">توضیحات (اختیاری)</Label>
                    <Textarea
                      id="comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="توضیحات مربوط به تأیید..."
                      rows={2}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>دلیل رد مستند برای بارگذارنده ارسال خواهد شد.</span>
                  </div>
                  <Label htmlFor="rejectionReason">دلیل رد (اجباری)</Label>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="مثال: مستند ناقص است، تاریخ آن قدیمی است، ..."
                    rows={3}
                    required
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewDoc(null)}>انصراف</Button>
            <Button
              onClick={submitReview}
              disabled={submitting}
              className={reviewMode === "approve"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              {reviewMode === "approve" ? "تأیید نهایی" : "رد مستند"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Inline icons to avoid extra imports
function ListTodoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18M3 12h18M3 19h12" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}
