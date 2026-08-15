"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

interface DocItem {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  forMonth: number | null;
  title: string | null;
  uploadedAt: string;
  task: { id: string; taskName: string; project: { id: string; projectName: string } };
}

function fa(n: number | string) { return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]); }
function fmtSize(bytes: number) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

export function PortalDocuments() {
  const { data: session } = useSession();
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const reqId = useRef(0);

  useEffect(() => {
    // Fetch all tasks then their documents — simpler: fetch from a dedicated endpoint
    // For now, fetch tasks (large) and aggregate
    const sig = ++reqId.current;
    fetch("/api/portal/tasks?pageSize=1000", { credentials: "include" })
      .then(r => r.json())
      .then(async (tasksData) => {
        const tasks = tasksData.data || [];
        // Fetch docs for each task (batch via Promise.all, limited)
        const taskIds = tasks.map((t: any) => t.id);
        // Fetch docs in chunks of 20
        const allDocs: DocItem[] = [];
        for (let i = 0; i < taskIds.length; i += 20) {
          const chunk = taskIds.slice(i, i + 20);
          const results = await Promise.all(
            chunk.map((tid: string) =>
              fetch(`/api/portal/tasks/${tid}/documents`, { credentials: "include" }).then(r => r.json()).catch(() => ({ data: [] }))
            )
          );
          results.forEach((r, idx) => {
            const task = tasks.find((t: any) => t.id === chunk[idx]);
            (r.data || []).forEach((d: any) => allDocs.push({ ...d, task: { id: task.id, taskName: task.taskName, project: task.project } }));
          });
        }
        if (reqId.current === sig) {
          setItems(allDocs);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter(d =>
    !search || d.originalFileName.includes(search) || d.task?.taskName?.includes(search) || d.task?.project?.projectName?.includes(search)
  );

  async function deleteDoc(id: string) {
    if (!confirm("حذف این مستند؟")) return;
    const res = await fetch(`/api/portal/documents/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { setItems(items.filter(d => d.id !== id)); toast.success("حذف شد"); }
  }

  if (loading) return <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Card key={i}><CardContent className="p-3"><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="جستجوی مستند..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" />
      </div>

      <div className="text-xs text-muted-foreground">{fa(filtered.length)} مستند</div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />مستندی یافت نشد</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <Card key={d.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title || d.originalFileName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {d.task?.project?.projectName} • {d.task?.taskName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fa(fmtSize(d.sizeBytes))} • {new Date(d.uploadedAt).toLocaleDateString("fa-IR")}
                    </p>
                  </div>
                  <a href={`/api/portal/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" title="دانلود"><Download className="h-4 w-4" /></Button>
                  </a>
                  {session?.user?.role && session.user.role !== "VIEWER" && (
                    <Button variant="ghost" size="icon" onClick={() => deleteDoc(d.id)} title="حذف"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
