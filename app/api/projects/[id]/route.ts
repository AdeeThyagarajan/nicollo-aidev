import { NextResponse } from "next/server";

import { deleteProject, getProject, renameProject } from "@/lib/sandbox/projects";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx?.params?.id;
    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to fetch project" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx?.params?.id;
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : "";
    const project = renameProject(id, title);
    return NextResponse.json({ ok: true, project });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to rename project" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx?.params?.id;
    deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to delete project" },
      { status: 500 },
    );
  }
}
