import { NextResponse } from "next/server";

import { createProject, listProjects } from "@/lib/sandbox/projects";

export const runtime = "nodejs";

export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to list projects" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body?.title === "string" ? body.title : undefined;
    const description =
      typeof body?.description === "string" ? body.description : undefined;

    const project = await createProject({ title, description });
    return NextResponse.json({ ok: true, project });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to create project" },
      { status: 500 },
    );
  }
}
