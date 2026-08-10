"use client";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/jalali";
import { toFa, faPercent } from "@/lib/jalali";

const STATUS_FA: Record<string, string> = {
  NOT_STARTED: "شروع نشده",
  IN_PROGRESS: "در حال اجرا",
  COMPLETED: "تکمیل شده",
  DELAYED: "تأخیر",
  ON_HOLD: "متوقف",
  CANCELLED: "لغو شده",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const c = statusColor(status);
  const label = STATUS_FA[status] || status;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", c.badge, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
      {label}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  barClassName,
  showLabel = false,
  size = "md",
}: {
  value: number;
  className?: string;
  barClassName?: string;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const v = Math.max(0, Math.min(100, value || 0));
  const colorCls =
    v >= 80 ? "bg-emerald-500" : v >= 50 ? "bg-teal-500" : v >= 25 ? "bg-amber-500" : v > 0 ? "bg-orange-500" : "bg-slate-400";
  const h = size === "sm" ? "h-1.5" : size === "lg" ? "h-3.5" : "h-2.5";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn("relative w-full overflow-hidden rounded-full bg-muted", h)}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", barClassName || colorCls)}
          style={{ width: `${v}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-medium tabular-nums text-muted-foreground min-w-[3rem] text-left">{faPercent(v)}</span>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  icon,
  hint,
  accent = "teal",
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  hint?: string;
  accent?: "teal" | "amber" | "emerald" | "rose" | "violet";
}) {
  const accents: Record<string, string> = {
    teal: "from-teal-500/10 to-teal-500/5 text-teal-700 dark:text-teal-300 border-teal-200/60 dark:border-teal-900/40",
    amber: "from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/40",
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/40",
    rose: "from-rose-500/10 to-rose-500/5 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-900/40",
    violet: "from-violet-500/10 to-violet-500/5 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-900/40",
  };
  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-gradient-to-br p-4", accents[accent])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {typeof value === "number" ? toFa(value) : value}
            {unit && <span className="mr-1 text-sm font-normal text-muted-foreground">{unit}</span>}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className="shrink-0 opacity-80">{icon}</div>}
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-muted-foreground/40">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground/70 max-w-sm">{hint}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 py-8 text-muted-foreground", className)}>
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="text-xs">در حال بارگذاری…</span>
    </div>
  );
}
