import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithScope } from "@/lib/rbac";
import { readFile } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, scope } = await getCurrentUserWithScope();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const doc = await db.document.findUnique({
    where: { id: id },
    select: { id: true, storagePath: true, originalFileName: true, mimeType: true, isActive: true, orgId: true, projectId: true },
  });
  if (!doc || !doc.isActive) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  // Scope check: document must be in a project within user's scope
  const isAll = scope?.has("*");
  if (!isAll) {
    const project = await db.project.findUnique({
      where: { id: doc.projectId },
      select: { ownerOrgId: true, unitLinks: { select: { orgId: true } } },
    });
    if (project) {
      const orgIds = new Set<string>();
      if (project.ownerOrgId) orgIds.add(project.ownerOrgId);
      for (const ul of project.unitLinks) orgIds.add(ul.orgId);
      const inScope = [...(scope ?? [])].some((id) => orgIds.has(id));
      if (!inScope) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    }
  }

  try {
    const buffer = await readFile(doc.storagePath);
    // Encode filename for Persian in Content-Disposition
    const encodedName = encodeURIComponent(doc.originalFileName);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return Response.json({ error: { code: "NOT_FOUND", message: "فایل یافت نشد" } }, { status: 404 });
  }
}
