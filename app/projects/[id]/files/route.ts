// app/api/projects/[id]/files/route.ts
import { NextResponse } from "next/server";
import { listFiles, readFilesSnapshot } from "@/lib/sandbox/fs";
import { readMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    const files = listFiles(projectId);

    // Optional: include a small snapshot so the UI can show preview/size quickly.
    // Keep it light to avoid huge payloads.
    const preview = readFilesSnapshot(projectId, files.slice(0, 50), 20_000);

    const meta = readMeta(projectId) || {};

    return NextResponse.json({
      ok: true,
      projectId,
      files,
      preview,
      meta,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to list files" },
      { status: 500 }
    );
  }
}
