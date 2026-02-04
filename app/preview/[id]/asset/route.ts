// app/preview/[id]/asset/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

import { readMeta, writeMeta, type ProjectMeta } from "@/lib/sandbox/meta";
import { projectRoot } from "@/lib/sandbox/paths";

export const runtime = "nodejs";

// Keep child processes alive across requests in dev/runtime
declare global {
  // eslint-disable-next-line no-var
  var __previewProcesses: Map<string, ChildProcessWithoutNullStreams> | undefined;
}
const processes =
  globalThis.__previewProcesses ?? (globalThis.__previewProcesses = new Map());

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function pickFreeishPort() {
  // good-enough: deterministic per process, avoids collisions most of the time
  // you can swap to a real port finder later
  return 3100 + Math.floor(Math.random() * 2000);
}

function writePreviewMeta(projectId: string, patch: ProjectMeta["preview"]) {
  const existing = (readMeta(projectId) ?? { id: projectId }) as ProjectMeta;

  writeMeta(projectId, {
    ...existing,
    id: projectId, // ✅ required
    preview: {
      ...(existing.preview ?? {}),
      ...(patch ?? {}),
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

  try {
    // Ensure project root exists
    const root = projectRoot(projectId);
    ensureDir(root);

    // If already running, just return the meta preview
    const existing = (readMeta(projectId) ?? { id: projectId }) as ProjectMeta;
    if (processes.has(projectId) && existing.preview?.nextPort) {
      return NextResponse.json({
        ok: true,
        nextPort: existing.preview.nextPort,
        nextStartedAt: existing.preview.nextStartedAt ?? null,
      });
    }

    // Start Next dev server inside the project folder
    const port = pickFreeishPort();

    // Some builds expect there to be a package.json. If yours always exists, fine.
    // This just prevents a crash on empty folders.
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath)) {
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          { name: `project-${projectId}`, private: true, scripts: { dev: "next dev" } },
          null,
          2
        ),
        "utf8"
      );
    }

    const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: "pipe",
    });

    processes.set(projectId, child);

    // Write meta immediately so UI has something stable
    writePreviewMeta(projectId, {
      nextPort: port,
      nextStartedAt: Date.now(),
    });

    // Optional: if process exits, clear it
    child.on("exit", () => {
      processes.delete(projectId);
    });

    return NextResponse.json({
      ok: true,
      nextPort: port,
      nextStartedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ? String(err.message) : "Preview failed" },
      { status: 500 }
    );
  }
}
