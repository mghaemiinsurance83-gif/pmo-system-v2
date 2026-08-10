import { NextResponse } from "next/server";
import { buildOrgTree } from "@/lib/rollup";

export async function GET() {
  const tree = await buildOrgTree();
  return NextResponse.json(tree);
}
