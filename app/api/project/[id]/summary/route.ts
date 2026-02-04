import { NextResponse } from "next/server";

import { readMeta } from "@/lib/sandbox/meta";
import { listFiles } from "@/lib/sandbox/fs";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;

    const meta = readMeta(projectId) || {};
    const buildInfo = (meta as any).buildInfo || null;

    let files: string[] = [];
    try {
      files = listFiles(projectId);
    } catch {
      files = Array.isArray((meta as any).files) ? (meta as any).files : [];
    }

    return NextResponse.json({
      ok: true,
      projectId,
      buildInfo,
      built: Boolean((meta as any).built),
      entry: (meta as any).entry || null,
      version: (meta as any).version || 0,
      lastBuildAt: (meta as any).lastBuildAt || null,
      filesCount: files.length,
      filesPreview: files.slice(0, 25),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Summary error" }, { status: 500 });
  }
}
