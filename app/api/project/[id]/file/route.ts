import { NextResponse } from "next/server";

import { readFile } from "@/lib/sandbox/fs";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    if (!path) {
      return NextResponse.json({ ok: false, error: "Missing path" }, { status: 400 });
    }

    const content = await readFile(params.id, path);
    return NextResponse.json({ ok: true, content });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to read file" },
      { status: 500 }
    );
  }
}
