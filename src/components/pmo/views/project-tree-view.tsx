"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { SectionCard, Spinner, EmptyState, ProgressBar, StatusBadge } from "@/components/pmo/shared";
import { toFa, faPercent } from "@/lib/jalali";
import { cn } from "@/lib/utils";
import { ChevronLeft, Building2, Layers, FolderKanban, ListTree, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface OrgNode {
  id: string;
  code: string;
  name: string;
  displayName: string;
  orgType: string;
  level: number;
  parentId: string | null;
  childCount: number;
  projectCount: number;
  taskCount: number;
  progress: number;
  statusBreakdown: Record<string, number>;
  children: OrgNode[];
}

interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  programTitle: string;
  owner: string;
  ownerCode: string | null;
  progress: number;
  weight: number;
  status: string;
  taskCount: number;
  startJalali: string;
  endJalali: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  programTitle: string;
  owner: { name: string; code: string } | null;
  progress: number;
  status: string;
  tasks: {
    id: string;
    name: string;
    sequenceNo: number;
    weight: number;
    progress: number;
    status: string;
    isMilestone: boolean;
    activeMonths: number[];
    units: { org: { name: string }; roleType: string; isPrimary: boolean }[];
  }[];
}

const ORG_TYPE_ICON: Record<string, React.ElementType> = {
  COMPANY: Building2,
  DEPUTY: Layers,
  MANAGEMENT: FolderKanban,
  UNIT: FolderKanban,
  GROUP: FolderKanban,
};

const ORG_TYPE_LABEL: Record<string, string> = {
  COMPANY: "شرکت",
  DEPUTY: "معاونت",
  MANAGEMENT: "مدیریت",
  UNIT: "واحد",
  GROUP: "گروه",
};

