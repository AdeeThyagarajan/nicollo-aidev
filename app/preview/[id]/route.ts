import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import net from "net";
import { spawn, type ChildProcess } from "child_process";

import { readMeta, writeMeta, type ProjectMeta } from "@/lib/sandbox/meta";

export const runtime = "nodejs";

const processes = new Map<string, ChildProcess>();

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close(() => reject(new Error("Could not get free port")));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForPort(port: number, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.createConnection({ port, host: "127.0.0.1" }, () => {
        s.end();
        resolve(true);
      });
      s.on("error", () => resolve(false));
      s.setTimeout(800, () => resolve(false));
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function killProcessTree(pid: number) {
  try {
    process.kill(-pid);
  } catch {
    try {
      process.kill(pid);
    } catch {
      // ignore
    }
  }
}

function writePreviewMeta(projectId: string, patch: ProjectMeta["preview"]) {
  const existing = (readMeta(projectId) ?? { id: projectId }) as ProjectMeta;

  writeMeta(projectId, {
    ...existing,
    id: projectId,
    preview: {
      ...(existing.preview ?? {}),
      ...(patch ?? {}),
    },
    updatedAt: new Date().toISOString(),
  });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

  const root = path.join(
    process.cwd(),
    "sandbox",
    "projects",
    projectId,
    "current"
  );

  if (!fs.existsSync(root)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = (readMeta(projectId) ?? { id: projectId }) as ProjectMeta;
  const running = processes.get(projectId);

  if (running && !running.killed) {
    const url = new URL(req.url);
    return NextResponse.redirect(
      new URL(`/preview/${projectId}/next`, url),
      307
    );
  }

  if (running?.pid) {
    killProcessTree(running.pid);
    processes.delete(projectId);
  }

  const port = await getFreePort();

  const child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
    detached: true,
  });

  processes.set(projectId, child);

  writePreviewMeta(projectId, {
    ...(existing.preview ?? {}),
    nextPort: port,
    nextStartedAt: Date.now(),
  });

  await waitForPort(port);

  const url = new URL(req.url);
  const res = NextResponse.redirect(
    new URL(`/preview/${projectId}/next`, url),
    307
  );

  res.cookies.set("da_preview", projectId, {
    path: "/",
    sameSite: "lax",
  });

  return res;
}
