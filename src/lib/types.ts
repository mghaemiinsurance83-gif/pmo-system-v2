// Shared types for portal/admin API contracts.

export type Role = "ADMIN" | "MANAGER" | "LIAISON" | "VIEWER";

export interface PortalUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  orgId: string | null;
  orgName?: string | null;
  orgCode?: string | null;
}

export interface ApiError {
  error: {
    code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function toPersianDigits(input: string | number): string {
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(input).replace(/[0-9]/g, (d) => fa[Number(d)]);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