export function ProjectTreeView() {
  const [tree, setTree] = useState<OrgNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiFetch<OrgNode[]>("/api/orgs/tree")
      .then((t) => {
        setTree(t);
        // expand root + first level by default
        const init = new Set<string>();
        if (t[0]) {
          init.add(t[0].id);
          t[0].children.forEach((c) => init.add(c.id));
        }
        setExpanded(init);
      })
      .catch((e) => setError(e.message));
  }, []);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!tree) return;
    const all = new Set<string>();
    const walk = (n: OrgNode) => {
      all.add(n.id);
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    setExpanded(all);
  }, [tree]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  if (error) return <EmptyState title="خطا" hint={error} />;
  if (!tree) return <Spinner className="py-16" />;

  return (
    <div className="space-y-4">
      <SectionCard
        title="درخت سلسله‌مراتبی سازمان و پروژه"
        description="شرکت → معاونت → مدیریت → برنامه → فعالیت — با محاسبه Roll-up پیشرفت وزنی"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={expandAll}>باز کردن همه</Button>
            <Button size="sm" variant="outline" onClick={collapseAll}>بستن همه</Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="border-b px-4 py-2.5">
          <div className="relative max-w-sm">
            <Search className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="جستجوی واحد/مدیریت…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pr-8 text-xs"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto custom-scroll p-2">
          {tree.map((node) => (
            <OrgNodeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              search={search}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function OrgNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  search,
}: {
  node: OrgNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  search: string;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isManagement = node.orgType === "MANAGEMENT" || node.orgType === "GROUP";
  const matchesSearch = !search || node.name.includes(search) || node.displayName.includes(search);

  // For management nodes, lazy-load projects when expanded
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (projects || loadingProjects) return;
    setLoadingProjects(true);
    try {
      const data = await apiFetch<{ items: ProjectListItem[] }>(`/api/projects?ownerOrgId=${node.id}&pageSize=100`);
      setProjects(data.items);
    } finally {
      setLoadingProjects(false);
    }
  }, [node.id, projects, loadingProjects]);

  useEffect(() => {
    if (isOpen && isManagement && !projects && !loadingProjects) {
      loadProjects();
    }
  }, [isOpen, isManagement, projects, loadingProjects, loadProjects]);

  // If searching and this node doesn't match and has no matching children, hide
  if (search && !matchesSearch && !hasChildren) return null;

  const Icon = ORG_TYPE_ICON[node.orgType] || FolderKanban;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/50 cursor-pointer",
          depth === 0 && "bg-primary/5 font-semibold"
        )}
        style={{ paddingRight: `${depth * 18 + 8}px` }}
        onClick={() => onToggle(node.id)}
      >
        {hasChildren || isManagement ? (
          <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "-rotate-90")} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", depth === 0 ? "text-primary" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className={cn("text-sm truncate", depth === 0 && "font-bold")}>{node.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{ORG_TYPE_LABEL[node.orgType]}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {node.projectCount > 0 && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground tabular-nums">
              {toFa(node.projectCount)} برنامه • {toFa(node.taskCount)} فعالیت
            </span>
          )}
          <span className="text-xs font-semibold tabular-nums w-12 text-left">{faPercent(node.progress)}</span>
          <div className="w-20">
            <ProgressBar value={node.progress} size="sm" />
          </div>
        </div>
      </div>

      {isOpen && (
        <div>
          {/* children orgs */}
          {hasChildren && node.children.map((child) => (
            <OrgNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              search={search}
            />
          ))}

          {/* projects under management */}
          {isManagement && (
            <div style={{ paddingRight: `${(depth + 1) * 18}px` }}>
              {loadingProjects && <Spinner className="py-3" />}
              {projects && projects.length === 0 && !loadingProjects && (
                <p className="py-2 text-xs text-muted-foreground">برنامه‌ای ثبت نشده است.</p>
              )}
              {projects && projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  depth={depth + 1}
                  expandedProject={expandedProject}
                  setExpandedProject={setExpandedProject}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  depth,
  expandedProject,
  setExpandedProject,
}: {
  project: ProjectListItem;
  depth: number;
  expandedProject: string | null;
  setExpandedProject: (id: string | null) => void;
}) {
  const isOpen = expandedProject === project.id;
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const toggle = useCallback(async () => {
    if (isOpen) {
      setExpandedProject(null);
      return;
    }
    setExpandedProject(project.id);
    if (!loaded.current) {
      setLoading(true);
      try {
        const d = await apiFetch<ProjectDetail>(`/api/projects/${project.id}`);
        setDetail(d);
        loaded.current = true;
      } finally {
        setLoading(false);
      }
    }
  }, [isOpen, project.id, setExpandedProject]);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent/40 cursor-pointer border-r-2 border-amber-300/60"
        style={{ paddingRight: `${depth * 14 + 8}px` }}
        onClick={toggle}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "-rotate-90")} />
        <FolderKanban className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{project.programTitle || project.name}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {project.code} • {toFa(project.taskCount)} فعالیت • {project.startJalali} تا {project.endJalali}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold tabular-nums w-10 text-left">{faPercent(project.progress)}</span>
          <div className="w-16">
            <ProgressBar value={project.progress} size="sm" />
          </div>
        </div>
      </div>

      {isOpen && (
        <div style={{ paddingRight: `${(depth + 1) * 14 + 8}px` }} className="py-1">
          {loading && <Spinner className="py-3" />}
          {detail && (
            <div className="space-y-1 rounded-lg border bg-card/40 p-2">
              {detail.tasks.length === 0 && <p className="text-xs text-muted-foreground py-2">فعالیتی ثبت نشده است.</p>}
              {detail.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/30 border-r-2 border-teal-300/60">
                  <ListTree className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{t.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground tabular-nums">وزن: {toFa(t.weight)}</span>
                      {t.units.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          مجری: {t.units.map((u) => u.org.name).join("، ")}
                        </span>
                      )}
                      {t.isMilestone && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">نقطه عطف</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={t.status} />
                    <span className="text-[11px] font-semibold tabular-nums w-10 text-left">{faPercent(t.progress)}</span>
                    <div className="w-14">
                      <ProgressBar value={t.progress} size="sm" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
